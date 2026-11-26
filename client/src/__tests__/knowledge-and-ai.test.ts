import { afterEach, describe, expect, it, vi } from "vitest";
import { askGroundedAssistant, exploreNearbyWithMaps } from "@/lib/ai";
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
  it("posts trimmed history (max 6) and parses Maps grounding sources", async () => {
    let capturedBody = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        capturedBody = String(init?.body ?? "");
        return new Response(
          JSON.stringify({
            text: "Nearby pharmacies stocking N95 masks.",
            sources: [{ title: "City Pharmacy", uri: "https://maps.google.com/?q=City+Pharmacy", reviewSnippets: [] }],
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
    });

    expect(res.text).toBe("Nearby pharmacies stocking N95 masks.");
    expect(res.sources).toHaveLength(1);
    const parsed = JSON.parse(capturedBody) as { history: unknown[] };
    expect(parsed.history).toHaveLength(6);
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
});
