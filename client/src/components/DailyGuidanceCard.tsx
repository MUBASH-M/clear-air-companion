import { Activity, AppWindow, HeartPulse, Shield, ShieldCheck, SlidersHorizontal, Wind } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AirReport, CATEGORIES } from "@/lib/air";
import { GuidanceIcon, Profile, buildDailyGuidance } from "@/lib/companion";
import { Lang } from "@/lib/knowledge";

const GUIDANCE_ICONS: Record<GuidanceIcon, typeof ShieldCheck> = {
  mask: ShieldCheck,
  activity: Activity,
  window: AppWindow,
  heart: HeartPulse,
  shield: Shield,
  wind: Wind,
};

type DailyGuidanceCardProps = {
  report: AirReport;
  profile: Profile;
  profileTouched: boolean;
  lang: Lang;
  onPersonalise: () => void;
};

export function DailyGuidanceCard({ report, profile, profileTouched, lang, onPersonalise }: DailyGuidanceCardProps) {
  const guidance = buildDailyGuidance(report, profile, lang);
  const category = CATEGORIES[report.category];
  const L = (en: string, hi: string) => (lang === "en" ? en : hi);

  return (
    <section
      aria-labelledby="daily-guidance-heading"
      className="mt-4 overflow-hidden rounded-xl border bg-card"
      data-testid="card-daily-guidance"
    >
      <div className="h-1.5" style={{ background: category.color }} />
      <div className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2
              id="daily-guidance-heading"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              {L("Daily Guidance", "दैनिक मार्गदर्शन")}
            </h2>
            <span
              className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums"
              style={{ background: category.color, color: category.ink }}
              data-testid="badge-guidance-aqi"
            >
              {guidance.aqiLabel}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onPersonalise}
            className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
            data-testid="button-guidance-personalise"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
            {profileTouched ? L("Edit profile", "प्रोफ़ाइल बदलें") : L("Personalise", "व्यक्तिगत बनाएँ")}
          </Button>
        </div>

        <p
          className="mt-2.5 text-lg font-bold leading-snug text-foreground"
          data-testid="text-guidance-headline"
        >
          {guidance.headline}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {guidance.subtext}
        </p>

        {guidance.personalizedFor.length > 0 && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-primary" data-testid="text-guidance-tailored">
            <HeartPulse className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              {L("Tailored for: ", "इनके लिए व्यक्तिगत: ")}
              {guidance.personalizedFor.join(" · ")}
            </span>
          </p>
        )}

        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {guidance.tips.map((tip, index) => {
            const Icon = GUIDANCE_ICONS[tip.icon];
            const isHigh = tip.priority === "high";
            const spanFull = guidance.tips.length === 3 && index === 0;
            return (
              <li
                key={tip.id}
                className={`rounded-lg border p-3.5 ${
                  isHigh ? "border-primary/25 bg-accent/40" : "bg-background/60"
                } ${spanFull ? "sm:col-span-2" : ""}`}
                data-testid={`guidance-tip-${tip.id}`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      isHigh ? "bg-primary text-primary-foreground" : "bg-secondary text-primary"
                    }`}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                      <h3 className="text-sm font-semibold leading-snug text-foreground">
                        {tip.title}
                      </h3>
                      <span className="text-[11px] font-medium text-muted-foreground">
                        {tip.tag}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {tip.detail}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
