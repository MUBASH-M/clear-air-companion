import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CATEGORIES,
  PRESET_PLACES,
  buildSurroundingGrid,
  categoryFor,
  detectCurrentLocation,
  fetchAir,
  fetchSurroundingAirPins,
  fmtHour,
  indiaAqi,
  resolveCurrentLocation,
  searchPlaces,
} from "@/lib/air";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CPCB India AQI calculations", () => {
  it("computes PM2.5 and PM10 sub-indices across all six CPCB breakpoint bands", () => {
    expect(indiaAqi(0, 0)).toEqual({ aqi: 0, dominant: "PM2.5" });
    expect(indiaAqi(18, 30)).toEqual({ aqi: 30, dominant: "PM2.5" });
    expect(indiaAqi(30, 50)).toEqual({ aqi: 50, dominant: "PM2.5" });
    expect(indiaAqi(60, 100)).toEqual({ aqi: 100, dominant: "PM2.5" });
    expect(indiaAqi(90, 250)).toEqual({ aqi: 200, dominant: "PM2.5" });
    expect(indiaAqi(120, 350)).toEqual({ aqi: 300, dominant: "PM2.5" });
    expect(indiaAqi(250, 430)).toEqual({ aqi: 400, dominant: "PM2.5" });
    expect(indiaAqi(380, 510)).toEqual({ aqi: 500, dominant: "PM2.5" });
  });

  it("interpolates linearly within CPCB breakpoint segments and clamps negative values", () => {
    // Band [30, 60] -> [51, 100]: at 45, 51 + (49 * 15) / 30 = 75.5 -> rounds to 76
    expect(indiaAqi(45, 0)).toEqual({ aqi: 76, dominant: "PM2.5" });
    expect(indiaAqi(-10, -5)).toEqual({ aqi: 0, dominant: "PM2.5" });
  });

  it("caps extreme concentrations at AQI 500 and handles non-finite readings safely", () => {
    expect(indiaAqi(650, 700).aqi).toBe(500);
    expect(indiaAqi(Number.NaN, 100)).toEqual({ aqi: 100, dominant: "PM10" });
    expect(indiaAqi(Number.NaN, Number.NaN).aqi).toBe(0);
  });

  it("identifies PM10 as dominant when PM10 sub-index exceeds PM2.5", () => {
    const res = indiaAqi(10, 300);
    expect(res.dominant).toBe("PM10");
    expect(res.aqi).toBeGreaterThan(200);
  });

  it("maps AQI thresholds accurately to all six categories with bilingual metadata", () => {
    expect(categoryFor(0)).toBe("good");
    expect(categoryFor(50)).toBe("good");
    expect(categoryFor(51)).toBe("satisfactory");
    expect(categoryFor(100)).toBe("satisfactory");
    expect(categoryFor(101)).toBe("moderate");
    expect(categoryFor(200)).toBe("moderate");
    expect(categoryFor(201)).toBe("poor");
    expect(categoryFor(300)).toBe("poor");
    expect(categoryFor(301)).toBe("very_poor");
    expect(categoryFor(400)).toBe("very_poor");
    expect(categoryFor(401)).toBe("severe");
    expect(categoryFor(500)).toBe("severe");

    const relativeLuminance = (hex: string) => {
      const n = Number.parseInt(hex.slice(1), 16);
      const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    };
    const contrastRatio = (a: string, b: string) => {
      const l1 = Math.max(relativeLuminance(a), relativeLuminance(b));
      const l2 = Math.min(relativeLuminance(a), relativeLuminance(b));
      return (l1 + 0.05) / (l2 + 0.05);
    };

    for (const cat of Object.values(CATEGORIES)) {
      expect(cat.en.length).toBeGreaterThan(0);
      expect(cat.hi.length).toBeGreaterThan(0);
      expect(cat.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(cat.ink).toMatch(/^#[0-9a-f]{6}$/i);
      expect(cat.textColor).toMatch(/^#[0-9a-f]{6}$/i);
      // WCAG 2.1 AA (>= 4.5:1) for both pill ink-on-color and textColor-on-white
      expect(contrastRatio(cat.color, cat.ink)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(cat.textColor, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("fmtHour", () => {
  it("formats 24-hour ISO timestamps into 12-hour am/pm labels", () => {
    expect(fmtHour("2026-11-26T00:00")).toBe("12 am");
    expect(fmtHour("2026-11-26T01:00")).toBe("1 am");
    expect(fmtHour("2026-11-26T06:00")).toBe("6 am");
    expect(fmtHour("2026-11-26T12:00")).toBe("12 pm");
    expect(fmtHour("2026-11-26T15:00")).toBe("3 pm");
    expect(fmtHour("2026-11-26T23:00")).toBe("11 pm");
  });
});

describe("fetchAir", () => {
  function makeHourlyFixtures() {
    const times: string[] = [];
    const pm25: number[] = [];
    const pm10: number[] = [];
    for (let h = 0; h < 72; h++) {
      const day = h < 24 ? "2026-11-25" : h < 48 ? "2026-11-26" : "2026-11-27";
      const hh = String(h % 24).padStart(2, "0");
      times.push(`${day}T${hh}:00`);
      const hour = h % 24;
      const val = hour === 14 || hour === 15 ? 20 : hour === 8 || hour === 9 ? 180 : 80;
      pm25.push(val);
      pm10.push(val + 10);
    }
    return { times, pm25, pm10 };
  }

  it("parses Open-Meteo air + weather responses and computes best/worst waking windows", async () => {
    const { times, pm25, pm10 } = makeHourlyFixtures();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("air-quality-api")) {
          return new Response(
            JSON.stringify({
              current: { time: "2026-11-26T06:00", pm2_5: 90, pm10: 110, nitrogen_dioxide: 35 },
              hourly: { time: times, pm2_5: pm25, pm10 },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            current: { temperature_2m: 21.4, relative_humidity_2m: 64, wind_speed_10m: 5.2 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    const report = await fetchAir(PRESET_PLACES[0]);
    expect(report.place.name).toBe("New Delhi");
    expect(report.next24).toHaveLength(24);
    expect(report.temperature).toBe(21.4);
    expect(report.humidity).toBe(64);
    expect(report.wind).toBe(5.2);
    expect(report.bestWindow).not.toBeNull();
    expect(report.worstWindow).not.toBeNull();
    expect(fmtHour(report.bestWindow!.start)).toBe("2 pm");
    expect(fmtHour(report.worstWindow!.start)).toBe("8 am");
    expect(report.bestWindow!.aqi).toBeLessThan(report.worstWindow!.aqi);
    expect(report.peakToday).toBeGreaterThanOrEqual(report.worstWindow!.aqi);
  });

  it("succeeds with NaN weather fields when forecast service fails but air-quality succeeds", async () => {
    const { times, pm25, pm10 } = makeHourlyFixtures();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("air-quality-api")) {
          return new Response(
            JSON.stringify({
              current: { time: "2026-11-26T06:00", pm2_5: 40, pm10: 55, nitrogen_dioxide: 20 },
              hourly: { time: times, pm2_5: pm25, pm10 },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("Service Unavailable", { status: 503 });
      }),
    );

    const report = await fetchAir(PRESET_PLACES[1]);
    expect(report.place.name).toBe("Noida");
    expect(Number.isNaN(report.temperature)).toBe(true);
    expect(Number.isNaN(report.wind)).toBe(true);
    expect(Number.isNaN(report.humidity)).toBe(true);
  });

  it("throws when the air quality upstream service fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Bad Gateway", { status: 502 })),
    );

    await expect(fetchAir(PRESET_PLACES[0])).rejects.toThrow("Air quality service did not respond");
  });
});

describe("searchPlaces", () => {
  it("skips queries shorter than 2 characters and filters malformed rows", async () => {
    expect(await searchPlaces("a")).toEqual([]);
    expect(await searchPlaces(" ")).toEqual([]);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            results: [
              { name: "Jaipur", admin1: "Rajasthan", country: "India", latitude: 26.91, longitude: 75.79 },
              { name: "BrokenRow", latitude: null, longitude: 75.0 },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const places = await searchPlaces("Jaipur");
    expect(places).toEqual([{ name: "Jaipur", region: "Rajasthan, India", lat: 26.91, lon: 75.79 }]);
  });

  it("returns an empty array when geocoding returns a non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Error", { status: 500 })));
    expect(await searchPlaces("Mumbai")).toEqual([]);
  });
});

describe("resolveCurrentLocation", () => {
  it("uses browser geolocation, rounds to ~1 km, and skips IP fallback when granted", async () => {
    const locateByIp = vi.fn(async () => null);
    const place = await resolveCurrentLocation("en", {
      getPermission: async () => "granted",
      getPosition: async () => ({ latitude: 12.97159, longitude: 77.59456 }),
      reverseGeocode: async () => ({ name: "Bengaluru", region: "Karnataka, India" }),
      locateByIp,
    });

    expect(locateByIp).not.toHaveBeenCalled();
    expect(place).toEqual({
      name: "Bengaluru",
      region: "Karnataka, India",
      lat: 12.97,
      lon: 77.59,
      approx: "gps",
    });
  });

  it("uses localized Hindi fallbacks when reverse geocoding returns empty", async () => {
    const place = await resolveCurrentLocation("hi", {
      getPermission: async () => "granted",
      getPosition: async () => ({ latitude: 28.6139, longitude: 77.209 }),
      reverseGeocode: async () => ({}),
      locateByIp: async () => null,
    });

    expect(place.name).toBe("आपके पास");
    expect(place.region).toBe("लगभग 1 किमी");
    expect(place.approx).toBe("gps");
  });

  it("skips browser geolocation immediately when permission is denied and uses IP location", async () => {
    const getPosition = vi.fn(async () => ({ latitude: 0, longitude: 0 }));
    const place = await resolveCurrentLocation("en", {
      getPermission: async () => "denied",
      getPosition,
      reverseGeocode: async () => ({}),
      locateByIp: async () => ({
        name: "Mumbai",
        region: "Maharashtra, India",
        lat: 19.08,
        lon: 72.88,
        approx: "ip",
      }),
    });

    expect(getPosition).not.toHaveBeenCalled();
    expect(place.name).toBe("Mumbai");
    expect(place.approx).toBe("ip");
  });

  it("falls back to IP location when browser geolocation times out or rejects", async () => {
    const place = await resolveCurrentLocation("hi", {
      getPermission: async () => "prompt",
      getPosition: async () => {
        throw new Error("Timeout");
      },
      reverseGeocode: async () => ({}),
      locateByIp: async () => ({
        name: "Pune",
        region: "Maharashtra, India",
        lat: 18.52,
        lon: 73.86,
        approx: "ip",
      }),
    });

    expect(place.name).toBe("Pune");
    expect(place.approx).toBe("ip");
  });

  it("throws instead of silently falling back to a hardcoded default city", async () => {
    await expect(
      resolveCurrentLocation("en", {
        getPermission: async () => "prompt",
        getPosition: async () => {
          throw new Error("Unavailable");
        },
        reverseGeocode: async () => ({}),
        locateByIp: async () => null,
      }),
    ).rejects.toThrow("Could not determine location");
  });
});

describe("buildSurroundingGrid & fetchSurroundingAirPins", () => {
  it("builds a 9-point center + surrounding ring grid with localized labels", () => {
    const enGrid = buildSurroundingGrid(PRESET_PLACES[0], "en");
    expect(enGrid).toHaveLength(9);
    expect(enGrid[0].isCenter).toBe(true);
    expect(enGrid[0].label).toBe("New Delhi");
    expect(enGrid.find((p) => p.id === "n")?.lat).toBeGreaterThan(PRESET_PLACES[0].lat);
    expect(enGrid.find((p) => p.id === "s")?.lat).toBeLessThan(PRESET_PLACES[0].lat);
    expect(enGrid.find((p) => p.id === "e")?.lon).toBeGreaterThan(PRESET_PLACES[0].lon);
    expect(enGrid.find((p) => p.id === "w")?.lon).toBeLessThan(PRESET_PLACES[0].lon);

    const hiGrid = buildSurroundingGrid(PRESET_PLACES[0], "hi");
    expect(hiGrid.find((p) => p.id === "n")?.label).toBe("New Delhi · उत्तर");
  });

  it("fetches and parses batch surrounding AQI pins in a single request", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify(
          Array.from({ length: 9 }, (_, i) => ({
            current: { pm2_5: 25 + i * 15, pm10: 40 + i * 20, nitrogen_dioxide: 20 + i * 3 },
          })),
        ),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const pins = await fetchSurroundingAirPins(PRESET_PLACES[0], "en");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(pins).toHaveLength(9);
    expect(pins[0].isCenter).toBe(true);
    expect(pins[0].category).toBe("good");
    expect(pins[8].aqi).toBeGreaterThan(pins[0].aqi);
  });

  it("throws when surrounding pins upstream fails and handles single-object/partial rows", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Error", { status: 500 })));
    await expect(fetchSurroundingAirPins(PRESET_PLACES[0], "en")).rejects.toThrow(
      "Surrounding air quality service did not respond",
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ current: { pm2_5: 55, pm10: Number.NaN } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const partial = await fetchSurroundingAirPins(PRESET_PLACES[0], "hi");
    expect(partial).toHaveLength(1);
    expect(partial[0].pm25).toBe(55);
  });
});

describe("detectCurrentLocation browser + IP geolocation flows", () => {
  it("uses browser geolocation + Nominatim reverse geocode when granted", async () => {
    vi.stubGlobal("navigator", {
      permissions: { query: vi.fn(async () => ({ state: "granted" })) },
      geolocation: {
        getCurrentPosition: vi.fn((ok: (p: { coords: { latitude: number; longitude: number } }) => void) =>
          ok({ coords: { latitude: 28.6139, longitude: 77.209 } }),
        ),
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ address: { city: "New Delhi", state: "Delhi", country: "India" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const place = await detectCurrentLocation("en");
    expect(place.name).toBe("New Delhi");
    expect(place.approx).toBe("gps");
  });

  it("falls back from geojs to ipinfo when browser geolocation is denied and primary IP fails", async () => {
    vi.stubGlobal("navigator", {
      permissions: { query: vi.fn(async () => ({ state: "denied" })) },
    });

    // Primary geojs success
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL) => {
        if (String(url).includes("geojs.io")) {
          return new Response(
            JSON.stringify({ city: "Lucknow", region: "Uttar Pradesh", country: "India", latitude: 26.85, longitude: 80.95 }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("err", { status: 500 });
      }),
    );
    const geojsPlace = await detectCurrentLocation("en");
    expect(geojsPlace.name).toBe("Lucknow");
    expect(geojsPlace.approx).toBe("ip");

    // geojs fails -> ipinfo fallback succeeds
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL) => {
        if (String(url).includes("ipinfo.io")) {
          return new Response(
            JSON.stringify({ city: "Jaipur", region: "Rajasthan", country: "India", loc: "26.91,75.79" }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("err", { status: 500 });
      }),
    );
    const ipinfoPlace = await detectCurrentLocation("hi");
    expect(ipinfoPlace.name).toBe("Jaipur");
    expect(ipinfoPlace.approx).toBe("ip");

    // Both IP providers fail -> throws
    vi.stubGlobal("fetch", vi.fn(async () => new Response("err", { status: 500 })));
    await expect(detectCurrentLocation("en")).rejects.toThrow("Could not determine location");

    // Permission query throws + geolocation unavailable + reverseGeocode error
    vi.stubGlobal("navigator", {
      permissions: { query: vi.fn(async () => { throw new Error("unsupported"); }) },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL) => {
        if (String(url).includes("geojs.io")) {
          return new Response(JSON.stringify({ latitude: 28.61, longitude: 77.21 }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("err", { status: 500 });
      }),
    );
    const anonIp = await detectCurrentLocation("hi");
    expect(anonIp.name).toBe("आपके पास");
    expect(anonIp.region).toBe("नेटवर्क से अनुमानित");

    // Surrounding pins skips null rows and handles missing pm2_5 with valid pm10
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify([
            { current: { pm2_5: null, pm10: null } },
            { current: { pm2_5: Number.NaN, pm10: 95, nitrogen_dioxide: Number.NaN } },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const filteredPins = await fetchSurroundingAirPins(PRESET_PLACES[0], "en");
    expect(filteredPins).toHaveLength(1);
    expect(filteredPins[0].pm10).toBe(95);
    expect(filteredPins[0].no2).toBe(0);
  });
});
