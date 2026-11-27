import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  APIProvider,
  APILoadingStatus,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  MapMouseEvent,
  Pin,
  useAdvancedMarkerRef,
  useApiLoadingStatus,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";
import {
  AlertTriangle,
  Building2,
  Compass,
  ExternalLink,
  Hospital,
  Layers,
  Loader2,
  Search,
  ShieldPlus,
  Star,
  TrainFront,
  Trees,
} from "lucide-react";
import { MapsSourcesList } from "@/components/MapsSourcesList";
import { SafeMarkdown } from "@/components/SafeMarkdown";
import {
  AirQualityHeatmapOverlay,
  HeatmapLayerId,
  LocalizedAqiPin,
  MAPS_ATTRIBUTION_IDS,
  MAPS_LIBRARIES,
  MapCameraSync,
  formatPickedPlace,
  syncSurroundingPinsWithReport,
  useMapsApiKey,
} from "@/components/maps/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AirReport, Place, SurroundingAirPin, fetchSurroundingAirPins } from "@/lib/air";
import { GroundedResponse, exploreNearbyWithMaps } from "@/lib/ai";
import { Lang } from "@/lib/knowledge";
import { isSafeHttpUrl } from "@/lib/url";

type NearbyCategory = {
  id: string;
  label: { en: string; hi: string };
  mapsQuery: string;
  groundedPrompt: { en: string; hi: string };
  pinColor: string;
  icon: typeof ShieldPlus;
};

const NEARBY_CATEGORIES: NearbyCategory[] = [
  {
    id: "masks",
    label: { en: "Pharmacies / N95", hi: "फ़ार्मेसी / N95" },
    mapsQuery: "pharmacy medical store",
    groundedPrompt: {
      en: "Pharmacies or medical stores nearby where I can buy N95 or FFP2 masks",
      hi: "आसपास की फ़ार्मेसी या मेडिकल स्टोर जहाँ N95 या FFP2 मास्क मिल सकें",
    },
    pinColor: "#1f5c48",
    icon: ShieldPlus,
  },
  {
    id: "hospitals",
    label: { en: "Hospitals & Clinics", hi: "अस्पताल और क्लिनिक" },
    mapsQuery: "hospital pulmonary respiratory clinic",
    groundedPrompt: {
      en: "24-hour hospitals or respiratory clinics nearby for breathing or asthma care",
      hi: "साँस या दमा की देखभाल के लिए आसपास के 24-घंटे अस्पताल या क्लिनिक",
    },
    pinColor: "#b91c1c",
    icon: Hospital,
  },
  {
    id: "metro",
    label: { en: "Metro Stations", hi: "मेट्रो स्टेशन" },
    mapsQuery: "metro station",
    groundedPrompt: {
      en: "Nearest metro stations or enclosed transit stops to cut roadside smog exposure",
      hi: "सड़क के धुएँ से बचने के लिए सबसे नज़दीकी मेट्रो स्टेशन या बंद सार्वजनिक परिवहन",
    },
    pinColor: "#1d4ed8",
    icon: TrainFront,
  },
  {
    id: "indoor",
    label: { en: "Indoor Spaces", hi: "इनडोर स्थान" },
    mapsQuery: "library museum shopping mall indoor",
    groundedPrompt: {
      en: "Family-friendly indoor spaces like libraries, museums, or air-conditioned malls nearby for high-smog days",
      hi: "ज़्यादा धुंध वाले दिनों के लिए परिवार और बच्चों के लिए आसपास के इनडोर स्थान (पुस्तकालय, संग्रहालय, मॉल)",
    },
    pinColor: "#7c3aed",
    icon: Building2,
  },
  {
    id: "parks",
    label: { en: "Green Parks", hi: "हरे पार्क" },
    mapsQuery: "park garden",
    groundedPrompt: {
      en: "Quieter green parks away from main traffic for walking during today's cleanest window",
      hi: "आज के सबसे साफ़ समय में टहलने के लिए मुख्य ट्रैफ़िक से दूर शांत हरे पार्क",
    },
    pinColor: "#15803d",
    icon: Trees,
  },
];

type NearbyPlacePin = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating?: number;
  uri?: string;
  color: string;
};

const HEATMAP_OPTIONS: Array<{ id: HeatmapLayerId; label: { en: string; hi: string } }> = [
  { id: "IND_CPCB", label: { en: "India AQI", hi: "भारत AQI" } },
  { id: "PM25_INDIGO_PERSIAN", label: { en: "PM2.5", hi: "PM2.5" } },
  { id: "UAQI_RED_GREEN", label: { en: "Universal AQI", hi: "वैश्विक AQI" } },
  { id: "OFF", label: { en: "Off", hi: "बंद" } },
];

function NearbyPlaceMarker({
  pin,
  selected,
  onSelect,
  onClose,
  lang,
}: {
  pin: NearbyPlacePin;
  selected: boolean;
  onSelect: () => void;
  onClose: () => void;
  lang: Lang;
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: pin.lat, lng: pin.lng }}
        title={pin.name}
        onClick={onSelect}
        zIndex={15}
      >
        <Pin background={pin.color} borderColor="#ffffff" glyphColor="#ffffff" scale={0.95} />
      </AdvancedMarker>
      {selected && marker && (
        <InfoWindow anchor={marker} onCloseClick={onClose} maxWidth={260}>
          <div className="p-0.5 text-foreground">
            <p className="text-sm font-semibold leading-snug">{pin.name}</p>
            {pin.address && <p className="mt-0.5 text-xs text-muted-foreground">{pin.address}</p>}
            {typeof pin.rating === "number" && (
              <p className="mt-1 flex items-center gap-1 text-xs font-medium">
                <Star className="h-3 w-3 fill-amber-500 text-amber-500" aria-hidden />
                {pin.rating.toFixed(1)}
              </p>
            )}
            {isSafeHttpUrl(pin.uri) && (
              <a
                href={pin.uri}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 inline-flex items-center gap-1 rounded-sm text-xs font-semibold text-primary underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {lang === "en" ? "Open in Google Maps" : "Google Maps में खोलें"}
                <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            )}
          </div>
        </InfoWindow>
      )}
    </>
  );
}

function PlacesPinLoader({
  activeCategory,
  place,
  lang,
  onResults,
  onError,
  onLoading,
}: {
  activeCategory: NearbyCategory | null;
  place: Place;
  lang: Lang;
  onResults: (pins: NearbyPlacePin[]) => void;
  onError: (msg: string) => void;
  onLoading: (loading: boolean) => void;
}) {
  const placesLib = useMapsLibrary("places");

  useEffect(() => {
    if (!activeCategory) {
      onResults([]);
      onError("");
      return;
    }
    if (!placesLib || !placesLib.Place?.searchByText) return;

    let cancelled = false;
    onLoading(true);
    onError("");

    placesLib.Place.searchByText({
      textQuery: `${activeCategory.mapsQuery} near ${place.name}`,
      fields: ["id", "displayName", "formattedAddress", "location", "rating", "googleMapsURI"],
      locationBias: {
        center: { lat: place.lat, lng: place.lon },
        radius: 5000,
      },
      maxResultCount: 8,
      language: lang,
    })
      .then((res) => {
        if (cancelled) return;
        const pins: NearbyPlacePin[] = (res.places ?? [])
          .map((p): NearbyPlacePin | null => {
            const loc = p.location;
            if (!loc) return null;
            const lat = typeof loc.lat === "function" ? loc.lat() : Number((loc as unknown as { lat: number }).lat);
            const lng = typeof loc.lng === "function" ? loc.lng() : Number((loc as unknown as { lng: number }).lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
            return {
              id: p.id || `${lat}-${lng}`,
              name: p.displayName || activeCategory.label[lang],
              address: p.formattedAddress || "",
              lat,
              lng,
              rating: typeof p.rating === "number" ? p.rating : undefined,
              uri: p.googleMapsURI || undefined,
              color: activeCategory.pinColor,
            };
          })
          .filter((x): x is NearbyPlacePin => x !== null);
        onResults(pins);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Places API (New) search error:", err);
        onError(
          lang === "en"
            ? "Could not load map pins for this category right now. Use the grounded local guide below."
            : "इस श्रेणी के लिए नक्शे के पिन लोड नहीं हो सके। नीचे स्थानीय मार्गदर्शन देखें।",
        );
        onResults([]);
      })
      .finally(() => {
        if (!cancelled) onLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeCategory, place.lat, place.lon, place.name, lang, placesLib, onResults, onError, onLoading]);

  return null;
}

function InteractiveMapCanvas({
  apiKey,
  place,
  aqiPins,
  lang,
  heatmap,
  activeCategory,
  onSelectPlace,
  onPinsChange,
  onPlacesError,
  onPlacesLoading,
}: {
  apiKey: string;
  place: Place;
  aqiPins: SurroundingAirPin[];
  lang: Lang;
  heatmap: HeatmapLayerId;
  activeCategory: NearbyCategory | null;
  onSelectPlace: (p: Place) => void;
  onPinsChange: (pins: NearbyPlacePin[]) => void;
  onPlacesError: (msg: string) => void;
  onPlacesLoading: (loading: boolean) => void;
}) {
  const status = useApiLoadingStatus();
  const [placePins, setPlacePins] = useState<NearbyPlacePin[]>([]);
  const [selectedPlacePinId, setSelectedPlacePinId] = useState<string | null>(null);
  const [selectedAqiPinId, setSelectedAqiPinId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedAqiPinId(null);
    setSelectedPlacePinId(null);
  }, [place.lat, place.lon]);

  const handlePins = useCallback(
    (next: NearbyPlacePin[]) => {
      setPlacePins(next);
      setSelectedPlacePinId(null);
      onPinsChange(next);
    },
    [onPinsChange],
  );

  const handleMapClick = useCallback(
    (ev: MapMouseEvent) => {
      const ll = ev.detail.latLng;
      if (!ll) return;
      onSelectPlace(formatPickedPlace(ll.lat, ll.lng, lang));
    },
    [lang, onSelectPlace],
  );

  const handleFocusAqiPin = useCallback(
    (pin: SurroundingAirPin) => {
      onSelectPlace({
        name: pin.label,
        region: place.region,
        lat: pin.lat,
        lon: pin.lon,
      });
    },
    [onSelectPlace, place.region],
  );

  if (status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE) {
    return (
      <div className="flex h-[320px] flex-col items-center justify-center rounded-xl border bg-muted/40 p-6 text-center">
        <AlertTriangle className="h-7 w-7 text-amber-600" aria-hidden />
        <p className="mt-2 font-semibold">
          {lang === "en" ? "Interactive Google Map could not load" : "इंटरैक्टिव Google Map लोड नहीं हो सका"}
        </p>
        <p className="mt-1 max-w-md text-xs text-muted-foreground">
          {lang === "en"
            ? "Check your Google Maps Platform setup and API key permissions. You can still use the Google Maps-grounded local place finder below."
            : "अपने Google Maps Platform सेटअप और API कुंजी की जाँच करें। आप नीचे स्थानीय स्थान खोजक का उपयोग कर सकते हैं।"}
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-[380px] w-full overflow-hidden rounded-xl border sm:h-[440px]" data-testid="google-map-container">
      <GoogleMap
        defaultCenter={{ lat: place.lat, lng: place.lon }}
        defaultZoom={11}
        mapId="DEMO_MAP_ID"
        gestureHandling="greedy"
        streetViewControl={false}
        fullscreenControl={true}
        mapTypeControl={false}
        onClick={handleMapClick}
        internalUsageAttributionIds={MAPS_ATTRIBUTION_IDS}
        className="h-full w-full"
      >
        <MapCameraSync lat={place.lat} lon={place.lon} />
        <AirQualityHeatmapOverlay layer={heatmap} apiKey={apiKey} opacity={0.56} />
        <PlacesPinLoader
          activeCategory={activeCategory}
          place={place}
          lang={lang}
          onResults={handlePins}
          onError={onPlacesError}
          onLoading={onPlacesLoading}
        />

        {aqiPins.map((pin) => (
          <LocalizedAqiPin
            key={pin.id}
            pin={pin}
            selected={selectedAqiPinId === pin.id}
            onSelect={() => {
              setSelectedPlacePinId(null);
              setSelectedAqiPinId(pin.id);
            }}
            onClose={() => setSelectedAqiPinId(null)}
            onFocusArea={handleFocusAqiPin}
            lang={lang}
            testIdPrefix="fullmap-aqi-pin"
          />
        ))}

        {placePins.map((pin) => (
          <NearbyPlaceMarker
            key={pin.id}
            pin={pin}
            selected={selectedPlacePinId === pin.id}
            onSelect={() => {
              setSelectedAqiPinId(null);
              setSelectedPlacePinId(pin.id);
            }}
            onClose={() => setSelectedPlacePinId(null)}
            lang={lang}
          />
        ))}
      </GoogleMap>
    </div>
  );
}

export function AirMapView({
  place,
  report,
  lang,
  onSelectPlace,
}: {
  place: Place;
  report: AirReport | null;
  lang: Lang;
  onSelectPlace: (p: Place) => void;
}) {
  const { apiKey: mapsApiKey, keyChecked } = useMapsApiKey();
  const [heatmap, setHeatmap] = useState<HeatmapLayerId>("IND_CPCB");
  const [activeCatId, setActiveCatId] = useState<string | null>(null);
  const [mapPinsCount, setMapPinsCount] = useState(0);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [placesError, setPlacesError] = useState("");

  const [customQuery, setCustomQuery] = useState("");
  const [groundedLoading, setGroundedLoading] = useState(false);
  const [groundedError, setGroundedError] = useState("");
  const [groundedResult, setGroundedResult] = useState<GroundedResponse | null>(null);
  const [activePromptLabel, setActivePromptLabel] = useState("");

  const surroundingQuery = useQuery<SurroundingAirPin[]>({
    queryKey: ["surrounding-air", place.lat, place.lon, place.name, lang],
    queryFn: () => fetchSurroundingAirPins(place, lang),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const aqiPins = syncSurroundingPinsWithReport(surroundingQuery.data, place, report, lang);
  const activeCategory = NEARBY_CATEGORIES.find((c) => c.id === activeCatId) ?? null;

  const runGroundedExplore = useCallback(
    async (query: string, label: string) => {
      const trimmed = query.trim();
      if (!trimmed) return;
      setGroundedLoading(true);
      setGroundedError("");
      setActivePromptLabel(label);
      try {
        const result = await exploreNearbyWithMaps({
          query: trimmed,
          lang,
          place,
          report,
        });
        setGroundedResult(result);
      } catch (err) {
        setGroundedError(
          err instanceof Error
            ? err.message
            : lang === "en"
              ? "Could not reach Google Maps grounding right now."
              : "अभी स्थानीय जानकारी प्राप्त नहीं हो सकी।",
        );
        setGroundedResult(null);
      } finally {
        setGroundedLoading(false);
      }
    },
    [lang, place, report],
  );

  const handleCategoryClick = (cat: NearbyCategory) => {
    const nextId = activeCatId === cat.id ? null : cat.id;
    setActiveCatId(nextId);
    if (nextId) {
      void runGroundedExplore(cat.groundedPrompt[lang], cat.label[lang]);
    }
  };

  const handlePinsChange = useCallback((pins: NearbyPlacePin[]) => {
    setMapPinsCount(pins.length);
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold leading-tight">
          {lang === "en" ? "Air quality map & nearby places" : "वायु गुणवत्ता नक्शा और आसपास के स्थान"}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {lang === "en"
            ? `Explore localized AQI pins around ${place.name}, click any point on the map to check its reading, and find real nearby pharmacies, clinics, metro stations or indoor spaces.`
            : `${place.name} के आसपास के स्थानीय AQI पिन देखें, किसी भी जगह का आँकड़ा जानने के लिए नक्शे पर क्लिक करें, और पास की फ़ार्मेसी, अस्पताल, मेट्रो या इनडोर स्थान खोजें।`}
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label={lang === "en" ? "Nearby place categories" : "आसपास के स्थानों की श्रेणियाँ"}>
        {NEARBY_CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const active = activeCatId === cat.id;
          return (
            <Button
              key={cat.id}
              size="sm"
              variant={active ? "default" : "outline"}
              onClick={() => handleCategoryClick(cat)}
              aria-pressed={active}
              className="gap-1.5"
              data-testid={`map-category-${cat.id}`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {cat.label[lang]}
            </Button>
          );
        })}
      </div>

      {mapsApiKey ? (
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={lang === "en" ? "Air quality overlay" : "वायु गुणवत्ता परत"}>
              <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <Layers className="h-3.5 w-3.5" aria-hidden />
                {lang === "en" ? "Air overlay:" : "वायु परत:"}
              </span>
              {HEATMAP_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setHeatmap(opt.id)}
                  aria-pressed={heatmap === opt.id}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    heatmap === opt.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-card text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid={`heatmap-${opt.id}`}
                >
                  {opt.label[lang]}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
              {placesLoading
                ? lang === "en"
                  ? "Searching nearby pins…"
                  : "आसपास के पिन खोजे जा रहे हैं…"
                : activeCategory && mapPinsCount > 0
                  ? lang === "en"
                    ? `${mapPinsCount} places + ${aqiPins.length} AQI pins · tap any pin`
                    : `${mapPinsCount} स्थान + ${aqiPins.length} AQI पिन · किसी पिन पर टैप करें`
                  : lang === "en"
                    ? `${aqiPins.length} local AQI pins · tap a pin or map spot`
                    : `${aqiPins.length} स्थानीय AQI पिन · पिन या नक्शे पर टैप करें`}
            </p>
          </div>

          <APIProvider
            apiKey={mapsApiKey}
            libraries={MAPS_LIBRARIES}
            language={lang}
            region="IN"
          >
            <InteractiveMapCanvas
              apiKey={mapsApiKey}
              place={place}
              aqiPins={aqiPins}
              lang={lang}
              heatmap={heatmap}
              activeCategory={activeCategory}
              onSelectPlace={onSelectPlace}
              onPinsChange={handlePinsChange}
              onPlacesError={setPlacesError}
              onPlacesLoading={setPlacesLoading}
            />
          </APIProvider>

          {placesError && <p className="text-xs text-destructive" role="alert">{placesError}</p>}
        </div>
      ) : !keyChecked ? (
        <div className="flex h-[220px] items-center justify-center rounded-xl border bg-card" role="status" aria-live="polite">
          <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none text-muted-foreground" aria-hidden />
        </div>
      ) : (
        <div
          className="rounded-xl border border-dashed bg-card p-5"
          data-testid="maps-key-notice"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
              <Compass className="h-4 w-4" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold">
                {lang === "en" ? "Enable interactive Google Map view" : "इंटरैक्टिव Google Map दृश्य सक्षम करें"}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {lang === "en"
                  ? "The interactive Google Map canvas and live Air Quality heatmap tiles require a Google Maps Platform API key. Open Settings > Secrets (or the Google Maps Settings Panel) to add GOOGLE_MAPS_API_KEY or VITE_GOOGLE_MAPS_API_KEY, then reload. Meanwhile, you can use the Google Maps-grounded local finder below right away."
                  : "इंटरैक्टिव Google Map और लाइव वायु गुणवत्ता हीटमैप के लिए Google Maps Platform API कुंजी आवश्यक है। Settings > Secrets (या Google Maps Settings Panel) में GOOGLE_MAPS_API_KEY या VITE_GOOGLE_MAPS_API_KEY जोड़ें। इस बीच नीचे Google Maps आधारित स्थानीय खोजक तुरंत उपयोग करें।"}
              </p>
            </div>
          </div>
        </div>
      )}

      <section className="rounded-xl border bg-card p-5" aria-labelledby="local-finder-heading" data-testid="maps-grounded-panel">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="local-finder-heading" className="text-base font-semibold">
              {lang === "en" ? "Local Clean-Air Place Finder" : "स्थानीय स्वच्छ-वायु स्थान खोजक"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {lang === "en"
                ? `Up-to-date places near ${place.name}, grounded with live Google Maps data.`
                : `${place.name} के पास के ताज़ा स्थान, Google Maps डेटा पर आधारित।`}
            </p>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!customQuery.trim() || groundedLoading) return;
            setActiveCatId(null);
            void runGroundedExplore(customQuery, customQuery.trim());
          }}
          className="mt-3 flex gap-2"
        >
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
            <Input
              value={customQuery}
              onChange={(e) => setCustomQuery(e.target.value)}
              aria-label={lang === "en" ? `Search nearby places around ${place.name}` : `${place.name} के आसपास के स्थान खोजें`}
              placeholder={
                lang === "en"
                  ? `Search near ${place.name} (e.g. 24-hour pharmacy, indoor kids play area, metro)`
                  : `${place.name} के पास खोजें (जैसे 24-घंटे फ़ार्मेसी, बच्चों का इनडोर प्ले एरिया, मेट्रो)`
              }
              className="pl-8"
              data-testid="input-maps-explore"
            />
          </div>
          <Button type="submit" disabled={!customQuery.trim() || groundedLoading} data-testid="button-maps-explore">
            {groundedLoading ? (
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
            ) : lang === "en" ? (
              "Find"
            ) : (
              "खोजें"
            )}
          </Button>
        </form>

        {groundedLoading && (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground" role="status" aria-live="polite">
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none text-primary" aria-hidden />
            <span>
              {lang === "en"
                ? `Checking Google Maps near ${place.name}…`
                : `${place.name} के पास Google Maps पर खोजा जा रहा है…`}
            </span>
          </div>
        )}

        {groundedError && (
          <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive" role="alert" data-testid="maps-grounded-error">
            {groundedError}
          </p>
        )}

        {groundedResult && !groundedLoading && (
          <div className="mt-4" data-testid="maps-grounded-result">
            {activePromptLabel && (
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary">
                {activePromptLabel} · {place.name}
              </p>
            )}
            <div className="prose prose-sm max-w-none text-foreground/90 prose-headings:text-foreground prose-strong:text-foreground prose-a:text-primary">
              <SafeMarkdown>{groundedResult.text}</SafeMarkdown>
            </div>
            <MapsSourcesList sources={groundedResult.sources} lang={lang} />
          </div>
        )}

        {!groundedResult && !groundedLoading && !groundedError && (
          <p className="mt-3 text-xs text-muted-foreground">
            {lang === "en"
              ? "Pick a category above or type a question to find nearby pharmacies stocking N95 masks, metro stations, clinics, or indoor spaces for smoggy days."
              : "N95 मास्क वाली फ़ार्मेसी, मेट्रो स्टेशन, क्लिनिक या धुंध भरे दिनों के लिए इनडोर स्थान खोजने हेतु ऊपर कोई श्रेणी चुनें या प्रश्न लिखें।"}
          </p>
        )}
      </section>
    </div>
  );
}
