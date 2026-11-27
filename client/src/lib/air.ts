// Air quality + weather data from Open-Meteo (free, no key, CORS-enabled).
// Air quality is model data (CAMS) – we label it as an estimate everywhere.

export type Place = { name: string; region?: string; lat: number; lon: number; approx?: "gps" | "ip" };

export const PRESET_PLACES: Place[] = [
  { name: "New Delhi", region: "Delhi", lat: 28.6139, lon: 77.209 },
  { name: "Noida", region: "Uttar Pradesh", lat: 28.5355, lon: 77.391 },
  { name: "Gurugram", region: "Haryana", lat: 28.4595, lon: 77.0266 },
  { name: "Ghaziabad", region: "Uttar Pradesh", lat: 28.6692, lon: 77.4538 },
  { name: "Lucknow", region: "Uttar Pradesh", lat: 26.8467, lon: 80.9462 },
  { name: "Kanpur", region: "Uttar Pradesh", lat: 26.4499, lon: 80.3319 },
  { name: "Patna", region: "Bihar", lat: 25.5941, lon: 85.1376 },
  { name: "Chandigarh", region: "Chandigarh", lat: 30.7333, lon: 76.7794 },
  { name: "Amritsar", region: "Punjab", lat: 31.634, lon: 74.8723 },
  { name: "Jaipur", region: "Rajasthan", lat: 26.9124, lon: 75.7873 },
];

export type CategoryKey = "good" | "satisfactory" | "moderate" | "poor" | "very_poor" | "severe";

export const CATEGORIES: Record<CategoryKey, { en: string; hi: string; color: string; ink: string; min: number }> = {
  good: { en: "Good", hi: "अच्छा", color: "#3f9b4f", ink: "#ffffff", min: 0 },
  satisfactory: { en: "Satisfactory", hi: "संतोषजनक", color: "#9cc24a", ink: "#14240f", min: 51 },
  moderate: { en: "Moderate", hi: "मध्यम", color: "#f2d43a", ink: "#2a2405", min: 101 },
  poor: { en: "Poor", hi: "खराब", color: "#ec9a2e", ink: "#2a1600", min: 201 },
  very_poor: { en: "Very poor", hi: "बहुत खराब", color: "#d9412f", ink: "#ffffff", min: 301 },
  severe: { en: "Severe", hi: "गंभीर", color: "#8a2420", ink: "#ffffff", min: 401 },
};

export function categoryFor(aqi: number): CategoryKey {
  if (aqi <= 50) return "good";
  if (aqi <= 100) return "satisfactory";
  if (aqi <= 200) return "moderate";
  if (aqi <= 300) return "poor";
  if (aqi <= 400) return "very_poor";
  return "severe";
}

// India National AQI (CPCB) breakpoints: [concLo, concHi, aqiLo, aqiHi]
const PM25_BP: [number, number, number, number][] = [
  [0, 30, 0, 50], [30, 60, 51, 100], [60, 90, 101, 200], [90, 120, 201, 300], [120, 250, 301, 400], [250, 380, 401, 500],
];
const PM10_BP: [number, number, number, number][] = [
  [0, 50, 0, 50], [50, 100, 51, 100], [100, 250, 101, 200], [250, 350, 201, 300], [350, 430, 301, 400], [430, 510, 401, 500],
];

function subIndex(c: number, bp: [number, number, number, number][]) {
  if (!Number.isFinite(c)) return NaN;
  for (const [cl, ch, il, ih] of bp) {
    if (c <= ch) return Math.round(il + ((ih - il) / (ch - cl)) * (Math.max(c, cl) - cl));
  }
  return 500;
}

export function indiaAqi(pm25: number, pm10: number) {
  const a = subIndex(pm25, PM25_BP);
  const b = subIndex(pm10, PM10_BP);
  const aqi = Math.max(Number.isFinite(a) ? a : 0, Number.isFinite(b) ? b : 0);
  return { aqi, dominant: a >= b ? "PM2.5" : "PM10" };
}

export type HourPoint = { time: string; hour: number; aqi: number; pm25: number; pm10: number; category: CategoryKey };

export type AirReport = {
  place: Place;
  fetchedAt: Date;
  observedAt: string; // model time of current reading
  aqi: number; // 24h-average based India AQI
  category: CategoryKey;
  dominant: string;
  pm25: number;
  pm10: number;
  no2: number;
  pm25Avg24: number;
  pm10Avg24: number;
  temperature: number;
  humidity: number;
  wind: number;
  next24: HourPoint[];
  bestWindow: { start: string; end: string; aqi: number } | null;
  worstWindow: { start: string; end: string; aqi: number } | null;
  peakToday: number;
};

const mean = (xs: number[]) => {
  const v = xs.filter((x) => Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN;
};

export async function fetchAir(place: Place): Promise<AirReport> {
  const aqUrl =
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${place.lat}&longitude=${place.lon}` +
    `&current=pm2_5,pm10,nitrogen_dioxide&hourly=pm2_5,pm10&past_days=1&forecast_days=2&timezone=auto`;
  const wxUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}` +
    `&current=temperature_2m,relative_humidity_2m,wind_speed_10m&timezone=auto`;

  const [aqRes, wxRes] = await Promise.all([fetch(aqUrl), fetch(wxUrl)]);
  if (!aqRes.ok) throw new Error("Air quality service did not respond");
  const aq = await aqRes.json();
  const wx = wxRes.ok ? await wxRes.json() : null;

  const times: string[] = aq.hourly.time;
  const pm25s: number[] = aq.hourly.pm2_5;
  const pm10s: number[] = aq.hourly.pm10;
  const nowKey: string = aq.current.time.slice(0, 13); // YYYY-MM-DDTHH
  let idx = times.findIndex((t) => t.slice(0, 13) === nowKey);
  if (idx < 0) idx = Math.min(24, times.length - 1);

  const pastStart = Math.max(0, idx - 23);
  const pm25Avg24 = mean(pm25s.slice(pastStart, idx + 1));
  const pm10Avg24 = mean(pm10s.slice(pastStart, idx + 1));
  const { aqi, dominant } = indiaAqi(pm25Avg24, pm10Avg24);

  const next24: HourPoint[] = [];
  for (let i = idx; i < Math.min(times.length, idx + 24); i++) {
    const h = indiaAqi(pm25s[i], pm10s[i]).aqi;
    next24.push({ time: times[i], hour: Number(times[i].slice(11, 13)), aqi: h, pm25: pm25s[i], pm10: pm10s[i], category: categoryFor(h) });
  }

  // Best and worst 2-hour windows during waking hours (6:00–22:00)
  const awake = next24.map((p, i) => ({ p, i })).filter(({ p }) => p.hour >= 6 && p.hour <= 21);
  let best: AirReport["bestWindow"] = null;
  let worst: AirReport["worstWindow"] = null;
  for (const { i } of awake) {
    if (i + 1 >= next24.length) continue;
    const a = (next24[i].aqi + next24[i + 1].aqi) / 2;
    const win = { start: next24[i].time, end: next24[i + 1].time, aqi: Math.round(a) };
    if (!best || a < best.aqi) best = win;
    if (!worst || a > worst.aqi) worst = win;
  }

  return {
    place,
    fetchedAt: new Date(),
    observedAt: aq.current.time,
    aqi,
    category: categoryFor(aqi),
    dominant,
    pm25: aq.current.pm2_5,
    pm10: aq.current.pm10,
    no2: aq.current.nitrogen_dioxide,
    pm25Avg24,
    pm10Avg24,
    temperature: wx?.current?.temperature_2m ?? NaN,
    humidity: wx?.current?.relative_humidity_2m ?? NaN,
    wind: wx?.current?.wind_speed_10m ?? NaN,
    next24,
    bestWindow: best,
    worstWindow: worst,
    peakToday: Math.max(...next24.map((p) => p.aqi)),
  };
}

export type SurroundingAirPin = {
  id: string;
  label: string;
  sector: string;
  isCenter: boolean;
  lat: number;
  lon: number;
  aqi: number;
  category: CategoryKey;
  dominant: string;
  pm25: number;
  pm10: number;
  no2: number;
};

type GridPointSpec = {
  id: string;
  en: string;
  hi: string;
  dNorthKm: number;
  dEastKm: number;
  isCenter?: boolean;
};

const SURROUNDING_RING: GridPointSpec[] = [
  { id: "center", en: "Center", hi: "केंद्र", dNorthKm: 0, dEastKm: 0, isCenter: true },
  { id: "n", en: "North", hi: "उत्तर", dNorthKm: 12, dEastKm: 0 },
  { id: "ne", en: "North-East", hi: "उत्तर-पूर्व", dNorthKm: 8.5, dEastKm: 8.5 },
  { id: "e", en: "East", hi: "पूर्व", dNorthKm: 0, dEastKm: 12 },
  { id: "se", en: "South-East", hi: "दक्षिण-पूर्व", dNorthKm: -8.5, dEastKm: 8.5 },
  { id: "s", en: "South", hi: "दक्षिण", dNorthKm: -12, dEastKm: 0 },
  { id: "sw", en: "South-West", hi: "दक्षिण-पश्चिम", dNorthKm: -8.5, dEastKm: -8.5 },
  { id: "w", en: "West", hi: "पश्चिम", dNorthKm: 0, dEastKm: -12 },
  { id: "nw", en: "North-West", hi: "उत्तर-पश्चिम", dNorthKm: 8.5, dEastKm: -8.5 },
];

export function buildSurroundingGrid(
  place: Place,
  lang: "en" | "hi" = "en",
): Array<{ id: string; label: string; sector: string; isCenter: boolean; lat: number; lon: number }> {
  const cosLat = Math.max(0.2, Math.cos((place.lat * Math.PI) / 180));
  const round4 = (n: number) => Math.round(n * 10000) / 10000;

  return SURROUNDING_RING.map((pt) => {
    const lat = Math.max(-89.9, Math.min(89.9, round4(place.lat + pt.dNorthKm / 111.32)));
    const lon = Math.max(-179.9, Math.min(179.9, round4(place.lon + pt.dEastKm / (111.32 * cosLat))));
    const sector = lang === "en" ? pt.en : pt.hi;
    return {
      id: pt.id,
      label: pt.isCenter ? place.name : `${place.name} · ${sector}`,
      sector,
      isCenter: Boolean(pt.isCenter),
      lat,
      lon,
    };
  });
}

type OpenMeteoBatchCurrent = {
  current?: {
    pm2_5?: number;
    pm10?: number;
    nitrogen_dioxide?: number;
  };
};

export async function fetchSurroundingAirPins(place: Place, lang: "en" | "hi" = "en"): Promise<SurroundingAirPin[]> {
  const points = buildSurroundingGrid(place, lang);
  const lats = points.map((p) => p.lat).join(",");
  const lons = points.map((p) => p.lon).join(",");
  const url =
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lats}&longitude=${lons}` +
    `&current=pm2_5,pm10,nitrogen_dioxide&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) throw new Error("Surrounding air quality service did not respond");
  const raw = (await res.json()) as OpenMeteoBatchCurrent | OpenMeteoBatchCurrent[];
  const rows = Array.isArray(raw) ? raw : [raw];

  return points
    .map((pt, idx): SurroundingAirPin | null => {
      const cur = rows[idx]?.current;
      const pm25 = Number(cur?.pm2_5);
      const pm10 = Number(cur?.pm10);
      const no2 = Number(cur?.nitrogen_dioxide);
      if (!Number.isFinite(pm25) && !Number.isFinite(pm10)) return null;
      const safePm25 = Number.isFinite(pm25) ? pm25 : 0;
      const safePm10 = Number.isFinite(pm10) ? pm10 : 0;
      const safeNo2 = Number.isFinite(no2) ? no2 : 0;
      const { aqi, dominant } = indiaAqi(safePm25, safePm10);
      return {
        id: pt.id,
        label: pt.label,
        sector: pt.sector,
        isCenter: pt.isCenter,
        lat: pt.lat,
        lon: pt.lon,
        aqi,
        category: categoryFor(aqi),
        dominant,
        pm25: safePm25,
        pm10: safePm10,
        no2: safeNo2,
      };
    })
    .filter((pin): pin is SurroundingAirPin => pin !== null);
}

type OpenMeteoGeoResult = {
  name?: string;
  admin1?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
};

export async function searchPlaces(q: string): Promise<Place[]> {
  if (q.trim().length < 2) return [];
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en`);
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: OpenMeteoGeoResult[] };
  return (data.results ?? [])
    .filter((r): r is Required<Pick<OpenMeteoGeoResult, "name" | "latitude" | "longitude">> & OpenMeteoGeoResult =>
      typeof r.name === "string" && Number.isFinite(r.latitude) && Number.isFinite(r.longitude),
    )
    .map((r) => ({
      name: r.name,
      region: [r.admin1, r.country].filter(Boolean).join(", "),
      lat: r.latitude,
      lon: r.longitude,
    }));
}

const roundCoord = (n: number) => Math.round(n * 100) / 100;

async function fetchJsonWithTimeout<T = Record<string, unknown>>(url: string, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

type NominatimReverseResponse = {
  name?: string;
  address?: Record<string, string | undefined>;
};

async function reverseGeocode(lat: number, lon: number, lang: "en" | "hi"): Promise<{ name?: string; region?: string }> {
  try {
    const data = await fetchJsonWithTimeout<NominatimReverseResponse>(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=10&accept-language=${lang}`,
      3500,
    );
    const addr = data?.address ?? {};
    const name = addr.city || addr.town || addr.village || addr.suburb || addr.city_district || addr.state_district || addr.county || data?.name;
    const region = [addr.state, addr.country].filter(Boolean).join(", ");
    return { name: typeof name === "string" ? name : undefined, region: region || undefined };
  } catch {
    return {};
  }
}

type GeoJsResponse = {
  city?: string;
  region?: string;
  country?: string;
  latitude?: string | number;
  longitude?: string | number;
};

type IpInfoResponse = {
  city?: string;
  region?: string;
  country?: string;
  loc?: string;
};

async function locateByIp(lang: "en" | "hi"): Promise<Place | null> {
  const fallbackName = lang === "en" ? "Near you" : "आपके पास";

  try {
    const data = await fetchJsonWithTimeout<GeoJsResponse>("https://get.geojs.io/v1/ip/geo.json", 4500);
    const lat = Number(data?.latitude);
    const lon = Number(data?.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      const region = [data.region, data.country].filter((x) => x && x !== data.city).join(", ");
      return {
        name: data.city || fallbackName,
        region: region || (lang === "en" ? "approx. via network" : "नेटवर्क से अनुमानित"),
        lat: roundCoord(lat),
        lon: roundCoord(lon),
        approx: "ip",
      };
    }
  } catch {
    // Try secondary IP geolocation provider
  }

  try {
    const data = await fetchJsonWithTimeout<IpInfoResponse>("https://ipinfo.io/json", 4500);
    if (typeof data?.loc === "string" && data.loc.includes(",")) {
      const [rawLat, rawLon] = data.loc.split(",").map(Number);
      if (Number.isFinite(rawLat) && Number.isFinite(rawLon)) {
        const region = [data.region, data.country].filter((x) => x && x !== data.city).join(", ");
        return {
          name: data.city || fallbackName,
          region: region || (lang === "en" ? "approx. via network" : "नेटवर्क से अनुमानित"),
          lat: roundCoord(rawLat),
          lon: roundCoord(rawLon),
          approx: "ip",
        };
      }
    }
  } catch {
    // Both IP providers failed
  }

  return null;
}

async function getGeolocationPermissionState(): Promise<PermissionState | "unknown"> {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) return "unknown";
  try {
    const status = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    return status.state;
  } catch {
    return "unknown";
  }
}

function getBrowserPosition(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocation unavailable"));
      return;
    }
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        reject,
        {
          enableHighAccuracy: false,
          timeout: 5000,
          maximumAge: 600000,
        },
      );
    } catch (err) {
      reject(err);
    }
  });
}

export type LocationDeps = {
  getPermission: () => Promise<PermissionState | "unknown">;
  getPosition: () => Promise<{ latitude: number; longitude: number }>;
  reverseGeocode: (lat: number, lon: number, lang: "en" | "hi") => Promise<{ name?: string; region?: string }>;
  locateByIp: (lang: "en" | "hi") => Promise<Place | null>;
};

export async function resolveCurrentLocation(lang: "en" | "hi", deps: LocationDeps): Promise<Place> {
  const perm = await deps.getPermission().catch(() => "unknown" as const);
  if (perm !== "denied") {
    try {
      const coords = await deps.getPosition();
      // Round to ~1 km – approximate location is enough
      const lat = roundCoord(coords.latitude);
      const lon = roundCoord(coords.longitude);
      const resolved = await deps.reverseGeocode(lat, lon, lang);
      return {
        name: resolved.name || (lang === "en" ? "Near you" : "आपके पास"),
        region: resolved.region || (lang === "en" ? "approx. 1 km" : "लगभग 1 किमी"),
        lat,
        lon,
        approx: "gps",
      };
    } catch {
      // Fall through to approximate network/IP location
    }
  }

  // Fallback to approximate network/IP location when browser geolocation is blocked,
  // denied (e.g., restricted iframe permissions policy), or unavailable on desktop.
  const ipPlace = await deps.locateByIp(lang);
  if (ipPlace) return ipPlace;
  throw new Error("Could not determine location");
}

export async function detectCurrentLocation(lang: "en" | "hi" = "en"): Promise<Place> {
  return resolveCurrentLocation(lang, {
    getPermission: getGeolocationPermissionState,
    getPosition: getBrowserPosition,
    reverseGeocode,
    locateByIp,
  });
}

export function fmtHour(iso: string) {
  const h = Number(iso.slice(11, 13));
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${suffix}`;
}
