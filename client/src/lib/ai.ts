import { AirReport, Place, fmtHour } from "./air";
import { Profile } from "./companion";
import { Lang } from "./knowledge";

export type GroundingMode = "auto" | "maps" | "search";

export type MapsReviewSnippet = {
  uri?: string;
  title?: string;
  text?: string;
};

export type MapsGroundingSource = {
  title: string;
  uri: string;
  placeId?: string;
  reviewSnippets: MapsReviewSnippet[];
};

export type WebGroundingSource = {
  title: string;
  uri: string;
};

export type GroundedResponse = {
  text: string;
  sources: MapsGroundingSource[];
  webSources: WebGroundingSource[];
  groundingUsed?: "maps" | "search";
};

function summarizeAir(report: AirReport | null) {
  if (!report) return undefined;
  return {
    aqi: report.aqi,
    category: report.category,
    dominant: report.dominant,
    pm25: report.pm25,
    pm10: report.pm10,
    bestWindow: report.bestWindow ? `${fmtHour(report.bestWindow.start)}–${fmtHour(report.bestWindow.end)}` : null,
    worstWindow: report.worstWindow ? `${fmtHour(report.worstWindow.start)}–${fmtHour(report.worstWindow.end)}` : null,
  };
}

export async function askGroundedAssistant(params: {
  message: string;
  lang: Lang;
  place: Place;
  report: AirReport | null;
  profile: Profile;
  history: Array<{ role: "user" | "assistant"; text: string }>;
  groundingMode?: GroundingMode;
}): Promise<GroundedResponse> {
  const res = await fetch("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: params.message,
      lang: params.lang,
      place: {
        name: params.place.name,
        region: params.place.region,
        lat: params.place.lat,
        lon: params.place.lon,
      },
      air: summarizeAir(params.report),
      profile: params.profile,
      history: params.history.slice(-6),
      groundingMode: params.groundingMode ?? "auto",
    }),
  });

  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const data = isJson ? await res.json().catch(() => ({})) : {};
  if (!res.ok || !isJson) {
    if (res.status === 404 || !isJson) {
      throw new Error(
        params.lang === "hi"
          ? "लाइव AI, Google Maps और Google Search ग्राउंडिंग के लिए फ़ुल-स्टैक सर्वर आवश्यक है (यह स्टैटिक GitHub Pages पर उपलब्ध नहीं है)।"
          : "Live Gemini Maps & Search Grounding requires the full-stack server deployment (not available on static GitHub Pages).",
      );
    }
    throw new Error(typeof data?.error === "string" ? data.error : `Request failed (${res.status})`);
  }

  return {
    text: typeof data.text === "string" ? data.text : "",
    sources: Array.isArray(data.sources) ? data.sources : [],
    webSources: Array.isArray(data.webSources) ? data.webSources : [],
    groundingUsed: data.groundingUsed === "maps" || data.groundingUsed === "search" ? data.groundingUsed : undefined,
  };
}

export async function exploreNearbyWithMaps(params: {
  query: string;
  lang: Lang;
  place: Place;
  report: AirReport | null;
}): Promise<GroundedResponse> {
  const res = await fetch("/api/maps-explore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: params.query,
      lang: params.lang,
      place: {
        name: params.place.name,
        region: params.place.region,
        lat: params.place.lat,
        lon: params.place.lon,
      },
      air: summarizeAir(params.report),
    }),
  });

  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const data = isJson ? await res.json().catch(() => ({})) : {};
  if (!res.ok || !isJson) {
    if (res.status === 404 || !isJson) {
      throw new Error(
        params.lang === "hi"
          ? "स्थानीय Google Maps ग्राउंडिंग के लिए फ़ुल-स्टैक सर्वर आवश्यक है (यह स्टैटिक GitHub Pages पर उपलब्ध नहीं है)।"
          : "Local Gemini Maps Grounding requires the full-stack server deployment (not available on static GitHub Pages).",
      );
    }
    throw new Error(typeof data?.error === "string" ? data.error : `Request failed (${res.status})`);
  }

  return {
    text: typeof data.text === "string" ? data.text : "",
    sources: Array.isArray(data.sources) ? data.sources : [],
    webSources: [],
    groundingUsed: "maps",
  };
}

export async function fetchLiveAirAdvisories(params: {
  lang: Lang;
  place: Place;
  report: AirReport | null;
  topic?: string;
}): Promise<{ text: string; webSources: WebGroundingSource[] }> {
  const res = await fetch("/api/search-alerts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lang: params.lang,
      place: {
        name: params.place.name,
        region: params.place.region,
        lat: params.place.lat,
        lon: params.place.lon,
      },
      air: summarizeAir(params.report),
      topic: params.topic,
    }),
  });

  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const data = isJson ? await res.json().catch(() => ({})) : {};
  if (!res.ok || !isJson) {
    if (res.status === 404 || !isJson) {
      throw new Error(
        params.lang === "hi"
          ? "लाइव Google Search समाचार अपडेट के लिए फ़ुल-स्टैक सर्वर आवश्यक है।"
          : "Live Google Search advisories require the full-stack server deployment.",
      );
    }
    throw new Error(typeof data?.error === "string" ? data.error : `Request failed (${res.status})`);
  }

  return {
    text: typeof data.text === "string" ? data.text : "",
    webSources: Array.isArray(data.webSources) ? data.webSources : [],
  };
}
