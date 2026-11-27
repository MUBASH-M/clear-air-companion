import { afterEach, describe, expect, it, vi } from "vitest";
import { askGroundedAssistant, exploreNearbyWithMaps, fetchLiveAirAdvisories } from "@/lib/ai";
import { DEFAULT_PROFILE } from "@/lib/companion";
import { COST_LABEL, EVIDENCE_LABEL, KIND_LABEL, TIPS, fx, tipById, tr } from "@/lib/knowledge";
import { isSafeHttpUrl } from "@/lib/url";

const samplePlace = { name: "Bengaluru", region: "Karnataka", lat: 12.97, lon: 77.59 };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("knowledge library integrity", () => {
  it("contains unique IDs and complete bilingual EN/HI copy for every tip", () => {
    const seen = new Set<string>();
    expect(TIPS.length).toBeGreaterThanOrEqual(12);

    for (const tip of TIPS) {
      expect(seen.has(tip.id)).toBe(false);
      seen.add(tip.id);

      expect(tip.title.en.trim().length).toBeGreaterThan(0);
      expect(tip.title.hi.trim().length).toBeGreaterThan(0);
      expect(tip.body.en.trim().length).toBeGreaterThan(0);
      expect(tip.body.hi.trim().length).toBeGreaterThan(0);
      expect(tip.limits.en.trim().length).toBeGreaterThan(0);
      expect(tip.limits.hi.trim().length).toBeGreaterThan(0);
      expect(COST_LABEL[tip.cost]).toBeDefined();
      expect(EVIDENCE_LABEL[tip.evidence]).toBeDefined();
      expect(KIND_LABEL[tip.kind]).toBeDefined();
    }
  });

  it("resolves known tips and throws clearly on unknown IDs", () => {
    expect(tipById("mask").id).toBe("mask");
    expect(() => tipById("does-not-exist")).toThrow("Unknown tip id");
  });

  it("localizes bilingual labels and effect ranges cleanly", () => {
    expect(tr({ en: "Free", hi: "मुफ़्त" }, "en")).toBe("Free");
    expect(tr({ en: "Free", hi: "मुफ़्त" }, "hi")).toBe("मुफ़्त");
    expect(fx("10–30% lower indoor PM2.5", "en")).toBe("10–30% lower indoor PM2.5");
    expect(fx("10–30% lower indoor PM2.5", "hi")).toBe("घर के अंदर PM2.5 में 10–30% कमी");
    expect(fx("Custom unmapped string", "hi")).toBe("Custom unmapped string");
  });
});

describe("isSafeHttpUrl", () => {
  it("permits http/https URLs and rejects unsafe schemes", () => {
    expect(isSafeHttpUrl("https://maps.google.com/?cid=123")).toBe(true);
    expect(isSafeHttpUrl("http://example.com/path")).toBe(true);
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isSafeHttpUrl("vbscript:msgbox(1)")).toBe(false);
    expect(isSafeHttpUrl("not a url")).toBe(false);
    expect(isSafeHttpUrl(undefined)).toBe(false);
  });
});

describe("AI client API wrappers", () => {
  it("posts trimmed history (max 6), forwards groundingMode, and parses Maps & Search grounding sources", async () => {
    let capturedBody = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        capturedBody = String(init?.body ?? "");
        return new Response(
          JSON.stringify({
            text: "Nearby pharmacies stocking N95 masks.",
            sources: [{ title: "City Pharmacy", uri: "https://maps.google.com/?q=City+Pharmacy", reviewSnippets: [] }],
            webSources: [{ title: "CPCB Advisory", uri: "https://cpcb.nic.in/advisory" }],
            groundingUsed: "maps",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    const history = Array.from({ length: 10 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      text: `msg-${i}`,
    }));

    const res = await askGroundedAssistant({
      message: "Where can I buy N95 masks?",
      lang: "en",
      place: samplePlace,
      report: null,
      profile: DEFAULT_PROFILE,
      history,
      groundingMode: "maps",
    });

    expect(res.text).toBe("Nearby pharmacies stocking N95 masks.");
    expect(res.sources).toHaveLength(1);
    expect(res.webSources).toHaveLength(1);
    expect(res.groundingUsed).toBe("maps");
    const parsed = JSON.parse(capturedBody) as { history: unknown[]; groundingMode: string };
    expect(parsed.history).toHaveLength(6);
    expect(parsed.groundingMode).toBe("maps");
  });

  it("fetches live Search-grounded air quality advisories and surfaces clean errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL) => {
        expect(String(url)).toBe("/api/search-alerts");
        return new Response(
          JSON.stringify({
            text: "- No active GRAP emergency restrictions in Bengaluru today.",
            webSources: [{ title: "KSPCB Air Quality", uri: "https://kspcb.karnataka.gov.in" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    const brief = await fetchLiveAirAdvisories({
      lang: "en",
      place: samplePlace,
      report: null,
    });
    expect(brief.text).toContain("GRAP");
    expect(brief.webSources).toEqual([{ title: "KSPCB Air Quality", uri: "https://kspcb.karnataka.gov.in" }]);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("<html>404</html>", {
          status: 404,
          headers: { "Content-Type": "text/html" },
        }),
      ),
    );
    await expect(fetchLiveAirAdvisories({ lang: "hi", place: samplePlace, report: null })).rejects.toThrow(
      "फ़ुल-स्टैक सर्वर आवश्यक है",
    );
  });

  it("surfaces clean localized errors for server rate limits and static hosts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "Rate limit reached." }), {
          status: 429,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(
      exploreNearbyWithMaps({ query: "pharmacy", lang: "en", place: samplePlace, report: null }),
    ).rejects.toThrow("Rate limit reached.");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("<html>404</html>", {
          status: 404,
          headers: { "Content-Type": "text/html" },
        }),
      ),
    );

    await expect(
      exploreNearbyWithMaps({ query: "pharmacy", lang: "hi", place: samplePlace, report: null }),
    ).rejects.toThrow("फ़ुल-स्टैक सर्वर आवश्यक है");
  });

  it("serializes live AirReport context and handles all remaining success/error branches in ai.ts", async () => {
    const sampleReport = {
      place: samplePlace,
      fetchedAt: new Date("2026-11-27T08:00:00Z"),
      observedAt: "2026-11-27T08:00",
      aqi: 210,
      category: "poor" as const,
      dominant: "PM2.5",
      pm25: 98,
      pm10: 160,
      no2: 34,
      pm25Avg24: 95,
      pm10Avg24: 155,
      temperature: 24,
      humidity: 55,
      wind: 6,
      next24: [],
      bestWindow: { start: "2026-11-27T14:00", end: "2026-11-27T16:00", aqi: 140 },
      worstWindow: { start: "2026-11-27T08:00", end: "2026-11-27T10:00", aqi: 240 },
      peakToday: 240,
    };

    // exploreNearbyWithMaps success with report
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            text: "Nearby clinic found.",
            sources: [{ title: "Clinic", uri: "https://maps.google.com/?q=clinic", reviewSnippets: [] }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const exploreOk = await exploreNearbyWithMaps({
      query: "clinic",
      lang: "en",
      place: samplePlace,
      report: sampleReport,
    });
    expect(exploreOk.text).toBe("Nearby clinic found.");
    expect(exploreOk.groundingUsed).toBe("maps");

    // Non-JSON / 404 errors in English for ask, explore, and search-alerts
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>404</html>", { status: 404, headers: { "Content-Type": "text/html" } })),
    );
    await expect(
      askGroundedAssistant({
        message: "Hi",
        lang: "en",
        place: samplePlace,
        report: { ...sampleReport, bestWindow: null, worstWindow: null },
        profile: DEFAULT_PROFILE,
        history: [],
      }),
    ).rejects.toThrow("full-stack server");
    await expect(
      askGroundedAssistant({
        message: "Hi",
        lang: "hi",
        place: samplePlace,
        report: null,
        profile: DEFAULT_PROFILE,
        history: [],
      }),
    ).rejects.toThrow("फ़ुल-स्टैक सर्वर");
    await expect(
      exploreNearbyWithMaps({ query: "park", lang: "en", place: samplePlace, report: null }),
    ).rejects.toThrow("full-stack server");
    await expect(
      fetchLiveAirAdvisories({ lang: "en", place: samplePlace, report: null }),
    ).rejects.toThrow("full-stack server");

    // 500 JSON errors without custom message fallback
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({}), { status: 500, headers: { "Content-Type": "application/json" } })),
    );
    await expect(
      askGroundedAssistant({
        message: "Hi",
        lang: "en",
        place: samplePlace,
        report: null,
        profile: DEFAULT_PROFILE,
        history: [],
      }),
    ).rejects.toThrow("Request failed (500)");
    await expect(
      exploreNearbyWithMaps({ query: "park", lang: "en", place: samplePlace, report: null }),
    ).rejects.toThrow("Request failed (500)");
    await expect(
      fetchLiveAirAdvisories({ lang: "en", place: samplePlace, report: null }),
    ).rejects.toThrow("Request failed (500)");

    // Malformed JSON bodies with JSON content-type trigger .catch(() => ({})) fallbacks
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not-json", { status: 200, headers: { "Content-Type": "application/json" } })),
    );
    const askEmpty = await askGroundedAssistant({
      message: "Hi",
      lang: "en",
      place: samplePlace,
      report: null,
      profile: DEFAULT_PROFILE,
      history: [],
    });
    expect(askEmpty).toEqual({ text: "", sources: [], webSources: [], groundingUsed: undefined });

    const exploreEmpty = await exploreNearbyWithMaps({
      query: "park",
      lang: "en",
      place: samplePlace,
      report: null,
    });
    expect(exploreEmpty).toEqual({ text: "", sources: [], webSources: [], groundingUsed: "maps" });

    const alertsEmpty = await fetchLiveAirAdvisories({ lang: "en", place: samplePlace, report: null });
    expect(alertsEmpty).toEqual({ text: "", webSources: [] });
  });
});
