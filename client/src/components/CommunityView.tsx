import { Dispatch, SetStateAction } from "react";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Place } from "@/lib/air";
import { Lang } from "@/lib/knowledge";

const GOALS = [
  {
    id: "idle",
    title: { en: "No-idling week at the school gate", hi: "स्कूल गेट पर इंजन-बंद सप्ताह" },
    body: {
      en: "Parents and drivers switch off engines during drop-off and pick-up, 24–30 November.",
      hi: "24–30 नवंबर, छोड़ने और लेने के समय माता-पिता और ड्राइवर इंजन बंद रखें।",
    },
    pledged: 74,
    target: 120,
    tip: "carpool",
  },
  {
    id: "burn",
    title: { en: "No leaf or rubbish burning this winter", hi: "इस सर्दी पत्ते या कचरा न जलाने का संकल्प" },
    body: {
      en: "Leaves go to the society compost pit; burning is reported to the RWA.",
      hi: "पत्ते सोसाइटी के खाद गड्ढे में; जलाने की सूचना RWA को।",
    },
    pledged: 131,
    target: 200,
    tip: "no-burning",
  },
  {
    id: "carpool",
    title: { en: "Carpool Tuesdays and Thursdays", hi: "मंगलवार और गुरुवार कारपूल" },
    body: {
      en: "Office-goers share rides two days a week on the worst-forecast days.",
      hi: "सबसे खराब पूर्वानुमान वाले दिनों में सप्ताह में दो दिन सवारी साझा करें।",
    },
    pledged: 38,
    target: 80,
    tip: "carpool",
  },
];

const TOP_QUESTIONS = [
  { q: { en: "Is it safe to send children to school?", hi: "क्या बच्चों को स्कूल भेजना सुरक्षित है?" }, n: 41 },
  { q: { en: "When to open windows", hi: "खिड़कियाँ कब खोलें" }, n: 33 },
  { q: { en: "Low-cost air filters", hi: "सस्ते एयर फ़िल्टर" }, n: 27 },
  { q: { en: "Masks for older parents", hi: "बुज़ुर्ग माता-पिता के लिए मास्क" }, n: 15 },
];

type CommunityViewProps = {
  lang: Lang;
  place: Place | null;
  joined: Record<string, boolean>;
  setJoined: Dispatch<SetStateAction<Record<string, boolean>>>;
  doneCount: number;
};

export function CommunityView({ lang, place, joined, setJoined, doneCount }: CommunityViewProps) {
  const maxQ = Math.max(...TOP_QUESTIONS.map((x) => x.n));
  const areaLabel = place?.name;
  const groupTitle = areaLabel
    ? lang === "en"
      ? `${areaLabel} Residents & School Group`
      : `${areaLabel} निवासी और स्कूल समूह`
    : lang === "en"
      ? "Local Residents & School Group"
      : "स्थानीय निवासी और स्कूल समूह";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold">{groupTitle}</h1>
        <Badge variant="outline">{lang === "en" ? "Sample group" : "नमूना समूह"}</Badge>
      </div>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        {lang === "en"
          ? "212 households · 1 school · 3 small workplaces. Only grouped, anonymous numbers are shown – individual household details are never visible to the group."
          : "212 घर · 1 स्कूल · 3 छोटे कार्यस्थल। केवल समूहित, गुमनाम आँकड़े दिखते हैं – किसी घर की व्यक्तिगत जानकारी समूह को नहीं दिखती।"}
      </p>

      <h2 className="mt-6 text-base font-semibold">{lang === "en" ? "Shared goals" : "साझा लक्ष्य"}</h2>
      <div className="mt-2 space-y-3">
        {GOALS.map((g) => {
          const me = joined[g.id] ? 1 : 0;
          const n = g.pledged + me;
          const pct = Math.min(100, (n / g.target) * 100);
          return (
            <div key={g.id} className="rounded-xl border bg-card p-4" data-testid={`card-goal-${g.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold leading-snug">{g.title[lang]}</h3>
                  <p className="mt-0.5 text-sm text-foreground/80">{g.body[lang]}</p>
                </div>
                <Button
                  size="sm"
                  variant={me ? "default" : "outline"}
                  onClick={() => setJoined((j) => ({ ...j, [g.id]: !j[g.id] }))}
                  aria-pressed={Boolean(me)}
                  aria-label={`${me ? (lang === "en" ? "Leave goal" : "संकल्प छोड़ें") : lang === "en" ? "Join goal" : "संकल्प से जुड़ें"}: ${g.title[lang]}`}
                  className="shrink-0"
                  data-testid={`button-join-${g.id}`}
                >
                  {me ? (
                    <>
                      <Check className="h-4 w-4" aria-hidden />
                      {lang === "en" ? "Joined" : "जुड़ गए"}
                    </>
                  ) : lang === "en" ? (
                    "Join"
                  ) : (
                    "जुड़ें"
                  )}
                </Button>
              </div>
              <Progress
                value={pct}
                aria-label={`${g.title[lang]}: ${n} / ${g.target}`}
                className="mt-3 h-2"
              />
              <p className="mt-1.5 text-xs text-muted-foreground tabular-nums" data-testid={`text-goal-count-${g.id}`}>
                {n} / {g.target} {lang === "en" ? "households pledged" : "घरों ने संकल्प लिया"}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <h2 className="text-base font-semibold">{lang === "en" ? "What neighbours are asking" : "पड़ोसी क्या पूछ रहे हैं"}</h2>
          <p className="text-xs text-muted-foreground">{lang === "en" ? "This week, grouped" : "इस सप्ताह, समूहित"}</p>
          <ul className="mt-3 space-y-2.5">
            {TOP_QUESTIONS.map((x) => (
              <li key={x.q.en}>
                <div className="flex justify-between gap-2 text-sm">
                  <span className="min-w-0">{x.q[lang]}</span>
                  <span className="tabular-nums text-muted-foreground">{x.n}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-muted" aria-hidden>
                  <div className="h-1.5 rounded-full bg-primary/70" style={{ width: `${(x.n / maxQ) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <h2 className="text-base font-semibold">{lang === "en" ? "Actions taken together" : "मिलकर उठाए गए कदम"}</h2>
          <p className="text-xs text-muted-foreground">{lang === "en" ? "Since 1 November" : "1 नवंबर से"}</p>
          <dl className="mt-3 grid grid-cols-2 gap-3">
            {[
              { k: lang === "en" ? "Indoor-air actions" : "घर की हवा के कदम", v: 486 },
              { k: lang === "en" ? "Low-emission trips" : "कम-उत्सर्जन यात्राएँ", v: 1290 },
              { k: lang === "en" ? "Burning reports" : "जलाने की शिकायतें", v: 17 },
              { k: lang === "en" ? "Your actions" : "आपके कदम", v: doneCount },
            ].map((s) => (
              <div key={s.k} className="rounded-lg bg-muted/60 p-3">
                <dt className="text-xs text-muted-foreground">{s.k}</dt>
                <dd className="text-lg font-bold tabular-nums">{s.v.toLocaleString("en-IN")}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        {lang === "en" ? "Group numbers in this pilot are illustrative sample data." : "इस पायलट में समूह के आँकड़े उदाहरण के लिए हैं।"}
      </p>
    </div>
  );
}
