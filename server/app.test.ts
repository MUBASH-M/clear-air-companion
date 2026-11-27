import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { AppConfig, GeminiLikeClient, attachCentralErrorHandler, createExpressApp } from "./app";
import { createRateLimiter } from "./helpers";

const VALID_PLACE = { name: "New Delhi", region: "Delhi", lat: 28.6139, lon: 77.209 };
const VALID_AIR = {
  aqi: 248,
  category: "poor",
  dominant: "PM2.5",
  pm25: 108,
  pm10: 192,
  bestWindow: "2 pm–4 pm",
  worstWindow: "7 am–9 am",
};

function buildTestApp(config: AppConfig = {}) {
  const auditLogs: string[] = [];
  const app = createExpressApp({
    isProd: false,
    geminiApiKey: "test-gemini-key",
    mapsApiKey: "test-maps-key",
    allowedOrigins: ["https://allowed.example.com"],
    geminiTimeoutMs: 500,
    geminiMaxRetries: 1,
    auditSink: (line) => auditLogs.push(line),
    ...config,
  });
  attachCentralErrorHandler(app, (line) => auditLogs.push(line));
  return { app, auditLogs };
}

function makeMockGemini(
  impl: (params: Record<string, unknown>) => Promise<{ text?: string; candidates?: unknown[] }>,
): () => GeminiLikeClient {
  return () => ({
    models: {
      generateContent: impl,
    },
  });
}

describe("Express API security, grounding, error handling & ops", () => {
  it("returns health metadata, request ID, and security headers in dev and prod", async () => {
    const { app: devApp } = buildTestApp({ isProd: false });
    const devRes = await request(devApp).get("/api/health").set("X-Request-Id", "req-trace-123");

    expect(devRes.status).toBe(200);
    expect(devRes.body).toMatchObject({
      ok: true,
      status: "ok",
      geminiConfigured: true,
      mapsConfigured: true,
    });
    expect(typeof devRes.body.uptimeSec).toBe("number");
    expect(devRes.headers["x-request-id"]).toBe("req-trace-123");
    expect(devRes.headers["x-content-type-options"]).toBe("nosniff");
    expect(devRes.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(devRes.headers["permissions-policy"]).toBe("geolocation=(self)");
    expect(devRes.headers["cache-control"]).toBe("no-store");
    expect(devRes.headers["content-security-policy-report-only"]).toContain("default-src 'self'");
    expect(devRes.headers["x-powered-by"]).toBeUndefined();
    expect(devRes.headers["x-frame-options"]).toBeUndefined();

    const { app: prodApp } = buildTestApp({ isProd: true });
    const prodRes = await request(prodApp).get("/api/health");
    expect(prodRes.status).toBe(200);
    expect(prodRes.headers["strict-transport-security"]).toContain("max-age=31536000");
    expect(prodRes.headers["content-security-policy"]).toContain("object-src 'none'");
    expect(prodRes.headers["x-request-id"]).toBeTruthy();
  });

  it("validates maps config key and rejects keys containing whitespace", async () => {
    const { app: validApp } = buildTestApp({ mapsApiKey: "  AIzaValidKey123  " });
    const okRes = await request(validApp).get("/api/maps-config");
    expect(okRes.status).toBe(200);
    expect(okRes.body).toEqual({ apiKey: "AIzaValidKey123" });

    const { app: badApp } = buildTestApp({ mapsApiKey: "bad key with spaces" });
    const badRes = await request(badApp).get("/api/maps-config");
    expect(badRes.status).toBe(200);
    expect(badRes.body).toEqual({ apiKey: "" });
  });

  it("enforces strict CORS allowlist (no wildcard) and supports preflight OPTIONS", async () => {
    const { app, auditLogs } = buildTestApp({ allowedOrigins: ["https://trusted.example.org"] });

    const denied = await request(app).get("/api/health").set("Origin", "https://evil.example.net");
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe("CORS_ORIGIN_DENIED");
    expect(auditLogs.some((l) => l.includes("cors_rejected"))).toBe(true);

    const allowed = await request(app)
      .options("/api/ask")
      .set("Origin", "https://trusted.example.org");
    expect(allowed.status).toBe(204);
    expect(allowed.headers["access-control-allow-origin"]).toBe("https://trusted.example.org");
    expect(allowed.headers["vary"]).toContain("Origin");

    const sameHost = await request(app)
      .get("/api/health")
      .set("Host", "clearair.local:3000")
      .set("Origin", "http://clearair.local:3000");
    expect(sameHost.status).toBe(200);
    expect(sameHost.headers["access-control-allow-origin"]).toBe("http://clearair.local:3000");
  });

  it("returns 503 with Retry-After in maintenance mode while keeping /api/health responsive", async () => {
    const { app } = buildTestApp({ maintenanceMode: true });

    const health = await request(app).get("/api/health");
    expect(health.status).toBe(503);
    expect(health.body).toMatchObject({ ok: false, status: "maintenance" });

    const ask = await request(app)
      .post("/api/ask")
      .send({ message: "Hello", place: VALID_PLACE });
    expect(ask.status).toBe(503);
    expect(ask.body.code).toBe("MAINTENANCE_MODE");
    expect(ask.headers["retry-after"]).toBe("300");
  });

  it("enforces rate limiting with 429 and Retry-After", async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 1 });
    const mockGen = vi.fn().mockResolvedValue({ text: "Stay indoors." });
    const { app, auditLogs } = buildTestApp({
      rateLimiter: limiter,
      createGeminiClient: makeMockGemini(mockGen),
    });

    const first = await request(app)
      .post("/api/ask")
      .send({ message: "What is GRAP today?", place: VALID_PLACE });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post("/api/ask")
      .send({ message: "Another question", place: VALID_PLACE });
    expect(second.status).toBe(429);
    expect(second.body.code).toBe("RATE_LIMITED");
    expect(Number(second.headers["retry-after"])).toBeGreaterThanOrEqual(1);
    expect(auditLogs.some((l) => l.includes("rate_limited"))).toBe(true);
  });

  it("handles /api/ask with Maps grounding, Search grounding, Hindi language, and retry recovery", async () => {
    const mockGen = vi
      .fn()
      .mockResolvedValueOnce({
        text: "Nearby pharmacies include **Apollo Pharmacy**.",
        candidates: [
          {
            groundingMetadata: {
              groundingChunks: [
                {
                  maps: {
                    title: "Apollo Pharmacy",
                    uri: "https://maps.google.com/?cid=123",
                    placeId: "place_1",
                  },
                },
              ],
            },
          },
        ],
      })
      .mockRejectedValueOnce(new Error("503 temporary upstream glitch"))
      .mockResolvedValueOnce({
        text: "GRAP Stage 2 लागू है।",
        candidates: [
          {
            groundingMetadata: {
              groundingChunks: [
                {
                  web: {
                    title: "CAQM Bulletin",
                    uri: "https://caqm.nic.in/alert",
                  },
                },
              ],
            },
          },
        ],
      });

    const { app } = buildTestApp({ createGeminiClient: makeMockGemini(mockGen) });

    // Maps grounding
    const mapsRes = await request(app)
      .post("/api/ask")
      .send({
        message: "Where can I buy N95 masks near me?",
        lang: "en",
        place: VALID_PLACE,
        air: VALID_AIR,
        profile: { children: true, commute: "metro", fuel: "lpg", budget: "tight" },
        history: [{ role: "user", text: "Hi" }],
        groundingMode: "auto",
      });

    expect(mapsRes.status).toBe(200);
    expect(mapsRes.body.groundingUsed).toBe("maps");
    expect(mapsRes.body.sources).toHaveLength(1);
    expect(mapsRes.body.sources[0].title).toBe("Apollo Pharmacy");
    expect(mapsRes.body.webSources).toEqual([]);

    // Search grounding with transient retry recovery + Hindi prompt
    const searchRes = await request(app)
      .post("/api/ask")
      .send({
        message: "आज के ताज़ा GRAP नियम क्या हैं?",
        lang: "hi",
        place: VALID_PLACE,
        groundingMode: "search",
      });

    expect(searchRes.status).toBe(200);
    expect(searchRes.body.groundingUsed).toBe("search");
    expect(searchRes.body.webSources).toHaveLength(1);
    expect(searchRes.body.webSources[0].uri).toBe("https://caqm.nic.in/alert");
    expect(mockGen).toHaveBeenCalledTimes(3);
  });

  it("maps Gemini missing key (503), invalid key (403), quota (429), timeout (504), empty (502), and validation errors without leaking PII to audit logs", async () => {
    const secretPrompt = "My child Aarav has asthma at Flat 402 Secret Address";

    // Missing API key
    const { app: noKeyApp, auditLogs: noKeyLogs } = buildTestApp({ geminiApiKey: "" });
    const noKeyRes = await request(noKeyApp)
      .post("/api/ask")
      .send({ message: secretPrompt, place: VALID_PLACE, profile: { children: true, condition: true } });
    expect(noKeyRes.status).toBe(503);
    expect(noKeyRes.body.code).toBe("API_KEY_MISSING");
    expect(noKeyLogs.join("\n")).not.toContain("Aarav");
    expect(noKeyLogs.join("\n")).not.toContain("asthma");

    // Invalid API key (403)
    const { app: badKeyApp } = buildTestApp({
      createGeminiClient: makeMockGemini(async () => {
        throw new Error("403 API_KEY_INVALID");
      }),
    });
    const badKeyRes = await request(badKeyApp).post("/api/ask").send({ message: "Hi", place: VALID_PLACE });
    expect(badKeyRes.status).toBe(403);
    expect(badKeyRes.body.code).toBe("API_KEY_INVALID");

    // Quota exceeded (429)
    const { app: quotaApp } = buildTestApp({
      createGeminiClient: makeMockGemini(async () => {
        throw new Error("429 RESOURCE_EXHAUSTED quota");
      }),
    });
    const quotaRes = await request(quotaApp).post("/api/ask").send({ message: "Hi", place: VALID_PLACE });
    expect(quotaRes.status).toBe(429);
    expect(quotaRes.body.code).toBe("QUOTA_EXCEEDED");

    // Upstream timeout (504)
    const { app: timeoutApp } = buildTestApp({
      geminiTimeoutMs: 30,
      geminiMaxRetries: 0,
      createGeminiClient: makeMockGemini(
        () => new Promise((resolve) => setTimeout(() => resolve({ text: "late" }), 200)),
      ),
    });
    const timeoutRes = await request(timeoutApp).post("/api/ask").send({ message: "Hi", place: VALID_PLACE });
    expect(timeoutRes.status).toBe(504);
    expect(timeoutRes.body.code).toBe("UPSTREAM_TIMEOUT");

    // Empty response (502)
    const { app: emptyApp } = buildTestApp({
      createGeminiClient: makeMockGemini(async () => ({ text: "   " })),
    });
    const emptyRes = await request(emptyApp).post("/api/ask").send({ message: "Hi", place: VALID_PLACE });
    expect(emptyRes.status).toBe(502);
    expect(emptyRes.body.code).toBe("EMPTY_RESPONSE");

    // Validation errors (400)
    const badSchema = await request(emptyApp).post("/api/ask").send({ message: "", place: VALID_PLACE });
    expect(badSchema.status).toBe(400);
    expect(badSchema.body.code).toBe("INVALID_REQUEST");

    const badCoords = await request(emptyApp)
      .post("/api/ask")
      .send({ message: "Air today?", place: { lat: 999, lon: 77 } });
    expect(badCoords.status).toBe(400);
    expect(badCoords.body.code).toBe("INVALID_PLACE");

    const controlOnly = await request(emptyApp)
      .post("/api/ask")
      .send({ message: "\u0000\u0007", place: VALID_PLACE });
    expect(controlOnly.status).toBe(400);
  });

  it("covers /api/maps-explore success, empty, validation, upstream error, and 16kb body limit", async () => {
    const mockGen = vi
      .fn()
      .mockResolvedValueOnce({
        text: "- **AIIMS Emergency** – 24h care",
        candidates: [
          {
            groundingMetadata: {
              groundingChunks: [{ maps: { title: "AIIMS", uri: "https://maps.google.com/?q=AIIMS" } }],
            },
          },
        ],
      })
      .mockResolvedValueOnce({ text: "" })
      .mockRejectedValueOnce(new Error("500 upstream error"));

    const { app } = buildTestApp({ geminiMaxRetries: 0, createGeminiClient: makeMockGemini(mockGen) });

    const ok = await request(app)
      .post("/api/maps-explore")
      .send({ query: "respiratory clinic", lang: "en", place: VALID_PLACE, air: VALID_AIR });
    expect(ok.status).toBe(200);
    expect(ok.body.groundingUsed).toBe("maps");
    expect(ok.body.sources).toHaveLength(1);

    const empty = await request(app)
      .post("/api/maps-explore")
      .send({ query: "pharmacy", place: VALID_PLACE });
    expect(empty.status).toBe(502);
    expect(empty.body.code).toBe("EMPTY_RESPONSE");

    const fail = await request(app)
      .post("/api/maps-explore")
      .send({ query: "pharmacy", place: VALID_PLACE });
    expect(fail.status).toBe(502);
    expect(fail.body.code).toBe("UPSTREAM_ERROR");

    const invalid = await request(app).post("/api/maps-explore").send({ query: "", place: VALID_PLACE });
    expect(invalid.status).toBe(400);

    const invalidCtrl = await request(app)
      .post("/api/maps-explore")
      .send({ query: "\u0001\u0002", place: VALID_PLACE });
    expect(invalidCtrl.status).toBe(400);

    const invalidPlace = await request(app)
      .post("/api/maps-explore")
      .send({ query: "park", place: null });
    expect(invalidPlace.status).toBe(400);

    const tooLarge = await request(app)
      .post("/api/maps-explore")
      .send({ query: "x".repeat(20_000), place: VALID_PLACE });
    expect(tooLarge.status).toBe(413);
    expect(tooLarge.body.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("covers /api/search-alerts success (with and without topic), empty, validation, and upstream error", async () => {
    const mockGen = vi
      .fn()
      .mockResolvedValueOnce({
        text: "- GRAP Stage 2 active.",
        candidates: [
          {
            groundingMetadata: {
              groundingChunks: [{ web: { title: "CPCB", uri: "https://cpcb.nic.in" } }],
            },
          },
        ],
      })
      .mockResolvedValueOnce({ text: "- School timing notice.", candidates: [] })
      .mockResolvedValueOnce({ text: "" })
      .mockRejectedValueOnce(new Error("upstream down"));

    const { app } = buildTestApp({ geminiMaxRetries: 0, createGeminiClient: makeMockGemini(mockGen) });

    const okDefault = await request(app)
      .post("/api/search-alerts")
      .send({ lang: "en", place: VALID_PLACE, air: VALID_AIR });
    expect(okDefault.status).toBe(200);
    expect(okDefault.body.webSources).toHaveLength(1);

    const okTopic = await request(app)
      .post("/api/search-alerts")
      .send({ lang: "hi", place: VALID_PLACE, topic: "school closure" });
    expect(okTopic.status).toBe(200);
    expect(okTopic.body.groundingUsed).toBe("search");

    const empty = await request(app)
      .post("/api/search-alerts")
      .send({ lang: "en", place: VALID_PLACE });
    expect(empty.status).toBe(502);

    const fail = await request(app)
      .post("/api/search-alerts")
      .send({ lang: "en", place: VALID_PLACE });
    expect(fail.status).toBe(502);

    const invalid = await request(app)
      .post("/api/search-alerts")
      .send({ lang: "fr", place: VALID_PLACE });
    expect(invalid.status).toBe(400);

    const invalidPlace = await request(app)
      .post("/api/search-alerts")
      .send({ lang: "en", place: { lat: "bad", lon: 77 } });
    expect(invalidPlace.status).toBe(400);
  });

  it("handles unknown /api/* 404, malformed JSON 400, oversized /api/ask 413, and unexpected 500 errors", async () => {
    const { app } = buildTestApp();

    const notFound = await request(app).get("/api/does-not-exist");
    expect(notFound.status).toBe(404);
    expect(notFound.body.code).toBe("NOT_FOUND");

    const malformed = await request(app)
      .post("/api/ask")
      .set("Content-Type", "application/json")
      .send("{not valid json");
    expect(malformed.status).toBe(400);
    expect(malformed.body.code).toBe("INVALID_JSON");

    const tooLarge = await request(app)
      .post("/api/ask")
      .send({ message: "a".repeat(40_000), place: VALID_PLACE });
    expect(tooLarge.status).toBe(413);
    expect(tooLarge.body.code).toBe("PAYLOAD_TOO_LARGE");

    // Verify central error handler handles generic unhandled errors for both /api and non-api routes
    const customApp = express();
    customApp.get("/api/boom", () => {
      throw new Error("boom");
    });
    customApp.get("/page-boom", () => {
      throw new Error("page boom");
    });
    attachCentralErrorHandler(customApp, () => {});

    const apiBoom = await request(customApp).get("/api/boom");
    expect(apiBoom.status).toBe(500);
    expect(apiBoom.body.code).toBe("INTERNAL_ERROR");

    const pageBoom = await request(customApp).get("/page-boom");
    expect(pageBoom.status).toBe(500);
    expect(pageBoom.text).toContain("Something went wrong");
  });

  it("covers TRUST_PROXY env parsing, Hindi maps-explore, and minimal payloads", async () => {
    const prevTrust = process.env.TRUST_PROXY;
    try {
      for (const val of ["true", "false", "2", "invalid", ""]) {
        process.env.TRUST_PROXY = val;
        const app = createExpressApp({ geminiApiKey: "k", mapsApiKey: "", auditSink: () => {} });
        const res = await request(app).get("/api/health");
        expect(res.status).toBe(200);
      }
    } finally {
      if (prevTrust === undefined) delete process.env.TRUST_PROXY;
      else process.env.TRUST_PROXY = prevTrust;
    }

    const mockGen = vi.fn().mockResolvedValue({ text: "स्थानीय फार्मेसी मिली।", candidates: [] });
    const { app } = buildTestApp({ createGeminiClient: makeMockGemini(mockGen) });

    const hiMaps = await request(app)
      .post("/api/maps-explore")
      .send({ query: "pharmacy", lang: "hi", place: { name: "Delhi", lat: 28.61, lon: 77.21 } });
    expect(hiMaps.status).toBe(200);

    const noRegionAlerts = await request(app)
      .post("/api/search-alerts")
      .send({ lang: "en", place: { name: "Delhi", lat: 28.61, lon: 77.21 } });
    expect(noRegionAlerts.status).toBe(200);
  });
});
