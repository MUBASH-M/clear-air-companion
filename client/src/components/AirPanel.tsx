import { UseQueryResult } from "@tanstack/react-query";
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Info, LocateFixed, RefreshCw, Wind } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AirReport, CATEGORIES, CategoryKey, fmtHour } from "@/lib/air";
import { Lang, tr } from "@/lib/knowledge";
import { UI } from "@/lib/ui-copy";

type ChartTooltipPayload = {
  payload?: {
    category?: CategoryKey;
  };
};

function AqiDial({ aqi, color, categoryLabel, lang }: { aqi: number; color: string; categoryLabel: string; lang: Lang }) {
  const pct = Math.min(aqi, 500) / 500;
  const r = 52;
  const c = 2 * Math.PI * r;
  const arc = c * 0.75;
  const ariaLabel =
    lang === "en"
      ? `Estimated India AQI ${aqi} out of 500, ${categoryLabel}`
      : `अनुमानित भारत AQI ${aqi} (500 में से), ${categoryLabel}`;

  return (
    <svg viewBox="0 0 128 128" className="h-32 w-32 shrink-0" role="img" aria-label={ariaLabel}>
      <g transform="rotate(135 64 64)">
        <circle cx="64" cy="64" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="10" strokeDasharray={`${arc} ${c}`} strokeLinecap="round" />
        <circle
          cx="64"
          cy="64"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeDasharray={`${arc * pct} ${c}`}
          strokeLinecap="round"
          className="transition-[stroke-dasharray] duration-500 ease-out"
        />
      </g>
      <text x="64" y="70" textAnchor="middle" className="fill-foreground text-[30px] font-bold tabular-nums">
        {aqi}
      </text>
      <text x="64" y="90" textAnchor="middle" className="fill-muted-foreground text-[11px] font-medium">
        / 500
      </text>
    </svg>
  );
}

export function LocationPendingCard({ locating, lang, onRetry }: { locating: boolean; lang: Lang; onRetry: () => void }) {
  if (locating) {
    return (
      <Card className="shadow-none" role="status" aria-live="polite" data-testid="status-map-locating">
        <CardContent className="space-y-3 p-6">
          <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <LocateFixed className="h-4 w-4 text-primary" aria-hidden />
            {lang === "en" ? "Detecting your current location…" : "आपका वर्तमान स्थान खोजा जा रहा है…"}
          </p>
          <Skeleton className="h-64 w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="border-dashed shadow-none" role="alert" data-testid="status-map-location-error">
      <CardContent className="p-6 text-center">
        <LocateFixed className="mx-auto h-7 w-7 text-muted-foreground" aria-hidden />
        <h2 className="mt-2 text-base font-semibold">{lang === "en" ? "We couldn't detect your location" : "आपका स्थान नहीं मिल सका"}</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          {lang === "en"
            ? "Allow location permission in your browser, or pick a city from the location menu above."
            : "ब्राउज़र में लोकेशन की अनुमति दें, या ऊपर दिए गए स्थान मेनू से कोई शहर चुनें।"}
        </p>
        <Button size="sm" className="mt-4" onClick={onRetry} data-testid="button-retry-location">
          <LocateFixed className="h-4 w-4" aria-hidden />
          {lang === "en" ? "Detect my location" : "मेरा स्थान खोजें"}
        </Button>
      </CardContent>
    </Card>
  );
}

type AirPanelProps = {
  q: UseQueryResult<AirReport>;
  lang: Lang;
  t: (x: { en: string; hi: string }) => string;
  hasPlace: boolean;
  locating: boolean;
  locError: boolean;
  onRetry: () => void;
};

export function AirPanel({ q, lang, t, hasPlace, locating, locError, onRetry }: AirPanelProps) {
  if ((!hasPlace && locating) || q.isLoading) {
    return (
      <Card className="shadow-none" role="status" aria-live="polite" data-testid="status-air-loading">
        <CardContent className="p-5">
          {!hasPlace && locating ? (
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground" data-testid="status-locating">
              <LocateFixed className="h-3.5 w-3.5 text-primary" aria-hidden />
              {lang === "en" ? "Detecting your current location…" : "आपका वर्तमान स्थान खोजा जा रहा है…"}
            </p>
          ) : (
            <Skeleton className="h-4 w-28" />
          )}
          <div className="mt-4 flex items-center gap-4">
            <Skeleton className="h-32 w-32 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          <Skeleton className="mt-5 h-28 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!hasPlace) {
    return (
      <Card className="shadow-none" role="alert" data-testid="status-location-error">
        <CardContent className="p-5">
          <p className="flex items-center gap-2 font-semibold">
            <LocateFixed className="h-4 w-4 text-primary" aria-hidden />
            {lang === "en" ? "Location needed" : "स्थान आवश्यक है"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {locError
              ? lang === "en"
                ? "Couldn't detect your location automatically. Try again or pick a city from the header."
                : "आपका स्थान अपने आप नहीं मिल सका। फिर कोशिश करें या ऊपर से कोई शहर चुनें।"
              : lang === "en"
                ? "Allow location access or pick a city above to load air quality for your area."
                : "अपने क्षेत्र की हवा देखने के लिए लोकेशन की अनुमति दें या ऊपर से शहर चुनें।"}
          </p>
          <Button size="sm" className="mt-3" onClick={onRetry} data-testid="button-retry-locate">
            <LocateFixed className="h-4 w-4" aria-hidden />
            {lang === "en" ? "Try detecting again" : "फिर से खोजें"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (q.isError || !q.data) {
    return (
      <Card className="shadow-none" role="alert" data-testid="status-air-error">
        <CardContent className="p-5">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden />
            {lang === "en" ? "Couldn't load air data" : "वायु डेटा लोड नहीं हुआ"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {lang === "en"
              ? "The plan needs a fresh reading, so we won't guess. Check your connection and try again."
              : "योजना के लिए ताज़ा आँकड़ा चाहिए, इसलिए हम अंदाज़ा नहीं लगाएँगे। कनेक्शन जाँचकर फिर कोशिश करें।"}
          </p>
          <Button size="sm" className="mt-3" onClick={onRetry} data-testid="button-retry">
            <RefreshCw className="h-4 w-4" aria-hidden />
            {lang === "en" ? "Try again" : "फिर कोशिश करें"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const r = q.data;
  const c = CATEGORIES[r.category];
  const catLabel = tr(c, lang);
  const obs = new Date(r.observedAt);
  const chartData = r.next24.map((p) => ({ ...p, label: fmtHour(p.time) }));
  const forecastSummary =
    lang === "en"
      ? `Next 24 hours hourly AQI estimate for ${r.place.name}. Peak AQI ${r.peakToday}.${r.bestWindow ? ` Cleanest window ${fmtHour(r.bestWindow.start)} to ${fmtHour(r.bestWindow.end)}.` : ""}`
      : `${r.place.name} के लिए अगले 24 घंटों का प्रति घंटा AQI अनुमान। अधिकतम AQI ${r.peakToday}।`;

  return (
    <Card className="overflow-hidden shadow-none" data-testid="panel-air">
      <div className="h-1.5" style={{ background: c.color }} />
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">
            {t(UI.airNow)} · {r.place.name}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={lang === "en" ? `Refresh air data for ${r.place.name}` : `${r.place.name} का वायु डेटा रीफ़्रेश करें`}
            data-testid="button-refresh"
          >
            <RefreshCw className={`h-4 w-4 ${q.isFetching ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden />
          </button>
        </div>

        <div className="mt-2 flex items-center gap-4">
          <AqiDial aqi={r.aqi} color={c.color} categoryLabel={catLabel} lang={lang} />
          <div className="min-w-0">
            <span
              className="inline-block rounded-md px-2.5 py-0.5 text-sm font-semibold"
              style={{ background: c.color, color: c.ink }}
              data-testid="text-category"
            >
              {catLabel}
            </span>
            <p className="mt-1.5 text-sm text-muted-foreground">{t(UI.estAqi)}</p>
            <p className="text-xs text-muted-foreground">
              {lang === "en" ? `Led by ${r.dominant} · 24h avg` : `मुख्य ${r.dominant} · 24 घंटे का औसत`}
            </p>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[
            { k: "PM2.5", v: Math.round(r.pm25), u: "µg/m³" },
            { k: "PM10", v: Math.round(r.pm10), u: "µg/m³" },
            { k: "NO₂", v: Math.round(r.no2), u: "µg/m³" },
            { k: lang === "en" ? "Temp" : "तापमान", v: Number.isFinite(r.temperature) ? Math.round(r.temperature) : "–", u: "°C" },
            { k: lang === "en" ? "Wind" : "हवा", v: Number.isFinite(r.wind) ? Math.round(r.wind) : "–", u: "km/h" },
            { k: lang === "en" ? "Humidity" : "नमी", v: Number.isFinite(r.humidity) ? Math.round(r.humidity) : "–", u: "%" },
          ].map((m) => (
            <div key={m.k} className="rounded-lg bg-muted/60 px-2 py-2">
              <dt className="text-xs text-muted-foreground">{m.k}</dt>
              <dd className="text-base font-semibold tabular-nums">
                {m.v}
                <span className="ml-0.5 text-xs font-normal text-muted-foreground">{m.u}</span>
              </dd>
            </div>
          ))}
        </dl>

        {Number.isFinite(r.wind) && r.wind < 8 && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
            <Wind className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {lang === "en"
              ? "Light winds – pollution tends to linger near the ground."
              : "हल्की हवा – प्रदूषण ज़मीन के पास ठहरता है।"}
          </p>
        )}

        <div className="mt-5">
          <p className="text-sm font-semibold">
            {t(UI.next24)}{" "}
            <span className="font-normal text-muted-foreground">
              · {lang === "en" ? "hourly estimate" : "प्रति घंटा अनुमान"}
            </span>
          </p>
          <div className="mt-2 h-32" role="region" aria-label={forecastSummary} data-testid="chart-forecast">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                <XAxis dataKey="label" interval={5} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={34} />
                <ReferenceLine y={200} stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted))" }}
                  contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", fontSize: 12, background: "hsl(var(--popover))" }}
                  formatter={(v: number, _name, item: ChartTooltipPayload) => {
                    const key = item?.payload?.category;
                    const label = key && CATEGORIES[key] ? tr(CATEGORIES[key], lang) : "";
                    return [label ? `${v} · ${label}` : String(v), "AQI"];
                  }}
                />
                <Bar dataKey="aqi" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  {chartData.map((p) => (
                    <Cell key={p.time} fill={CATEGORIES[p.category].color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            {r.bestWindow && (
              <div className="rounded-lg border px-3 py-2">
                <p className="text-xs text-muted-foreground">{t(UI.cleanest)}</p>
                <p className="font-semibold" data-testid="text-best-window">
                  {fmtHour(r.bestWindow.start)}–{fmtHour(r.bestWindow.end)}
                </p>
              </div>
            )}
            {r.worstWindow && (
              <div className="rounded-lg border px-3 py-2">
                <p className="text-xs text-muted-foreground">{t(UI.peak)}</p>
                <p className="font-semibold">
                  {fmtHour(r.worstWindow.start)}–{fmtHour(r.worstWindow.end)}
                </p>
              </div>
            )}
          </div>
        </div>

        <p className="mt-4 flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground" data-testid="text-source">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            {t(UI.updated)}{" "}
            {obs.toLocaleString(lang === "en" ? "en-IN" : "hi-IN", {
              hour: "numeric",
              minute: "2-digit",
              day: "numeric",
              month: "short",
            })}{" "}
            ({lang === "en" ? "local time" : "स्थानीय समय"}). {t(UI.source)}
          </span>
        </p>
      </CardContent>
    </Card>
  );
}
