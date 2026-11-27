import axe from "axe-core";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AirIndicesStrip } from "@/components/AirIndicesStrip";
import { AirPanel } from "@/components/AirPanel";
import { AskView } from "@/components/AskView";
import { DailyPlan } from "@/components/DailyPlan";
import { Header } from "@/components/Header";
import { ProfileView } from "@/components/ProfileView";
import { SafeMarkdown } from "@/components/SafeMarkdown";
import { TipsView } from "@/components/TipsView";
import { AirReport, CATEGORIES, PRESET_PLACES, fetchAir } from "@/lib/air";
import { DEFAULT_PROFILE } from "@/lib/companion";
import { Lang, tr } from "@/lib/knowledge";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const DELHI = PRESET_PLACES[0];

function makeReport(overrides: Partial<AirReport> = {}): AirReport {
  return {
    place: DELHI,
    fetchedAt: new Date("2026-11-27T08:00:00Z"),
    observedAt: "2026-11-27T08:00",
    aqi: 248,
    category: "poor",
    dominant: "PM2.5",
    pm25: 108,
    pm10: 192,
    no2: 44,
    pm25Avg24: 102,
    pm10Avg24: 185,
    temperature: 22,
    humidity: 58,
    wind: 5.5,
    next24: [
      { time: "2026-11-27T08:00", hour: 8, aqi: 248, pm25: 108, pm10: 192, category: "poor" },
      { time: "2026-11-27T14:00", hour: 14, aqi: 180, pm25: 84, pm10: 140, category: "moderate" },
      { time: "2026-11-27T20:00", hour: 20, aqi: 290, pm25: 118, pm10: 215, category: "poor" },
    ],
    bestWindow: { start: "2026-11-27T14:00", end: "2026-11-27T16:00", aqi: 180 },
    worstWindow: { start: "2026-11-27T07:00", end: "2026-11-27T09:00", aqi: 290 },
    peakToday: 295,
    ...overrides,
  };
}

async function expectZeroAxeViolations(container: HTMLElement) {
  const results = await axe.run(container, {
    rules: {
      // jsdom does not implement CSS layout / canvas computed color contrast;
      // WCAG 2.2 AA contrast is independently verified mathematically below.
      "color-contrast": { enabled: false },
      region: { enabled: false },
    },
  });
  const seriousOrCritical = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical" || v.impact === "moderate",
  );
  expect(seriousOrCritical).toEqual([]);
}

function relativeLuminance(hex: string): number {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

describe("WCAG 2.2 AA Accessibility & Bilingual Compliance", () => {
  it("verifies every CPCB AQI category badge and text color meets WCAG AA >= 4.5:1 contrast", () => {
    for (const [, cat] of Object.entries(CATEGORIES)) {
      expect(contrastRatio(cat.color, cat.ink)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(cat.textColor, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each<Lang>(["en", "hi"])("passes axe-core checks with zero violations in %s across core views", async (lang) => {
    const report = makeReport();
    const { container, rerender } = render(
      <main>
        <Header
          lang={lang}
          setLang={vi.fn()}
          place={DELHI}
          setPlace={vi.fn()}
          locatingInitial={false}
          t={(x) => tr(x, lang)}
        />
        <AirIndicesStrip
          report={report}
          isLoading={false}
          isFetching={false}
          isError={false}
          hasPlace={true}
          locating={false}
          locError={false}
          lang={lang}
          onRefresh={vi.fn()}
        />
        <DailyPlan
          report={report}
          profile={DEFAULT_PROFILE}
          profileTouched={false}
          isLoading={false}
          hasPlace={true}
          locating={false}
          lang={lang}
          activeTab="today"
          onAction={vi.fn()}
        />
      </main>,
    );
    await expectZeroAxeViolations(container);

    rerender(
      <main>
        <TipsView profile={DEFAULT_PROFILE} lang={lang} done={{}} toggleDone={vi.fn()} />
      </main>,
    );
    await expectZeroAxeViolations(container);

    rerender(
      <main>
        <AskView
          place={DELHI}
          locating={false}
          report={report}
          profile={DEFAULT_PROFILE}
          lang={lang}
          messages={[]}
          setMessages={vi.fn()}
          updateProfile={vi.fn()}
        />
      </main>,
    );
    await expectZeroAxeViolations(container);

    rerender(
      <main>
        <ProfileView
          lang={lang}
          profile={DEFAULT_PROFILE}
          update={vi.fn()}
          clearAll={vi.fn()}
          stored={{ actions: 1, messages: 2, groups: 0 }}
          place={DELHI}
          locating={false}
        />
      </main>,
    );
    await expectZeroAxeViolations(container);
    expect(screen.getByTestId("card-privacy-disclosure")).toBeTruthy();
  });

  it("provides a non-visual data table alternative for the 24h AQI chart and prominent CPCB station link", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const report = makeReport();
    const mockQuery = {
      data: report,
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as Parameters<typeof AirPanel>[0]["q"];

    const { container } = render(
      <main>
        <AirPanel
          q={mockQuery}
          lang="en"
          t={(x) => tr(x, "en")}
          hasPlace={true}
          locating={false}
          locError={false}
          onRetry={vi.fn()}
        />
      </main>,
    );

    const table = screen.getByTestId("table-forecast-a11y");
    expect(table.querySelectorAll("tbody tr").length).toBe(3);

    const cpcbLink = screen.getByTestId("link-cpcb-official");
    expect(cpcbLink.getAttribute("href")).toBe("https://airquality.cpcb.gov.in/AQI_India/");
    expect(cpcbLink.getAttribute("rel")).toContain("noopener");

    await expectZeroAxeViolations(container);
  });
});

describe("XSS & unsafe-link neutralization in SafeMarkdown", () => {
  it("strips javascript:/data: links and never injects executable HTML or event handlers", () => {
    const payload = [
      "[Click safe](https://cpcb.nic.in)",
      "[Bad JS](javascript:alert(1))",
      "[Bad Data](data:text/html,<script>alert(1)</script>)",
      "<script>window.__pwned = true</script>",
      '<img src="x" onerror="window.__pwned = true" />',
    ].join("\n\n");

    const { container } = render(<SafeMarkdown>{payload}</SafeMarkdown>);

    const anchors = Array.from(container.querySelectorAll("a"));
    expect(anchors).toHaveLength(1);
    expect(anchors[0].getAttribute("href")).toBe("https://cpcb.nic.in");
    expect(anchors[0].getAttribute("rel")).toContain("noopener");
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect((window as unknown as Record<string, unknown>).__pwned).toBeUndefined();
  });
});

describe("Network recovery & resilience", () => {
  it("retries transient 503 Open-Meteo responses and recovers cleanly", async () => {
    let aqCalls = 0;
    const hours = Array.from({ length: 48 }, (_, i) => {
      const day = i < 24 ? "2026-11-26" : "2026-11-27";
      return `${day}T${String(i % 24).padStart(2, "0")}:00`;
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("air-quality-api")) {
          aqCalls += 1;
          if (aqCalls === 1) {
            return new Response("Temporary Unavailable", { status: 503 });
          }
          return new Response(
            JSON.stringify({
              current: { time: "2026-11-27T08:00", pm2_5: 90, pm10: 150, nitrogen_dioxide: 30 },
              hourly: { time: hours, pm2_5: hours.map(() => 90), pm10: hours.map(() => 150) },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({ current: { temperature_2m: 22, relative_humidity_2m: 50, wind_speed_10m: 6 } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    const report = await fetchAir(DELHI);
    expect(aqCalls).toBe(2);
    expect(report.aqi).toBeGreaterThan(100);
  });
});
