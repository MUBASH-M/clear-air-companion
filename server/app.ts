import crypto from "node:crypto";
import compression from "compression";
import express from "express";
import { GoogleGenAI } from "@google/genai";
import {
  AuditEvent,
  PlaceInput,
  RateLimitCheckFn,
  askRequestSchema,
  chooseGroundingTool,
  createRateLimiter,
  extractMapsSources,
  extractWebSources,
  formatContextBlock,
  isOriginAllowed,
  logAuditEvent,
  mapGeminiError,
  mapsExploreRequestSchema,
  parseAllowedOrigins,
  sanitizeHistory,
  sanitizeInlineText,
  searchAlertsRequestSchema,
  validateLatLon,
  withTimeoutAndRetry,
} from "./helpers";
import type {
  AskResponseDTO,
  HealthResponseDTO,
  MapsConfigResponseDTO,
  SearchAlertsResponseDTO,
} from "../shared/api-types";

export type GeminiLikeClient = {
  models: {
    generateContent: (params: Record<string, unknown>) => Promise<{
      text?: string;
      candidates?: unknown[];
    }>;
  };
};

export type AppConfig = {
  isProd?: boolean;
  geminiApiKey?: string;
  geminiModel?: string;
  mapsApiKey?: string;
  allowedOrigins?: string[];
  trustProxy?: boolean | number | string;
  maintenanceMode?: boolean;
  geminiTimeoutMs?: number;
  geminiMaxRetries?: number;
  rateLimiter?: RateLimitCheckFn;
  createGeminiClient?: (apiKey: string) => GeminiLikeClient;
  auditSink?: (line: string) => void;
};

export const STRICT_CSP = [
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

const DEFAULT_GEMINI_MODEL = "gemini-4-hydrogen";

function defaultGeminiFactory(apiKey: string): GeminiLikeClient {
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  }) as unknown as GeminiLikeClient;
}

function getRequestId(res: express.Response): string {
  return String(res.locals.requestId ?? "unknown");
}

function parseTrustProxy(raw: string | undefined): boolean | number {
  if (!raw) return 1;
  if (raw === "true") return true;
  if (raw === "false") return false;
  const num = Number(raw);
  return Number.isInteger(num) && num >= 0 ? num : 1;
}

function getValidatedMapsApiKey(raw: string): string {
  const trimmed = raw.trim();
  // Reject keys containing whitespace or control characters
  if (!trimmed || /\s/.test(trimmed)) return "";
  return trimmed;
}

export function createExpressApp(config: AppConfig = {}): express.Express {
  const isProd = config.isProd ?? process.env.NODE_ENV === "production";
  const getGeminiApiKey = () =>
    (config.geminiApiKey !== undefined ? config.geminiApiKey : (process.env.GEMINI_API_KEY ?? "")).trim();
  const getGeminiModel = () =>
    (config.geminiModel ?? process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL).trim() || DEFAULT_GEMINI_MODEL;
  const getPublicMapsApiKey = () =>
    getValidatedMapsApiKey(
      config.mapsApiKey !== undefined
        ? config.mapsApiKey
        : (process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || ""),
    );
  const allowedOrigins = config.allowedOrigins ?? parseAllowedOrigins(process.env.ALLOWED_ORIGINS);
  const isMaintenance = () => config.maintenanceMode ?? process.env.MAINTENANCE_MODE === "true";
  const geminiTimeoutMs = config.geminiTimeoutMs ?? (Number(process.env.GEMINI_TIMEOUT_MS) || 15_000);
  const geminiMaxRetries = config.geminiMaxRetries ?? 1;
  const createGeminiClient = config.createGeminiClient ?? defaultGeminiFactory;
  const checkAiRateLimit = config.rateLimiter ?? createRateLimiter({ windowMs: 60_000, maxRequests: 30 });
  const auditSink = config.auditSink ?? console.warn;
  const startedAt = Date.now();

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy ?? parseTrustProxy(process.env.TRUST_PROXY));

  // Compress API and static responses when supported by the client
  app.use(compression());

  const emitAudit = (req: express.Request, res: express.Response, event: AuditEvent["event"], status: number, code: string) => {
    logAuditEvent(
      {
        event,
        requestId: getRequestId(res),
        method: req.method,
        path: req.path,
        status,
        code,
      },
      auditSink,
    );
  };

  // Request ID + defense-in-depth security headers on every response (dev and prod)
  // X-Frame-Options is intentionally omitted to preserve iframe preview compatibility.
  app.use((req, res, next) => {
    const incomingId = typeof req.headers["x-request-id"] === "string" ? sanitizeInlineText(req.headers["x-request-id"], 64) : "";
    const requestId = incomingId || crypto.randomUUID();
    res.locals.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "geolocation=(self)");
    res.setHeader("X-DNS-Prefetch-Control", "off");
    res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");

    if (isProd) {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
      res.setHeader("Content-Security-Policy", STRICT_CSP);
    } else {
      res.setHeader("Content-Security-Policy-Report-Only", STRICT_CSP);
    }

    if (req.path.startsWith("/api/")) {
      res.setHeader("Cache-Control", "no-store");
    }
    next();
  });

  // Explicit CORS verification on /api/* (no wildcard origins)
  app.use("/api", (req, res, next) => {
    const origin = req.headers.origin;
    const host = req.headers.host;
    if (origin && !isOriginAllowed(origin, host, allowedOrigins)) {
      emitAudit(req, res, "cors_rejected", 403, "CORS_ORIGIN_DENIED");
      return res.status(403).json({
        error: "Origin not allowed.",
        code: "CORS_ORIGIN_DENIED",
        requestId: getRequestId(res),
      });
    }
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Request-Id");
    }
    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }
    return next();
  });

  // Graceful maintenance-mode gate (keeps /api/health accessible for probes)
  app.use("/api", (req, res, next) => {
    if (req.path === "/health" || !isMaintenance()) return next();
    res.setHeader("Retry-After", "300");
    emitAudit(req, res, "maintenance_rejected", 503, "MAINTENANCE_MODE");
    return res.status(503).json({
      error: "Clear Air Companion is undergoing brief maintenance. Please try again shortly.",
      code: "MAINTENANCE_MODE",
      requestId: getRequestId(res),
    });
  });

  // Strict per-endpoint JSON body limits
  const askJsonParser = express.json({ limit: "32kb" });
  const mapsExploreJsonParser = express.json({ limit: "16kb" });
  const searchAlertsJsonParser = express.json({ limit: "16kb" });

  const rateLimitMiddleware: express.RequestHandler = (req, res, next) => {
    const clientIp = (req.ip || "unknown").trim();
    const result = checkAiRateLimit(clientIp);
    if (!result.allowed) {
      res.setHeader("Retry-After", String(result.retryAfterSec));
      emitAudit(req, res, "rate_limited", 429, "RATE_LIMITED");
      return res.status(429).json({
        error: "Too many requests. Please wait a moment and try again.",
        code: "RATE_LIMITED",
        requestId: getRequestId(res),
      });
    }
    return next();
  };

  function getGeminiClient(): GeminiLikeClient {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY_MISSING");
    }
    return createGeminiClient(apiKey);
  }

  function requireValidPlace(req: express.Request, rawPlace: unknown, res: express.Response): PlaceInput | null {
    const place = validateLatLon(rawPlace);
    if (!place) {
      emitAudit(req, res, "invalid_request", 400, "INVALID_PLACE");
      res.status(400).json({
        error: "Valid location coordinates are required.",
        code: "INVALID_PLACE",
        requestId: getRequestId(res),
      });
      return null;
    }
    return place;
  }

  function handleGeminiError(err: unknown, req: express.Request, res: express.Response) {
    const mapped = mapGeminiError(err);
    emitAudit(req, res, "upstream_failure", mapped.status, mapped.code);
    return res.status(mapped.status).json({
      error: mapped.error,
      code: mapped.code,
      requestId: getRequestId(res),
    });
  }

  app.get("/api/health", (_req, res) => {
    const maintenance = isMaintenance();
    const body: HealthResponseDTO = {
      ok: !maintenance,
      status: maintenance ? "maintenance" : "ok",
      geminiConfigured: Boolean(getGeminiApiKey()),
      mapsConfigured: Boolean(getPublicMapsApiKey()),
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    };
    res.status(maintenance ? 503 : 200).json(body);
  });

  app.get("/api/maps-config", (_req, res) => {
    const body: MapsConfigResponseDTO = { apiKey: getPublicMapsApiKey() };
    res.json(body);
  });

  app.post("/api/ask", askJsonParser, rateLimitMiddleware, async (req, res) => {
    try {
      const parsed = askRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        emitAudit(req, res, "invalid_request", 400, "INVALID_REQUEST");
        return res.status(400).json({
          error: "Please enter a valid question.",
          code: "INVALID_REQUEST",
          requestId: getRequestId(res),
        });
      }

      const place = requireValidPlace(req, parsed.data.place, res);
      if (!place) return;

      const cleanMessage = sanitizeInlineText(parsed.data.message, 1500);
      if (!cleanMessage) {
        emitAudit(req, res, "invalid_request", 400, "INVALID_REQUEST");
        return res.status(400).json({
          error: "Please enter a valid question.",
          code: "INVALID_REQUEST",
          requestId: getRequestId(res),
        });
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

      const model = getGeminiModel();
      // Note: googleMaps and googleSearch cannot be combined in the same request
      const response = await withTimeoutAndRetry(
        () =>
          selectedTool === "maps"
            ? ai.models.generateContent({
                model,
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
            : ai.models.generateContent({
                model,
                contents,
                config: {
                  systemInstruction,
                  tools: [{ googleSearch: {} }],
                },
              }),
        { timeoutMs: geminiTimeoutMs, maxRetries: geminiMaxRetries },
      );

      const text = (response?.text ?? "").trim();
      const sources = selectedTool === "maps" ? extractMapsSources(response) : [];
      const webSources = selectedTool === "search" ? extractWebSources(response) : [];

      if (!text) {
        emitAudit(req, res, "upstream_failure", 502, "EMPTY_RESPONSE");
        return res.status(502).json({
          error: "Empty response from assistant. Please try again.",
          code: "EMPTY_RESPONSE",
          requestId: getRequestId(res),
        });
      }

      const payload: AskResponseDTO = { text, sources, webSources, groundingUsed: selectedTool };
      return res.json(payload);
    } catch (err) {
      return handleGeminiError(err, req, res);
    }
  });

  app.post("/api/maps-explore", mapsExploreJsonParser, rateLimitMiddleware, async (req, res) => {
    try {
      const parsed = mapsExploreRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        emitAudit(req, res, "invalid_request", 400, "INVALID_REQUEST");
        return res.status(400).json({
          error: "Please enter a valid place query.",
          code: "INVALID_REQUEST",
          requestId: getRequestId(res),
        });
      }

      const place = requireValidPlace(req, parsed.data.place, res);
      if (!place) return;

      const cleanQuery = sanitizeInlineText(parsed.data.query, 500);
      if (!cleanQuery) {
        emitAudit(req, res, "invalid_request", 400, "INVALID_REQUEST");
        return res.status(400).json({
          error: "Please enter a valid place query.",
          code: "INVALID_REQUEST",
          requestId: getRequestId(res),
        });
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

      const response = await withTimeoutAndRetry(
        () =>
          ai.models.generateContent({
            model: getGeminiModel(),
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
          }),
        { timeoutMs: geminiTimeoutMs, maxRetries: geminiMaxRetries },
      );

      const text = (response?.text ?? "").trim();
      const sources = extractMapsSources(response);

      if (!text) {
        emitAudit(req, res, "upstream_failure", 502, "EMPTY_RESPONSE");
        return res.status(502).json({
          error: "Could not find local place information right now.",
          code: "EMPTY_RESPONSE",
          requestId: getRequestId(res),
        });
      }

      const payload: AskResponseDTO = { text, sources, webSources: [], groundingUsed: "maps" };
      return res.json(payload);
    } catch (err) {
      return handleGeminiError(err, req, res);
    }
  });

  app.post("/api/search-alerts", searchAlertsJsonParser, rateLimitMiddleware, async (req, res) => {
    try {
      const parsed = searchAlertsRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        emitAudit(req, res, "invalid_request", 400, "INVALID_REQUEST");
        return res.status(400).json({
          error: "Invalid advisory request.",
          code: "INVALID_REQUEST",
          requestId: getRequestId(res),
        });
      }

      const place = requireValidPlace(req, parsed.data.place, res);
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

      const response = await withTimeoutAndRetry(
        () =>
          ai.models.generateContent({
            model: getGeminiModel(),
            contents: prompt,
            config: {
              systemInstruction,
              tools: [{ googleSearch: {} }],
            },
          }),
        { timeoutMs: geminiTimeoutMs, maxRetries: geminiMaxRetries },
      );

      const text = (response?.text ?? "").trim();
      const webSources = extractWebSources(response);

      if (!text) {
        emitAudit(req, res, "upstream_failure", 502, "EMPTY_RESPONSE");
        return res.status(502).json({
          error: "Could not fetch live air advisories right now.",
          code: "EMPTY_RESPONSE",
          requestId: getRequestId(res),
        });
      }

      const payload: SearchAlertsResponseDTO = { text, webSources, groundingUsed: "search" };
      return res.json(payload);
    } catch (err) {
      return handleGeminiError(err, req, res);
    }
  });

  // Explicit JSON 404 for unknown API endpoints
  app.use("/api", (_req, res) => {
    res.status(404).json({
      error: "API endpoint not found.",
      code: "NOT_FOUND",
      requestId: getRequestId(res),
    });
  });

  return app;
}

export function attachCentralErrorHandler(
  app: express.Express,
  auditSink: (line: string) => void = console.warn,
): void {
  app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const requestId = getRequestId(res);
    const errObj = err as { type?: string; status?: number; message?: string };

    if (errObj?.type === "entity.too.large" || errObj?.status === 413) {
      logAuditEvent(
        { event: "payload_too_large", requestId, method: req.method, path: req.path, status: 413, code: "PAYLOAD_TOO_LARGE" },
        auditSink,
      );
      return res.status(413).json({
        error: "Request payload exceeds the allowed size limit.",
        code: "PAYLOAD_TOO_LARGE",
        requestId,
      });
    }

    if (err instanceof SyntaxError && "body" in err) {
      logAuditEvent(
        { event: "malformed_json", requestId, method: req.method, path: req.path, status: 400, code: "INVALID_JSON" },
        auditSink,
      );
      return res.status(400).json({
        error: "Malformed JSON request body.",
        code: "INVALID_JSON",
        requestId,
      });
    }

    const status = typeof errObj?.status === "number" ? errObj.status : 500;
    logAuditEvent(
      { event: "unhandled_error", requestId, method: req.method, path: req.path, status, code: "INTERNAL_ERROR" },
      auditSink,
    );
    if (req.path.startsWith("/api/")) {
      return res.status(status).json({
        error: "An unexpected server error occurred.",
        code: "INTERNAL_ERROR",
        requestId,
      });
    }
    return res.status(status).send("Something went wrong. Please try again.");
  });
}
