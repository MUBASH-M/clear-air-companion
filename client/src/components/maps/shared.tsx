import { useEffect, useState } from "react";
import {
  AdvancedMarker,
  InfoWindow,
  useAdvancedMarkerRef,
  useMap,
} from "@vis.gl/react-google-maps";
import { MapPin, Navigation } from "lucide-react";
import { AirReport, CATEGORIES, Place, SurroundingAirPin } from "@/lib/air";
import { Lang, tr } from "@/lib/knowledge";

const BUILD_MAPS_API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim() || "";

export const MAPS_ATTRIBUTION_IDS = ["gmp_mcp_codeassist_v1_aistudio"];
export const MAPS_LIBRARIES = ["marker", "places"];

export type HeatmapLayerId = "IND_CPCB" | "UAQI_RED_GREEN" | "PM25_INDIGO_PERSIAN" | "OFF";

let cachedRuntimeKey: string | null = BUILD_MAPS_API_KEY || null;
let inflightKeyPromise: Promise<string> | null = null;

async function fetchRuntimeMapsApiKey(): Promise<string> {
  if (cachedRuntimeKey !== null) return cachedRuntimeKey;
  if (!inflightKeyPromise) {
    inflightKeyPromise = fetch("/api/maps-config")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const key = typeof data?.apiKey === "string" ? data.apiKey.trim() : "";
        cachedRuntimeKey = key;
        return key;
      })
      .catch(() => {
        cachedRuntimeKey = "";
        return "";
      })
      .finally(() => {
        inflightKeyPromise = null;
      });
  }
  return inflightKeyPromise;
}

export function useMapsApiKey(): { apiKey: string; keyChecked: boolean } {
  const [apiKey, setApiKey] = useState(cachedRuntimeKey ?? "");
  const [keyChecked, setKeyChecked] = useState(cachedRuntimeKey !== null);

  useEffect(() => {
    if (cachedRuntimeKey !== null) return;
    let cancelled = false;
    fetchRuntimeMapsApiKey().then((key) => {
      if (cancelled) return;
      setApiKey(key);
      setKeyChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { apiKey, keyChecked };
}

export function MapCameraSync({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    map.panTo({ lat, lng: lon });
  }, [map, lat, lon]);
  return null;
}

export function AirQualityHeatmapOverlay({
  layer,
  apiKey,
  opacity = 0.56,
}: {
  layer: HeatmapLayerId;
  apiKey: string;
  opacity?: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || layer === "OFF" || !apiKey || typeof google === "undefined" || !google.maps) {
      return;
    }

    const aqTileLayer = new google.maps.ImageMapType({
      getTileUrl(coord, zoom) {
        if (zoom < 0 || zoom > 16) return null;
        const numTiles = 1 << zoom;
        if (coord.y < 0 || coord.y >= numTiles) return null;
        const x = ((coord.x % numTiles) + numTiles) % numTiles;
        return `https://airquality.googleapis.com/v1/mapTypes/${layer}/heatmapTiles/${zoom}/${x}/${coord.y}?key=${encodeURIComponent(apiKey)}`;
      },
      tileSize: new google.maps.Size(256, 256),
      maxZoom: 16,
      minZoom: 0,
      name: `Air Quality (${layer})`,
      opacity,
    });

    map.overlayMapTypes.insertAt(0, aqTileLayer);

    return () => {
      const overlays = map.overlayMapTypes;
      for (let i = overlays.getLength() - 1; i >= 0; i--) {
        if (overlays.getAt(i) === aqTileLayer) {
          overlays.removeAt(i);
          break;
        }
      }
    };
  }, [map, layer, apiKey, opacity]);

  return null;
}

export function formatPickedPlace(lat: number, lng: number, lang: Lang): Place {
  const rLat = Math.round(lat * 100) / 100;
  const rLon = Math.round(lng * 100) / 100;
  return {
    name: `${rLat.toFixed(2)}°N, ${rLon.toFixed(2)}°E`,
    region: lang === "en" ? "Picked on map" : "नक्शे से चुना गया",
    lat: rLat,
    lon: rLon,
  };
}

export function syncSurroundingPinsWithReport(
  rawPins: SurroundingAirPin[] | undefined,
  place: Place,
  report: AirReport | null | undefined,
  lang: Lang,
): SurroundingAirPin[] {
  const pins = (rawPins ?? []).map((pin) =>
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

  if (pins.length > 0) return pins;
  if (!report) return [];

  return [
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
  ];
}

export function LocalizedAqiPin({
  pin,
  selected,
  onSelect,
  onClose,
  onFocusArea,
  lang,
  testIdPrefix = "aqi-pin",
}: {
  pin: SurroundingAirPin;
  selected: boolean;
  onSelect: () => void;
  onClose: () => void;
  onFocusArea: (pin: SurroundingAirPin) => void;
  lang: Lang;
  testIdPrefix?: string;
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
          className={`flex items-center gap-1 rounded-full border-2 border-white font-bold shadow-md transition-transform hover:scale-105 motion-reduce:transition-none tabular-nums ${
            pin.isCenter ? "px-2.5 py-1 text-xs ring-2 ring-foreground/20" : "px-2 py-0.5 text-[11px]"
          }`}
          style={{ backgroundColor: cat.color, color: cat.ink }}
          data-testid={`${testIdPrefix}-${pin.id}`}
        >
          {pin.isCenter && <MapPin className="h-3 w-3 shrink-0" aria-hidden />}
          <span>{pin.isCenter ? `AQI ${pin.aqi}` : pin.aqi}</span>
        </div>
      </AdvancedMarker>

      {selected && marker && (
        <InfoWindow anchor={marker} onCloseClick={onClose} maxWidth={260}>
          <div className="min-w-[170px] px-1 pb-0.5 text-foreground">
            <p className="text-sm font-semibold leading-snug">{pin.label}</p>
            <p className="mt-0.5 text-xs font-semibold tabular-nums" style={{ color: cat.textColor }}>
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
                className="mt-2 inline-flex items-center gap-1 rounded-sm text-xs font-semibold text-primary underline underline-offset-2 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
