import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AirIndicesStrip } from "@/components/AirIndicesStrip";
import { AskView } from "@/components/AskView";
import { DailyPlan } from "@/components/DailyPlan";
import { Header } from "@/components/Header";
import { SurroundingAirMapCard } from "@/components/SurroundingAirMapCard";
import { TipsView } from "@/components/TipsView";
import { formatPickedPlace, syncSurroundingPinsWithReport } from "@/components/maps/shared";
import { AirReport, PRESET_PLACES, Place, SurroundingAirPin } from "@/lib/air";
import { ChatMsg, DEFAULT_PROFILE, Profile } from "@/lib/companion";
import { tr } from "@/lib/knowledge";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const DELHI: Place = PRESET_PLACES[0];

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
    next24: [],
    bestWindow: { start: "2026-11-27T14:00", end: "2026-11-27T16:00", aqi: 180 },
    worstWindow: { start: "2026-11-27T07:00", end: "2026-11-27T09:00", aqi: 290 },
    peakToday: 295,
    ...overrides,
  };
}

describe("AirIndicesStrip component", () => {
  it("renders accessible loading, location-needed, error, and live reading states", () => {
    const onRefresh = vi.fn();

    const { rerender } = render(
      <AirIndicesStrip
        report={undefined}
        isLoading={true}
        isFetching={true}
        isError={false}
        hasPlace={false}
        locating={true}
        locError={false}
        lang="en"
        onRefresh={onRefresh}
      />,
    );
    expect(screen.getByTestId("indices-loading").getAttribute("role")).toBe("status");

    rerender(
      <AirIndicesStrip
        report={undefined}
        isLoading={false}
        isFetching={false}
        isError={false}
        hasPlace={false}
        locating={false}
        locError={true}
        lang="en"
        onRefresh={onRefresh}
      />,
    );
    expect(screen.getByTestId("indices-location-needed")).toBeTruthy();

    rerender(
      <AirIndicesStrip
        report={undefined}
        isLoading={false}
        isFetching={false}
        isError={true}
        hasPlace={true}
        locating={false}
        locError={false}
        lang="en"
        onRefresh={onRefresh}
      />,
    );
    expect(screen.getByTestId("indices-error")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRefresh).toHaveBeenCalledTimes(1);

    rerender(
      <AirIndicesStrip
        report={makeReport()}
        isLoading={false}
        isFetching={false}
        isError={false}
        hasPlace={true}
        locating={false}
        locError={false}
        lang="en"
        onRefresh={onRefresh}
      />,
    );
    expect(screen.getByTestId("metric-aqi").textContent).toBe("248");
    expect(screen.getByTestId("metric-pm25").textContent).toBe("108");
    expect(screen.getByTestId("metric-pm10").textContent).toBe("192");
    expect(screen.getByTestId("metric-no2").textContent).toBe("44");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain("New Delhi");
  });
});

describe("DailyPlan component", () => {
  it("renders actionable indoor exercise and closed-window advice on poor air days", () => {
    const onAction = vi.fn();
    render(
      <DailyPlan
        report={makeReport({ aqi: 260, category: "poor" })}
        profile={{ ...DEFAULT_PROFILE, children: true }}
        profileTouched={true}
        isLoading={false}
        hasPlace={true}
        locating={false}
        lang="en"
        activeTab="today"
        onAction={onAction}
      />,
    );

    expect(screen.getByTestId("card-daily-plan")).toBeTruthy();
    expect(screen.getByTestId("daily-plan-item-exercise").textContent).toContain("Indoor exercise advised");
    expect(screen.getByTestId("daily-plan-item-windows").textContent).toContain("Keep windows closed");
    expect(screen.getByTestId("daily-plan-item-protection").textContent).toContain("Wear an N95 outdoors");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain("Extra-careful mode");

    fireEvent.click(screen.getByTestId("button-daily-plan-action"));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("adapts cleanly to Hindi and good air conditions", () => {
    render(
      <DailyPlan
        report={makeReport({ aqi: 38, category: "good" })}
        profile={DEFAULT_PROFILE}
        profileTouched={false}
        isLoading={false}
        hasPlace={true}
        locating={false}
        lang="hi"
        activeTab="map"
        onAction={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain("दैनिक योजना");
    expect(screen.getByTestId("daily-plan-item-exercise").textContent).toContain("बाहर व्यायाम सुरक्षित");
    expect(screen.getByTestId("button-daily-plan-action").textContent).toContain("पूरी योजना");
  });
});

describe("Header component", () => {
  it("supports keyboard-accessible city selection, Escape close, and language toggle", () => {
    const setLang = vi.fn();
    const setPlace = vi.fn();

    render(
      <Header
        lang="en"
        setLang={setLang}
        place={DELHI}
        setPlace={setPlace}
        locatingInitial={false}
        t={(x) => tr(x, "en")}
      />,
    );

    const locBtn = screen.getByTestId("button-location");
    expect(locBtn.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(locBtn);
    expect(locBtn.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.click(screen.getByTestId("option-place-Jaipur"));
    expect(setPlace).toHaveBeenCalledWith(expect.objectContaining({ name: "Jaipur" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    // Open again and verify Escape closes dialog
    fireEvent.click(locBtn);
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByTestId("button-language"));
    expect(setLang).toHaveBeenCalledWith("hi");
  });
});

describe("TipsView component", () => {
  it("filters tips by category, announces polite live count, and toggles completion", () => {
    const toggleDone = vi.fn();
    render(<TipsView profile={DEFAULT_PROFILE} lang="en" done={{}} toggleDone={toggleDone} />);

    const initialCount = screen.getByTestId("tips-count").textContent;
    fireEvent.click(screen.getByTestId("filter-cooking"));
    expect(screen.getByTestId("filter-cooking").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("tips-count").textContent).not.toBe(initialCount);

    const doneButtons = screen.getAllByRole("button", { name: /did this/i });
    expect(doneButtons.length).toBeGreaterThan(0);
    fireEvent.click(doneButtons[0]);
    expect(toggleDone).toHaveBeenCalledTimes(1);
  });
});

describe("AskView component", () => {
  it("switches grounding modes, runs deterministic 112 safety checks offline, and clears chat", async () => {
    let msgs: ChatMsg[] = [];
    const setMessages = vi.fn((updater: ChatMsg[] | ((prev: ChatMsg[]) => ChatMsg[])) => {
      msgs = typeof updater === "function" ? updater(msgs) : updater;
    });
    const updateProfile = vi.fn((_p: Partial<Profile>) => {});
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { rerender } = render(
      <AskView
        place={DELHI}
        locating={false}
        report={makeReport()}
        profile={DEFAULT_PROFILE}
        lang="en"
        messages={msgs}
        setMessages={setMessages}
        updateProfile={updateProfile}
      />,
    );

    const mapsBtn = screen.getByTestId("grounding-mode-maps");
    fireEvent.click(mapsBtn);
    expect(mapsBtn.getAttribute("aria-pressed")).toBe("true");

    // Emergency symptom must trigger immediate deterministic safety alert without hitting /api/ask
    const input = screen.getByTestId("input-chat");
    fireEvent.change(input, { target: { value: "My father has severe chest pain and blue lips" } });
    fireEvent.submit(input.closest("form")!);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(msgs.some((m) => m.kind === "safety" && m.text.includes("112"))).toBe(true);

    rerender(
      <AskView
        place={DELHI}
        locating={false}
        report={makeReport()}
        profile={DEFAULT_PROFILE}
        lang="en"
        messages={msgs}
        setMessages={setMessages}
        updateProfile={updateProfile}
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain("112");
    fireEvent.click(screen.getByTestId("button-clear-chat"));
    expect(msgs).toHaveLength(0);
  });
});

describe("Shared maps helpers & SurroundingAirMapCard", () => {
  it("formats map-picked coordinates and synchronizes the center AQI pin with the live report", () => {
    const picked = formatPickedPlace(28.61394, 77.20902, "en");
    expect(picked).toEqual({
      name: "28.61°N, 77.21°E",
      region: "Picked on map",
      lat: 28.61,
      lon: 77.21,
    });

    const report = makeReport({ aqi: 312, category: "very_poor", pm25: 135 });
    const rawPins: SurroundingAirPin[] = [
      {
        id: "center",
        label: "New Delhi",
        sector: "Center",
        isCenter: true,
        lat: DELHI.lat,
        lon: DELHI.lon,
        aqi: 150,
        category: "moderate",
        dominant: "PM2.5",
        pm25: 75,
        pm10: 120,
        no2: 30,
      },
      {
        id: "n",
        label: "New Delhi · North",
        sector: "North",
        isCenter: false,
        lat: 28.72,
        lon: 77.21,
        aqi: 195,
        category: "moderate",
        dominant: "PM2.5",
        pm25: 88,
        pm10: 140,
        no2: 28,
      },
    ];

    const synced = syncSurroundingPinsWithReport(rawPins, DELHI, report, "en");
    expect(synced[0].aqi).toBe(312);
    expect(synced[0].category).toBe("very_poor");
    expect(synced[1].aqi).toBe(195);

    const fallbackOnly = syncSurroundingPinsWithReport(undefined, DELHI, report, "en");
    expect(fallbackOnly).toHaveLength(1);
    expect(fallbackOnly[0].isCenter).toBe(true);
    expect(fallbackOnly[0].aqi).toBe(312);
  });

  it("renders SurroundingAirMapCard header, range badge, and Full map navigation cleanly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/maps-config")) {
          return new Response(JSON.stringify({ apiKey: "" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify(
            Array.from({ length: 9 }, (_, i) => ({
              current: { pm2_5: 40 + i * 10, pm10: 60 + i * 10, nitrogen_dioxide: 25 },
            })),
          ),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    const onOpenFullMap = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={qc}>
        <SurroundingAirMapCard
          place={DELHI}
          report={makeReport()}
          lang="en"
          locating={false}
          onSelectPlace={vi.fn()}
          onOpenFullMap={onOpenFullMap}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain("Surrounding Air Quality Map");
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2 }).textContent).toContain("9 pins");
    });

    fireEvent.click(screen.getByTestId("button-open-full-map"));
    expect(onOpenFullMap).toHaveBeenCalledTimes(1);
  });
});
