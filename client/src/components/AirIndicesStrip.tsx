import { AlertTriangle, LocateFixed, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { AirReport, CATEGORIES, fmtHour } from "@/lib/air";
import { Lang, tr } from "@/lib/knowledge";

const CPCB_PM25_24H_LIMIT = 60;
const CPCB_PM10_24H_LIMIT = 100;

export type AirIndicesStripProps = {
  report: AirReport | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  hasPlace: boolean;
  locating: boolean;
  locError: boolean;
  lang: Lang;
  onRefresh: () => void;
};

export function AirIndicesStrip({
  report,
  isLoading,
  isFetching,
  isError,
  hasPlace,
  locating,
  locError,
  lang,
  onRefresh,
}: AirIndicesStripProps) {
  if ((!hasPlace && locating) || isLoading) {
    return (
      <Card className="mb-6 shadow-none" role="status" aria-live="polite" data-testid="indices-loading">
        <CardContent className="grid grid-cols-2 divide-y divide-border p-0 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2.5 p-4 md:p-5">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-7 w-28" />
              <Skeleton className="h-3 w-36" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!hasPlace) {
    return (
      <Alert className="mb-6 bg-card" data-testid="indices-location-needed">
        <LocateFixed className="h-4 w-4 text-primary" aria-hidden />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {lang === "en" ? "Detect your location for live air indices" : "लाइव वायु सूचकांक के लिए अपना स्थान चुनें"}
            </p>
            <AlertDescription className="mt-1 text-muted-foreground">
              {locError
                ? lang === "en"
                  ? "Automatic detection couldn't resolve your location. Retry detection or pick a city in the top bar."
                  : "आपका स्थान अपने आप नहीं मिल सका। फिर से खोजें या ऊपर से कोई शहर चुनें।"
                : lang === "en"
                  ? "Allow browser location access or pick a city above to view India AQI, PM2.5, PM10, and NO₂."
                  : "भारत AQI, PM2.5, PM10 और NO₂ देखने के लिए लोकेशन की अनुमति दें या ऊपर शहर चुनें।"}
            </AlertDescription>
          </div>
          <Button size="sm" variant="outline" className="shrink-0 whitespace-nowrap" onClick={onRefresh}>
            <LocateFixed className="h-4 w-4" aria-hidden />
            {lang === "en" ? "Detect location" : "स्थान खोजें"}
          </Button>
        </div>
      </Alert>
    );
  }

  if (isError || !report) {
    return (
      <Alert variant="destructive" className="mb-6 bg-card" data-testid="indices-error">
        <AlertTriangle className="h-4 w-4" aria-hidden />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">
              {lang === "en" ? "Unable to load live air quality indices" : "लाइव वायु गुणवत्ता सूचकांक लोड नहीं हुए"}
            </p>
            <AlertDescription className="mt-1">
              {lang === "en"
                ? "We couldn't reach the air quality feed right now. Check your connection and retry."
                : "अभी वायु गुणवत्ता सेवा से संपर्क नहीं हो सका। कनेक्शन जाँचकर फिर कोशिश करें।"}
            </AlertDescription>
          </div>
          <Button size="sm" variant="outline" className="shrink-0 whitespace-nowrap" onClick={onRefresh}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            {lang === "en" ? "Retry" : "फिर कोशिश करें"}
          </Button>
        </div>
      </Alert>
    );
  }

  const cat = CATEGORIES[report.category];
  const catLabel = tr(cat, lang);
  const aqiPercent = Math.min(100, Math.max(2, Math.round((report.aqi / 500) * 100)));
  const pm25Now = Math.round(report.pm25);
  const pm25Avg = Math.round(report.pm25Avg24);
  const pm10Now = Math.round(report.pm10);
  const pm10Avg = Math.round(report.pm10Avg24);
  const no2Now = Math.round(report.no2);
  const pm25Above = pm25Avg > CPCB_PM25_24H_LIMIT;
  const pm10Above = pm10Avg > CPCB_PM10_24H_LIMIT;

  return (
    <section aria-labelledby="air-indices-heading" className="mb-6">
      <Card className="overflow-hidden shadow-none" data-testid="indices-overview">
        <div className="h-1 w-full" style={{ backgroundColor: cat.color }} aria-hidden />
        <CardContent className="p-0">
          <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5 md:px-5">
            <h2
              id="air-indices-heading"
              className="flex min-w-0 items-center gap-1.5 truncate text-xs font-normal text-muted-foreground"
            >
              <span className="font-semibold text-foreground">{report.place.name}</span>
              {report.place.region && (
                <>
                  <span aria-hidden className="hidden sm:inline">·</span>
                  <span className="hidden truncate sm:inline">{report.place.region}</span>
                </>
              )}
              <span aria-hidden>·</span>
              <span className="truncate">{lang === "en" ? "CPCB India AQI indices" : "CPCB भारत AQI सूचकांक"}</span>
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              disabled={isFetching}
              className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground whitespace-nowrap shrink-0"
              aria-label={lang === "en" ? `Refresh air indices for ${report.place.name}` : `${report.place.name} के वायु सूचकांक रीफ़्रेश करें`}
              data-testid="button-refresh-indices"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isFetching ? "animate-spin motion-reduce:animate-none" : ""}`}
                aria-hidden
              />
              {lang === "en" ? "Refresh" : "रीफ़्रेश"}
            </Button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 lg:divide-x divide-border">
            <div className="p-3.5 sm:p-4 md:p-5">
              <p className="text-xs font-medium text-muted-foreground">
                {lang === "en" ? "India AQI (CPCB)" : "भारत AQI (CPCB)"}
              </p>
              <div className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                <span className="text-2xl font-bold tracking-tight text-foreground tabular-nums" data-testid="metric-aqi">
                  {report.aqi}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">/ 500</span>
                <span className="text-xs font-semibold" style={{ color: cat.textColor }}>
                  · {catLabel}
                </span>
              </div>
              <Progress
                value={aqiPercent}
                className="mt-2.5 h-1.5 bg-muted"
                aria-label={lang === "en" ? `India AQI ${report.aqi} out of 500, ${catLabel}` : `भारत AQI ${report.aqi} (500 में से), ${catLabel}`}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                {lang === "en" ? `Dominant: ${report.dominant}` : `प्रमुख प्रदूषक: ${report.dominant}`}
              </p>
            </div>

            <div className="border-l border-border p-3.5 sm:p-4 lg:border-l-0 md:p-5">
              <p className="text-xs font-medium text-muted-foreground">
                {lang === "en" ? "PM2.5 · Fine particles" : "PM2.5 · सूक्ष्म कण"}
              </p>
              <div className="mt-1.5 flex items-baseline gap-1.5">
                <span className="text-2xl font-bold tracking-tight text-foreground tabular-nums" data-testid="metric-pm25">
                  {pm25Now}
                </span>
                <span className="text-xs text-muted-foreground">µg/m³</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground tabular-nums">
                {lang === "en" ? `24h avg ${pm25Avg} µg/m³` : `24 घंटे औसत ${pm25Avg} µg/m³`}
                {" · "}
                <span className={pm25Above ? "font-medium text-amber-800 dark:text-amber-300" : "font-medium text-emerald-800 dark:text-emerald-300"}>
                  {pm25Above
                    ? lang === "en"
                      ? `Above ${CPCB_PM25_24H_LIMIT} limit`
                      : `${CPCB_PM25_24H_LIMIT} सीमा से अधिक`
                    : lang === "en"
                      ? `Within ${CPCB_PM25_24H_LIMIT} limit`
                      : `${CPCB_PM25_24H_LIMIT} सीमा में`}
                </span>
              </p>
            </div>

            <div className="border-t border-border p-3.5 sm:p-4 lg:border-t-0 md:p-5">
              <p className="text-xs font-medium text-muted-foreground">
                {lang === "en" ? "PM10 · Coarse dust" : "PM10 · धूल के कण"}
              </p>
              <div className="mt-1.5 flex items-baseline gap-1.5">
                <span className="text-2xl font-bold tracking-tight text-foreground tabular-nums" data-testid="metric-pm10">
                  {pm10Now}
                </span>
                <span className="text-xs text-muted-foreground">µg/m³</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground tabular-nums">
                {lang === "en" ? `24h avg ${pm10Avg} µg/m³` : `24 घंटे औसत ${pm10Avg} µg/m³`}
                {" · "}
                <span className={pm10Above ? "font-medium text-amber-800 dark:text-amber-300" : "font-medium text-emerald-800 dark:text-emerald-300"}>
                  {pm10Above
                    ? lang === "en"
                      ? `Above ${CPCB_PM10_24H_LIMIT} limit`
                      : `${CPCB_PM10_24H_LIMIT} सीमा से अधिक`
                    : lang === "en"
                      ? `Within ${CPCB_PM10_24H_LIMIT} limit`
                      : `${CPCB_PM10_24H_LIMIT} सीमा में`}
                </span>
              </p>
            </div>

            <div className="border-l border-t border-border p-3.5 sm:p-4 lg:border-l-0 lg:border-t-0 md:p-5">
              <p className="text-xs font-medium text-muted-foreground">
                {lang === "en" ? "NO₂ · Traffic & combustion" : "NO₂ · यातायात गैस"}
              </p>
              <div className="mt-1.5 flex items-baseline gap-1.5">
                <span className="text-2xl font-bold tracking-tight text-foreground tabular-nums" data-testid="metric-no2">
                  {no2Now}
                </span>
                <span className="text-xs text-muted-foreground">µg/m³</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground tabular-nums">
                {report.bestWindow
                  ? lang === "en"
                    ? `Cleanest: ${fmtHour(report.bestWindow.start)}–${fmtHour(report.bestWindow.end)}`
                    : `सबसे साफ़: ${fmtHour(report.bestWindow.start)}–${fmtHour(report.bestWindow.end)}`
                  : lang === "en"
                    ? `Peak today: AQI ${report.peakToday}`
                    : `आज का चरम: AQI ${report.peakToday}`}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
