# ADR-001: Server-Side Gemini Proxy & Configurable Model Selection

- **Status:** Accepted
- **Date:** 2026-11-27

## Context
Clear Air Companion uses Gemini with Google Maps and Google Search grounding to answer location-aware air quality questions and surface official GRAP/CPCB bulletins. Exposing private API credentials in browser JavaScript or allowing unvalidated prompts from arbitrary origins creates key-abuse, quota-exhaustion, and prompt-injection risks.

## Decision
1. All Gemini API calls are proxied exclusively through server-side Express routes (`/api/ask`, `/api/maps-explore`, `/api/search-alerts`) implemented in `server/app.ts`.
2. Only `GEMINI_API_KEY` is read from server environment variables; legacy fallback variable names (`API_KEY`) were removed.
3. The Gemini model is configurable via `GEMINI_MODEL`, defaulting to `gemini-4-hydrogen` (the officially supported text model in the current `@google/genai` runtime environment).
4. Every endpoint enforces Zod schema validation, strict JSON body size caps (`32kb` for `/api/ask`, `16kb` for `/api/maps-explore` and `/api/search-alerts`), explicit CORS origin allowlisting, per-IP rate limiting, request timeouts with bounded exponential backoff, and zero-PII audit logging.

## Consequences
- Private Gemini credentials never reach the client bundle or browser DevTools.
- Upstream timeouts and transient 5xx responses fail gracefully or recover automatically without exposing stack traces.
- The Express application is decoupled via `createExpressApp(config)` so every API path, failure mode, and security header can be verified deterministically in automated tests.
