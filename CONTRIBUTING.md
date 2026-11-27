# Contributing to Clear Air Companion

Thank you for helping improve Clear Air Companion. We prioritize **public-health accuracy, accessibility (WCAG 2.2 AA), privacy, and low-cost practicality** for families living through urban air pollution.

## Local Development Setup

```bash
npm ci
cp .env.example .env
# Add GEMINI_API_KEY and VITE_GOOGLE_MAPS_API_KEY to .env
npm run dev
```

## Quality Checks (Required Before Opening a PR)

Run the same checks enforced by `.github/workflows/ci.yml`:

```bash
npm run lint              # TypeScript type-check + ESLint (--max-warnings=0)
npm test -- --coverage    # Unit, API, security, and axe-core accessibility tests (>=90% coverage)
npm run build             # Production Vite bundle
npm run check:budget      # Verifies <200 KB gzip initial JS and <250 KB largest chunk
npm run format:check      # Prettier formatting check
```

## Architecture & Module Boundaries

- `client/src/lib/companion/` — Single-responsibility domain modules:
  - `profile.ts` (household sensitivity & budget helpers)
  - `safety.ts` (deterministic emergency 112 & medical boundary rules)
  - `planning.ts` (daily plan & guidance ranking)
  - `offline-assistant.ts` (deterministic offline guidance)
- `shared/api-types.ts` — Typed request/response DTO contracts shared between Express and React.
- `server/app.ts` & `server/helpers.ts` — Express API factory, security headers, CORS allowlist, Zod validation, timeouts/retries, and zero-PII audit logging.
- `docs/adr/` — Architecture Decision Records.

## Public-Health & Bilingual Standards

- Never add medical diagnoses, prescription dosage advice, or commercial product endorsements.
- Keep free and low-cost actions ranked ahead of paid interventions.
- Every user-facing string must ship in both **English (`en`)** and **Hindi (`hi`, Devanagari script)**.
- Preserve `data-testid` attributes and accessible labels (`aria-label`, `role`, keyboard navigation, visible focus rings).
