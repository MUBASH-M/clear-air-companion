import { useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  CalendarCheck,
  Clock,
  Compass,
  DoorClosed,
  Dumbbell,
  Lightbulb,
  LocateFixed,
  MessageCircle,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
  Users,
  Wind,
} from "lucide-react";
import { Header } from "@/components/Header";
import { AirPanel, LocationPendingCard } from "@/components/AirPanel";
import { SurroundingAirMapCard } from "@/components/SurroundingAirMapCard";
import { TodayView } from "@/components/TodayView";
import { AirMapView } from "@/components/AirMapView";
import { AskView } from "@/components/AskView";
import { TipsView } from "@/components/TipsView";
import { ImpactView } from "@/components/ImpactView";
import { CommunityView } from "@/components/CommunityView";
import { ProfileView } from "@/components/ProfileView";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCompanionState } from "@/hooks/use-companion-state";
import { AirReport, CATEGORIES, CategoryKey, fetchAir, fmtHour } from "@/lib/air";
import { Profile, isSensitive } from "@/lib/companion";
import { Lang, tr } from "@/lib/knowledge";
import { TAB_ORDER, TabId, UI } from "@/lib/ui-copy";

const TAB_ICONS: Record<TabId, typeof CalendarCheck> = {
  today: CalendarCheck,
  map: Compass,
  ask: MessageCircle,
  tips: Lightbulb,
  impact: BarChart3,
  community: Users,
  profile: UserCog,
};

const CPCB_PM25_24H_LIMIT = 60;
const CPCB_PM10_24H_LIMIT = 100;
const AQI_SEVERITY: Record<CategoryKey, number> = {
  good: 0,
  satisfactory: 1,
  moderate: 2,
  poor: 3,
  very_poor: 4,
  severe: 5,
};

type AirIndicesStripProps = {
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

function AirIndicesStrip({
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
    <Card className="mb-6 overflow-hidden shadow-none" data-testid="indices-overview">
      <div className="h-1 w-full" style={{ backgroundColor: cat.color }} aria-hidden />
      <CardContent className="p-0">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5 md:px-5">
          <div className="flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{report.place.name}</span>
            {report.place.region && (
              <>
                <span aria-hidden className="hidden sm:inline">·</span>
                <span className="hidden truncate sm:inline">{report.place.region}</span>
              </>
            )}
            <span aria-hidden>·</span>
            <span className="truncate">{lang === "en" ? "CPCB India AQI indices" : "CPCB भारत AQI सूचकांक"}</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={isFetching}
            className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground whitespace-nowrap shrink-0"
            aria-label={lang === "en" ? `Refresh air indices for ${report.place.name}` : `${report.place.name} के वायु सूचकांक रीफ़्रेश करें`}
            data-testid="button-refresh-indices"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} aria-hidden />
            {lang === "en" ? "Refresh" : "रीफ़्रेश"}
          </Button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 lg:divide-x divide-border">
          {/* Index 1: India AQI */}
          <div className="p-3.5 sm:p-4 md:p-5">
            <p className="text-xs font-medium text-muted-foreground">
              {lang === "en" ? "India AQI (CPCB)" : "भारत AQI (CPCB)"}
            </p>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
              <span className="text-2xl font-bold tracking-tight text-foreground tabular-nums" data-testid="metric-aqi">
                {report.aqi}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">/ 500</span>
              <span className="text-xs font-semibold" style={{ color: cat.color }}>
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

          {/* Index 2: PM2.5 */}
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
              <span className={pm25Above ? "font-medium text-amber-700 dark:text-amber-400" : "font-medium text-emerald-700 dark:text-emerald-400"}>
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

          {/* Index 3: PM10 */}
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
              <span className={pm10Above ? "font-medium text-amber-700 dark:text-amber-400" : "font-medium text-emerald-700 dark:text-emerald-400"}>
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

          {/* Index 4: NO2 & Best Window */}
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
  );
}

export type DailyPlanAdviceItem = {
  id: "exercise" | "windows" | "protection" | "timing";
  label: string;
  action: string;
  detail: string;
  priority: "normal" | "caution" | "high";
  icon: typeof Dumbbell;
};

export function buildDailyPlanAdvice(
  report: AirReport,
  profile: Profile,
  lang: Lang,
): DailyPlanAdviceItem[] {
  const sev = AQI_SEVERITY[report.category];
  const sensitive = isSensitive(profile);
  const L = (en: string, hi: string) => (lang === "en" ? en : hi);
  const bestStr = report.bestWindow ? `${fmtHour(report.bestWindow.start)}–${fmtHour(report.bestWindow.end)}` : null;
  const worstStr = report.worstWindow ? `${fmtHour(report.worstWindow.start)}–${fmtHour(report.worstWindow.end)}` : null;

  const exercise: DailyPlanAdviceItem =
    sev >= 4
      ? {
          id: "exercise",
          label: L("Exercise", "व्यायाम"),
          action: L("Avoid outdoor exertion", "बाहर भारी व्यायाम से बचें"),
          detail: L(
            "Indoor exercise advised; skip outdoor runs and keep essential trips brief.",
            "घर के अंदर व्यायाम करें; बाहर दौड़ना टालें और ज़रूरी काम कम समय में निपटाएँ।",
          ),
          priority: "high",
          icon: Dumbbell,
        }
      : sev === 3 || (sev === 2 && sensitive)
        ? {
            id: "exercise",
            label: L("Exercise", "व्यायाम"),
            action: L("Indoor exercise advised", "अंदर व्यायाम की सलाह"),
            detail: L(
              "Move workouts and children's play indoors to avoid deeper smog inhalation.",
              "गहरी साँसों से प्रदूषण से बचने के लिए व्यायाम और बच्चों का खेल घर के अंदर रखें।",
            ),
            priority: sev === 3 ? "high" : "caution",
            icon: Dumbbell,
          }
        : sev === 2
          ? {
              id: "exercise",
              label: L("Exercise", "व्यायाम"),
              action: L("Light outdoor activity", "हल्की बाहरी गतिविधि"),
              detail: L(
                "Keep outdoor sessions moderate and pick quieter streets away from traffic.",
                "बाहर समय सीमित रखें और ट्रैफ़िक से दूर शांत रास्ते चुनें।",
              ),
              priority: "caution",
              icon: Dumbbell,
            }
          : {
              id: "exercise",
              label: L("Exercise", "व्यायाम"),
              action: L("Outdoor exercise safe", "बाहर व्यायाम सुरक्षित"),
              detail: L(
                "Good conditions for walks, runs, or outdoor play away from idling traffic.",
                "सैर, दौड़ और बाहर खेलने के लिए अच्छा समय; चालू वाहनों से दूर रहें।",
              ),
              priority: "normal",
              icon: Dumbbell,
            };

  const windows: DailyPlanAdviceItem =
    sev >= 3
      ? {
          id: "windows",
          label: L("Ventilation", "वेंटिलेशन"),
          action: L("Keep windows closed", "खिड़कियाँ बंद रखें"),
          detail: bestStr
            ? L(
                `Seal drafts and avoid outdoor air intake; crack briefly near ${bestStr} only if stuffy.`,
                `खिड़कियाँ बंद रखें; घुटन हो तो केवल ${bestStr} के बीच थोड़ी देर खोलें।`,
              )
            : L(
                "Seal drafts and keep exterior doors closed during morning and evening smog peaks.",
                "सुबह और शाम के स्मॉग के दौरान खिड़कियाँ और दरवाज़े बंद रखें।",
              ),
          priority: sev >= 4 ? "high" : "caution",
          icon: DoorClosed,
        }
      : sev === 2
        ? {
            id: "windows",
            label: L("Ventilation", "वेंटिलेशन"),
            action: L("Ventilate selectively", "सही समय पर हवादार करें"),
            detail: bestStr
              ? L(
                  `Open windows briefly around ${bestStr}, then keep closed during traffic peaks.`,
                  `${bestStr} के आसपास थोड़ी देर खिड़कियाँ खोलें, फिर ट्रैफ़िक के समय बंद रखें।`,
                )
              : L(
                  "Air out rooms briefly at midday and close windows before evening rush hour.",
                  "दोपहर में कमरे थोड़ी देर हवादार करें और शाम की भीड़ से पहले बंद कर दें।",
                ),
            priority: "caution",
            icon: Wind,
          }
        : {
            id: "windows",
            label: L("Ventilation", "वेंटिलेशन"),
            action: L("Cross-ventilate indoors", "घर में ताज़ी हवा लाएँ"),
            detail: L(
              "Open opposite windows for 15–20 minutes to refresh indoor air; run kitchen exhaust.",
              "ताज़ी हवा के लिए 15–20 मिनट विपरीत खिड़कियाँ खोलें और रसोई का एग्ज़ॉस्ट चलाएँ।",
            ),
            priority: "normal",
            icon: Wind,
          };

  const protection: DailyPlanAdviceItem =
    sev >= 4
      ? {
          id: "protection",
          label: L("Protection", "सुरक्षा"),
          action: L("Fitted N95 essential", "फ़िट N95 मास्क ज़रूरी"),
          detail: L(
            "Wear a well-sealed N95 outdoors and run a HEPA purifier in bedrooms if available.",
            "बाहर अच्छी तरह फ़िट N95 पहनें और संभव हो तो कमरे में HEPA प्यूरीफ़ायर चलाएँ।",
          ),
          priority: "high",
          icon: ShieldCheck,
        }
      : sev === 3 || (sev === 2 && sensitive)
        ? {
            id: "protection",
            label: L("Protection", "सुरक्षा"),
            action: L("Wear an N95 outdoors", "बाहर N95 मास्क पहनें"),
            detail: L(
              "Use a snug N95 for commutes and errands; keep vehicle vents on recirculate.",
              "यात्रा और बाहरी कामों में N95 पहनें; कार का AC रिसर्कुलेट पर रखें।",
            ),
            priority: sev === 3 ? "high" : "caution",
            icon: ShieldCheck,
          }
        : sev === 2
          ? {
              id: "protection",
              label: L("Protection", "सुरक्षा"),
              action: L("Carry N95 for traffic", "ट्रैफ़िक में N95 साथ रखें"),
              detail: L(
                "Keep a fitted N95 handy for two-wheelers, autos, or congested roads.",
                "दोपहिया, ऑटो या भीड़भाड़ वाली सड़कों के लिए N95 मास्क साथ रखें।",
              ),
              priority: "caution",
              icon: ShieldCheck,
            }
          : {
              id: "protection",
              label: L("Protection", "सुरक्षा"),
              action: L("No mask needed today", "आज मास्क ज़रूरी नहीं"),
              detail: L(
                "Regular commutes are comfortable; minimise indoor smoke when cooking.",
                "सामान्य आवाजाही आरामदायक है; खाना बनाते समय घर के अंदर धुआँ कम रखें।",
              ),
              priority: "normal",
              icon: ShieldCheck,
            };

  const timing: DailyPlanAdviceItem = {
    id: "timing",
    label: L("Best window", "सबसे साफ़ समय"),
    action: bestStr
      ? L(`Cleanest: ${bestStr}`, `सबसे साफ़: ${bestStr}`)
      : L(`Peak today: AQI ${report.peakToday}`, `आज का चरम: AQI ${report.peakToday}`),
    detail: worstStr
      ? L(
          `Plan essential errands then; avoid the worst stretch around ${worstStr}.`,
          `ज़रूरी बाहरी काम तब करें; ${worstStr} के आसपास बाहर निकलने से बचें।`,
        )
      : L(
          "Schedule outdoor trips when winds are steadier and road traffic is lighter.",
          "जब हवा चल रही हो और ट्रैफ़िक कम हो तब बाहर के काम निपटाएँ।",
        ),
    priority: sev >= 3 ? "caution" : "normal",
    icon: Clock,
  };

  return [exercise, windows, protection, timing];
}

type DailyPlanProps = {
  report: AirReport | undefined;
  profile: Profile;
  profileTouched: boolean;
  isLoading: boolean;
  hasPlace: boolean;
  locating: boolean;
  lang: Lang;
  activeTab: TabId;
  onAction: () => void;
};

export function DailyPlan({
  report,
  profile,
  profileTouched,
  isLoading,
  hasPlace,
  locating,
  lang,
  activeTab,
  onAction,
}: DailyPlanProps) {
  if ((!hasPlace && locating) || isLoading) {
    return (
      <Card className="mb-6 shadow-none" role="status" aria-live="polite" data-testid="daily-plan-loading">
        <CardContent className="grid grid-cols-1 divide-y divide-border p-0 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2 p-4">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!report) return null;

  const items = buildDailyPlanAdvice(report, profile, lang);
  const cat = CATEGORIES[report.category];
  const catLabel = tr(cat, lang);
  const sensitive = isSensitive(profile);

  return (
    <Card className="mb-6 overflow-hidden shadow-none" data-testid="card-daily-plan">
      <CardContent className="p-0">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5 md:px-5">
          <div className="flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">
              {lang === "en" ? "Daily Plan" : "दैनिक योजना"}
            </span>
            <span aria-hidden>·</span>
            <span className="font-medium tabular-nums" style={{ color: cat.color }}>
              AQI {report.aqi} · {catLabel}
            </span>
            {sensitive && (
              <>
                <span aria-hidden className="hidden sm:inline">·</span>
                <span className="hidden truncate text-primary sm:inline">
                  {lang === "en" ? "Extra-careful mode" : "अतिरिक्त सावधानी"}
                </span>
              </>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onAction}
            className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground whitespace-nowrap shrink-0"
            data-testid="button-daily-plan-action"
          >
            {activeTab === "today" ? (
              <>
                <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
                {profileTouched
                  ? lang === "en"
                    ? "Edit profile"
                    : "प्रोफ़ाइल बदलें"
                  : lang === "en"
                    ? "Personalise"
                    : "व्यक्तिगत बनाएँ"}
              </>
            ) : (
              <>
                <CalendarCheck className="h-3.5 w-3.5" aria-hidden />
                {lang === "en" ? "Full plan" : "पूरी योजना"}
              </>
            )}
          </Button>
        </div>

        <ul className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
          {items.map((item, idx) => {
            const Icon = item.icon;
            const iconBoxClass =
              item.priority === "high"
                ? "bg-destructive/10 text-destructive"
                : item.priority === "caution"
                  ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
                  : "bg-secondary text-primary";
            const smGridBorders = [
              "",
              "sm:border-l sm:border-border lg:border-l-0",
              "sm:border-t sm:border-border lg:border-t-0",
              "sm:border-l sm:border-t sm:border-border lg:border-l-0 lg:border-t-0",
            ][idx];

            return (
              <li
                key={item.id}
                className={`flex items-start gap-3 p-3.5 sm:p-4 ${smGridBorders}`}
                data-testid={`daily-plan-item-${item.id}`}
              >
                <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconBoxClass}`}>
                  <Icon className="h-4 w-4" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-muted-foreground">{item.label}</p>
                  <p className="mt-0.5 text-sm font-semibold leading-snug text-foreground tabular-nums">
                    {item.action}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.detail}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

export default function Home() {
  const {
    lang,
    place,
    locatingInitial,
    locInitError,
    profile,
    profileTouched,
    tab,
    done,
    joined,
    messages,
    stored,
    setLang,
    selectPlace,
    autoDetectLocation,
    setTab,
    toggleDone,
    updateProfile,
    setJoined,
    setMessages,
    clearUserData,
  } = useCompanionState();

  const air = useQuery<AirReport>({
    queryKey: ["air", place?.lat, place?.lon, place?.name],
    queryFn: () => fetchAir(place!),
    enabled: Boolean(place),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const t = (x: { en: string; hi: string }) => tr(x, lang);
  const navRef = useRef<HTMLDivElement>(null);
  const pendingScroll = useRef(false);

  const selectTab = useCallback(
    (id: TabId) => {
      pendingScroll.current = true;
      setTab(id);
    },
    [setTab],
  );

  const handleRefresh = useCallback(() => {
    if (place) {
      void air.refetch();
    } else {
      void autoDetectLocation(true);
    }
  }, [air, autoDetectLocation, place]);

  useEffect(() => {
    // On small screens the tabs sit below the air panel – bring the new section into view.
    const el = navRef.current;
    if (!pendingScroll.current || !el || window.innerWidth >= 1024) return;
    pendingScroll.current = false;
    const top = el.getBoundingClientRect().top + window.scrollY - 57;
    if (window.scrollY < top - 4) requestAnimationFrame(() => window.scrollTo({ top, behavior: "smooth" }));
  }, [tab]);

  return (
    <div className="min-h-screen bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground focus:shadow-lg"
      >
        {lang === "en" ? "Skip to main content" : "मुख्य सामग्री पर जाएँ"}
      </a>

      <Header
        lang={lang}
        setLang={setLang}
        place={place}
        setPlace={selectPlace}
        locatingInitial={locatingInitial}
        t={t}
      />

      <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl px-4 pb-16 pt-5 outline-none md:px-6">
        <AirIndicesStrip
          report={air.data}
          isLoading={air.isLoading}
          isFetching={air.isFetching}
          isError={air.isError}
          hasPlace={Boolean(place)}
          locating={locatingInitial}
          locError={locInitError}
          lang={lang}
          onRefresh={handleRefresh}
        />

        <DailyPlan
          report={air.data}
          profile={profile}
          profileTouched={profileTouched}
          isLoading={air.isLoading}
          hasPlace={Boolean(place)}
          locating={locatingInitial}
          lang={lang}
          activeTab={tab}
          onAction={() => selectTab(tab === "today" ? "profile" : "today")}
        />

        <div className="lg:grid lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:gap-6">
          <aside className="lg:sticky lg:top-20 lg:self-start" aria-label={lang === "en" ? "Current air quality" : "वर्तमान वायु गुणवत्ता"}>
            <AirPanel
              q={air}
              lang={lang}
              t={t}
              hasPlace={Boolean(place)}
              locating={locatingInitial}
              locError={locInitError}
              onRetry={handleRefresh}
            />
          </aside>

          <section className="mt-6 min-h-[calc(100vh-57px)] min-w-0 lg:mt-0 lg:min-h-0">
            <Tabs value={tab} onValueChange={(v) => selectTab(v as TabId)} className="w-full">
              <div
                ref={navRef}
                className="sticky top-[57px] z-20 -mx-4 mb-4 overflow-x-auto border-b bg-background/95 px-4 backdrop-blur md:-mx-0 md:px-0 lg:top-[65px]"
              >
                <TabsList
                  aria-label={lang === "en" ? "Clear Air Companion sections" : "क्लियर एयर कम्पेनियन अनुभाग"}
                  className="h-auto w-full justify-start gap-1 rounded-none bg-transparent p-0"
                >
                  {TAB_ORDER.map((id) => {
                    const Icon = TAB_ICONS[id];
                    return (
                      <TabsTrigger
                        key={id}
                        value={id}
                        id={`tab-btn-${id}`}
                        data-testid={`tab-${id}`}
                        className="flex shrink-0 items-center gap-1.5 rounded-none border-b-2 border-transparent bg-transparent px-3 py-3 text-sm font-medium text-muted-foreground shadow-none transition-colors whitespace-nowrap hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none"
                      >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden />
                        <span>{t(UI.tabs[id])}</span>
                        {id === "impact" && stored.actions > 0 && (
                          <span className="text-xs font-semibold text-primary tabular-nums">({stored.actions})</span>
                        )}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </div>

              <TabsContent value="today" id="tabpanel-today" className="mt-0 outline-none">
                <SurroundingAirMapCard
                  place={place}
                  report={air.data}
                  lang={lang}
                  locating={locatingInitial}
                  onSelectPlace={selectPlace}
                  onOpenFullMap={() => selectTab("map")}
                />
                <TodayView
                  q={air}
                  profile={profile}
                  profileTouched={profileTouched}
                  lang={lang}
                  t={t}
                  done={done}
                  toggleDone={toggleDone}
                  goProfile={() => selectTab("profile")}
                  hasPlace={Boolean(place)}
                  locating={locatingInitial}
                  onRetryLocate={() => void autoDetectLocation(true)}
                />
              </TabsContent>

              <TabsContent value="map" id="tabpanel-map" className="mt-0 outline-none">
                {place ? (
                  <AirMapView place={place} report={air.data ?? null} lang={lang} onSelectPlace={selectPlace} />
                ) : (
                  <LocationPendingCard locating={locatingInitial} lang={lang} onRetry={() => void autoDetectLocation(true)} />
                )}
              </TabsContent>

              <TabsContent value="ask" id="tabpanel-ask" className="mt-0 outline-none">
                <AskView
                  place={place}
                  locating={locatingInitial}
                  report={air.data ?? null}
                  profile={profile}
                  lang={lang}
                  messages={messages}
                  setMessages={setMessages}
                  updateProfile={updateProfile}
                />
              </TabsContent>

              <TabsContent value="tips" id="tabpanel-tips" className="mt-0 outline-none">
                <TipsView profile={profile} lang={lang} done={done} toggleDone={toggleDone} />
              </TabsContent>

              <TabsContent value="impact" id="tabpanel-impact" className="mt-0 outline-none">
                <ImpactView lang={lang} done={done} toggleDone={toggleDone} goTips={() => selectTab("tips")} />
              </TabsContent>

              <TabsContent value="community" id="tabpanel-community" className="mt-0 outline-none">
                <CommunityView
                  lang={lang}
                  place={place}
                  joined={joined}
                  setJoined={setJoined}
                  doneCount={stored.actions}
                />
              </TabsContent>

              <TabsContent value="profile" id="tabpanel-profile" className="mt-0 outline-none">
                <ProfileView
                  lang={lang}
                  profile={profile}
                  update={updateProfile}
                  place={place}
                  locating={locatingInitial}
                  clearAll={clearUserData}
                  stored={stored}
                />
              </TabsContent>
            </Tabs>
          </section>
        </div>
      </main>

      <Separator />
      <footer>
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between md:px-6">
          <p className="flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {t(UI.disclaimer)}
          </p>
          <p>
            {lang === "en" ? "Data: " : "डेटा: "}
            <a
              className="underline underline-offset-2 hover:text-foreground"
              href="https://open-meteo.com/en/docs/air-quality-api"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open-Meteo / CAMS
            </a>
            {" · "}
            <a
              className="underline underline-offset-2 hover:text-foreground"
              href="https://airquality.cpcb.gov.in/AQI_India/"
              target="_blank"
              rel="noopener noreferrer"
            >
              CPCB AQI India
            </a>
            {" · "}
            <a
              className="underline underline-offset-2 hover:text-foreground"
              href="https://cloud.google.com/maps-platform/terms?utm_campaign=gmp_mcp_codeassist_v1_aistudio"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google Maps Platform
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
