# Clear Air Companion

A friendly assistant that helps families and communities in smog-affected cities live well through severe winter air pollution. It turns live air quality into a short, personalised daily plan, suggests low-cost indoor air fixes and cleaner everyday choices, and explains what each choice does for your own exposure and for your neighbourhood.

Built from the **Clear Air Companion Project Initiation Document v1.0** (23 November 2026). First launch region: Delhi NCR and the northern India smog belt.

## Features

| Area | What it does | PID reference |
| --- | --- | --- |
| Air right now | Estimated India AQI (CPCB breakpoints, 24-hour PM2.5/PM10 average), pollutants, weather, 24-hour hourly forecast, cleanest and worst windows. Source and reading time are always shown. | §4.1, §7, §8.2 |
| Today's plan | A daily plan built from the air forecast and household profile: outdoor time, school run, commute, ventilation, cooking, extra care for sensitive members, one budget-fit indoor tip and one neighbourhood action. | §6.1 |
| Ask | Conversational assistant grounded in a reviewed knowledge library. Safety checks run on every message: breathing emergencies get a fixed response pointing to 112/108, and diagnosis or medicine questions are declined. It says when it doesn't know. Household details mentioned in chat (e.g. "my son has asthma") update the profile. | §5, §7, §8.1 |
| Tips | Indoor air fixes and sustainable alternatives (travel, cooking, heating, waste, shopping) sorted by cost first, then effect. Each shows what it won't fix, evidence strength, and effect ranges for you and for your neighbourhood. No brands or paid placements. | §6.2, §6.3, §8.4 |
| Impact | Running summary of actions you've taken, with ranges and evidence labels rather than single-number promises. | §6.4 |
| Community | Sample resident and school group with shared goals (no-idling week, no-burning pledge, carpool days), grouped anonymous questions and totals. | §6.5 |
| Profile & privacy | Household profile (children, older adults, pregnancy, health conditions, home, commute, fuel, budget), a view of what's stored, and one-click delete. Geolocation is rounded to ~1 km. | §8.3 |
| Languages | English and Hindi throughout. | §4.1 |

## How it works

- **Frontend only.** React + Vite + Tailwind CSS + shadcn/ui. No backend and no account.
- **Air and weather data** come from [Open-Meteo](https://open-meteo.com/en/docs/air-quality-api) (CAMS model data, free, no key). These are model estimates, not official CPCB station readings, and the app labels them that way.
- **India AQI** is calculated in `client/src/lib/air.ts` using CPCB PM2.5 and PM10 breakpoints.
- **Knowledge library** lives in `client/src/lib/knowledge.ts`. In the pilot, every entry is meant to be reviewed by public health and environment advisers.
- **Plan engine, assistant and safety checks** live in `client/src/lib/companion.ts`. The assistant here is rule-based and grounded in the library. A generative model can replace `respond()` later, with the same safety layer running first.
- **Privacy.** Everything stays in memory in the browser tab. Only the approximate location is sent, and only to fetch air data.

## Run locally

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # outputs dist/public
npm run preview
```

## Deploy

A GitHub Actions workflow (`.github/workflows/deploy.yml`) builds the app and publishes it to GitHub Pages on every push to `main`. Enable it under **Settings → Pages → Source: GitHub Actions**.

## Disclaimer

Clear Air Companion gives general wellbeing guidance, not medical advice. In an emergency in India, call 112. Effect estimates are rules of thumb shown as ranges and depend on your home, fit and how consistently you use them. Community figures in this version are sample data.
