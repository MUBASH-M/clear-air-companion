import "dotenv/config";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import {
  PlaceInput,
  askRequestSchema,
  chooseGroundingTool,
  createRateLimiter,
  extractMapsSources,
  extractWebSources,
  formatContextBlock,
  mapGeminiError,
  mapsExploreRequestSchema,
  sanitizeHistory,
  sanitizeInlineText,
  searchAlertsRequestSchema,
  validateLatLon,
} from "./server/helpers";

function parseCliArg(flag: string): string | undefined {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === flag && args[i + 1]) return args[i + 1];
    if (arg.startsWith(`${flag}=`)) return arg.slice(flag.length + 1);
  }
  return undefined;
}

const PORT = Number(parseCliArg("--port") || process.env.PORT) || 3000;
const HOST = parseCliArg("--host") || process.env.HOST || "0.0.0.0";
const IS_PROD = process.env.NODE_ENV === "production";
const ROOT_DIR = import.meta.dirname;
const CLIENT_DIR = path.resolve(ROOT_DIR, "client");
const DIST_DIR = path.resolve(ROOT_DIR, "dist/public");

const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self' https://maps.googleapis.com https://maps.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https://*.googleapis.com https://*.gstatic.com https://*.ggpht.com https://*.googleusercontent.com",
  "connect-src 'self' https://air-quality-api.open-meteo.com https://api.open-meteo.com https://geocoding-api.open-meteo.com https://nominatim.openstreetmap.org https://get.geojs.io https://ipinfo.io https://*.googleapis.com https://*.gstatic.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

function getGeminiApiKey(): string {
  return (process.env.GEMINI_API_KEY || process.env.API_KEY || "").trim();
}

function getPublicMapsApiKey(): string {
  return (process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "").trim();
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY_MISSING");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function getClientKey(req: express.Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  const first = Array.isArray(forwarded) ? forwarded[0] : typeof forwarded === "string" ? forwarded.split(",")[0] : "";
  return (first || req.ip || "unknown").trim();
}

function requireValidPlace(rawPlace: unknown, res: express.Response): PlaceInput | null {
  const place = validateLatLon(rawPlace);
  if (!place) {
    res.status(400).json({ error: "Valid location coordinates are required.", code: "INVALID_PLACE" });
    return null;
  }
  return place;
}

function handleGeminiError(err: unknown, res: express.Response) {
  const mapped = mapGeminiError(err);
  if (mapped.code !== "API_KEY_MISSING") {
    console.error("Gemini API request failed:", mapped.code);
  }
  return res.status(mapped.status).json({
    error: mapped.error,
    code: mapped.code,
  });
}

async function createServer() {
  const app = express();
  app.disable("x-powered-by");

  // Defense-in-depth security headers (omitting X-Frame-Options to preserve iframe preview)
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "geolocation=(self)");
    res.setHeader("X-DNS-Prefetch-Control", "off");
    res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
    if (IS_PROD) {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
      res.setHeader("Content-Security-Policy", PRODUCTION_CSP);
    }
    if (req.path.startsWith("/api/")) {
      res.setHeader("Cache-Control", "no-store");
    }
    next();
  });

  app.use(express.json({ limit: "256kb" }));

  const checkAiRateLimit = createRateLimiter({ windowMs: 60_000, maxRequests: 30 });

  const rateLimitMiddleware: express.RequestHandler = (req, res, next) => {
    const result = checkAiRateLimit(getClientKey(req));
    if (!result.allowed) {
      res.setHeader("Retry-After", String(result.retryAfterSec));
      return res.status(429).json({
        error: "Too many requests. Please wait a moment and try again.",
        code: "RATE_LIMITED",
      });
    }
    return next();
  };

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, geminiConfigured: Boolean(getGeminiApiKey()) });
  });

  app.get("/api/maps-config", (_req, res) => {
    res.json({ apiKey: getPublicMapsApiKey() });
  });

  app.post("/api/ask", rateLimitMiddleware, async (req, res) => {
    try {
      const parsed = askRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Please enter a valid question.", code: "INVALID_REQUEST" });
      }

      const place = requireValidPlace(parsed.data.place, res);
      if (!place) return;

      const cleanMessage = sanitizeInlineText(parsed.data.message, 1500);
      if (!cleanMessage) {
        return res.status(400).json({ error: "Please enter a valid question.", code: "INVALID_REQUEST" });
      }

      const { lang, air, profile, groundingMode } = parsed.data;
      const history = sanitizeHistory(parsed.data.history);
      const ai = getGeminiClient();
      const context = formatContextBlock(place, air, profile);
      const selectedTool = chooseGroundingTool(cleanMessage, groundingMode);

      const groundingInstruction =
        selectedTool === "maps"
          ? "- Use the Google Maps tool to give real, up-to-date nearby places near the user's coordinates (pharmacies/N95 masks, hospitals/clinics, metro stations, indoor spaces, quieter parks). Never invent place names or addresses."
          : "- Use the Google Search tool when current news, GRAP/CAQM pollution stages, CPCB advisories, school circulars, or up-to-date public health guidance are relevant. Cite facts accurately without inventing announcements.";

      const systemInstruction = [
        "You are Clear Air Companion, a calm, practical, evidence-based air quality wellbeing assistant for families living through urban smog.",
        `Respond in ${lang === "hi" ? "Hindi (Devanagari script)" : "clear, plain English"}.`,
        "Safety & editorial rules:",
        "- General wellbeing guidance only: never diagnose conditions, prescribe medicines, or recommend drug dosages. Direct breathing emergencies to call 112 (or 108 for ambulance in India).",
        "- Put free and low-cost actions first. Never endorse or promote commercial purifier or mask brands.",
        "- Be honest about limits (for example, houseplants do not measurably clean smoggy indoor air; cloth/surgical masks do not block PM2.5 like a well-fitted N95/FFP2).",
        groundingInstruction,
        "- Keep answers concise (roughly 80-180 words), practical, and formatted with clean Markdown bullet points when listing steps or places.",
        "",
        "Current user context:",
        context,
      ].join("\n");

      const contents = [
        ...history.map((item) => ({
          role: item.role === "assistant" ? "model" : "user",
          parts: [{ text: sanitizeInlineText(item.text, 1200) }],
        })),
        { role: "user", parts: [{ text: cleanMessage }] },
      ];

      // Note: googleMaps and googleSearch cannot be combined in the same request
      const response =
        selectedTool === "maps"
          ? await ai.models.generateContent({
              model: "gemini-4-hydrogen",
              contents,
              config: {
                systemInstruction,
                tools: [{ googleMaps: {} }],
                toolConfig: {
                  retrievalConfig: {
                    latLng: {
                      latitude: place.lat,
                      longitude: place.lon,
                    },
                  },
                },
              },
            })
          : await ai.models.generateContent({
              model: "gemini-4-hydrogen",
              contents,
              config: {
                systemInstruction,
                tools: [{ googleSearch: {} }],
              },
            });

      const text = (response.text ?? "").trim();
      const sources = selectedTool === "maps" ? extractMapsSources(response) : [];
      const webSources = selectedTool === "search" ? extractWebSources(response) : [];

      if (!text) {
        return res.status(502).json({ error: "Empty response from assistant. Please try again.", code: "EMPTY_RESPONSE" });
      }

      return res.json({ text, sources, webSources, groundingUsed: selectedTool });
    } catch (err) {
      return handleGeminiError(err, res);
    }
  });

  app.post("/api/maps-explore", rateLimitMiddleware, async (req, res) => {
    try {
      const parsed = mapsExploreRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Please enter a valid place query.", code: "INVALID_REQUEST" });
      }

      const place = requireValidPlace(parsed.data.place, res);
      if (!place) return;

      const cleanQuery = sanitizeInlineText(parsed.data.query, 500);
      if (!cleanQuery) {
        return res.status(400).json({ error: "Please enter a valid place query.", code: "INVALID_REQUEST" });
      }

      const { lang, air } = parsed.data;
      const ai = getGeminiClient();
      const context = formatContextBlock(place, air);

      const systemInstruction = [
        "You are Clear Air Companion's local place finder powered by Google Maps.",
        `Respond in ${lang === "hi" ? "Hindi (Devanagari script)" : "clear, plain English"}.`,
        "Use the Google Maps tool to find real, up-to-date places near the user's coordinates.",
        "For each recommended place, briefly explain why it helps given today's air quality (for example: enclosed air-conditioned space, pharmacy likely carrying N95/FFP2 masks, 24-hour respiratory care, or metro access to cut roadside exposure).",
        "Never invent place names, addresses, ratings, or opening hours. Keep the summary crisp (3-5 top places in clean Markdown bullets).",
        "",
        "Current user context:",
        context,
      ].join("\n");

      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: `Find places near ${place.name}: ${cleanQuery}`,
        config: {
          systemInstruction,
          tools: [{ googleMaps: {} }],
          toolConfig: {
            retrievalConfig: {
              latLng: {
                latitude: place.lat,
                longitude: place.lon,
              },
            },
          },
        },
      });

      const text = (response.text ?? "").trim();
      const sources = extractMapsSources(response);

      if (!text) {
        return res.status(502).json({ error: "Could not find local place information right now.", code: "EMPTY_RESPONSE" });
      }

      return res.json({ text, sources, webSources: [], groundingUsed: "maps" });
    } catch (err) {
      return handleGeminiError(err, res);
    }
  });

  app.post("/api/search-alerts", rateLimitMiddleware, async (req, res) => {
    try {
      const parsed = searchAlertsRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid advisory request.", code: "INVALID_REQUEST" });
      }

      const place = requireValidPlace(parsed.data.place, res);
      if (!place) return;

      const { lang, air } = parsed.data;
      const cleanTopic = parsed.data.topic ? sanitizeInlineText(parsed.data.topic, 240) : "";
      const ai = getGeminiClient();
      const context = formatContextBlock(place, air);
      const locationLabel = place.region ? `${place.name}, ${place.region}` : place.name;

      const systemInstruction = [
        "You are Clear Air Companion's live air quality news & official advisory brief powered by Google Search.",
        `Respond in ${lang === "hi" ? "Hindi (Devanagari script)" : "clear, plain English"}.`,
        "Use Google Search to check for the latest real-world air quality alerts, GRAP/pollution stages, official environmental agency bulletins, school/commute advisories, or weather shifts affecting air quality in the user's location.",
        "If no special emergency advisory is currently active, briefly state the current air outlook and seasonal factors clearly without inventing alerts.",
        "Format as 3-4 concise Markdown bullet points (roughly 80-140 words total). Never give medical diagnoses.",
        "",
        "Current user context:",
        context,
      ].join("\n");

      const prompt = cleanTopic
        ? `Check latest air quality news and advisories for ${locationLabel} regarding: ${cleanTopic}`
        : `What are the latest air quality advisories, GRAP or official pollution alerts, and 24-48 hour smog outlook for ${locationLabel} right now?`;

      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: prompt,
        config: {
          systemInstruction,
          tools: [{ googleSearch: {} }],
        },
      });

      const text = (response.text ?? "").trim();
      const webSources = extractWebSources(response);

      if (!text) {
        return res.status(502).json({ error: "Could not fetch live air advisories right now.", code: "EMPTY_RESPONSE" });
      }

      return res.json({ text, webSources, groundingUsed: "search" });
    } catch (err) {
      return handleGeminiError(err, res);
    }
  });

  // Explicit JSON 404 for unknown API endpoints
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API endpoint not found.", code: "NOT_FOUND" });
  });

  let viteServer: { close: () => Promise<void> } | null = null;

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      configFile: path.resolve(ROOT_DIR, "vite.config.ts"),
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: "spa",
    });
    viteServer = vite;

    app.use(vite.middlewares);

    app.use(async (req, res, next) => {
      if (req.originalUrl.startsWith("/api/")) return next();
      try {
        const htmlPath = path.resolve(CLIENT_DIR, "index.html");
        const rawHtml = fs.readFileSync(htmlPath, "utf-8");
        const html = await vite.transformIndexHtml(req.originalUrl, rawHtml);
        res.status(200).set({ "Content-Type": "text/html" }).end(html);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    app.use(express.static(DIST_DIR));
    app.use((req, res, next) => {
      if (req.originalUrl.startsWith("/api/")) return next();
      res.sendFile(path.resolve(DIST_DIR, "index.html"));
    });
  }

  // Centralized error handler: cleanly returns JSON without leaking stack traces
  app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof SyntaxError && "body" in err) {
      return res.status(400).json({ error: "Malformed JSON request body.", code: "INVALID_JSON" });
    }
    const status = typeof (err as { status?: unknown })?.status === "number" ? (err as { status: number }).status : 500;
    console.error("Unhandled server error:", err instanceof Error ? err.message : "unknown error");
    if (req.path.startsWith("/api/")) {
      return res.status(status).json({ error: "An unexpected server error occurred.", code: "INTERNAL_ERROR" });
    }
    return res.status(status).send("Something went wrong. Please try again.");
  });

  const httpServer = app.listen(PORT, HOST, () => {
    console.log(`Clear Air Companion server listening on http://${HOST}:${PORT}`);
  });

  const shutdown = () => {
    httpServer.close(() => {
      Promise.resolve(viteServer?.close())
        .catch(() => {})
        .finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 2000).unref();
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

createServer().catch((err) => {
  console.error("Failed to start server:", err instanceof Error ? err.message : "unknown error");
  process.exit(1);
});
