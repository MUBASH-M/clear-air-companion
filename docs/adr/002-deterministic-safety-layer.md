# ADR-002: Deterministic Client-Side Emergency & Medical Safety Layer

- **Status:** Accepted
- **Date:** 2026-11-27

## Context
Families experiencing urban smog events may type acute medical symptoms (e.g., severe breathing difficulty, chest pain, blue lips, wheezing in a young child) or request prescription medication dosages in the assistant chat. Delegating emergency triage to a probabilistic LLM introduces latency, network-failure risk, and hallucination hazards.

## Decision
1. All user chat messages pass through a deterministic, client-side `safetyCheck()` function (`client/src/lib/companion/safety.ts`) **before** any network request is made to `/api/ask`.
2. Matches against bilingual (English + Hindi) emergency patterns return an immediate, fixed response directing the user to call **112** (or **108** for ambulance in India) and seek urgent medical care, rendered inside an accessible `role="alert"` container.
3. Matches against prescription/diagnosis/medicine dosage queries return a fixed wellbeing boundary response reminding the user to consult a qualified clinician.
4. Both safety patterns and emergency outputs are covered by unit tests (`companion.test.ts`), component tests (`components.test.tsx`), and end-to-end Playwright tests (`e2e/companion.spec.ts`).

## Consequences
- Emergency guidance works instantaneously and offline, even if the server or upstream LLM is unreachable.
- Medical boundary language is auditable and reviewable by public-health reviewers without modifying LLM prompts.
