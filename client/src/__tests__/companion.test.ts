import { describe, expect, it } from "vitest";
import { AirReport } from "@/lib/air";
import {
  DEFAULT_PROFILE,
  Profile,
  buildDailyGuidance,
  buildPlan,
  extractProfile,
  isSensitive,
  rankedTips,
  respond,
  safetyCheck,
} from "@/lib/companion";

function makeReport(overrides: Partial<AirReport> = {}): AirReport {
  return {
    place: { name: "Jaipur", region: "Rajasthan", lat: 26.91, lon: 75.79 },
    fetchedAt: new Date("2026-11-26T08:00:00Z"),
    observedAt: "2026-11-26T08:00",
    aqi: 340,
    category: "very_poor",
    dominant: "PM2.5",
    pm25: 175,
    pm10: 210,
    no2: 42,
    pm25Avg24: 165,
    pm10Avg24: 200,
    temperature: 18,
    humidity: 60,
    wind: 5,
    next24: [],
    bestWindow: { start: "2026-11-26T14:00", end: "2026-11-26T15:00", aqi: 210 },
    worstWindow: { start: "2026-11-26T08:00", end: "2026-11-26T09:00", aqi: 380 },
    peakToday: 380,
    ...overrides,
  };
}

describe("isSensitive & rankedTips", () => {
  it("detects any household vulnerability flag", () => {
    expect(isSensitive(DEFAULT_PROFILE)).toBe(false);
    expect(isSensitive({ ...DEFAULT_PROFILE, children: true })).toBe(true);
    expect(isSensitive({ ...DEFAULT_PROFILE, olderAdult: true })).toBe(true);
    expect(isSensitive({ ...DEFAULT_PROFILE, pregnant: true })).toBe(true);
    expect(isSensitive({ ...DEFAULT_PROFILE, condition: true })).toBe(true);
  });

  it("sorts budget-fitting tips first by cost then effect without leaking private fields", () => {
    const tightTips = rankedTips(["indoor"], { ...DEFAULT_PROFILE, budget: "tight" });
    expect(tightTips.length).toBeGreaterThan(0);
    expect(tightTips[0].cost).toBe(0);
    expect(tightTips[tightTips.length - 1].cost).toBe(3);
    expect("_ok" in (tightTips[0] as unknown as Record<string, unknown>)).toBe(false);
  });
});

describe("buildPlan", () => {
  it("adapts to severe smog, children, solid fuel, open commute, and bilingual copy", () => {
    const profile: Profile = {
      ...DEFAULT_PROFILE,
      children: true,
      condition: true,
      fuel: "wood",
      commute: "two_wheeler",
    };
    const report = makeReport({ aqi: 420, category: "severe" });

    const enPlan = buildPlan(report, profile, "en");
    expect(enPlan.headline).toMatch(/severe/i);
    expect(enPlan.items.some((i) => i.id === "school")).toBe(true);
    expect(enPlan.items.some((i) => i.id === "care")).toBe(true);
    expect(enPlan.items.some((i) => i.tipId === "clean-fuel")).toBe(true);
    expect(enPlan.items.some((i) => i.id === "commute")).toBe(true);

    const hiPlan = buildPlan(report, profile, "hi");
    expect(hiPlan.headline).toMatch(/गंभीर/);
    expect(hiPlan.items).toHaveLength(enPlan.items.length);
  });

  it("produces clean-air guidance and omits high-smog commute warning when AQI is good for metro commuters", () => {
    const plan = buildPlan(makeReport({ aqi: 35, category: "good" }), DEFAULT_PROFILE, "en");
    expect(plan.headline).toMatch(/fairly clean/i);
    expect(plan.items.some((i) => i.id === "commute")).toBe(false);
    expect(plan.items.some((i) => i.tipId === "exhaust-cooking")).toBe(true);
  });
});

describe("buildDailyGuidance", () => {
  it("scales headline, priority, and personalisation tags across AQI levels", () => {
    const clean = buildDailyGuidance(
      makeReport({ aqi: 32, category: "good", pm25: 18 }),
      DEFAULT_PROFILE,
      "en",
    );
    expect(clean.headline).toMatch(/clean air/i);
    expect(clean.tips.length).toBeGreaterThanOrEqual(2);
    expect(clean.tips.length).toBeLessThanOrEqual(4);

    const severeSensitive = buildDailyGuidance(
      makeReport({ aqi: 430, category: "severe", pm25: 290 }),
      { ...DEFAULT_PROFILE, children: true, commute: "two_wheeler" },
      "en",
    );
    expect(severeSensitive.headline).toMatch(/N95/i);
    expect(severeSensitive.personalizedFor).toContain("Children");
    expect(severeSensitive.personalizedFor).toContain("Open commute");
    expect(severeSensitive.tips[0].priority).toBe("high");
  });

  it("provides tailored guidance for asthma/heart, pregnancy, and older adults", () => {
    const asthma = buildDailyGuidance(
      makeReport({ aqi: 260, category: "poor" }),
      { ...DEFAULT_PROFILE, condition: true },
      "en",
    );
    expect(asthma.tips.some((t) => t.id === "condition")).toBe(true);

    const pregnant = buildDailyGuidance(
      makeReport({ aqi: 260, category: "poor" }),
      { ...DEFAULT_PROFILE, pregnant: true },
      "hi",
    );
    expect(pregnant.tips.some((t) => t.id === "pregnant")).toBe(true);

    const older = buildDailyGuidance(
      makeReport({ aqi: 260, category: "poor" }),
      { ...DEFAULT_PROFILE, olderAdult: true },
      "en",
    );
    expect(older.tips.some((t) => t.id === "older")).toBe(true);
  });
});

describe("safetyCheck, extractProfile, and respond", () => {
  it("catches breathing emergencies and medical diagnosis requests in EN and HI", () => {
    const emergencyEn = safetyCheck("My father can't breathe and has chest pain", "en");
    expect(emergencyEn?.kind).toBe("safety");
    expect(emergencyEn?.text).toMatch(/112/);

    const emergencyHi = safetyCheck("मेरे पिता को साँस लेने में तकलीफ हो रही है", "hi");
    expect(emergencyHi?.kind).toBe("safety");
    expect(emergencyHi?.text).toMatch(/112/);

    const medicalEn = safetyCheck("Which medicine dosage should I take for cough?", "en");
    expect(medicalEn?.kind).toBe("safety");
    expect(medicalEn?.text).toMatch(/doctor or pharmacist/i);

    const medicalHi = safetyCheck("मुझे कौन सी दवा लेनी चाहिए?", "hi");
    expect(medicalHi?.kind).toBe("safety");
    expect(medicalHi?.text).toMatch(/डॉक्टर/);

    expect(safetyCheck("When should I open the windows today?", "en")).toBeNull();
  });

  it("extracts household context from natural language in EN and HI", () => {
    expect(extractProfile("My child has asthma and I ride a scooter to work")).toEqual({
      children: true,
      condition: true,
      commute: "two_wheeler",
    });

    expect(extractProfile("हम घर में चूल्हा इस्तेमाल करते हैं और दादी साथ रहती हैं")).toEqual({
      olderAdult: true,
      fuel: "wood",
    });
  });

  it("returns grounded offline replies and always prioritizes safety checks", () => {
    const report = makeReport();
    expect(respond("chest pain and breathless", report, DEFAULT_PROFILE, "en").kind).toBe("safety");

    const windows = respond("When should I open windows?", report, DEFAULT_PROFILE, "en");
    expect(windows.kind).toBe("normal");
    expect(windows.text).toMatch(/2 pm–3 pm/);

    const plants = respond("Do houseplants clean smog?", report, DEFAULT_PROFILE, "en");
    expect(plants.kind).toBe("normal");
    expect(plants.text).toMatch(/hundreds/i);

    const unknown = respond("What is the price of gold?", report, DEFAULT_PROFILE, "en");
    expect(unknown.kind).toBe("unknown");
  });
});
