# Public Health Methodology, Data Provenance & Safety Governance

## 1. Air Quality Index (AQI) Methodology

Clear Air Companion computes AQI using the **India National Air Quality Index (CPCB)** linear sub-index breakpoints (`client/src/lib/air.ts`):

| CPCB Category | AQI Range | PM₂.₅ 24h (µg/m³) | PM₁₀ 24h (µg/m³) |
| --- | --- | --- | --- |
| Good (अच्छा) | 0 – 50 | 0 – 30 | 0 – 50 |
| Satisfactory (संतोषजनक) | 51 – 100 | 31 – 60 | 51 – 100 |
| Moderate (मध्यम) | 101 – 200 | 61 – 90 | 101 – 250 |
| Poor (खराब) | 201 – 300 | 91 – 120 | 251 – 350 |
| Very Poor (बहुत खराब) | 301 – 400 | 121 – 250 | 351 – 430 |
| Severe (गंभीर) | 401 – 500 | 250+ | 430+ |

- **24-hour rolling average:** The headline AQI is derived from the trailing 24-hour mean of hourly PM₂.₅ and PM₁₀ concentrations (`pm25Avg24`, `pm10Avg24`), selecting the dominant pollutant sub-index.
- **Cleanest & worst waking windows:** Computed over waking hours (`06:00–22:00` local time) by scanning consecutive 2-hour windows in the 24-hour forecast (`next24`) to help households time essential errands and brief ventilation.

## 2. Source-of-Truth & Model Limitations

- **Current data source:** Open-Meteo Copernicus Atmosphere Monitoring Service (CAMS) atmospheric model (`air-quality-api.open-meteo.com`).
- **Prominent disclosure:** Every dashboard card and air-detail panel explicitly labels readings as a **model estimate** alongside the observation timestamp (`observedAt`) and refresh timestamp (`fetchedAt`).
- **Official ground-station verification:** Because atmospheric models can lag sudden hyper-local events (traffic jams, waste fires, construction dust), `AirPanel.tsx` displays a direct, verified link to the **Central Pollution Control Board (CPCB) National Air Quality Portal** (`https://airquality.cpcb.gov.in/AQI_India/`) for official ground monitoring stations.
- **Authority boundary:**
  - *Official authority required:* GRAP stage enforcement, school closures, construction/vehicle restrictions, and emergency medical triage (defer to CPCB, CAQM, local municipal authorities, and emergency services `112`/`108`).
  - *Local estimate / wellbeing guidance:* Daily ventilation timing, N95/FFP2 fit tips, commute route adjustments, and low-cost indoor exposure reduction.

## 3. Evidence Citation & Honest Limitations Layer

Every intervention in `client/src/lib/knowledge.ts` carries:
- **Evidence level badge (`EVIDENCE_LABEL`):** `strong` (well-established public-health/aerosol evidence, e.g., fitted N95/FFP2 respirators, HEPA filtration, LPG/electric cooking transition), `moderate`, or `practical`.
- **Cost tier (`COST_LABEL`):** Ranked free/low-cost first (`0` free → `3` higher cost) so guidance never assumes expensive hardware.
- **Honest limits (`limits`):** Explicit statement of what an action *will not* fix (e.g., indoor plants do not measurably lower PM₂.₅ during urban smog; cloth/surgical masks leak fine particles).
- **Dual-impact framing:** Separates personal exposure reduction (`exposure`) from neighborhood emissions impact (`emissions`).

## 4. Deterministic Emergency & Medical Safety Layer

Emergency and medical boundaries are **never delegated solely to an LLM**:
- `client/src/lib/companion/safety.ts` intercepts acute respiratory/cardiac distress queries in English and Hindi **locally and deterministically**, immediately displaying a fixed emergency instruction pointing to **112** (and **108** ambulance in India).
- Medicine dosage and clinical diagnosis queries trigger a deterministic wellbeing boundary response directing the user to a qualified doctor.

## 5. Periodic Content-Review Cadence

- **Quarterly review** (especially pre-winter North India smog season in October): review CPCB/CAQM GRAP stage rules, WHO Air Quality Guideline references, and bilingual translations using `.github/ISSUE_TEMPLATE/health_content_review.md`.
- **Sign-off gate:** Any PR modifying `client/src/lib/knowledge.ts` or `client/src/lib/companion/safety.ts` requires public-health/medical reviewer approval and passing safety unit + E2E tests before merge.
