import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Place } from "@/lib/air";
import { Profile } from "@/lib/companion";
import { Lang } from "@/lib/knowledge";

type ProfileViewProps = {
  lang: Lang;
  profile: Profile;
  update: (p: Partial<Profile>) => void;
  clearAll: () => void;
  stored: { actions: number; messages: number; groups: number };
  place: Place | null;
  locating: boolean;
};

export function ProfileView({ lang, profile, update, clearAll, stored, place, locating }: ProfileViewProps) {
  const [confirm, setConfirm] = useState(false);
  const L = (en: string, hi: string) => (lang === "en" ? en : hi);

  const toggles: { k: "children" | "olderAdult" | "pregnant" | "condition"; en: string; hi: string }[] = [
    { k: "children", en: "Children at home", hi: "घर में बच्चे" },
    { k: "olderAdult", en: "Older adults (60+)", hi: "बुज़ुर्ग (60+)" },
    { k: "pregnant", en: "Someone is pregnant", hi: "कोई गर्भवती है" },
    { k: "condition", en: "Asthma, COPD or a heart condition", hi: "दमा, COPD या हृदय रोग" },
  ];

  const selects = [
    {
      k: "home" as const,
      label: L("Home type", "घर का प्रकार"),
      opts: [
        ["apartment", L("Apartment", "फ़्लैट")],
        ["house", L("Independent house", "स्वतंत्र मकान")],
        ["shared", L("Shared or single room", "साझा या एक कमरा")],
      ],
    },
    {
      k: "commute" as const,
      label: L("Main way of travelling", "मुख्य यात्रा साधन"),
      opts: [
        ["metro", L("Metro", "मेट्रो")],
        ["bus", L("Bus", "बस")],
        ["car", L("Car", "कार")],
        ["two_wheeler", L("Two-wheeler", "दोपहिया")],
        ["auto", L("Auto-rickshaw", "ऑटो")],
        ["walk_cycle", L("Walk or cycle", "पैदल या साइकिल")],
        ["home", L("Mostly at home", "ज़्यादातर घर पर")],
      ],
    },
    {
      k: "fuel" as const,
      label: L("Cooking fuel", "खाना बनाने का ईंधन"),
      opts: [
        ["lpg", "LPG / PNG"],
        ["induction", L("Induction / electric", "इंडक्शन / बिजली")],
        ["wood", L("Wood, dung or coal", "लकड़ी, उपले या कोयला")],
        ["kerosene", L("Kerosene", "मिट्टी का तेल")],
      ],
    },
    {
      k: "budget" as const,
      label: L("Budget for air fixes", "हवा के उपायों का बजट"),
      opts: [
        ["tight", L("Tight – free and under ₹500", "कम – मुफ़्त और ₹500 तक")],
        ["some", L("Some – up to ₹3,000", "कुछ – ₹3,000 तक")],
        ["comfortable", L("Comfortable", "आरामदायक")],
      ],
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
      <div className="rounded-xl border bg-card p-5">
        <h1 className="text-xl font-bold">{L("Your household", "आपका घर")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {L(
            "Share only what you're comfortable with. Each detail makes the daily plan more useful.",
            "केवल उतना साझा करें जितना आप सहज हों। हर जानकारी योजना को और उपयोगी बनाती है।",
          )}
        </p>
        <div className="mt-5 space-y-3">
          {toggles.map((x) => (
            <div key={x.k} className="flex items-center justify-between gap-3">
              <Label htmlFor={`sw-${x.k}`} className="text-sm font-normal">
                {lang === "en" ? x.en : x.hi}
              </Label>
              <Switch
                id={`sw-${x.k}`}
                checked={profile[x.k]}
                onCheckedChange={(v) => update({ [x.k]: v } as Partial<Profile>)}
                data-testid={`switch-${x.k}`}
              />
            </div>
          ))}
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {selects.map((s) => (
            <div key={s.k}>
              <Label htmlFor={`sel-${s.k}`} className="text-sm">
                {s.label}
              </Label>
              <Select value={profile[s.k]} onValueChange={(v) => update({ [s.k]: v } as Partial<Profile>)}>
                <SelectTrigger id={`sel-${s.k}`} className="mt-1.5" data-testid={`select-${s.k}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {s.opts.map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-base font-semibold">{L("What's stored", "क्या संग्रहीत है")}</h2>
          <ul className="mt-2 space-y-1.5 text-sm text-foreground/80">
            <li>
              {L("Location", "स्थान")}:{" "}
              {place ? (
                <>
                  {place.name}{" "}
                  {place.approx === "gps" || place.region === "approx. 1 km"
                    ? L("(rounded to ~1 km)", "(~1 किमी तक)")
                    : place.approx === "ip"
                      ? L("(approximate from network)", "(नेटवर्क से अनुमानित)")
                      : ""}
                </>
              ) : locating ? (
                L("Detecting…", "खोजा जा रहा है…")
              ) : (
                L("Not set", "सेट नहीं है")
              )}
            </li>
            <li>
              {L("Household profile", "घर की प्रोफ़ाइल")}: {L("8 answers", "8 उत्तर")}
            </li>
            <li>
              {L("Logged actions", "दर्ज कदम")}: {stored.actions}
            </li>
            <li>
              {L("Chat messages", "चैट संदेश")}: {stored.messages}
            </li>
            <li>
              {L("Groups joined", "जुड़े समूह")}: {stored.groups}
            </li>
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            {L(
              "Everything stays in this browser tab and is gone when you close it. Nothing is sent to a server except your approximate location to fetch air data.",
              "सब कुछ इसी ब्राउज़र टैब में रहता है और बंद करने पर मिट जाता है। वायु डेटा के लिए अनुमानित स्थान के अलावा कुछ भी सर्वर पर नहीं जाता।",
            )}
          </p>
          {!confirm ? (
            <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => setConfirm(true)} data-testid="button-delete-data">
              <Trash2 className="h-4 w-4" aria-hidden />
              {L("Delete my data", "मेरा डेटा मिटाएँ")}
            </Button>
          ) : (
            <div className="mt-3 rounded-lg border border-destructive/40 p-3" role="alertdialog" aria-label={L("Confirm data deletion", "डेटा मिटाने की पुष्टि")}>
              <p className="text-sm">{L("Clear your profile, actions, chat and groups?", "प्रोफ़ाइल, कदम, चैट और समूह मिटाएँ?")}</p>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    clearAll();
                    setConfirm(false);
                  }}
                  data-testid="button-confirm-delete"
                >
                  {L("Delete", "मिटाएँ")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirm(false)} data-testid="button-cancel-delete">
                  {L("Cancel", "रद्द करें")}
                </Button>
              </div>
            </div>
          )}
        </div>
        <div className="rounded-xl border bg-card p-5 text-sm">
          <h2 className="text-base font-semibold">{L("How we keep advice safe", "सलाह को सुरक्षित कैसे रखते हैं")}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-foreground/80">
            <li>{L("General wellbeing guidance only – no diagnosis or medicines.", "केवल सामान्य मार्गदर्शन – निदान या दवा नहीं।")}</li>
            <li>{L("Breathing emergencies get a fixed response pointing to 112.", "साँस की आपात स्थिति में 112 की ओर निश्चित उत्तर।")}</li>
            <li>{L("More cautious advice for children, older adults, pregnancy and health conditions.", "बच्चों, बुज़ुर्गों, गर्भावस्था और रोगों के लिए अधिक सावधान सलाह।")}</li>
            <li>{L("Low-cost options first; no brands or paid placements.", "सस्ते विकल्प पहले; कोई ब्रांड या विज्ञापन नहीं।")}</li>
          </ul>
        </div>
        <div className="rounded-xl border bg-card p-5 text-sm" data-testid="card-privacy-disclosure">
          <h2 className="text-base font-semibold">{L("External services & retention", "बाहरी सेवाएँ और डेटा गोपनीयता")}</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-muted-foreground">
            <li>
              {L(
                "Air & weather: Open-Meteo (CAMS model) receives only rounded ~1 km coordinates.",
                "वायु और मौसम: Open-Meteo (CAMS मॉडल) को केवल ~1 किमी तक गोल निर्देशांक भेजे जाते हैं।",
              )}
            </li>
            <li>
              {L(
                "Maps: Google Maps Platform loads only when the map view is active.",
                "मानचित्र: Google Maps Platform केवल मानचित्र खुलने पर लोड होता है।",
              )}
            </li>
            <li>
              {L(
                "AI assistant: prompts go through our server proxy; server logs record only status codes and latency, never your profile or prompt text.",
                "AI सहायक: प्रश्न हमारे सर्वर प्रॉक्सी से जाते हैं; सर्वर लॉग में प्रोफ़ाइल या प्रश्न कभी दर्ज नहीं होते।",
              )}
            </li>
            <li>
              {L(
                "Zero third-party analytics or ad trackers receive your household attributes.",
                "कोई भी तृतीय-पक्ष एनालिटिक्स या विज्ञापन ट्रैकर आपका डेटा प्राप्त नहीं करता।",
              )}
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
