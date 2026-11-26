import { UseQueryResult } from "@tanstack/react-query";
import { AppWindow, Check, Flame, HeartPulse, Home as HomeIcon, Leaf, Route, School, Sun } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DailyGuidanceCard } from "@/components/DailyGuidanceCard";
import { LocationPendingCard } from "@/components/AirPanel";
import { AirReport } from "@/lib/air";
import { PlanItem, Profile, buildPlan, isSensitive } from "@/lib/companion";
import { Lang, fx } from "@/lib/knowledge";
import { DoneAction, UI } from "@/lib/ui-copy";

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
  if (!q.data) {
    return (
      <p className="text-sm text-muted-foreground">
        {lang === "en" ? "Your plan will appear once air data loads." : "वायु डेटा लोड होने पर आपकी योजना दिखेगी।"}
      </p>
    );
  }

  const plan = buildPlan(q.data, profile, lang);
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
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{today}</p>
      <h1 className="mt-1 text-xl font-bold leading-tight" data-testid="text-plan-headline">
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
          <Button size="sm" onClick={goProfile} data-testid="button-setup-profile" className="shrink-0">
            {lang === "en" ? "Personalise" : "व्यक्तिगत बनाएँ"}
          </Button>
        </div>
      )}

      {isSensitive(profile) && (
        <Badge variant="outline" className="mt-3 gap-1">
          <HeartPulse className="h-3 w-3" aria-hidden />
          {lang === "en" ? "Extra-careful mode on" : "अतिरिक्त सावधानी मोड चालू"}
        </Badge>
      )}

      <h2 className="mt-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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
                      className="shrink-0"
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
