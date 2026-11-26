import "dotenv/config";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";

type Lang = "en" | "hi";

type PlaceInput = {
  name: string;
  region?: string;
  lat: number;
  lon: number;
};

type AirSummaryInput = {
  aqi: number;
  category: string;
  dominant: string;
  pm25: number;
  pm10: number;
  bestWindow?: string | null;
  worstWindow?: string | null;
};

type ProfileInput = {
  children?: boolean;
  olderAdult?: boolean;
  pregnant?: boolean;
  condition?: boolean;
  home?: string;
  commute?: string;
  fuel?: string;
  budget?: string;
};

type HistoryItem = {
  role: "user" | "assistant";
  text: string;
};

export type MapsReviewSnippet = {
  uri?: string;
  title?: string;
  text?: string;
};

export type MapsGroundingSource = {
  title: string;
  uri: string;
  placeId?: string;
  reviewSnippets: MapsReviewSnippet[];
};

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === "production";
const ROOT_DIR = import.meta.dirname;
const CLIENT_DIR = path.resolve(ROOT_DIR, "client");
const DIST_DIR = path.resolve(ROOT_DIR, "dist/public");

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
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

function isSafeHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function extractMapsSources(response: unknown): MapsGroundingSource[] {
  const resp = response as {
    candidates?: Array<{
      groundingMetadata?: {
        groundingChunks?: Array<{
          maps?: {
            uri?: string;
            title?: string;
            placeId?: string;
            placeAnswerSources?: {
              reviewSnippets?: Array<{
                uri?: string;
                title?: string;
                reviewText?: string;
                text?: string;
              }>;
            };
          };
        }>;
      };
    }>;
  };

  const chunks = resp?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (!Array.isArray(chunks)) return [];

  const seen = new Set<string>();
  const results: MapsGroundingSource[] = [];

  for (const chunk of chunks) {
    const maps = chunk?.maps;
    if (!maps || !isSafeHttpUrl(maps.uri)) continue;
    if (seen.has(maps.uri)) continue;
    seen.add(maps.uri);

    const rawSnippets = maps.placeAnswerSources?.reviewSnippets;
    const reviewSnippets: MapsReviewSnippet[] = Array.isArray(rawSnippets)
      ? rawSnippets
          .map((s) => ({
            uri: isSafeHttpUrl(s?.uri) ? s.uri : undefined,
            title: typeof s?.title === "string" ? s.title : undefined,
            text:
              typeof s?.reviewText === "string"
                ? s.reviewText
                : typeof s?.text === "string"
                  ? s.text
                  : undefined,
          }))
          .filter((s) => Boolean(s.uri || s.text || s.title))
          .slice(0, 3)
      : [];

    results.push({
      title: typeof maps.title === "string" && maps.title.trim() ? maps.title.trim() : "View on Google Maps",
      uri: maps.uri,
      placeId: typeof maps.placeId === "string" ? maps.placeId : undefined,
      reviewSnippets,
    });
  }

  return results;
}

function validateLatLon(place: unknown): PlaceInput | null {
  if (!place || typeof place !== "object") return null;
  const p = place as Record<string, unknown>;
  const lat = Number(p.lat);
  const lon = Number(p.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return null;
  }
  const name = typeof p.name === "string" && p.name.trim() ? p.name.trim().slice(0, 120) : "Selected location";
  const region = typeof p.region === "string" ? p.region.trim().slice(0, 120) : undefined;
  return { name, region, lat, lon };
}

function formatContextBlock(place: PlaceInput, air?: AirSummaryInput, profile?: ProfileInput): string {
  const lines: string[] = [
    `Location: ${place.name}${place.region ? ` (${place.region})` : ""} [${place.lat.toFixed(2)}, ${place.lon.toFixed(2)}]`,
  ];

  if (air && Number.isFinite(Number(air.aqi))) {
    lines.push(
      `Live air quality estimate (Open-Meteo CAMS, India CPCB AQI scale): AQI ${Math.round(Number(air.aqi))} (${String(air.category ?? "unknown")}), dominant pollutant ${String(air.dominant ?? "PM2.5")}, PM2.5 ${Math.round(Number(air.pm25 ?? 0))} µg/m³, PM10 ${Math.round(Number(air.pm10 ?? 0))} µg/m³.`,
    );
    if (air.bestWindow) lines.push(`Cleanest waking window today: ${String(air.bestWindow)}.`);
    if (air.worstWindow) lines.push(`Worst waking window today: ${String(air.worstWindow)}.`);
  }

  if (profile) {
    const flags: string[] = [];
    if (profile.children) flags.push("children at home");
    if (profile.olderAdult) flags.push("older adults (60+)");
    if (profile.pregnant) flags.push("someone is pregnant");
    if (profile.condition) flags.push("asthma, COPD, or heart condition");
    lines.push(
      `Household profile: ${flags.length ? flags.join(", ") : "no special sensitivity flags"}; home=${profile.home ?? "apartment"}; commute=${profile.commute ?? "metro"}; cooking fuel=${profile.fuel ?? "lpg"}; budget=${profile.budget ?? "tight"}.`,
    );
  }

  return lines.join("\n");
}

function handleGeminiError(err: unknown, res: express.Response) {
  const message = err instanceof Error ? err.message : String(err);
  console.error("Gemini API error:", message);

  if (message === "GEMINI_API_KEY_MISSING") {
    return res.status(503).json({
      error: "Gemini API key is not configured. Check Settings > Secrets to set GEMINI_API_KEY.",
      code: "API_KEY_MISSING",
    });
  }

  const lower = message.toLowerCase();
  if (lower.includes("403") || lower.includes("permission_denied") || lower.includes("api_key_invalid")) {
    return res.status(403).json({
      error: "Gemini API key was rejected. Please verify your API key in Settings > Secrets.",
      code: "API_KEY_INVALID",
    });
  }
  if (lower.includes("429") || lower.includes("resource_exhausted") || lower.includes("quota")) {
    return res.status(429).json({
      error: "Rate limit or quota reached for the Gemini API. Please try again shortly.",
      code: "QUOTA_EXCEEDED",
    });
  }

  return res.status(502).json({
    error: "Unable to get a live response right now. Please try again in a moment.",
    code: "UPSTREAM_ERROR",
  });
}

async function createServer() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.post("/api/ask", async (req, res) => {
    try {
      const body = req.body as {
        message?: unknown;
        lang?: unknown;
        place?: unknown;
        air?: AirSummaryInput;
        profile?: ProfileInput;
        history?: unknown;
      };

      const message = typeof body.message === "string" ? body.message.trim() : "";
      if (!message || message.length > 1500) {
        return res.status(400).json({ error: "Please enter a valid question." });
      }

      const lang: Lang = body.lang === "hi" ? "hi" : "en";
      const place = validateLatLon(body.place);
      if (!place) {
        return res.status(400).json({ error: "Valid location coordinates are required." });
      }

      const history: HistoryItem[] = Array.isArray(body.history)
        ? body.history
            .filter(
              (item): item is HistoryItem =>
                Boolean(item) &&
                typeof item === "object" &&
                ((item as HistoryItem).role === "user" || (item as HistoryItem).role === "assistant") &&
                typeof (item as HistoryItem).text === "string",
            )
            .slice(-6)
        : [];

      const ai = getGeminiClient();
      const context = formatContextBlock(place, body.air, body.profile);

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
          parts: [{ text: item.text.slice(0, 1200) }],
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

  app.post("/api/maps-explore", async (req, res) => {
    try {
      const body = req.body as {
        query?: unknown;
        lang?: unknown;
        place?: unknown;
        air?: AirSummaryInput;
      };

      const query = typeof body.query === "string" ? body.query.trim() : "";
      if (!query || query.length > 500) {
        return res.status(400).json({ error: "Please enter a valid place query." });
      }

      const lang: Lang = body.lang === "hi" ? "hi" : "en";
      const place = validateLatLon(body.place);
      if (!place) {
        return res.status(400).json({ error: "Valid location coordinates are required." });
      }

      const ai = getGeminiClient();
      const context = formatContextBlock(place, body.air);

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

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      configFile: path.resolve(ROOT_DIR, "vite.config.ts"),
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: "spa",
    });

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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Clear Air Companion server listening on http://0.0.0.0:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
