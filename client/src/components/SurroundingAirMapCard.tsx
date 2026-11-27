import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  APIProvider,
  APILoadingStatus,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  MapMouseEvent,
  useAdvancedMarkerRef,
  useApiLoadingStatus,
  useMap,
} from "@vis.gl/react-google-maps";
import { AlertTriangle, Compass, Layers, Loader2, MapPin, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AirReport,
  CATEGORIES,
  Place,
  SurroundingAirPin,
  fetchSurroundingAirPins,
} from "@/lib/air";
import { Lang, tr } from "@/lib/knowledge";

const BUILD_MAPS_API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim() || "";
const ATTRIBUTION_IDS = ["gmp_mcp_codeassist_v1_aistudio"];

function MapCameraSync({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    map.panTo({ lat, lng: lon });
  }, [map, lat, lon]);
  return null;
}

function DashboardHeatmapOverlay({ enabled, apiKey }: { enabled: boolean; apiKey: string }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !enabled || !apiKey || typeof google === "undefined" || !google.maps) {
      return;
    }

    const tileLayer = new google.maps.ImageMapType({
      getTileUrl(coord, zoom) {
        if (zoom < 0 || zoom > 16) return null;
        const numTiles = 1 << zoom;
        if (coord.y < 0 || coord.y >= numTiles) return null;
        const x = ((coord.x % numTiles) + numTiles) % numTiles;
        return `https://airquality.googleapis.com/v1/mapTypes/IND_CPCB/heatmapTiles/${zoom}/${x}/${coord.y}?key=${encodeURIComponent(apiKey)}`;
      },
      tileSize: new google.maps.Size(256, 256),
      maxZoom: 16,
      minZoom: 0,
      name: "India AQI Heatmap",
      opacity: 0.45,
    });

    map.overlayMapTypes.insertAt(0, tileLayer);

    return () => {
      const overlays = map.overlayMapTypes;
      for (let i = overlays.getLength() - 1; i >= 0; i--) {
        if (overlays.getAt(i) === tileLayer) {
          overlays.removeAt(i);
          break;
        }
      }
    };
  }, [map, enabled, apiKey]);

  return null;
}

function LocalizedAqiPin({
  pin,
  selected,
  onSelect,
  onClose,
  onFocusArea,
  lang,
}: {
  pin: SurroundingAirPin;
  selected: boolean;
  onSelect: () => void;
  onClose: () => void;
  onFocusArea: (pin: SurroundingAirPin) => void;
  lang: Lang;
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const cat = CATEGORIES[pin.category];
  const catLabel = tr(cat, lang);

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: pin.lat, lng: pin.lon }}
        title={`${pin.label}: AQI ${pin.aqi} (${catLabel})`}
        onClick={onSelect}
        zIndex={pin.isCenter ? 20 : 10}
      >
        <div
          className={`flex items-center gap-1 rounded-full border-2 border-white font-bold shadow-md transition-transform hover:scale-105 tabular-nums ${
            pin.isCenter ? "px-2.5 py-1 text-xs ring-2 ring-foreground/20" : "px-2 py-0.5 text-[11px]"
          }`}
          style={{ backgroundColor: cat.color, color: cat.ink }}
          data-testid={`aqi-pin-${pin.id}`}
        >
          {pin.isCenter && <MapPin className="h-3 w-3 shrink-0" aria-hidden />}
          <span>{pin.isCenter ? `AQI ${pin.aqi}` : pin.aqi}</span>
        </div>
      </AdvancedMarker>

      {selected && marker && (
        <InfoWindow anchor={marker} onCloseClick={onClose} maxWidth={260}>
          <div className="min-w-[170px] px-1 pb-0.5 text-foreground">
            <p className="text-sm font-semibold leading-snug">{pin.label}</p>
            <p className="mt-0.5 text-xs font-medium tabular-nums" style={{ color: cat.color }}>
              AQI {pin.aqi} · {catLabel}
            </p>
            <div className="mt-1.5 grid grid-cols-3 gap-2 border-t pt-1.5 text-[11px] text-muted-foreground tabular-nums">
              <div>
                <p className="font-medium text-foreground">{Math.round(pin.pm25)}</p>
                <p>PM2.5</p>
              </div>
              <div>
                <p className="font-medium text-foreground">{Math.round(pin.pm10)}</p>
                <p>PM10</p>
              </div>
              <div>
                <p className="font-medium text-foreground">{Math.round(pin.no2)}</p>
                <p>NO₂</p>
              </div>
            </div>
            {!pin.isCenter && (
              <button
                type="button"
                onClick={() => {
                  onFocusArea(pin);
                  onClose();
                }}
                className="mt-2 inline-flex items-center gap-1 rounded-sm text-xs font-semibold text-primary underline underline-offset-2 hover:text-primary/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Navigation className="h-3 w-3" aria-hidden />
                {lang === "en" ? "Focus this area" : "यह क्षेत्र चुनें"}
              </button>
            )}
          </div>
        </InfoWindow>
      )}
    </>
  );
}

function DashboardMapCanvas({
  apiKey,
  place,
  pins,
  lang,
  showHeatmap,
  onSelectPlace,
}: {
  apiKey: string;
  place: Place;
  pins: SurroundingAirPin[];
  lang: Lang;
  showHeatmap: boolean;
  onSelectPlace: (p: Place) => void;
}) {
  const status = useApiLoadingStatus();
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedPinId(null);
  }, [place.lat, place.lon]);

  const handleMapClick = useCallback(
    (ev: MapMouseEvent) => {
      const ll = ev.detail.latLng;
      if (!ll) return;
      const lat = Math.round(ll.lat * 100) / 100;
      const lon = Math.round(ll.lng * 100) / 100;
      onSelectPlace({
        name: `${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E`,
        region: lang === "en" ? "Picked on map" : "नक्शे से चुना गया",
        lat,
        lon,
      });
    },
    [lang, onSelectPlace],
  );

  const handleFocusPin = useCallback(
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
      <div
        className="flex h-[300px] flex-col items-center justify-center bg-muted/40 p-6 text-center"
        data-testid="dashboard-map-error"
      >
        <AlertTriangle className="h-6 w-6 text-amber-600" aria-hidden />
        <p className="mt-2 text-sm font-semibold text-foreground">
          {lang === "en" ? "Unable to load Google Maps" : "Google Maps लोड नहीं हो सका"}
        </p>
        <p className="mt-1 max-w-md text-xs text-muted-foreground">
          {lang === "en"
            ? "Please verify your network connection and Google Maps Platform API key permissions."
            : "कृपया अपना नेटवर्क और Google Maps Platform API कुंजी जाँचें।"}
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-[300px] w-full sm:h-[340px]" data-testid="dashboard-google-map">
      <GoogleMap
        defaultCenter={{ lat: place.lat, lng: place.lon }}
        defaultZoom={10}
        mapId="DEMO_MAP_ID"
        gestureHandling="cooperative"
        streetViewControl={false}
        fullscreenControl={true}
        mapTypeControl={false}
        onClick={handleMapClick}
        internalUsageAttributionIds={ATTRIBUTION_IDS}
        className="h-full w-full"
      >
        <MapCameraSync lat={place.lat} lon={place.lon} />
        <DashboardHeatmapOverlay enabled={showHeatmap} apiKey={apiKey} />

        {pins.map((pin) => (
          <LocalizedAqiPin
            key={pin.id}
            pin={pin}
            selected={selectedPinId === pin.id}
            onSelect={() => setSelectedPinId(pin.id)}
            onClose={() => setSelectedPinId(null)}
            onFocusArea={handleFocusPin}
            lang={lang}
          />
        ))}
      </GoogleMap>
    </div>
  );
}

type SurroundingAirMapCardProps = {
  place: Place | null;
  report: AirReport | undefined;
  lang: Lang;
  locating: boolean;
  onSelectPlace: (p: Place) => void;
  onOpenFullMap: () => void;
};

export function SurroundingAirMapCard({
  place,
  report,
  lang,
  locating,
  onSelectPlace,
  onOpenFullMap,
}: SurroundingAirMapCardProps) {
  const [mapsApiKey, setMapsApiKey] = useState(BUILD_MAPS_API_KEY);
  const [keyChecked, setKeyChecked] = useState(Boolean(BUILD_MAPS_API_KEY));
  const [showHeatmap, setShowHeatmap] = useState(false);

  useEffect(() => {
    if (BUILD_MAPS_API_KEY) return;
    let cancelled = false;
    fetch("/api/maps-config")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && typeof data?.apiKey === "string" && data.apiKey.trim()) {
          setMapsApiKey(data.apiKey.trim());
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setKeyChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const surroundingQuery = useQuery<SurroundingAirPin[]>({
    queryKey: ["surrounding-air", place?.lat, place?.lon, place?.name, lang],
    queryFn: () => fetchSurroundingAirPins(place!, lang),
    enabled: Boolean(place),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  if (!place && locating) {
    return (
      <Card className="mb-6 overflow-hidden shadow-none" role="status" aria-live="polite" data-testid="surrounding-map-loading">
        <CardContent className="p-0">
          <div className="border-b px-4 py-2.5">
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-[300px] w-full rounded-none sm:h-[340px]" />
        </CardContent>
      </Card>
    );
  }

  if (!place) return null;

  // Ensure the center pin stays synchronized with the primary 24h CPCB report if loaded
  const pins: SurroundingAirPin[] = (surroundingQuery.data ?? []).map((pin) =>
    pin.isCenter && report
      ? {
          ...pin,
          aqi: report.aqi,
          category: report.category,
          dominant: report.dominant,
          pm25: report.pm25,
          pm10: report.pm10,
          no2: report.no2,
        }
      : pin,
  );

  // Fallback to at least the center pin while surrounding pins load
  const displayPins: SurroundingAirPin[] =
    pins.length > 0
      ? pins
      : report
        ? [
            {
              id: "center",
              label: place.name,
              sector: lang === "en" ? "Center" : "केंद्र",
              isCenter: true,
              lat: place.lat,
              lon: place.lon,
              aqi: report.aqi,
              category: report.category,
              dominant: report.dominant,
              pm25: report.pm25,
              pm10: report.pm10,
              no2: report.no2,
            },
          ]
        : [];

  const aqiRange =
    displayPins.length > 1
      ? {
          min: Math.min(...displayPins.map((p) => p.aqi)),
          max: Math.max(...displayPins.map((p) => p.aqi)),
        }
      : null;

  return (
    <Card className="mb-6 overflow-hidden shadow-none" data-testid="card-surrounding-air-map">
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5 md:px-5">
          <div className="flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">
              {lang === "en" ? "Surrounding Air Quality Map" : "आसपास की वायु गुणवत्ता नक्शा"}
            </span>
            <span aria-hidden>·</span>
            <span className="truncate">{place.name}</span>
            {aqiRange && (
              <>
                <span aria-hidden className="hidden sm:inline">·</span>
                <span className="hidden tabular-nums sm:inline">
                  {lang === "en"
                    ? `${displayPins.length} pins (AQI ${aqiRange.min}–${aqiRange.max})`
                    : `${displayPins.length} पिन (AQI ${aqiRange.min}–${aqiRange.max})`}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {mapsApiKey && (
              <Button
                type="button"
                variant={showHeatmap ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setShowHeatmap((v) => !v)}
                aria-pressed={showHeatmap}
                className="h-7 gap-1.5 px-2 text-xs whitespace-nowrap"
                data-testid="button-toggle-dashboard-heatmap"
              >
                <Layers className="h-3.5 w-3.5" aria-hidden />
                {lang === "en" ? "Heatmap" : "हीटमैप"}
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onOpenFullMap}
              className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground whitespace-nowrap"
              data-testid="button-open-full-map"
            >
              <Compass className="h-3.5 w-3.5" aria-hidden />
              {lang === "en" ? "Full map" : "पूरा नक्शा"}
            </Button>
          </div>
        </div>

        {mapsApiKey ? (
          <APIProvider apiKey={mapsApiKey} libraries={["marker", "places"]} language={lang} region="IN">
            <DashboardMapCanvas
              apiKey={mapsApiKey}
              place={place}
              pins={displayPins}
              lang={lang}
              showHeatmap={showHeatmap}
              onSelectPlace={onSelectPlace}
            />
          </APIProvider>
        ) : !keyChecked ? (
          <div className="flex h-[300px] items-center justify-center bg-muted/20">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
          </div>
        ) : (
          <div className="p-5 text-xs text-muted-foreground" data-testid="dashboard-map-missing-key">
            {lang === "en"
              ? "Add VITE_GOOGLE_MAPS_API_KEY in Settings > Secrets to display the interactive surrounding air quality map."
              : "आसपास की वायु गुणवत्ता का इंटरैक्टिव नक्शा देखने के लिए Settings > Secrets में VITE_GOOGLE_MAPS_API_KEY जोड़ें।"}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/20 px-4 py-2 text-[11px] text-muted-foreground md:px-5">
          <span>
            {surroundingQuery.isFetching
              ? lang === "en"
                ? "Updating surrounding AQI readings…"
                : "आसपास के AQI आँकड़े अपडेट हो रहे हैं…"
              : lang === "en"
                ? "Tap any pin for PM2.5 / PM10 / NO₂ details, or click anywhere on the map to inspect a spot."
                : "PM2.5 / PM10 / NO₂ विवरण के लिए किसी भी पिन पर टैप करें, या नक्शे पर कहीं भी क्लिक करें।"}
          </span>
          <span className="tabular-nums">
            {lang === "en" ? "~12 km radius · CPCB AQI scale" : "~12 किमी दायरा · CPCB AQI"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
