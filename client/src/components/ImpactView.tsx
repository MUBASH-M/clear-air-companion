import { BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EVIDENCE_LABEL, Lang, TIPS, fx, tipById, tr } from "@/lib/knowledge";
import { DoneAction, UI } from "@/lib/ui-copy";

type ImpactViewProps = {
  lang: Lang;
  done: Record<string, DoneAction>;
  toggleDone: (id: string) => void;
  goTips: () => void;
};

export function ImpactView({ lang, done, toggleDone, goTips }: ImpactViewProps) {
  const ids = Object.keys(done)
    .filter((id) => TIPS.some((t) => t.id === id))
    .sort((a, b) => done[b].ts - done[a].ts);
  const tips = ids.map(tipById);
  const protect = tips.filter((t) => !/no direct change/i.test(t.exposure));
  const reduce = tips.filter((t) => !/no direct change|electricity/i.test(t.emissions));
  const strong = tips.filter((t) => t.evidence === "strong").length;
  const steps = Object.keys(done)
    .filter((id) => id.startsWith("plan-"))
    .sort((a, b) => done[b].ts - done[a].ts);

  if (!tips.length && !steps.length) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center">
        <BarChart3 className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
        <h1 className="mt-2 text-lg font-semibold">{lang === "en" ? "No actions logged yet" : "अभी तक कोई कदम दर्ज नहीं"}</h1>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          {lang === "en"
            ? "Tap “I did this” on any plan step or tip and your running summary appears here."
            : "किसी भी कदम पर “मैंने किया” दबाएँ और आपका सारांश यहाँ दिखेगा।"}
        </p>
        <Button size="sm" variant="outline" className="mt-4" onClick={goTips} data-testid="button-browse-tips">
          {lang === "en" ? "Browse tips" : "सुझाव देखें"}
        </Button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-bold">{lang === "en" ? "Your impact so far" : "अब तक आपका प्रभाव"}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {lang === "en" ? "A simple running summary of what you've done this session." : "इस सत्र में आपने जो किया उसका सरल सारांश।"}
      </p>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {[
          { k: lang === "en" ? "Actions taken" : "उठाए गए कदम", v: tips.length + steps.length },
          { k: lang === "en" ? "Lower your exposure" : "आपका प्रदूषण घटाते", v: protect.length },
          { k: lang === "en" ? "Cut local emissions" : "स्थानीय उत्सर्जन घटाते", v: reduce.length },
        ].map((s) => (
          <div key={s.k} className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">{s.k}</p>
            <p className="mt-1 text-xl font-bold tabular-nums" data-testid={`stat-${s.k}`}>
              {s.v}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-4 divide-y rounded-xl border bg-card">
        {tips.map((tip) => (
          <div
            key={tip.id}
            className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between"
            data-testid={`row-impact-${tip.id}`}
          >
            <div className="min-w-0">
              <p className="font-semibold">{tip.title[lang]}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                <span className="font-semibold text-primary">{tr(UI.you, lang)}:</span> {fx(tip.exposure, lang)} ·{" "}
                <span className="font-semibold text-amber-800 dark:text-amber-400">{tr(UI.neighbourhood, lang)}:</span>{" "}
                {fx(tip.emissions, lang)}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{tr(EVIDENCE_LABEL[tip.evidence], lang)}</p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => toggleDone(tip.id)}
              aria-label={`${lang === "en" ? "Undo" : "हटाएँ"}: ${tip.title[lang]}`}
              className="self-start text-muted-foreground"
              data-testid={`button-undo-${tip.id}`}
            >
              {lang === "en" ? "Undo" : "हटाएँ"}
            </Button>
          </div>
        ))}
        {steps.map((id) => {
          const title = done[id]?.title ?? id;
          return (
            <div
              key={id}
              className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between"
              data-testid={`row-impact-${id}`}
            >
              <div className="min-w-0">
                <p className="font-semibold">{title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {lang === "en" ? "Plan step followed" : "योजना का कदम पूरा"}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => toggleDone(id)}
                aria-label={`${lang === "en" ? "Undo" : "हटाएँ"}: ${title}`}
                className="self-start text-muted-foreground"
              >
                {lang === "en" ? "Undo" : "हटाएँ"}
              </Button>
            </div>
          );
        })}
      </div>
      <p className="mt-4 rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
        {lang === "en"
          ? `${strong} of the ${tips.length} library actions here rest on strong evidence. Ranges are rules of thumb from published studies and depend on your home, fit and how long you keep them up; we show ranges rather than a single number on purpose.`
          : `इन ${tips.length} में से ${strong} कदम मज़बूत प्रमाण पर आधारित हैं। दायरे प्रकाशित अध्ययनों के सामान्य नियम हैं और आपके घर, फ़िटिंग और निरंतरता पर निर्भर करते हैं।`}
      </p>
    </div>
  );
}
