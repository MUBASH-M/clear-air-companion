import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  APIProvider,
  APILoadingStatus,
  Map as GoogleMap,
  MapMouseEvent,
  useApiLoadingStatus,
} from "@vis.gl/react-google-maps";
import { AlertTriangle, Compass, Layers, Loader2 } from "lucide-react";
import {
  AirQualityHeatmapOverlay,
  LocalizedAqiPin,
  MAPS_ATTRIBUTION_IDS,
  MAPS_LIBRARIES,
  MapCameraSync,
  formatPickedPlace,
  syncSurroundingPinsWithReport,
  useMapsApiKey,
} from "@/components/maps/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AirReport, Place, SurroundingAirPin, fetchSurroundingAirPins } from "@/lib/air";
import { Lang } from "@/lib/knowledge";

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
      onSelectPlace(formatPickedPlace(ll.lat, ll.lng, lang));
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
        internalUsageAttributionIds={MAPS_ATTRIBUTION_IDS}
        className="h-full w-full"
      >
        <MapCameraSync lat={place.lat} lon={place.lon} />
        <AirQualityHeatmapOverlay layer={showHeatmap ? "IND_CPCB" : "OFF"} apiKey={apiKey} opacity={0.45} />

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

export type SurroundingAirMapCardProps = {
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
  const { apiKey: mapsApiKey, keyChecked } = useMapsApiKey();
  const [showHeatmap, setShowHeatmap] = useState(false);

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

  const displayPins = syncSurroundingPinsWithReport(surroundingQuery.data, place, report, lang);
  const aqiRange =
    displayPins.length > 1
      ? {
          min: Math.min(...displayPins.map((p) => p.aqi)),
          max: Math.max(...displayPins.map((p) => p.aqi)),
        }
      : null;

  return (
    <section aria-labelledby="surrounding-map-heading" className="mb-6">
      <Card className="overflow-hidden shadow-none" data-testid="card-surrounding-air-map">
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5 md:px-5">
            <h2
              id="surrounding-map-heading"
              className="flex min-w-0 items-center gap-1.5 truncate text-xs font-normal text-muted-foreground"
            >
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
            </h2>

            <div className="flex items-center gap-1.5 shrink-0">
              {mapsApiKey && (
                <Button
                  type="button"
                  variant={showHeatmap ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setShowHeatmap((v) => !v)}
                  aria-pressed={showHeatmap}
                  className="h-8 gap-1.5 px-2.5 text-xs whitespace-nowrap"
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
                className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground whitespace-nowrap"
                data-testid="button-open-full-map"
              >
                <Compass className="h-3.5 w-3.5" aria-hidden />
                {lang === "en" ? "Full map" : "पूरा नक्शा"}
              </Button>
            </div>
          </div>

          {mapsApiKey ? (
            <APIProvider apiKey={mapsApiKey} libraries={MAPS_LIBRARIES} language={lang} region="IN">
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
            <div className="flex h-[300px] items-center justify-center bg-muted/20" role="status" aria-live="polite">
              <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none text-muted-foreground" aria-hidden />
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
    </section>
  );
}
