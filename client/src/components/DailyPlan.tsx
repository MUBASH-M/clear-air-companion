import { CalendarCheck, Clock, DoorClosed, Dumbbell, ShieldCheck, SlidersHorizontal, Wind } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AirReport, CATEGORIES, CategoryKey, fmtHour } from "@/lib/air";
import { Profile, isSensitive } from "@/lib/companion";
import { Lang, tr } from "@/lib/knowledge";
import { TabId } from "@/lib/ui-copy";

const AQI_SEVERITY: Record<CategoryKey, number> = {
  good: 0,
  satisfactory: 1,
  moderate: 2,
  poor: 3,
  very_poor: 4,
  severe: 5,
};

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

export type DailyPlanProps = {
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
    <section aria-labelledby="daily-plan-heading" className="mb-6">
      <Card className="overflow-hidden shadow-none" data-testid="card-daily-plan">
        <CardContent className="p-0">
          <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5 md:px-5">
            <h2
              id="daily-plan-heading"
              className="flex min-w-0 items-center gap-1.5 truncate text-xs font-normal text-muted-foreground"
            >
              <span className="font-semibold text-foreground">
                {lang === "en" ? "Daily Plan" : "दैनिक योजना"}
              </span>
              <span aria-hidden>·</span>
              <span className="font-semibold tabular-nums" style={{ color: cat.textColor }}>
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
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onAction}
              className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground whitespace-nowrap shrink-0"
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
    </section>
  );
}
