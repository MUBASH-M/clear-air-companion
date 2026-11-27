import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { UseQueryResult } from "@tanstack/react-query";
import {
  AlertTriangle,
  AppWindow,
  Check,
  Flame,
  Globe,
  HeartPulse,
  Home as HomeIcon,
  Leaf,
  RefreshCw,
  Route,
  School,
  Sun,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DailyGuidanceCard } from "@/components/DailyGuidanceCard";
import { LocationPendingCard } from "@/components/AirPanel";
import { WebSourcesList } from "@/components/WebSourcesList";
import { AirReport } from "@/lib/air";
import { WebGroundingSource, fetchLiveAirAdvisories } from "@/lib/ai";
import { PlanItem, Profile, buildPlan, isSensitive } from "@/lib/companion";
import { Lang, fx } from "@/lib/knowledge";
import { DoneAction, UI } from "@/lib/ui-copy";

const LazySafeMarkdown = lazy(() =>
  import("@/components/SafeMarkdown").then((m) => ({ default: m.SafeMarkdown })),
);

const ICONS: Record<PlanItem["icon"], typeof Sun> = {
  sun: Sun,
  school: School,
  route: Route,
  window: AppWindow,
  flame: Flame,
  heart: HeartPulse,
  home: HomeIcon,
  leaf: Leaf,
};

type TodayViewProps = {
  q: UseQueryResult<AirReport>;
  profile: Profile;
  profileTouched: boolean;
  lang: Lang;
  t: (x: { en: string; hi: string }) => string;
  done: Record<string, DoneAction>;
  toggleDone: (id: string, title?: string) => void;
  goProfile: () => void;
  hasPlace: boolean;
  locating: boolean;
  onRetryLocate: () => void;
};

export function TodayView({
  q,
  profile,
  profileTouched,
  lang,
  t,
  done,
  toggleDone,
  goProfile,
  hasPlace,
  locating,
  onRetryLocate,
}: TodayViewProps) {
  const [advisoryLoading, setAdvisoryLoading] = useState(false);
  const [advisoryError, setAdvisoryError] = useState<string | null>(null);
  const [advisory, setAdvisory] = useState<{ text: string; webSources: WebGroundingSource[] } | null>(null);

  // Reset cached advisory when location or language changes
  const placeKey = q.data ? `${q.data.place.name}-${q.data.place.lat}-${q.data.place.lon}-${lang}` : "";
  useEffect(() => {
    setAdvisory(null);
    setAdvisoryError(null);
  }, [placeKey]);

  const loadAdvisories = async () => {
    if (!q.data || advisoryLoading) return;
    setAdvisoryLoading(true);
    setAdvisoryError(null);
    try {
      const res = await fetchLiveAirAdvisories({
        lang,
        place: q.data.place,
        report: q.data,
      });
      setAdvisory(res);
    } catch (err) {
      setAdvisoryError(
        err instanceof Error
          ? err.message
          : lang === "en"
            ? "Could not load live advisories right now."
            : "अभी लाइव अपडेट लोड नहीं हो सके।",
      );
    } finally {
      setAdvisoryLoading(false);
    }
  };

  const plan = useMemo(
    () => (q.data ? buildPlan(q.data, profile, lang) : null),
    [q.data, profile, lang],
  );

  if ((!hasPlace && locating) || q.isLoading) {
    return (
      <div className="space-y-3" role="status" aria-live="polite" aria-label={lang === "en" ? "Loading daily plan" : "दैनिक योजना लोड हो रही है"}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }
  if (!hasPlace) {
    return <LocationPendingCard locating={false} lang={lang} onRetry={onRetryLocate} />;
  }
  if (!q.data || !plan) {
    return (
      <p className="text-sm text-muted-foreground">
        {lang === "en" ? "Your plan will appear once air data loads." : "वायु डेटा लोड होने पर आपकी योजना दिखेगी।"}
      </p>
    );
  }

  // Use the location's local date (from the reading), not the visitor's device date
  const [yy, mm, dd] = q.data.observedAt.slice(0, 10).split("-").map(Number);
  const today = new Date(Date.UTC(yy, mm - 1, dd)).toLocaleDateString(lang === "en" ? "en-IN" : "hi-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{today}</p>
      <h1 className="mt-1 text-xl font-bold leading-tight text-balance" data-testid="text-plan-headline">
        {plan.headline}
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{plan.summary}</p>

      <DailyGuidanceCard
        report={q.data}
        profile={profile}
        profileTouched={profileTouched}
        lang={lang}
        onPersonalise={goProfile}
      />

      {!profileTouched && (
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-dashed bg-accent/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            {lang === "en"
              ? "Tell us about your household – children, older adults, health conditions, commute and cooking fuel – and the plan adapts."
              : "अपने घर के बारे में बताएँ – बच्चे, बुज़ुर्ग, स्वास्थ्य, यात्रा और ईंधन – और योजना आपके अनुसार बदलेगी।"}
          </p>
          <Button size="sm" onClick={goProfile} data-testid="button-setup-profile" className="shrink-0 whitespace-nowrap">
            {lang === "en" ? "Personalise" : "व्यक्तिगत बनाएँ"}
          </Button>
        </div>
      )}

      {isSensitive(profile) && (
        <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-primary">
          <HeartPulse className="h-3.5 w-3.5" aria-hidden />
          {lang === "en" ? "Extra-careful mode active for your household" : "आपके परिवार के लिए अतिरिक्त सावधानी मोड सक्रिय"}
        </p>
      )}

      <Card className="mt-4 shadow-none" data-testid="card-search-advisories">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <Globe className="h-4 w-4 text-primary" aria-hidden />
                {lang === "en"
                  ? `Live advisories & news · ${q.data.place.name}`
                  : `लाइव प्रदूषण अपडेट और समाचार · ${q.data.place.name}`}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {lang === "en"
                  ? "Checks official GRAP stages, school notices, and local air updates via Google Search."
                  : "Google Search द्वारा ताज़ा GRAP नियम, स्कूल सूचनाएँ और स्थानीय वायु अपडेट देखें।"}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant={advisory ? "ghost" : "outline"}
              onClick={loadAdvisories}
              disabled={advisoryLoading}
              className="shrink-0 whitespace-nowrap"
              data-testid="button-fetch-advisories"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${advisoryLoading ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden />
              {advisory
                ? lang === "en"
                  ? "Refresh"
                  : "रीफ़्रेश"
                : lang === "en"
                  ? "Check live updates"
                  : "ताज़ा अपडेट देखें"}
            </Button>
          </div>

          {advisoryLoading && (
            <div className="mt-3 space-y-2" role="status" aria-live="polite">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          )}

          {advisoryError && (
            <Alert variant="destructive" className="mt-3">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              <AlertDescription>{advisoryError}</AlertDescription>
            </Alert>
          )}

          {advisory && !advisoryLoading && (
            <div className="mt-3 border-t pt-3" data-testid="advisories-result">
              <div className="prose prose-sm max-w-none text-foreground prose-p:my-1.5 prose-ul:my-1.5 prose-li:my-0.5 prose-strong:text-foreground prose-a:text-primary">
                <Suspense fallback={<Skeleton className="h-16 w-full" />}>
                  <LazySafeMarkdown>{advisory.text}</LazySafeMarkdown>
                </Suspense>
              </div>
              <WebSourcesList sources={advisory.webSources} lang={lang} />
            </div>
          )}
        </CardContent>
      </Card>

      <h2 className="mt-6 text-xs font-medium text-muted-foreground">
        {lang === "en" ? "Today's action plan" : "आज की कार्य योजना"}
      </h2>
      <ol className="mt-2.5 space-y-3">
        {plan.items.map((it, i) => {
          const Icon = ICONS[it.icon];
          const key = it.tipId ?? `plan-${it.id}`;
          const isDone = Boolean(done[key]);
          return (
            <li
              key={it.id}
              className={`rounded-xl border bg-card p-4 transition-colors ${isDone ? "border-primary/40 bg-accent/40" : ""}`}
              data-testid={`card-plan-${it.id}`}
            >
              <div className="flex gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                  <Icon className="h-[18px] w-[18px]" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-base font-semibold leading-snug">
                      <span className="mr-1.5 text-muted-foreground tabular-nums">{i + 1}.</span>
                      {it.title}
                    </h3>
                    <Button
                      size="sm"
                      variant={isDone ? "default" : "outline"}
                      onClick={() => toggleDone(key, it.title)}
                      aria-pressed={isDone}
                      aria-label={`${isDone ? t(UI.done) : t(UI.didThis)}: ${it.title}`}
                      className="shrink-0 whitespace-nowrap"
                      data-testid={`button-done-${it.id}`}
                    >
                      <Check className="h-4 w-4" aria-hidden />
                      <span className="hidden sm:inline">{isDone ? t(UI.done) : t(UI.didThis)}</span>
                    </Button>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-foreground/80">{it.detail}</p>
                  {(it.exposure || it.emissions) && (
                    <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      {it.exposure && (
                        <span>
                          <span className="font-semibold text-primary">{t(UI.you)}:</span>{" "}
                          <span className="text-muted-foreground">{fx(it.exposure, lang)}</span>
                        </span>
                      )}
                      {it.emissions && (
                        <span>
                          <span className="font-semibold text-amber-800 dark:text-amber-400">{t(UI.neighbourhood)}:</span>{" "}
                          <span className="text-muted-foreground">{fx(it.emissions, lang)}</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 text-xs text-muted-foreground">
        {lang === "en"
          ? "Effect estimates are ranges from documented rules of thumb, not promises. They depend on your home, how well things fit and how long you use them."
          : "प्रभाव के अनुमान सामान्य नियमों पर आधारित दायरे हैं, वादे नहीं। ये आपके घर, फ़िटिंग और उपयोग की अवधि पर निर्भर करते हैं।"}
      </p>
    </div>
  );
}
