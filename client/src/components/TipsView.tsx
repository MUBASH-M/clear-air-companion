import { useState } from "react";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Profile, rankedTips } from "@/lib/companion";
import { COST_LABEL, EVIDENCE_LABEL, KIND_LABEL, Lang, Tip, TipKind, fx, tr } from "@/lib/knowledge";
import { DoneAction, UI } from "@/lib/ui-copy";

function TipCard({
  tip,
  lang,
  isDone,
  onToggle,
  outOfBudget,
}: {
  tip: Tip;
  lang: Lang;
  isDone: boolean;
  onToggle: () => void;
  outOfBudget?: boolean;
}) {
  const title = tip.title[lang];
  return (
    <article
      className={`flex flex-col rounded-xl border bg-card p-4 ${isDone ? "border-primary/40 bg-accent/40" : ""}`}
      data-testid={`card-tip-${tip.id}`}
    >
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <Badge variant="secondary">{tr(KIND_LABEL[tip.kind], lang)}</Badge>
        <Badge variant="outline">{tr(COST_LABEL[tip.cost], lang)}</Badge>
        <span className="text-muted-foreground">{tr(EVIDENCE_LABEL[tip.evidence], lang)}</span>
      </div>
      <h2 className="mt-2 text-base font-semibold leading-snug">{title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-foreground/80">{tip.body[lang]}</p>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        <span className="font-semibold">{lang === "en" ? "What it won't fix: " : "क्या नहीं सुधरेगा: "}</span>
        {tip.limits[lang]}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md bg-muted/60 px-2 py-1.5">
          <p className="font-semibold text-primary">{tr(UI.you, lang)}</p>
          <p className="text-muted-foreground">{fx(tip.exposure, lang)}</p>
        </div>
        <div className="rounded-md bg-muted/60 px-2 py-1.5">
          <p className="font-semibold text-amber-800 dark:text-amber-400">{tr(UI.neighbourhood, lang)}</p>
          <p className="text-muted-foreground">{fx(tip.emissions, lang)}</p>
        </div>
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 pt-3">
        {outOfBudget ? (
          <span className="text-xs text-muted-foreground">
            {lang === "en" ? "Above your budget setting" : "आपके बजट से ऊपर"}
          </span>
        ) : (
          <span />
        )}
        <Button
          size="sm"
          variant={isDone ? "default" : "outline"}
          onClick={onToggle}
          aria-pressed={isDone}
          aria-label={`${isDone ? tr(UI.done, lang) : tr(UI.didThis, lang)}: ${title}`}
          data-testid={`button-tip-done-${tip.id}`}
        >
          <Check className="h-4 w-4" aria-hidden />
          {isDone ? tr(UI.done, lang) : tr(UI.didThis, lang)}
        </Button>
      </div>
    </article>
  );
}

type TipsViewProps = {
  profile: Profile;
  lang: Lang;
  done: Record<string, DoneAction>;
  toggleDone: (id: string, title?: string) => void;
};

export function TipsView({ profile, lang, done, toggleDone }: TipsViewProps) {
  const [filter, setFilter] = useState<"all" | TipKind>("all");
  const tips = rankedTips(filter === "all" ? null : [filter], profile);
  const max = profile.budget === "tight" ? 1 : profile.budget === "some" ? 2 : 3;
  const kinds: ("all" | TipKind)[] = ["all", "indoor", "travel", "cooking", "heating", "waste", "shopping"];

  return (
    <div>
      <h1 className="text-xl font-bold">{lang === "en" ? "Indoor air fixes and cleaner choices" : "घर की हवा के उपाय और स्वच्छ विकल्प"}</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        {lang === "en"
          ? "Sorted by cost, then by effect – free and low-cost steps always come first. We never sell or promote products."
          : "लागत, फिर प्रभाव के अनुसार क्रम – मुफ़्त और सस्ते कदम हमेशा पहले। हम कोई उत्पाद नहीं बेचते।"}
      </p>
      <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label={lang === "en" ? "Filter tips by category" : "श्रेणी के अनुसार सुझाव फ़िल्टर करें"}>
        {kinds.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            aria-pressed={filter === k}
            className={`rounded-full border px-3 py-1 text-sm ${filter === k ? "border-primary bg-primary text-primary-foreground" : "hover-elevate"}`}
            data-testid={`filter-${k}`}
          >
            {k === "all" ? (lang === "en" ? "All" : "सभी") : tr(KIND_LABEL[k], lang)}
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {tips.map((tip) => (
          <TipCard
            key={tip.id}
            tip={tip}
            lang={lang}
            isDone={Boolean(done[tip.id])}
            onToggle={() => toggleDone(tip.id, tip.title[lang])}
            outOfBudget={tip.cost > max}
          />
        ))}
      </div>
    </div>
  );
}
