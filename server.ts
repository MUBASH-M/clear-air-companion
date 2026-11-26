import "dotenv/config";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import {
  askRequestSchema,
  createRateLimiter,
  extractMapsSources,
  formatContextBlock,
  mapGeminiError,
  mapsExploreRequestSchema,
  sanitizeHistory,
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
  app.use(express.json({ limit: "256kb" }));

  // Baseline security headers (preserving iframe compatibility by omitting X-Frame-Options)
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "geolocation=(self)");
    next();
  });

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
    res.setHeader("Cache-Control", "no-store");
    res.json({ apiKey: getPublicMapsApiKey() });
  });

  app.post("/api/ask", rateLimitMiddleware, async (req, res) => {
    try {
      const parsed = askRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Please enter a valid question." });
      }

      const { message, lang, air, profile } = parsed.data;
      const place = validateLatLon(parsed.data.place);
      if (!place) {
        return res.status(400).json({ error: "Valid location coordinates are required." });
      }

      const history = sanitizeHistory(parsed.data.history);
      const ai = getGeminiClient();
      const context = formatContextBlock(place, air, profile);

      const systemInstruction = [
        "You are Clear Air Companion, a calm, practical, evidence-based air quality wellbeing assistant for families living through urban smog.",
        `Respond in ${lang === "hi" ? "Hindi (Devanagari script)" : "clear, plain English"}.`,
        "Safety & editorial rules:",
        "- General wellbeing guidance only: never diagnose conditions, prescribe medicines, or recommend drug dosages. Direct breathing emergencies to call 112 (or 108 for ambulance in India).",
        "- Put free and low-cost actions first. Never endorse or promote commercial purifier or mask brands.",
        "- Be honest about limits (for example, houseplants do not measurably clean smoggy indoor air; cloth/surgical masks do not block PM2.5 like a well-fitted N95/FFP2).",
        "- When the user asks about nearby places (pharmacies/N95 masks, hospitals/clinics, metro stations, indoor play spaces, quieter parks, local markets, etc.), use the Google Maps tool to give real, up-to-date nearby places near their coordinates. Never invent place names or addresses.",
        "- Keep answers concise (roughly 80-180 words), practical, and formatted with clean Markdown bullet points when listing steps or places.",
        "",
        "Current user context:",
        context,
      ].join("\n");

      const contents = [
        ...history.map((item) => ({
          role: item.role === "assistant" ? "model" : "user",
          parts: [{ text: item.text }],
        })),
        { role: "user", parts: [{ text: message }] },
      ];

      const response = await ai.models.generateContent({
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
      });

      const text = (response.text ?? "").trim();
      const sources = extractMapsSources(response);

      if (!text) {
        return res.status(502).json({ error: "Empty response from assistant. Please try again." });
      }

      return res.json({ text, sources });
    } catch (err) {
      return handleGeminiError(err, res);
    }
  });

  app.post("/api/maps-explore", rateLimitMiddleware, async (req, res) => {
    try {
      const parsed = mapsExploreRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Please enter a valid place query." });
      }

      const { query, lang, air } = parsed.data;
      const place = validateLatLon(parsed.data.place);
      if (!place) {
        return res.status(400).json({ error: "Valid location coordinates are required." });
      }

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
        contents: `Find places near ${place.name}: ${query}`,
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
        return res.status(502).json({ error: "Could not find local place information right now." });
      }

      return res.json({ text, sources });
    } catch (err) {
      return handleGeminiError(err, res);
    }
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
