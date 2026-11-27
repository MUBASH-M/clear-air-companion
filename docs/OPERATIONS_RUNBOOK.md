# Production Operations Runbook

## 1. Architecture & Runtime Overview

- **Runtime:** Node.js 22 serving a single Express 5 process (`server.ts` → `server/app.ts`) with gzip compression (`compression`), immutable `/assets` caching (`max-age=31536000, immutable`), and no-cache HTML shell delivery.
- **Port:** `PORT` (default `3000`), bound behind an HTTPS-terminating reverse proxy/load balancer (`TRUST_PROXY=1`).
- **Stateless Design:** Zero server-side database or session store; horizontal scaling requires only configuring a shared rate-limiter adapter (e.g., Redis-backed `RateLimitCheckFn` injected into `createExpressApp({ rateLimiter })`).

## 2. Environment Variables

All required and optional configuration variables are documented in `.env.example`:
- `GEMINI_API_KEY` (required secret — never committed or exposed to browser)
- `GEMINI_MODEL` (optional, default `gemini-4-hydrogen`)
- `VITE_GOOGLE_MAPS_API_KEY` (public HTTP-referrer-restricted browser key)
- `ALLOWED_ORIGINS` (comma-separated HTTPS origins permitted to call `/api/*`)
- `TRUST_PROXY` (`1` behind a single reverse proxy)
- `GEMINI_TIMEOUT_MS` (default `15000`)
- `MAINTENANCE_MODE` (`true` to enable graceful 503 mode)

## 3. Health Checks, Tracing & Structured Logging

- **Health endpoint:** `GET /api/health`
  - Returns `200 OK` with `{ ok: true, status: "ok", geminiConfigured, mapsConfigured, uptimeSec }` during normal operation.
  - Returns `503 Service Unavailable` with `{ ok: false, status: "maintenance", ... }` when `MAINTENANCE_MODE=true`.
- **Request correlation:** Every response includes `X-Request-Id` (echoing a sanitized incoming `X-Request-Id` header or generating a UUIDv4).
- **Structured audit logs:** JSON lines emitted for `cors_rejected`, `rate_limited`, `malformed_json`, `payload_too_large`, `invalid_request`, `upstream_failure`, `maintenance_rejected`, and `unhandled_error`. Logs contain zero PII, zero prompt text, and zero household profile data.

## 4. Monitoring & Alerting Thresholds

Configure log-based metrics and uptime monitors on your hosting platform (e.g., Cloud Run / Cloud Monitoring / Prometheus):

| Metric | Warning Alert | Critical Page |
| --- | --- | --- |
| `/api/health` uptime probe | 1 failed check | 2 consecutive failures (60s) |
| HTTP 5xx error rate (`/api/*`) | > 1% over 5 min | > 5% over 5 min |
| `upstream_failure` / `UPSTREAM_TIMEOUT` rate | > 5 events / 5 min | > 20 events / 5 min |
| `rate_limited` (429) spike | > 30 events / 5 min | > 100 events / 5 min |
| P95 latency on `/api/ask` | > 4.5s | > 10s |

## 5. Graceful Maintenance Mode

To pause write/AI traffic during key rotation or upstream outages without dropping health probes:
1. Set `MAINTENANCE_MODE=true` in deployment environment config and roll out.
2. All `/api/*` endpoints (except `/api/health`) immediately return `503 Service Unavailable` with `Retry-After: 300` and code `MAINTENANCE_MODE`.
3. Verify `/api/health` reports `status: "maintenance"`.
4. Clear `MAINTENANCE_MODE=false` when maintenance completes.

## 6. Deployment, Staging Smoke Test & Rollback (< 10 Minutes)

### Safe Deployment Pipeline
1. Merge only after `.github/workflows/ci.yml` passes (lint, >=90% coverage, production build, bundle budget, `npm audit`, secret scan, Playwright E2E).
2. Deploy candidate build to staging and verify:
   - `curl -sf https://<staging>/api/health` returns `ok: true` and `X-Request-Id`
   - Response headers include `Strict-Transport-Security`, `Content-Security-Policy`, `X-Content-Type-Options: nosniff`
   - Invalid origin receives `403 CORS_ORIGIN_DENIED`
3. Promote verified immutable build artifact to production.

### Rollback Procedure (Target < 10 Minutes)
1. Identify the last known-good revision/image tag in the container/hosting registry.
2. Route 100% traffic back to the previous revision (or redeploy previous tag) — typically 1–3 minutes on Cloud Run / containerized hosts.
3. Confirm `GET /api/health` returns `200 OK` and 5xx error rate returns to baseline.
4. Open a post-incident review issue linking the offending commit SHA and request IDs.

## 7. Incident Response & API Key Rotation

If `GEMINI_API_KEY` or `VITE_GOOGLE_MAPS_API_KEY` is suspected compromised or quota-exhausted:
1. Generate a replacement key in Google Cloud / AI Studio with API restrictions and HTTP referrer / server restrictions applied.
2. Update the secret manager entry (`GEMINI_API_KEY` / `VITE_GOOGLE_MAPS_API_KEY`) and trigger a rolling restart.
3. Revoke the previous key immediately after confirming `geminiConfigured: true` on `/api/health`.
