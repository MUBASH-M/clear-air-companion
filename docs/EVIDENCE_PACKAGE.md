# Clear Air Companion — Verification & Evidence Package (PDI-1 through PDI-10)

**Verification Date:** 2026-11-27  
**Node.js Runtime Target:** Node 22 (`package-lock.json` locked for `npm ci`)

This document records reproducible, verified command outputs across every evaluation dimension addressed by PDI-1 through PDI-10.

---

## 1. Executive Scorecard Evidence

| Category | Key Controls & Artifacts | Verified Metric | Status |
| --- | --- | --- | --- |
| **Code Quality** | TypeScript strict check (`tsc --noEmit`), ESLint 9 flat config (`react-hooks`, `jsx-a11y`, `typescript-eslint`, `--max-warnings=0`), Prettier, domain module split (`client/src/lib/companion/*`), shared DTOs (`shared/api-types.ts`), ADRs (`docs/adr/`), `CONTRIBUTING.md`, PR/Issue templates | **0 TypeScript errors · 0 ESLint warnings** | PASS |
| **Security** | Single `GEMINI_API_KEY` secret (fallback `API_KEY` removed), server-side proxy routes, validated Maps key config, strict per-endpoint body caps (`32kb`/`16kb`), explicit CORS allowlist (no wildcard), verified `trust proxy`, rate limiting (`429 + Retry-After`), security headers + CSP in dev/prod, zero-PII audit logs, locked `package-lock.json` | **`npm audit --omit=dev --audit-level=high`: 0 vulnerabilities** · XSS & unsafe-link payloads stripped | PASS |
| **Efficiency** | Route & component `React.lazy` code splitting (`ForecastChart`, `SafeMarkdown`, `SurroundingAirMapCard`, all non-default views), Rollup `manualChunks`, `useMemo` for planning/ranking, `compression` gzip responses, immutable `/assets` CDN caching (`max-age=1y`), Open-Meteo & Gemini timeout + exponential backoff, local Web Vitals monitor (`client/src/lib/vitals.ts`) | **Initial JS: 173.89 KB gzip** (`<= 200 KB`) · **Largest chunk: 154.53 KB gzip** (`<= 250 KB`, lazy) | PASS |
| **Testing** | Vitest unit, API (`supertest` against `createExpressApp`), security, resilience, and `axe-core` tests + Playwright E2E suite (`e2e/companion.spec.ts` targeting Chromium, Firefox, WebKit, Mobile Chrome) | **97/97 tests passing (9/9 files)** · **97.87% statements · 90.82% branches · 96.22% functions · 98.79% lines** | PASS |
| **Accessibility** | Automated `axe-core` WCAG 2.2 AA audits in English (`en`) and Hindi (`hi`), mathematical >=4.5:1 contrast check on all 6 CPCB AQI categories, programmatic dialog focus & Escape restoration, live regions (`role="status"`, `role="alert"`), `motion-reduce` support, sr-only data `<table>` alternative for 24h AQI chart | **0 axe-core violations (EN & HI)** · **>=4.5:1 contrast on 100% of AQI categories** | PASS |
| **Problem Statement Alignment** | India CPCB AQI breakpoints, prominent timestamped CAMS model disclosures + direct official CPCB portal link (`https://airquality.cpcb.gov.in/AQI_India/`), evidence & honest-limitations layer, deterministic client-side `112` emergency safety (`client/src/lib/companion/safety.ts`), bilingual EN/HI copy, session-only privacy (`PRIVACY.md`) | **100% deterministic emergency coverage** · Full methodology in `docs/PUBLIC_HEALTH_METHODOLOGY.md` | PASS |

---

## 2. CI/CD Quality Gate (PDI-1)

Workflow: `.github/workflows/ci.yml`
- All GitHub Actions pinned by immutable commit SHA (`actions/checkout`, `actions/setup-node`, `actions/upload-artifact`).
- Runs on every push and pull request targeting `main` on **Node 22**:
  1. `npm ci` (lockfile-verified install)
  2. `npm run lint` (`tsc --noEmit && eslint client/src server server.ts shared --max-warnings=0`)
  3. `npm test -- --coverage` (enforces `>=90%` statements, branches, functions, and lines)
  4. `npm run build`
  5. `npm run check:budget` (enforces `<=200 KB` gzip initial JS and `<=250 KB` largest chunk)
  6. `npm audit --omit=dev --audit-level=high`
  7. Secret pattern scan across source and config files
  8. Coverage artifact upload (`coverage/`)
  9. Multi-browser Playwright E2E job (Chromium, Firefox, WebKit, Mobile Chrome)

---

## 3. Verified Test & V8 Coverage Breakdown (PDI-2)

Command: `npm test -- --coverage`

| Module Scope | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| **All Tracked Core Modules** | **97.87%** | **90.82%** | **96.22%** | **98.79%** |
| `server/app.ts` | 99.52% | 88.96% | 96.55% | 99.50% |
| `server/helpers.ts` | 98.89% | 92.78% | 100.00% | 98.65% |
| `client/src/lib/companion/*` | 100.00% | 93.64% | 100.00% | 100.00% |
| `client/src/lib/ai.ts` | 100.00% | 93.24% | 100.00% | 100.00% |
| `client/src/lib/air.ts` | 93.96% | 83.95% | 90.24% | 96.91% |
| `client/src/lib/url.ts` | 100.00% | 100.00% | 100.00% | 100.00% |
| `client/src/hooks/use-companion-state.ts` | 93.61% | 75.00% | 93.33% | 97.67% |

---

## 4. Verified Production Bundle Gzip Report (PDI-5)

Command: `npm run build && npm run check:budget`

- **Initial JS total:** `173.89 KB gzip` (Budget: `<= 200 KB gzip`) — **PASS**
  - `assets/index-*.js`: `91.74 KB gzip`
  - `assets/vendor-react-*.js`: `77.18 KB gzip`
  - `assets/vendor-icons-*.js`: `4.97 KB gzip`
- **Largest chunk (lazy-loaded):** `assets/vendor-charts-*.js` (`154.53 KB gzip`, Budget: `<= 250 KB gzip`) — **PASS**
- **Additional lazy chunks:** `vendor-markdown` (`56.74 KB`), `ProfileView` (`32.36 KB`), `vendor-maps` (`24.03 KB`), `AirMapView` (`7.41 KB`), `AskView` (`5.76 KB`), `SurroundingAirMapCard` (`3.13 KB`), `CommunityView` (`2.95 KB`), `ImpactView` (`2.23 KB`), `TipsView` (`2.09 KB`), `ForecastChart` (`0.81 KB`), `SafeMarkdown` (`0.41 KB`).

---

## 5. Governance & Operations Documentation Index (PDI-4, PDI-7, PDI-8, PDI-9)

- **Architecture Decision Records:**
  - `docs/adr/001-server-side-gemini-proxy.md`
  - `docs/adr/002-deterministic-safety-layer.md`
  - `docs/adr/003-browser-session-privacy.md`
- **Public Health & Safety Methodology:** `docs/PUBLIC_HEALTH_METHODOLOGY.md`
- **Privacy Policy & Data Governance:** `PRIVACY.md`
- **Production Operations Runbook:** `docs/OPERATIONS_RUNBOOK.md`
- **Contributor Guidelines & Templates:** `CONTRIBUTING.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/`
