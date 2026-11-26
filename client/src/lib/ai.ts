import { AirReport, Place, fmtHour } from "./air";
import { Profile } from "./companion";
import { Lang } from "./knowledge";

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

export type GroundedResponse = {
  text: string;
  sources: MapsGroundingSource[];
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
    }),
  });

  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const data = isJson ? await res.json().catch(() => ({})) : {};
  if (!res.ok || !isJson) {
    if (res.status === 404 || !isJson) {
      throw new Error(
        params.lang === "hi"
          ? "लाइव AI और Google Maps ग्राउंडिंग के लिए फ़ुल-स्टैक सर्वर आवश्यक है (यह स्टैटिक GitHub Pages पर उपलब्ध नहीं है)।"
          : "Live Gemini Maps Grounding requires the full-stack server deployment (not available on static GitHub Pages).",
      );
    }
    throw new Error(typeof data?.error === "string" ? data.error : `Request failed (${res.status})`);
  }

  return {
    text: typeof data.text === "string" ? data.text : "",
    sources: Array.isArray(data.sources) ? data.sources : [],
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
  };
}
