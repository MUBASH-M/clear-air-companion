import { describe, expect, it } from "vitest";
import {
  askRequestSchema,
  chooseGroundingTool,
  createRateLimiter,
  extractMapsSources,
  extractWebSources,
  formatContextBlock,
  isSafeHttpUrl,
  mapGeminiError,
  mapsExploreRequestSchema,
  sanitizeHistory,
  sanitizeInlineText,
  searchAlertsRequestSchema,
  validateLatLon,
} from "./helpers";

describe("server input validation & sanitization", () => {
  it("strips control characters and caps length in sanitizeInlineText", () => {
    expect(sanitizeInlineText("Hello\r\n\t\x00World   !", 20)).toBe("Hello World !");
    expect(sanitizeInlineText("abcdefghij", 5)).toBe("abcde");
  });

  it("allows only http/https schemes in isSafeHttpUrl", () => {
    expect(isSafeHttpUrl("https://maps.google.com/place/abc")).toBe(true);
    expect(isSafeHttpUrl("http://maps.google.com")).toBe(true);
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("data:text/html,boom")).toBe(false);
    expect(isSafeHttpUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeHttpUrl(null)).toBe(false);
  });

  it("validates latitude/longitude bounds and sanitizes place names", () => {
    expect(validateLatLon({ name: "New\nDelhi", region: "Delhi", lat: 28.61, lon: 77.21 })).toEqual({
      name: "New Delhi",
      region: "Delhi",
      lat: 28.61,
      lon: 77.21,
    });

    expect(validateLatLon({ lat: 95, lon: 77 })).toBeNull();
    expect(validateLatLon({ lat: 28, lon: 181 })).toBeNull();
    expect(validateLatLon({ lat: "NaN", lon: 77 })).toBeNull();
    expect(validateLatLon(null)).toBeNull();
  });

  it("enforces request schemas for /api/ask, /api/maps-explore, and /api/search-alerts", () => {
    expect(askRequestSchema.safeParse({ message: "   ", place: { lat: 1, lon: 1 } }).success).toBe(false);
    expect(askRequestSchema.safeParse({ message: "x".repeat(1501), place: { lat: 1, lon: 1 } }).success).toBe(false);
    expect(askRequestSchema.safeParse({ message: "hi", place: { lat: 1, lon: 1 }, groundingMode: "both" }).success).toBe(false);
    const parsedAsk = askRequestSchema.safeParse({
      message: "Best window today?",
      lang: "hi",
      place: { name: "Pune", lat: 18.52, lon: 73.86 },
      profile: { children: true, budget: "tight" },
      groundingMode: "search",
    });
    expect(parsedAsk.success).toBe(true);
    if (parsedAsk.success) expect(parsedAsk.data.groundingMode).toBe("search");

    expect(mapsExploreRequestSchema.safeParse({ query: "", place: { lat: 1, lon: 1 } }).success).toBe(false);
    expect(mapsExploreRequestSchema.safeParse({ query: "pharmacy", lang: "en", place: { lat: 1, lon: 1 } }).success).toBe(true);

    expect(searchAlertsRequestSchema.safeParse({ lang: "en", place: { lat: 28.6, lon: 77.2 }, topic: "GRAP" }).success).toBe(true);
    expect(searchAlertsRequestSchema.safeParse({ lang: "en", place: { lat: 28.6, lon: 77.2 }, topic: "x".repeat(241) }).success).toBe(false);
  });

  it("sanitizes chat history to valid user/assistant messages capped at 6 turns", () => {
    const raw = [
      { role: "system", text: "ignored" },
      { role: "user", text: "   " },
      ...Array.from({ length: 8 }, (_, i) => ({ role: i % 2 === 0 ? "user" : "assistant", text: `turn-${i}` })),
    ];
    const clean = sanitizeHistory(raw);
    expect(clean).toHaveLength(6);
    expect(clean[0].text).toBe("turn-2");
    expect(clean[5].text).toBe("turn-7");
  });
});

describe("grounding routing, Maps & Search source extraction, context formatting, errors & rate limiting", () => {
  it("routes grounding tool cleanly between Maps and Search without combining them", () => {
    expect(chooseGroundingTool("Where can I buy N95 masks near me?", "auto")).toBe("maps");
    expect(chooseGroundingTool("नज़दीक कोई फ़ार्मेसी या पार्क बताएं", "auto")).toBe("maps");
    expect(chooseGroundingTool("Is GRAP Stage 3 active today?", "auto")).toBe("search");
    expect(chooseGroundingTool("आज स्कूल बंद होने की कोई ताज़ा खबर है?", "auto")).toBe("search");
    expect(chooseGroundingTool("Should I air out my bedroom at 2pm?", "auto")).toBe("search");

    // Explicit mode overrides intent detection
    expect(chooseGroundingTool("Is GRAP Stage 3 active today?", "maps")).toBe("maps");
    expect(chooseGroundingTool("Nearest pharmacy near me", "search")).toBe("search");
  });

  it("deduplicates Maps grounding places and strips unsafe review/place URLs", () => {
    const sources = extractMapsSources({
      candidates: [
        {
          groundingMetadata: {
            groundingChunks: [
              {
                maps: {
                  title: "Apollo Pharmacy",
                  uri: "https://maps.google.com/?cid=1",
                  placeId: "place_1",
                  placeAnswerSources: {
                    reviewSnippets: [
                      { title: "Good stock", uri: "https://maps.google.com/review/1", reviewText: "Has N95 masks" },
                      { title: "Bad link", uri: "javascript:alert(1)", reviewText: "Still safe text" },
                    ],
                  },
                },
              },
              { maps: { title: "Duplicate", uri: "https://maps.google.com/?cid=1" } },
              { maps: { title: "XSS attempt", uri: "javascript:alert(1)" } },
            ],
          },
        },
      ],
    });

    expect(sources).toHaveLength(1);
    expect(sources[0].title).toBe("Apollo Pharmacy");
    expect(sources[0].reviewSnippets).toHaveLength(2);
    expect(sources[0].reviewSnippets[0].uri).toBe("https://maps.google.com/review/1");
    expect(sources[0].reviewSnippets[1].uri).toBeUndefined();
  });

  it("extracts deduplicated, safe Google Search web sources with hostname fallback", () => {
    const sources = extractWebSources({
      candidates: [
        {
          groundingMetadata: {
            groundingChunks: [
              { web: { title: "CPCB Air Quality\nBulletin", uri: "https://cpcb.nic.in/aqi-bulletin" } },
              { web: { title: "Duplicate URL", uri: "https://cpcb.nic.in/aqi-bulletin" } },
              { web: { title: "", uri: "https://caqm.nic.in/grap-orders" } },
              { web: { title: "Unsafe link", uri: "javascript:alert(1)" } },
            ],
          },
        },
      ],
    });

    expect(sources).toEqual([
      { title: "CPCB Air Quality Bulletin", uri: "https://cpcb.nic.in/aqi-bulletin" },
      { title: "caqm.nic.in", uri: "https://caqm.nic.in/grap-orders" },
    ]);
  });

  it("formats sanitized context blocks for Gemini grounding prompts", () => {
    const block = formatContextBlock(
      { name: "Jaipur\nInject", region: "Rajasthan", lat: 26.912, lon: 75.787 },
      { aqi: 245, category: "poor", dominant: "PM2.5", pm25: 102, pm10: 140, bestWindow: "2 pm–3 pm" },
      { children: true, commute: "two_wheeler", fuel: "lpg", budget: "tight" },
    );
    expect(block).toMatch(/Location: Jaipur Inject \(Rajasthan\) \[26\.91, 75\.79\]/);
    expect(block).toMatch(/AQI 245 \(poor\)/);
    expect(block).toMatch(/children at home/);
    expect(block).toMatch(/commute=two_wheeler/);
  });

  it("maps Gemini API errors to safe HTTP status codes", () => {
    expect(mapGeminiError(new Error("GEMINI_API_KEY_MISSING")).status).toBe(503);
    expect(mapGeminiError(new Error("403 PERMISSION_DENIED")).status).toBe(403);
    expect(mapGeminiError(new Error("429 RESOURCE_EXHAUSTED")).status).toBe(429);
    expect(mapGeminiError(new Error("socket hang up")).status).toBe(502);
  });

  it("enforces sliding-window rate limits, isolates IPs, and bounds memory", () => {
    const limit = createRateLimiter({ windowMs: 1000, maxRequests: 2, maxEntries: 2 });
    expect(limit("1.1.1.1", 100).allowed).toBe(true);
    expect(limit("1.1.1.1", 200).allowed).toBe(true);
    const blocked = limit("1.1.1.1", 300);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThanOrEqual(1);

    // Separate IP unaffected
    expect(limit("2.2.2.2", 300).allowed).toBe(true);
    // Triggers eviction when exceeding maxEntries
    expect(limit("3.3.3.3", 300).allowed).toBe(true);
    // Window elapsed -> allowed again
    expect(limit("1.1.1.1", 1200).allowed).toBe(true);
  });
});
