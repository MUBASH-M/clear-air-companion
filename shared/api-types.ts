export type Lang = "en" | "hi";
export type GroundingMode = "auto" | "maps" | "search";
export type GroundingUsed = "maps" | "search";

export type PlaceDTO = {
  name: string;
  region?: string;
  lat: number;
  lon: number;
};

export type AirSummaryDTO = {
  aqi: number;
  category: string;
  dominant: string;
  pm25: number;
  pm10: number;
  bestWindow?: string | null;
  worstWindow?: string | null;
};

export type ProfileDTO = {
  children?: boolean;
  olderAdult?: boolean;
  pregnant?: boolean;
  condition?: boolean;
  home?: "apartment" | "house" | "shared";
  commute?: "metro" | "bus" | "car" | "two_wheeler" | "auto" | "walk_cycle" | "home";
  fuel?: "lpg" | "induction" | "wood" | "kerosene";
  budget?: "tight" | "some" | "comfortable";
};

export type ChatHistoryDTO = {
  role: "user" | "assistant";
  text: string;
};

export type MapsReviewSnippetDTO = {
  uri?: string;
  title?: string;
  text?: string;
};

export type MapsGroundingSourceDTO = {
  title: string;
  uri: string;
  placeId?: string;
  reviewSnippets: MapsReviewSnippetDTO[];
};

export type WebGroundingSourceDTO = {
  title: string;
  uri: string;
};

export type ApiErrorDTO = {
  error: string;
  code: string;
  requestId?: string;
};

export type HealthResponseDTO = {
  ok: boolean;
  status: "ok" | "maintenance";
  geminiConfigured: boolean;
  mapsConfigured: boolean;
  uptimeSec: number;
};

export type MapsConfigResponseDTO = {
  apiKey: string;
};

export type AskRequestDTO = {
  message: string;
  lang: Lang;
  place: PlaceDTO;
  air?: AirSummaryDTO;
  profile?: ProfileDTO;
  history?: ChatHistoryDTO[];
  groundingMode?: GroundingMode;
};

export type AskResponseDTO = {
  text: string;
  sources: MapsGroundingSourceDTO[];
  webSources: WebGroundingSourceDTO[];
  groundingUsed: GroundingUsed;
};

export type MapsExploreRequestDTO = {
  query: string;
  lang: Lang;
  place: PlaceDTO;
  air?: AirSummaryDTO;
};

export type SearchAlertsRequestDTO = {
  lang: Lang;
  place: PlaceDTO;
  air?: AirSummaryDTO;
  topic?: string;
};

export type SearchAlertsResponseDTO = {
  text: string;
  webSources: WebGroundingSourceDTO[];
  groundingUsed: "search";
};
