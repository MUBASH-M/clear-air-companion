# ADR-003: Session-Only Local State & Zero-PII Server Architecture

- **Status:** Accepted
- **Date:** 2026-11-27

## Context
Household sensitivity details (children at home, pregnancy, asthma/COPD/heart conditions, budget, cooking fuel) are sensitive personal attributes. Persisting them in a central database or third-party analytics tool would create unnecessary privacy and regulatory risk.

## Decision
1. All household profile answers, logged actions, chat history, and community group selections are stored strictly in browser `sessionStorage` via `useCompanionState` and cleared automatically when the browser tab closes.
2. Users can wipe all session state immediately via **Profile → Delete my data** with explicit confirmation.
3. Browser geolocation coordinates are rounded to ~1 km (`0.01°`) before being stored or sent to Open-Meteo.
4. Server structured logs (`logAuditEvent` in `server/helpers.ts`) record only timestamp, severity, event type, request ID, HTTP method, path, status code, and error code — never request bodies, prompts, coordinates, or household attributes.
5. No third-party analytics SDKs or tracking pixels are loaded. Core Web Vitals (`client/src/lib/vitals.ts`) are measured locally in-browser only.

## Consequences
- Zero personal or health data is retained on the server.
- External service data flows (Open-Meteo, Google Maps Platform, Gemini via proxy) are minimal and disclosed transparently in both `PRIVACY.md` and the Profile view.
