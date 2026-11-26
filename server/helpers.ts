import { z } from "zod";

export type Lang = "en" | "hi";

export type PlaceInput = {
  name: string;
  region?: string;
  lat: number;
  lon: number;
};

export type AirSummaryInput = {
  aqi: number;
  category: string;
  dominant: string;
  pm25: number;
  pm10: number;
  bestWindow?: string | null;
  worstWindow?: string | null;
};

export type ProfileInput = {
  children?: boolean;
  olderAdult?: boolean;
  pregnant?: boolean;
  condition?: boolean;
  home?: string;
  commute?: string;
  fuel?: string;
  budget?: string;
};

export type HistoryItem = {
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

const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]+/g;

export function sanitizeInlineText(value: string, maxLen: number): string {
  return value.replace(CONTROL_CHARS_RE, " ").replace(/\s+/g, " ").trim().slice(0, maxLen);
}

export function isSafeHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function validateLatLon(place: unknown): PlaceInput | null {
  if (!place || typeof place !== "object") return null;
  const p = place as Record<string, unknown>;
  const lat = Number(p.lat);
  const lon = Number(p.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return null;
  }
  const rawName = typeof p.name === "string" ? sanitizeInlineText(p.name, 120) : "";
  const rawRegion = typeof p.region === "string" ? sanitizeInlineText(p.region, 120) : "";
  return {
    name: rawName || "Selected location",
    region: rawRegion || undefined,
    lat,
    lon,
  };
}

const airSummarySchema = z
  .object({
    aqi: z.number().finite().min(0).max(1000),
    category: z.string().max(40),
    dominant: z.string().max(20),
    pm25: z.number().finite().min(0).max(5000),
    pm10: z.number().finite().min(0).max(5000),
    bestWindow: z.string().max(60).nullable().optional(),
    worstWindow: z.string().max(60).nullable().optional(),
  })
  .optional();

const profileSchema = z
  .object({
    children: z.boolean().optional(),
    olderAdult: z.boolean().optional(),
    pregnant: z.boolean().optional(),
    condition: z.boolean().optional(),
    home: z.enum(["apartment", "house", "shared"]).optional(),
    commute: z.enum(["metro", "bus", "car", "two_wheeler", "auto", "walk_cycle", "home"]).optional(),
    fuel: z.enum(["lpg", "induction", "wood", "kerosene"]).optional(),
    budget: z.enum(["tight", "some", "comfortable"]).optional(),
  })
  .optional();

const historyItemSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().min(1).max(2000),
});

export const askRequestSchema = z.object({
  message: z.string().trim().min(1).max(1500),
  lang: z.enum(["en", "hi"]).default("en"),
  place: z.unknown(),
  air: airSummarySchema,
  profile: profileSchema,
  history: z.array(historyItemSchema).max(12).optional(),
});

export const mapsExploreRequestSchema = z.object({
  query: z.string().trim().min(1).max(500),
  lang: z.enum(["en", "hi"]).default("en"),
  place: z.unknown(),
  air: airSummarySchema,
});

export function sanitizeHistory(raw: unknown): HistoryItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is HistoryItem =>
        Boolean(item) &&
        typeof item === "object" &&
        ((item as HistoryItem).role === "user" || (item as HistoryItem).role === "assistant") &&
        typeof (item as HistoryItem).text === "string" &&
        (item as HistoryItem).text.trim().length > 0,
    )
    .slice(-6)
    .map((item) => ({
      role: item.role,
      text: item.text.trim().slice(0, 1200),
    }));
}

export function extractMapsSources(response: unknown): MapsGroundingSource[] {
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
            title: typeof s?.title === "string" ? sanitizeInlineText(s.title, 160) : undefined,
            text:
              typeof s?.reviewText === "string"
                ? sanitizeInlineText(s.reviewText, 400)
                : typeof s?.text === "string"
                  ? sanitizeInlineText(s.text, 400)
                  : undefined,
          }))
          .filter((s) => Boolean(s.uri || s.text || s.title))
          .slice(0, 3)
      : [];

    const cleanTitle = typeof maps.title === "string" ? sanitizeInlineText(maps.title, 160) : "";
    results.push({
      title: cleanTitle || "View on Google Maps",
      uri: maps.uri,
      placeId: typeof maps.placeId === "string" ? sanitizeInlineText(maps.placeId, 160) : undefined,
      reviewSnippets,
    });
  }

  return results;
}

export function formatContextBlock(place: PlaceInput, air?: AirSummaryInput, profile?: ProfileInput): string {
  const safeName = sanitizeInlineText(place.name, 120);
  const safeRegion = place.region ? sanitizeInlineText(place.region, 120) : "";
  const lines: string[] = [
    `Location: ${safeName}${safeRegion ? ` (${safeRegion})` : ""} [${place.lat.toFixed(2)}, ${place.lon.toFixed(2)}]`,
  ];

  if (air && Number.isFinite(Number(air.aqi))) {
    const safeCat = sanitizeInlineText(String(air.category ?? "unknown"), 40);
    const safeDom = sanitizeInlineText(String(air.dominant ?? "PM2.5"), 20);
    lines.push(
      `Live air quality estimate (Open-Meteo CAMS, India CPCB AQI scale): AQI ${Math.round(Number(air.aqi))} (${safeCat}), dominant pollutant ${safeDom}, PM2.5 ${Math.round(Number(air.pm25 ?? 0))} µg/m³, PM10 ${Math.round(Number(air.pm10 ?? 0))} µg/m³.`,
    );
    if (air.bestWindow) lines.push(`Cleanest waking window today: ${sanitizeInlineText(String(air.bestWindow), 60)}.`);
    if (air.worstWindow) lines.push(`Worst waking window today: ${sanitizeInlineText(String(air.worstWindow), 60)}.`);
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

export function mapGeminiError(err: unknown): { status: number; code: string; error: string } {
  const message = err instanceof Error ? err.message : String(err);

  if (message === "GEMINI_API_KEY_MISSING") {
    return {
      status: 503,
      code: "API_KEY_MISSING",
      error: "Gemini API key is not configured yet. Please check Settings > Secrets to attach GEMINI_API_KEY, then retry.",
    };
  }

  const lower = message.toLowerCase();
  if (lower.includes("403") || lower.includes("permission_denied") || lower.includes("api_key_invalid")) {
    return {
      status: 403,
      code: "API_KEY_INVALID",
      error: "Gemini API key was rejected. Please verify your API key in Settings > Secrets.",
    };
  }
  if (lower.includes("429") || lower.includes("resource_exhausted") || lower.includes("quota")) {
    return {
      status: 429,
      code: "QUOTA_EXCEEDED",
      error: "Rate limit or quota reached for the Gemini API. Please try again shortly.",
    };
  }

  return {
    status: 502,
    code: "UPSTREAM_ERROR",
    error: "Unable to get a live response right now. Please try again in a moment.",
  };
}

export function createRateLimiter(options: { windowMs: number; maxRequests: number; maxEntries?: number }) {
  const { windowMs, maxRequests, maxEntries = 500 } = options;
  const buckets = new Map<string, number[]>();

  return function checkLimit(key: string, now = Date.now()): { allowed: boolean; retryAfterSec: number } {
    const cutoff = now - windowMs;
    const prev = buckets.get(key) ?? [];
    const active = prev.filter((ts) => ts > cutoff);

    if (active.length >= maxRequests) {
      const oldest = active[0] ?? now;
      const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
      buckets.set(key, active);
      return { allowed: false, retryAfterSec };
    }

    active.push(now);
    buckets.set(key, active);

    // Keep memory bounded if many unique IPs hit the server
    if (buckets.size > maxEntries) {
      buckets.forEach((stamps, k) => {
        if (buckets.size > maxEntries && stamps.every((ts) => ts <= cutoff)) {
          buckets.delete(k);
        }
      });
      if (buckets.size > maxEntries) {
        const firstKey = buckets.keys().next().value;
        if (firstKey !== undefined) buckets.delete(firstKey);
      }
    }

    return { allowed: true, retryAfterSec: 0 };
  };
}
