import { AirReport, CATEGORIES, CategoryKey, fmtHour } from "./air";
import { Lang, T, TIPS, Tip, tr } from "./knowledge";

export type Profile = {
  children: boolean;
  olderAdult: boolean;
  pregnant: boolean;
  condition: boolean; // asthma, COPD, heart condition
  home: "apartment" | "house" | "shared";
  commute: "metro" | "bus" | "car" | "two_wheeler" | "auto" | "walk_cycle" | "home";
  fuel: "lpg" | "induction" | "wood" | "kerosene";
  budget: "tight" | "some" | "comfortable";
};

export const DEFAULT_PROFILE: Profile = {
  children: false,
  olderAdult: false,
  pregnant: false,
  condition: false,
  home: "apartment",
  commute: "metro",
  fuel: "lpg",
  budget: "tight",
};

export const isSensitive = (p: Profile) => p.children || p.olderAdult || p.pregnant || p.condition;

const SEV: Record<CategoryKey, number> = { good: 0, satisfactory: 1, moderate: 2, poor: 3, very_poor: 4, severe: 5 };

export type PlanItem = {
  id: string;
  icon: "sun" | "school" | "route" | "window" | "flame" | "heart" | "home" | "leaf";
  title: string;
  detail: string;
  exposure?: string;
  emissions?: string;
  tipId?: string;
};

const budgetMaxCost = (b: Profile["budget"]) => (b === "tight" ? 1 : b === "some" ? 2 : 3);

export function rankedTips(kind: Tip["kind"][] | null, p: Profile): Tip[] {
  const max = budgetMaxCost(p.budget);
  return TIPS.filter((t) => (!kind || kind.includes(t.kind)))
    .sort((a, b) => a.cost - b.cost || b.effect - a.effect)
    .map((t) => ({ ...t, _ok: t.cost <= max }))
    .sort((a: any, b: any) => Number(b._ok) - Number(a._ok));
}

export function buildPlan(r: AirReport, p: Profile, l: Lang): { headline: string; summary: string; items: PlanItem[] } {
  const sev = SEV[r.category];
  const cat = tr(CATEGORIES[r.category], l);
  const sensitive = isSensitive(p);
  const best = r.bestWindow;
  const worst = r.worstWindow;
  const bestTxt = best ? `${fmtHour(best.start)}–${fmtHour(best.end)}` : "";
  const worstTxt = worst ? `${fmtHour(worst.start)}–${fmtHour(worst.end)}` : "";
  const items: PlanItem[] = [];
  const L = (en: string, hi: string) => (l === "en" ? en : hi);

  const headline =
    sev >= 4
      ? L(`Air is ${cat.toLowerCase()} today. Keep exposure low.`, `आज हवा ${cat} है। बाहर कम से कम रहें।`)
      : sev === 3
        ? L("Air is poor today. Limit long outdoor time.", "आज हवा खराब है। लंबे समय तक बाहर रहने से बचें।")
        : sev === 2
          ? L("Air is moderate. Sensitive members should take care.", "हवा मध्यम है। संवेदनशील सदस्य सावधानी रखें।")
          : L("Air is fairly clean right now.", "अभी हवा अपेक्षाकृत साफ़ है।");

  const summary = L(
    `Estimated India AQI ${r.aqi} (${cat}), led by ${r.dominant}. ${best ? `Cleanest window today: ${bestTxt}.` : ""} ${worst && worst.aqi > r.aqi ? `Expect a peak around ${worstTxt}.` : ""}`,
    `अनुमानित भारत AQI ${r.aqi} (${cat}), मुख्य कारण ${r.dominant}। ${best ? `आज का सबसे साफ़ समय: ${bestTxt}।` : ""} ${worst && worst.aqi > r.aqi ? `${worstTxt} के आसपास चरम की संभावना।` : ""}`,
  ).replace(/\s+/g, " ").trim();

  // Outdoor time
  items.push({
    id: "outdoor",
    icon: "sun",
    title: sev >= 3 ? L("Move exercise indoors", "व्यायाम घर के अंदर करें") : L("Outdoor time is fine, in moderation", "बाहर समय बिताना ठीक है, संयम से"),
    detail:
      sev >= 4
        ? L(`Skip outdoor runs and long walks. If you must go out, aim for ${bestTxt || "the afternoon"} and keep it short.`, `बाहर दौड़ना और लंबी सैर छोड़ें। ज़रूरी हो तो ${bestTxt || "दोपहर"} में जाएँ और जल्दी लौटें।`)
        : sev === 3
          ? L(`Keep outdoor activity light. ${best ? `${bestTxt} is the best slot.` : ""}`, `बाहर हल्की गतिविधि रखें। ${best ? `${bestTxt} सबसे अच्छा समय है।` : ""}`)
          : L(`Good day for a walk${best ? `, ideally ${bestTxt}` : ""}. Avoid busy roads.`, `सैर के लिए ठीक दिन${best ? `, ${bestTxt} बेहतर` : ""}। व्यस्त सड़कों से बचें।`),
    exposure: sev >= 3 ? L("Indoor exercise avoids most of the extra dose from heavy breathing", "अंदर व्यायाम से भारी साँसों से होने वाला अतिरिक्त प्रदूषण बचता है") : undefined,
  });

  if (p.children) {
    items.push({
      id: "school",
      icon: "school",
      title: sev >= 3 ? L("School run with a mask; play indoors", "स्कूल जाते समय मास्क; खेल घर के अंदर") : L("Normal school day", "सामान्य स्कूल दिवस"),
      detail:
        sev >= 3
          ? L("Use a well-fitted child-size mask for the trip, keep the car on recirculate, and plan indoor play after school. Check the school's notice for closures.", "रास्ते के लिए बच्चों के आकार का अच्छी तरह फ़िट मास्क, कार में AC रिसर्कुलेट, और स्कूल के बाद घर में खेल। बंद होने की सूचना के लिए स्कूल का नोटिस देखें।")
          : L("Outdoor play is fine. Avoid waiting near idling vehicles at the school gate.", "बाहर खेलना ठीक है। स्कूल गेट पर चालू गाड़ियों के पास इंतज़ार न करें।"),
      exposure: sev >= 3 ? L("Mask: up to 80–95% less inhaled PM2.5 if well fitted", "मास्क: अच्छी फ़िटिंग पर 80–95% तक कम PM2.5") : undefined,
      tipId: sev >= 3 ? "mask" : undefined,
    });
  }

  // Commute
  const commute: Record<Profile["commute"], { t: T; d: T; tip?: string }> = {
    metro: { t: { en: "Metro commute – mask on the platform", hi: "मेट्रो यात्रा – प्लेटफ़ॉर्म पर मास्क" }, d: { en: "Enclosed coaches keep exposure lower. The walk to the station and the platform are where to wear a mask.", hi: "बंद डिब्बों में प्रदूषण कम है। स्टेशन तक का रास्ता और प्लेटफ़ॉर्म पर मास्क पहनें।" }, tip: "mask" },
    bus: { t: { en: "Bus commute – mask while waiting", hi: "बस यात्रा – इंतज़ार में मास्क" }, d: { en: "Bus stops beside traffic are exposure hot spots. Stand back from the kerb and wear a mask.", hi: "ट्रैफ़िक के पास बस स्टॉप पर प्रदूषण ज़्यादा है। सड़क से दूर खड़े हों और मास्क पहनें।" }, tip: "mask" },
    car: { t: { en: "Driving – recirculate and share the ride", hi: "कार – रिसर्कुलेट और सवारी साझा करें" }, d: { en: "Keep windows up with air on recirculate. Carpooling or switching one trip to metro today cuts your share of emissions.", hi: "खिड़कियाँ बंद और AC रिसर्कुलेट रखें। कारपूल या एक यात्रा मेट्रो से करने से आपका उत्सर्जन घटता है।" }, tip: "carpool" },
    two_wheeler: { t: { en: "Two-wheeler – mask and quieter roads", hi: "दोपहिया – मास्क और शांत रास्ते" }, d: { en: "Riders breathe traffic exhaust directly. Wear an N95 under the helmet and pick a less congested route if possible.", hi: "सवार सीधे धुआँ साँस में लेते हैं। हेलमेट के नीचे N95 पहनें और कम भीड़ वाला रास्ता चुनें।" }, tip: "mask" },
    auto: { t: { en: "Auto-rickshaw – mask and timing", hi: "ऑटो – मास्क और समय" }, d: { en: "Open autos sit in exhaust. Wear a mask and, if your hours are flexible, travel outside the peak.", hi: "खुले ऑटो धुएँ के बीच रहते हैं। मास्क पहनें और संभव हो तो चरम समय से बाहर यात्रा करें।" }, tip: "mask" },
    walk_cycle: { t: { en: "Walking or cycling – choose side streets", hi: "पैदल/साइकिल – अंदर की गलियाँ चुनें" }, d: { en: "Pick quieter streets and go gently; heavy breathing increases your dose.", hi: "शांत गलियाँ चुनें और धीरे चलें; तेज़ साँसें प्रदूषण की मात्रा बढ़ाती हैं।" }, tip: "quiet-route" },
    home: { t: { en: "Working from home – a clean-room day", hi: "घर से काम – साफ़ कमरे का दिन" }, d: { en: "Set up in your cleanest room with the door shut and run any filter you have.", hi: "सबसे साफ़ कमरे में दरवाज़ा बंद करके काम करें और जो भी फ़िल्टर है चलाएँ।" }, tip: "clean-room" },
  };
  const c = commute[p.commute];
  if (sev >= 2 || p.commute === "car") {
    const tip = c.tip ? TIPS.find((t) => t.id === c.tip) : undefined;
    items.push({ id: "commute", icon: "route", title: tr(c.t, l), detail: tr(c.d, l), exposure: tip?.exposure, emissions: tip?.emissions, tipId: c.tip });
  }

  // Ventilation
  items.push({
    id: "ventilate",
    icon: "window",
    title: best ? L(`Air out the house at ${bestTxt}`, `${bestTxt} पर घर में हवा आने दें`) : L("Ventilate briefly when readings dip", "प्रदूषण कम होने पर थोड़ी देर हवा आने दें"),
    detail: L(
      `Keep windows closed during the morning and evening peaks${worst ? ` (worst around ${worstTxt})` : ""}. Open for 10–15 minutes in the cleanest window, then close again.`,
      `सुबह-शाम के चरम समय पर खिड़कियाँ बंद रखें${worst ? ` (सबसे खराब ${worstTxt} के आसपास)` : ""}। सबसे साफ़ समय पर 10–15 मिनट खोलें, फिर बंद करें।`,
    ),
    exposure: "10–30% lower indoor PM2.5",
    tipId: "ventilate-window",
  });

  // Cooking
  if (p.fuel === "wood" || p.fuel === "kerosene") {
    const t = TIPS.find((x) => x.id === "clean-fuel")!;
    items.push({ id: "cooking", icon: "flame", title: tr(t.title, l), detail: tr(t.body, l), exposure: t.exposure, emissions: t.emissions, tipId: t.id });
  } else {
    const t = TIPS.find((x) => x.id === "exhaust-cooking")!;
    items.push({ id: "cooking", icon: "flame", title: tr(t.title, l), detail: tr(t.body, l), exposure: t.exposure, tipId: t.id });
  }

  // Sensitive caution
  if (sensitive && sev >= 2) {
    const who = [
      p.children && L("children", "बच्चों"),
      p.olderAdult && L("older adults", "बुज़ुर्गों"),
      p.pregnant && L("pregnancy", "गर्भावस्था"),
      p.condition && L("asthma or heart conditions", "दमा या हृदय रोग"),
    ].filter(Boolean).join(", ");
    items.push({
      id: "care",
      icon: "heart",
      title: L("Extra care for sensitive members", "संवेदनशील सदस्यों के लिए अतिरिक्त सावधानी"),
      detail: L(
        `Because your household includes ${who}, keep them in the clean room during peaks and follow any action plan from their doctor. Contact a doctor if symptoms such as coughing, wheezing or chest tightness get worse.`,
        `आपके घर में ${who} के कारण, चरम समय पर उन्हें साफ़ कमरे में रखें और डॉक्टर की कार्य योजना का पालन करें। खाँसी, साँस में घरघराहट या सीने में जकड़न बढ़े तो डॉक्टर से संपर्क करें।`,
      ),
    });
  }

  // One budget-fit indoor tip
  const indoor = rankedTips(["indoor"], p).filter((t) => !["ventilate-window"].includes(t.id));
  const pick = sev >= 3 ? indoor.find((t) => t.effect >= 2 && t.cost <= budgetMaxCost(p.budget)) ?? indoor[0] : indoor[0];
  items.push({ id: "indoor", icon: "home", title: tr(pick.title, l), detail: tr(pick.body, l), exposure: pick.exposure, tipId: pick.id });

  // One action for the neighbourhood
  const civic = TIPS.find((t) => t.id === (p.commute === "car" ? "no-burning" : "no-burning"))!;
  items.push({ id: "civic", icon: "leaf", title: tr(civic.title, l), detail: tr(civic.body, l), emissions: civic.emissions, tipId: civic.id });

  return { headline, summary, items };
}

// ---------------------------------------------------------------------------
// Conversational assistant – grounded in the knowledge library with safety
// checks. Sensitive health situations get a fixed, pre-approved response.
// ---------------------------------------------------------------------------

export type ChatMsg = { role: "user" | "assistant"; text: string; kind?: "safety" | "normal" | "unknown"; tips?: string[] };

const has = (s: string, words: string[]) => words.some((w) => s.includes(w));

const EMERGENCY = [
  "can't breathe", "cant breathe", "cannot breathe", "difficulty breathing", "trouble breathing", "struggling to breathe", "breathless", "short of breath", "shortness of breath",
  "chest pain", "chest tight", "lips blue", "blue lips", "fainted", "unconscious", "collapsed",
  "साँस नहीं", "सांस नहीं", "साँस लेने में तकलीफ", "सांस लेने में तकलीफ", "सीने में दर्द", "बेहोश",
];
const MEDICAL = ["diagnos", "prescri", "dose", "dosage", "which medicine", "what medicine", "inhaler dose", "antibiotic", "steroid", "दवा", "दवाई", "इलाज"];

export function safetyCheck(text: string, l: Lang): ChatMsg | null {
  const s = text.toLowerCase();
  if (has(s, EMERGENCY)) {
    return {
      role: "assistant",
      kind: "safety",
      text:
        l === "en"
          ? "This sounds like it could be serious. If someone is struggling to breathe, has chest pain, blue lips or has collapsed, call 112 (or 108 for an ambulance) now. If they have a reliever inhaler and an action plan from their doctor, follow it. Move them to the cleanest indoor air you have, keep them sitting upright and calm. I can't assess symptoms, so please get medical help right away."
          : "यह गंभीर हो सकता है। अगर किसी को साँस लेने में कठिनाई, सीने में दर्द, होंठ नीले हों या वह बेहोश हो, तो अभी 112 (या एम्बुलेंस के लिए 108) पर कॉल करें। अगर डॉक्टर का दिया इनहेलर और कार्य योजना है, तो उसका पालन करें। उन्हें सबसे साफ़ हवा वाले कमरे में सीधा बैठाएँ और शांत रखें। मैं लक्षणों का आकलन नहीं कर सकता, कृपया तुरंत चिकित्सा सहायता लें।",
    };
  }
  if (has(s, MEDICAL)) {
    return {
      role: "assistant",
      kind: "safety",
      text:
        l === "en"
          ? "I can only share general wellbeing guidance, not diagnosis, medicines or doses. Please ask your doctor or pharmacist about treatment. I'm happy to help with ways to lower exposure at home and outdoors."
          : "मैं केवल सामान्य स्वास्थ्य संबंधी मार्गदर्शन दे सकता हूँ, निदान, दवा या खुराक नहीं। इलाज के बारे में अपने डॉक्टर या फ़ार्मासिस्ट से पूछें। घर और बाहर प्रदूषण कम करने के तरीकों में मैं मदद कर सकता हूँ।",
    };
  }
  return null;
}

export type ProfilePatch = Partial<Profile>;

export function extractProfile(text: string): ProfilePatch {
  const s = text.toLowerCase();
  const patch: ProfilePatch = {};
  if (has(s, ["my child", "my kid", "my son", "my daughter", "children", "kids", "बच्चा", "बच्चे", "बेटा", "बेटी"])) patch.children = true;
  if (has(s, ["asthma", "copd", "heart condition", "heart problem", "bronchitis", "दमा", "अस्थमा", "हृदय"])) patch.condition = true;
  if (has(s, ["pregnant", "expecting", "गर्भवती"])) patch.pregnant = true;
  if (has(s, ["grandparent", "grandmother", "grandfather", "elderly", "my mother", "my father", "older parent", "बुज़ुर्ग", "दादी", "दादा", "नानी", "नाना"])) patch.olderAdult = true;
  if (has(s, ["wood", "chulha", "dung", "uple", "लकड़ी", "चूल्हा", "उपले"])) patch.fuel = "wood";
  if (has(s, ["kerosene", "मिट्टी का तेल"])) patch.fuel = "kerosene";
  if (has(s, ["scooter", "bike to work", "motorbike", "two-wheeler", "two wheeler", "स्कूटर"])) patch.commute = "two_wheeler";
  if (has(s, ["i drive", "by car", "my car", "कार से"])) patch.commute = "car";
  if (has(s, ["by metro", "take the metro", "मेट्रो से"])) patch.commute = "metro";
  return patch;
}

type Intent = { id: string; words: string[]; answer: (r: AirReport | null, p: Profile, l: Lang) => { text: string; tips?: string[] } };

const cat = (r: AirReport | null, l: Lang) => (r ? tr(CATEGORIES[r.category], l) : l === "en" ? "unknown" : "अज्ञात");

const INTENTS: Intent[] = [
  {
    id: "school",
    words: ["school", "send my child", "send my kid", "स्कूल"],
    answer: (r, p, l) => {
      const sev = r ? SEV[r.category] : 3;
      const extra = p.condition
        ? l === "en" ? " Because a child in your home has asthma or a similar condition, be extra careful: keep the reliever handy and follow their doctor's action plan." : " क्योंकि घर में बच्चे को दमा या ऐसी कोई समस्या है, अतिरिक्त सावधानी रखें: इनहेलर पास रखें और डॉक्टर की कार्य योजना का पालन करें।"
        : "";
      if (l === "en")
        return {
          text:
            (sev >= 4
              ? `Air is ${cat(r, l).toLowerCase()} right now. If school is open, it's generally reasonable to go, but use a well-fitted mask for the trip, avoid waiting near idling vehicles, and ask whether outdoor assembly and sport are moved indoors. Plan indoor play afterwards.`
              : sev === 3
                ? "Air is poor. School is generally fine; a mask for the journey and indoor play afterwards will cut most of the extra exposure."
                : "Air is not too bad right now – a normal school day is fine. Avoid waiting near idling vehicles at the gate.") + extra,
          tips: ["mask", "carpool"],
        };
      return {
        text:
          (sev >= 4
            ? `अभी हवा ${cat(r, l)} है। अगर स्कूल खुला है तो जाना आम तौर पर ठीक है, पर रास्ते में अच्छी तरह फ़िट मास्क पहनें, चालू गाड़ियों के पास न रुकें, और पूछें कि सुबह की प्रार्थना और खेल अंदर हो रहे हैं या नहीं।`
            : sev === 3
              ? "हवा खराब है। स्कूल जाना आम तौर पर ठीक है; रास्ते में मास्क और बाद में घर के अंदर खेल से ज़्यादातर अतिरिक्त प्रदूषण बचता है।"
              : "अभी हवा बहुत खराब नहीं है – सामान्य स्कूल दिवस ठीक है।") + extra,
        tips: ["mask", "carpool"],
      };
    },
  },
  {
    id: "window",
    words: ["window", "ventilat", "fresh air", "open the door", "खिड़की", "हवा आने"],
    answer: (r, _p, l) => {
      const b = r?.bestWindow ? `${fmtHour(r.bestWindow.start)}–${fmtHour(r.bestWindow.end)}` : null;
      return {
        text:
          l === "en"
            ? `Keep windows closed during the morning and evening peaks. ${b ? `Today the cleanest window looks like ${b} – open up for 10–15 minutes then, then close again.` : "Open briefly when the reading is lowest, usually early afternoon."} Always keep some ventilation where gas or other fuel is burning.`
            : `सुबह-शाम के चरम समय पर खिड़कियाँ बंद रखें। ${b ? `आज सबसे साफ़ समय ${b} लगता है – तब 10–15 मिनट के लिए खोलें, फिर बंद कर दें।` : "जब प्रदूषण सबसे कम हो, आम तौर पर दोपहर में, थोड़ी देर खोलें।"} जहाँ गैस या ईंधन जल रहा हो वहाँ हमेशा कुछ हवा आने दें।`,
        tips: ["ventilate-window", "seal-gaps"],
      };
    },
  },
  {
    id: "mask",
    words: ["mask", "n95", "ffp2", "मास्क"],
    answer: (_r, _p, l) => ({
      text:
        l === "en"
          ? "A well-fitted N95 or FFP2 is what works against smog. Fit matters more than brand: pinch the nose clip and make sure there are no gaps at the cheeks. Cloth and surgical masks do very little for fine particles. They aren't suitable for very young children, and people with heart or lung conditions should check with their doctor first."
          : "धुंध के लिए अच्छी तरह फ़िट N95 या FFP2 ही काम करता है। ब्रांड से ज़्यादा फ़िटिंग ज़रूरी है: नाक की क्लिप दबाएँ और गालों पर गैप न हो। कपड़े और सर्जिकल मास्क महीन कणों पर बहुत कम असर करते हैं। बहुत छोटे बच्चों के लिए उपयुक्त नहीं, और हृदय/फेफड़ों की बीमारी वाले पहले डॉक्टर से पूछें।",
      tips: ["mask"],
    }),
  },
  {
    id: "purifier",
    words: ["purifier", "filter", "hepa", "diy", "afford", "cheap", "budget", "प्यूरीफ़ायर", "प्यूरीफायर", "फ़िल्टर", "सस्ता"],
    answer: (_r, p, l) => ({
      text:
        l === "en"
          ? `Start with the free steps: a single clean room, closed windows during peaks, no incense or coils, and wet mopping. ${p.budget === "tight" ? "If you can spend a little, a DIY filter fan – a MERV-13 filter taped to a box fan – can cut PM2.5 in one room by roughly 40–70%." : "A DIY filter fan or a correctly sized HEPA purifier in the room where you sleep gives the biggest gain."} I never recommend specific brands.`
          : `पहले मुफ़्त कदम: एक साफ़ कमरा, चरम समय पर खिड़कियाँ बंद, अगरबत्ती/कॉइल नहीं, और गीला पोछा। ${p.budget === "tight" ? "थोड़ा खर्च कर सकें तो घर का बना फ़िल्टर-पंखा (बॉक्स फ़ैन पर MERV-13 फ़िल्टर) एक कमरे में PM2.5 लगभग 40–70% तक कम कर सकता है।" : "सोने वाले कमरे में फ़िल्टर-पंखा या सही आकार का HEPA प्यूरीफ़ायर सबसे ज़्यादा फ़ायदा देता है।"} मैं किसी ब्रांड की सलाह नहीं देता।`,
      tips: ["clean-room", "diy-filter", "purifier"],
    }),
  },
  {
    id: "exercise",
    words: ["run", "jog", "walk", "exercise", "workout", "cycle", "cycling", "yoga", "park", "play outside", "दौड़", "सैर", "व्यायाम", "टहल"],
    answer: (r, p, l) => {
      const sev = r ? SEV[r.category] : 3;
      const b = r?.bestWindow ? `${fmtHour(r.bestWindow.start)}–${fmtHour(r.bestWindow.end)}` : null;
      if (l === "en")
        return {
          text:
            sev >= 3
              ? `With air ${cat(r, l).toLowerCase()}, move exercise indoors today – heavy breathing outdoors increases the dose a lot. Indoor yoga, stretching or a home workout with windows shut is a better choice.${isSensitive(p) ? " This matters even more for the sensitive members of your household." : ""}`
              : `Outdoor activity is reasonable today${b ? `, ideally around ${b}` : ""}. Keep away from busy roads.`,
          tips: ["quiet-route"],
        };
      return {
        text:
          sev >= 3
            ? `हवा ${cat(r, l)} होने पर आज व्यायाम घर के अंदर करें – बाहर तेज़ साँसों से प्रदूषण बहुत ज़्यादा जाता है। खिड़कियाँ बंद करके योग या स्ट्रेचिंग बेहतर है।`
            : `आज बाहर गतिविधि ठीक है${b ? `, ${b} के आसपास बेहतर` : ""}। व्यस्त सड़कों से दूर रहें।`,
        tips: ["quiet-route"],
      };
    },
  },
  {
    id: "cooking",
    words: ["cook", "kitchen", "chulha", "lpg", "stove", "fry", "tadka", "रसोई", "खाना बना", "चूल्हा"],
    answer: (_r, p, l) => ({
      text:
        l === "en"
          ? `${p.fuel === "wood" || p.fuel === "kerosene" ? "Solid fuels and kerosene are a big indoor smoke source. If you can, move to LPG (check PM Ujjwala Yojana support) or an induction plate for some dishes. " : ""}Switch the exhaust or chimney on before you start, use back burners and lids, and keep the kitchen door shut so smoke doesn't spread to the rest of the home.`
          : `${p.fuel === "wood" || p.fuel === "kerosene" ? "लकड़ी/उपले और मिट्टी का तेल घर में धुएँ का बड़ा स्रोत हैं। संभव हो तो LPG (PM उज्ज्वला योजना देखें) या कुछ व्यंजनों के लिए इंडक्शन अपनाएँ। " : ""}पकाने से पहले एग्ज़ॉस्ट या चिमनी चालू करें, पीछे के बर्नर और ढक्कन इस्तेमाल करें, और रसोई का दरवाज़ा बंद रखें।`,
      tips: ["exhaust-cooking", "clean-fuel"],
    }),
  },
  {
    id: "commute",
    words: ["commute", "travel", "office", "work", "metro", " bus", " car ", "drive", "auto", "scooter", "traffic", "route", "दफ़्तर", "ऑफिस", "यात्रा", "मेट्रो", "बस"],
    answer: (_r, p, l) => ({
      text:
        l === "en"
          ? `For lower exposure and fewer emissions: metro or an enclosed bus usually beats open transport${p.commute === "car" ? "; if you drive, keep windows up on recirculate and try sharing the ride – carpooling with two others roughly halves per-person exhaust" : ""}. Wear a mask on platforms and the walk, use quieter side streets, and shift trips away from 8–10 am and 6–9 pm where you can.`
          : `कम प्रदूषण और कम उत्सर्जन के लिए: मेट्रो या बंद बस अक्सर खुली सवारी से बेहतर है${p.commute === "car" ? "; कार चलाते हैं तो खिड़कियाँ बंद और AC रिसर्कुलेट रखें, और सवारी साझा करें" : ""}। प्लेटफ़ॉर्म और पैदल रास्ते पर मास्क पहनें, शांत गलियाँ चुनें, और संभव हो तो सुबह 8–10 व शाम 6–9 से बचें।`,
      tips: ["metro", "carpool", "quiet-route"],
    }),
  },
  {
    id: "why",
    words: ["why", "cause", "stubble", "crop", "parali", "where does", "smog come", "पराली", "क्यों", "कारण"],
    answer: (_r, _p, l) => ({
      text:
        l === "en"
          ? "Winter smog comes from a mix of vehicle exhaust, construction and road dust, burning of waste and crop residue, cooking and heating fuels, and industry. Cold, still air traps it near the ground, so it builds up over days. The mix varies by city and week, and the exact share of each source is still debated."
          : "सर्दियों की धुंध गाड़ियों के धुएँ, निर्माण और सड़क की धूल, कचरे और पराली जलाने, खाना बनाने व गर्माहट के ईंधन, और उद्योगों के मिश्रण से बनती है। ठंडी, ठहरी हवा इसे ज़मीन के पास रोक लेती है। हर स्रोत का सटीक हिस्सा शहर और समय के साथ बदलता है।",
      tips: ["no-burning"],
    }),
  },
  {
    id: "plants",
    words: ["plant", "money plant", "snake plant", "पौधे", "पौधा"],
    answer: (_r, _p, l) => ({
      text:
        l === "en"
          ? "Honest answer: houseplants are lovely but they don't measurably clean smoggy air in a real home – you'd need hundreds per room. Filters, closed windows during peaks and removing indoor smoke sources make a far bigger difference."
          : "सच कहें तो घर के पौधे अच्छे हैं, पर असली घर में धुंध भरी हवा को मापने लायक साफ़ नहीं करते – एक कमरे के लिए सैकड़ों पौधे चाहिए। फ़िल्टर, चरम समय पर बंद खिड़कियाँ और अंदरूनी धुआँ हटाना कहीं ज़्यादा असरदार है।",
      tips: ["diy-filter", "no-smoke-indoors"],
    }),
  },
  {
    id: "incense",
    words: ["incense", "agarbatti", "coil", "mosquito", "diya", "candle", "dhoop", "अगरबत्ती", "धूप", "कॉइल", "दीया"],
    answer: (_r, _p, l) => ({
      text:
        l === "en"
          ? "Incense, dhoop, mosquito coils and candles release fine particles right where you breathe – sometimes several times the outdoor level for a short while. On smog days, try a plug-in repellent or a net, and light diyas outdoors or briefly near an open window."
          : "अगरबत्ती, धूप, मच्छर कॉइल और मोमबत्ती ठीक वहीं महीन कण छोड़ते हैं जहाँ आप साँस लेते हैं – थोड़ी देर के लिए बाहर से कई गुना। धुंध के दिनों में प्लग-इन रिपेलेंट या मच्छरदानी अपनाएँ।",
      tips: ["no-smoke-indoors"],
    }),
  },
  {
    id: "heating",
    words: ["heater", "heating", "angithi", "cold", "warm", "blower", "अंगीठी", "हीटर", "ठंड"],
    answer: (_r, _p, l) => ({
      text:
        l === "en"
          ? "Please don't burn coal or wood (an angithi) in a closed room – besides smoke, it produces carbon monoxide, which can be fatal while sleeping. Layers, blankets and a hot-water bottle are safest; an electric heater is the cleaner option if affordable."
          : "कृपया बंद कमरे में अंगीठी (कोयला या लकड़ी) न जलाएँ – धुएँ के अलावा इससे कार्बन मोनोऑक्साइड बनती है जो सोते समय जानलेवा हो सकती है। कपड़ों की परतें, कंबल और गर्म पानी की बोतल सबसे सुरक्षित हैं।",
      tips: ["heating"],
    }),
  },
  {
    id: "pregnant",
    words: ["pregnan", "baby", "newborn", "infant", "गर्भ", "शिशु"],
    answer: (_r, _p, l) => ({
      text:
        l === "en"
          ? "During pregnancy and with infants, it's worth being more careful: spend peak hours in your cleanest room with a filter if possible, keep indoor smoke sources out, and limit time beside traffic. Masks aren't suitable for babies, so protect their indoor air instead. Please discuss any concerns with your doctor."
          : "गर्भावस्था और छोटे शिशुओं के साथ अधिक सावधानी ज़रूरी है: चरम समय में सबसे साफ़ कमरे में फ़िल्टर के साथ रहें, घर में धुआँ न होने दें, और ट्रैफ़िक के पास कम समय बिताएँ। शिशुओं के लिए मास्क उपयुक्त नहीं, उनके घर की हवा को सुरक्षित रखें। चिंता हो तो डॉक्टर से बात करें।",
      tips: ["clean-room", "diy-filter"],
    }),
  },
  {
    id: "community",
    words: ["community", "neighbour", "neighbor", "rwa", "society", "resident", "together", "मोहल्ला", "पड़ोस", "सोसाइटी"],
    answer: (_r, _p, l) => ({
      text:
        l === "en"
          ? "Joint action makes the biggest neighbourhood difference: a no-idling week at the school gate, a no-burning pledge for leaves and waste, shared carpools, and dust control at local construction. Open the Community tab to see your group's goals – only grouped, anonymous numbers are shown."
          : "मिलकर किया गया काम मोहल्ले में सबसे बड़ा फ़र्क लाता है: स्कूल गेट पर इंजन-बंद सप्ताह, पत्ते/कचरा न जलाने का संकल्प, साझा कारपूल। समुदाय टैब में अपने समूह के लक्ष्य देखें – केवल समूहित, गुमनाम आँकड़े दिखते हैं।",
      tips: ["no-burning", "carpool"],
    }),
  },
  {
    id: "privacy",
    words: ["privacy", "data", "store", "delete", "track", "गोपनीयता", "डेटा"],
    answer: (_r, _p, l) => ({
      text:
        l === "en"
          ? "In this version everything you tell me stays in this browser tab and disappears when you close it. Location is only used to fetch local air quality. You can see and clear your household profile any time in the Profile tab."
          : "इस संस्करण में आपकी हर जानकारी इसी ब्राउज़र टैब में रहती है और बंद करने पर मिट जाती है। स्थान केवल स्थानीय वायु गुणवत्ता लाने के लिए उपयोग होता है। प्रोफ़ाइल टैब में आप कभी भी जानकारी देख और मिटा सकते हैं।",
    }),
  },
  {
    id: "aqi",
    words: ["aqi", "air today", "how is the air", "air quality", "how bad", "today", "हवा कैसी", "आज", "प्रदूषण"],
    answer: (r, _p, l) => {
      if (!r) return { text: l === "en" ? "I couldn't load the latest reading, so I won't guess. Please try refreshing the air data." : "नवीनतम आँकड़ा लोड नहीं हुआ, इसलिए मैं अंदाज़ा नहीं लगाऊँगा। कृपया डेटा रीफ़्रेश करें।" };
      const b = r.bestWindow ? `${fmtHour(r.bestWindow.start)}–${fmtHour(r.bestWindow.end)}` : null;
      return {
        text:
          l === "en"
            ? `In ${r.place.name}, the estimated India AQI is ${r.aqi} – ${cat(r, l)} – mainly from ${r.dominant} (24-hour average PM2.5 ${Math.round(r.pm25Avg24)} µg/m³). ${b ? `The cleanest stretch in the next day looks like ${b}.` : ""} This is model data from Open-Meteo/CAMS, so treat it as an estimate and check official CPCB stations too.`
            : `${r.place.name} में अनुमानित भारत AQI ${r.aqi} – ${cat(r, l)} – है, मुख्यतः ${r.dominant} के कारण (24 घंटे का औसत PM2.5 ${Math.round(r.pm25Avg24)} µg/m³)। ${b ? `अगले दिन सबसे साफ़ समय ${b} लगता है।` : ""} यह मॉडल डेटा है, इसे अनुमान मानें और CPCB के आधिकारिक स्टेशन भी देखें।`,
      };
    },
  },
  {
    id: "hello",
    words: ["hello", " hi ", " hey ", "namaste", "नमस्ते", "हेलो"],
    answer: (r, _p, l) => ({
      text:
        l === "en"
          ? `Namaste. I can help you plan today around the air${r ? ` in ${r.place.name}` : ""} – school runs, windows, commuting, cooking, or low-cost ways to clean indoor air. What would you like to know?`
          : `नमस्ते। मैं आज की हवा${r ? ` (${r.place.name})` : ""} के हिसाब से दिन की योजना में मदद कर सकता हूँ – स्कूल, खिड़कियाँ, यात्रा, खाना बनाना, या घर की हवा साफ़ करने के सस्ते तरीके। आप क्या जानना चाहेंगे?`,
    }),
  },
];

export function respond(text: string, r: AirReport | null, p: Profile, l: Lang): ChatMsg {
  const safe = safetyCheck(text, l);
  if (safe) return safe;
  const s = ` ${text.toLowerCase()} `;
  // Score intents by number of keyword hits; first wins on tie.
  let bestIntent: Intent | null = null;
  let bestScore = 0;
  for (const it of INTENTS) {
    const score = it.words.filter((w) => s.includes(w)).length;
    if (score > bestScore) { bestScore = score; bestIntent = it; }
  }
  if (bestIntent) {
    const a = bestIntent.answer(r, p, l);
    return { role: "assistant", kind: "normal", text: a.text, tips: a.tips };
  }
  return {
    role: "assistant",
    kind: "unknown",
    text:
      l === "en"
        ? "I'm not sure about that one, and I'd rather not guess. I can help with today's air, school and outdoor decisions, windows and ventilation, masks, low-cost indoor air fixes, commuting, cooking and heating, or community action."
        : "इसके बारे में मैं निश्चित नहीं हूँ, और अंदाज़ा नहीं लगाना चाहता। मैं आज की हवा, स्कूल और बाहर जाने, खिड़कियों, मास्क, घर की हवा के सस्ते उपाय, यात्रा, खाना बनाने या सामुदायिक कदमों में मदद कर सकता हूँ।",
  };
}

export const SUGGESTIONS: T[] = [
  { en: "Is it safe to send my child to school today?", hi: "क्या आज बच्चे को स्कूल भेजना सुरक्षित है?" },
  { en: "When should I open the windows?", hi: "खिड़कियाँ कब खोलूँ?" },
  { en: "Cheap ways to clean indoor air?", hi: "घर की हवा साफ़ करने के सस्ते तरीके?" },
  { en: "Can I go for a run this evening?", hi: "क्या आज शाम दौड़ने जा सकता हूँ?" },
  { en: "Do indoor plants help?", hi: "क्या घर के पौधे मदद करते हैं?" },
];
