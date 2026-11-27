# Privacy Policy & Data Governance

**Effective Date:** 2026-11-27  
**Application:** Clear Air Companion

Clear Air Companion is built on **data minimization** and **zero server-side personal data retention**.

## 1. What Stays Only in Your Browser Session

All personal customization is stored exclusively inside your browser tab's `sessionStorage` (`client/src/hooks/use-companion-state.ts`) and is automatically cleared when you close the tab:

- **Household profile:** sensitivity flags (children, older adults, pregnancy, asthma/COPD/heart condition), home type, commute mode, cooking fuel, and budget tier.
- **Daily plan progress:** completed actions and logged habit counts.
- **Assistant chat history:** conversation turns during the current tab session.
- **Community groups:** local group selections.
- **Selected location:** city preset or coordinates rounded to ~1 km (`0.01°`).

### Instant Deletion
Opening **Profile → Delete my data → Delete** immediately clears all profile answers, logged actions, chat history, and community state from `sessionStorage` and resets the application to defaults.

## 2. Geolocation Precision & Transparency

- Browser GPS geolocation is requested with `enableHighAccuracy: false` and immediately rounded to `0.01°` (~1.1 km) before storage or network transmission.
- If browser geolocation is denied or unavailable, an approximate city-level lookup may be used, or you may manually select any city without sharing device location.

## 3. External Service Disclosures

| Service | Data Sent | Purpose | Stored by Clear Air Companion Server? |
| --- | --- | --- | --- |
| **Open-Meteo (CAMS Air Quality & Forecast)** | Rounded ~1 km latitude/longitude | Live pollutant estimates (PM2.5, PM10, NO₂), 24h forecast, weather | No |
| **Open-Meteo Geocoding / OpenStreetMap Nominatim** | City search query or rounded coordinates | Place search and approximate neighborhood label | No |
| **Google Maps Platform** | Map viewport & approximate coordinates (loaded only when map view is active) | Interactive map display and surrounding AQI pin visualization | No |
| **Gemini API (via `/api/*` server proxy)** | User question, rounded location, current AQI summary, and optional household sensitivity flags when using the Assistant | Location-aware wellbeing advice grounded in Google Maps or Google Search | **No.** Requests are proxied in memory and never written to a database or log file. |

## 4. Server Logging & Data Retention

- Server audit logs (`server/helpers.ts` → `logAuditEvent`) emit structured JSON containing **only**: ISO timestamp, log level, event category (`cors_rejected`, `rate_limited`, `malformed_json`, `payload_too_large`, `invalid_request`, `upstream_failure`, `maintenance_rejected`, `unhandled_error`), `requestId`, HTTP method, route path, status code, and error code.
- **Never logged:** user prompts, chat histories, household sensitivity flags, IP addresses in error payloads, or API keys.
- **Zero third-party analytics:** No advertising SDKs, behavioral trackers, or third-party telemetry scripts transmit household attributes. Core Web Vitals (`client/src/lib/vitals.ts`) are observed strictly in local browser memory.
