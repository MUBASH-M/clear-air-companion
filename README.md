# Clear Air Companion

A friendly bilingual (English & Hindi) assistant that helps families and communities in smog-affected cities live well through severe winter air pollution. It turns live air quality into personalized **Daily Guidance**, a short actionable daily plan, an interactive **Air Quality Map & Nearby Place Finder**, and a **Google Maps-grounded Q&A assistant**, while explaining what each choice does for your own exposure and for your neighbourhood.

Built from the **Clear Air Companion Project Initiation Document v1.0** (23 November 2026). First launch region: Delhi NCR and the northern India smog belt.

**Live demo:** [mubash-m.github.io/clear-air-companion](https://mubash-m.github.io/clear-air-companion/)

![Clear Air Companion – Today view with live air reading, 24-hour forecast and daily plan](docs/screenshot.png)

## Features

| Area | What it does | PID reference |
| --- | --- | --- |
| Air right now | Estimated India AQI (CPCB breakpoints, 24-hour PM2.5/PM10 average), pollutants, weather, 24-hour hourly forecast, cleanest and worst windows, and resilient **Use my location** detection (browser GPS rounded to ~1 km with reverse geocoding and automatic network-based fallback). Source and reading time are always shown. | §4.1, §7, §8.2 |
| Daily Guidance | A personalized health guidance card at the top of Today that adapts to the current AQI category and household profile (e.g., wearing a well-fitted N95 mask on poor+ days, indoor activity timing, and tailored precautions for children, older adults, pregnancy, asthma/heart care, and open commutes). | §6.1 |
| Today's plan | A daily checklist built from the air forecast and household profile: outdoor time, school run, commute, ventilation, cooking, extra care for sensitive members, one budget-fit indoor tip and one neighbourhood action. | §6.1 |
| Map & Nearby | Interactive Google Map (`@vis.gl/react-google-maps`) with live **Google Air Quality Heatmap** tile overlays (`India AQI`, `PM2.5`, `Universal AQI`), tap-anywhere AQI inspection, **Places API (New)** nearby pins (pharmacies/N95 masks, hospitals & clinics, metro stations, indoor spaces, parks), and a **Local Clean-Air Place Finder** grounded with live Google Maps data and clickable place links. | §6.1, §6.2 |
| Ask | Conversational assistant powered server-side by **Gemini (`gemini-4-hydrogen`) with Google Maps Grounding**, anchored to your active coordinates, live AQI reading, and household profile, with verified Google Maps links and review snippets. Deterministic safety checks run first on every message: breathing emergencies get a fixed response pointing to 112/108, and diagnosis or medicine questions are declined. Household details mentioned in chat automatically update the profile. | §5, §7, §8.1 |
| Tips | Indoor air fixes and sustainable alternatives (travel, cooking, heating, waste, shopping) sorted by cost first, then effect. Each shows what it won't fix, evidence strength, and effect ranges for you and for your neighbourhood. No brands or paid placements. | §6.2, §6.3, §8.4 |
| Impact | Running summary of actions you've taken, with ranges and evidence labels rather than single-number promises. | §6.4 |
| Community | Sample resident and school group with shared goals (no-idling week, no-burning pledge, carpool days), grouped anonymous questions and totals. | §6.5 |
| Profile & privacy | Household profile (children, older adults, pregnancy, health conditions, home, commute, fuel, budget), a view of what's stored, and one-click delete. Geolocation is rounded to ~1 km. | §8.3 |
| Languages | English and Hindi throughout. | §4.1 |

## How it works

- **Full-stack React + Express.** React + Vite + Tailwind CSS + shadcn/ui in `client/`, backed by an Express server in `server.ts` that mounts Vite in dev and serves `dist/public` in production.
- **Air and weather data** come from [Open-Meteo](https://open-meteo.com/en/docs/air-quality-api) (CAMS model data, free, no key). These are model estimates, not official CPCB station readings, and the app labels them that way.
- **India AQI** is calculated in `client/src/lib/air.ts` using CPCB PM2.5 and PM10 breakpoints.
- **Google Maps Platform** powers the interactive map (`@vis.gl/react-google-maps` with `AdvancedMarker` & `InfoWindow`), **Places API (New)** nearby search, and **Air Quality API** heatmap overlays (`client/src/components/AirMapView.tsx`).
- **Gemini API + Maps Grounding** runs strictly server-side in `server.ts` (`/api/ask` and `/api/maps-explore`) using `@google/genai` (`gemini-4-hydrogen` with the `googleMaps` tool), returning Markdown responses alongside extracted Google Maps links and review citations.
- **Knowledge library & safety layer** live in `client/src/lib/knowledge.ts` and `client/src/lib/companion.ts`. Deterministic emergency (112/108) and medical-refusal safety checks always run before any AI request.
- **Privacy.** Household profile, actions, chat history, and group pledges stay in memory in the browser tab. Only approximate coordinates are sent to fetch air readings and local Maps-grounded answers.

## Environment variables

Copy `.env.example` to `.env` and configure:

- `GEMINI_API_KEY` — Server-side Gemini API key used by `/api/ask` and `/api/maps-explore`.
- `VITE_GOOGLE_MAPS_API_KEY` — Client-side Google Maps Platform API key (restricted by HTTP referrer to Maps JavaScript API, Places API New, and Air Quality API) for the interactive map canvas and heatmap tiles.

## Run locally

```bash
npm install
npm run dev       # Express + Vite dev server on http://localhost:3000
npm run check     # TypeScript type check
npm run build     # Builds client into dist/public
npm start         # Serves production build + API routes via node server.ts
```

## Disclaimer

Clear Air Companion gives general wellbeing guidance, not medical advice. In an emergency in India, call 112. Effect estimates are rules of thumb shown as ranges and depend on your home, fit and how consistently you use them. Community figures in this version are sample data. Use of Google Maps features is subject to the [Google Maps Platform Terms of Service](https://cloud.google.com/maps-platform/terms?utm_campaign=gmp_mcp_codeassist_v1_aistudio).
