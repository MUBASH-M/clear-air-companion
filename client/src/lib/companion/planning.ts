import { AirReport, CATEGORIES, CategoryKey, fmtHour } from "../air";
import { Lang, T, TIPS, Tip, tipById, tr } from "../knowledge";
import { Profile, budgetMaxCost, isSensitive } from "./profile";

/**
 * Daily action-plan and personalized guidance calculators based on India CPCB AQI
 * severity bands and household sensitivity flags.
 */

export const AQI_SEVERITY: Record<CategoryKey, number> = {
  good: 0,
  satisfactory: 1,
  moderate: 2,
  poor: 3,
  very_poor: 4,
  severe: 5,
};

export type PlanItem = {
  id: string;
  icon: "sun" | "school" | "route" | "window" | "flame" | "heart" | "home" | "leaf";
  title: string;
  detail: string;
  exposure?: string;
  emissions?: string;
  tipId?: string;
};

/**
 * Sorts tips prioritizing affordability (fitting within the household's budget first),
 * then lowest cost, then highest documented exposure/emission reduction effect.
 */
export function rankedTips(kind: Tip["kind"][] | null, p: Profile): Tip[] {
  const max = budgetMaxCost(p.budget);
  return TIPS.filter((t) => !kind || kind.includes(t.kind))
    .slice()
    .sort((a, b) => {
      const aFits = a.cost <= max ? 1 : 0;
      const bFits = b.cost <= max ? 1 : 0;
      return bFits - aFits || a.cost - b.cost || b.effect - a.effect;
    });
}

/**
 * Builds the ranked daily action plan for a household given the live CPCB AQI report.
 */
export function buildPlan(
  r: AirReport,
  p: Profile,
  l: Lang,
): { headline: string; summary: string; items: PlanItem[] } {
  const sev = AQI_SEVERITY[r.category];
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
  )
    .replace(/\s+/g, " ")
    .trim();

  items.push({
    id: "outdoor",
    icon: "sun",
    title:
      sev >= 3
        ? L("Move exercise indoors", "व्यायाम घर के अंदर करें")
        : L("Outdoor time is fine, in moderation", "बाहर समय बिताना ठीक है, संयम से"),
    detail:
      sev >= 4
        ? L(
            `Skip outdoor runs and long walks. If you must go out, aim for ${bestTxt || "the afternoon"} and keep it short.`,
            `बाहर दौड़ना और लंबी सैर छोड़ें। ज़रूरी हो तो ${bestTxt || "दोपहर"} में जाएँ और जल्दी लौटें।`,
          )
        : sev === 3
          ? L(
              `Keep outdoor activity light. ${best ? `${bestTxt} is the best slot.` : ""}`,
              `बाहर हल्की गतिविधि रखें। ${best ? `${bestTxt} सबसे अच्छा समय है।` : ""}`,
            )
          : L(
              `Good day for a walk${best ? `, ideally ${bestTxt}` : ""}. Avoid busy roads.`,
              `सैर के लिए ठीक दिन${best ? `, ${bestTxt} बेहतर` : ""}। व्यस्त सड़कों से बचें।`,
            ),
    exposure:
      sev >= 3
        ? L(
            "Indoor exercise avoids most of the extra dose from heavy breathing",
            "अंदर व्यायाम से भारी साँसों से होने वाला अतिरिक्त प्रदूषण बचता है",
          )
        : undefined,
  });

  if (p.children) {
    items.push({
      id: "school",
      icon: "school",
      title:
        sev >= 3
          ? L("School run with a mask; play indoors", "स्कूल जाते समय मास्क; खेल घर के अंदर")
          : L("Normal school day", "सामान्य स्कूल दिवस"),
      detail:
        sev >= 3
          ? L(
              "Use a well-fitted child-size mask for the trip, keep the car on recirculate, and plan indoor play after school. Check the school's notice for closures.",
              "रास्ते के लिए बच्चों के आकार का अच्छी तरह फ़िट मास्क, कार में AC रिसर्कुलेट, और स्कूल के बाद घर में खेल। बंद होने की सूचना के लिए स्कूल का नोटिस देखें।",
            )
          : L(
              "Outdoor play is fine. Avoid waiting near idling vehicles at the school gate.",
              "बाहर खेलना ठीक है। स्कूल गेट पर चालू गाड़ियों के पास इंतज़ार न करें।",
            ),
      exposure:
        sev >= 3
          ? L("Mask: up to 80–95% less inhaled PM2.5 if well fitted", "मास्क: अच्छी फ़िटिंग पर 80–95% तक कम PM2.5")
          : undefined,
      tipId: sev >= 3 ? "mask" : undefined,
    });
  }

  const commute: Record<Profile["commute"], { t: T; d: T; tip?: string }> = {
    metro: {
      t: { en: "Metro commute – mask on the platform", hi: "मेट्रो यात्रा – प्लेटफ़ॉर्म पर मास्क" },
      d: {
        en: "Enclosed coaches keep exposure lower. The walk to the station and the platform are where to wear a mask.",
        hi: "बंद डिब्बों में प्रदूषण कम है। स्टेशन तक का रास्ता और प्लेटफ़ॉर्म पर मास्क पहनें।",
      },
      tip: "mask",
    },
    bus: {
      t: { en: "Bus commute – mask while waiting", hi: "बस यात्रा – इंतज़ार में मास्क" },
      d: {
        en: "Bus stops beside traffic are exposure hot spots. Stand back from the kerb and wear a mask.",
        hi: "ट्रैफ़िक के पास बस स्टॉप पर प्रदूषण ज़्यादा है। सड़क से दूर खड़े हों और मास्क पहनें।",
      },
      tip: "mask",
    },
    car: {
      t: { en: "Driving – recirculate and share the ride", hi: "कार – रिसर्कुलेट और सवारी साझा करें" },
      d: {
        en: "Keep windows up with air on recirculate. Carpooling or switching one trip to metro today cuts your share of emissions.",
        hi: "खिड़कियाँ बंद और AC रिसर्कुलेट रखें। कारपूल या एक यात्रा मेट्रो से करने से आपका उत्सर्जन घटता है।",
      },
      tip: "carpool",
    },
    two_wheeler: {
      t: { en: "Two-wheeler – mask and quieter roads", hi: "दोपहिया – मास्क और शांत रास्ते" },
      d: {
        en: "Riders breathe traffic exhaust directly. Wear an N95 under the helmet and pick a less congested route if possible.",
        hi: "सवार सीधे धुआँ साँस में लेते हैं। हेलमेट के नीचे N95 पहनें और कम भीड़ वाला रास्ता चुनें।",
      },
      tip: "mask",
    },
    auto: {
      t: { en: "Auto-rickshaw – mask and timing", hi: "ऑटो – मास्क और समय" },
      d: {
        en: "Open autos sit in exhaust. Wear a mask and, if your hours are flexible, travel outside the peak.",
        hi: "खुले ऑटो धुएँ के बीच रहते हैं। मास्क पहनें और संभव हो तो चरम समय से बाहर यात्रा करें।",
      },
      tip: "mask",
    },
    walk_cycle: {
      t: { en: "Walking or cycling – choose side streets", hi: "पैदल/साइकिल – अंदर की गलियाँ चुनें" },
      d: {
        en: "Pick quieter streets and go gently; heavy breathing increases your dose.",
        hi: "शांत गलियाँ चुनें और धीरे चलें; तेज़ साँसें प्रदूषण की मात्रा बढ़ाती हैं।",
      },
      tip: "quiet-route",
    },
    home: {
      t: { en: "Working from home – a clean-room day", hi: "घर से काम – साफ़ कमरे का दिन" },
      d: {
        en: "Set up in your cleanest room with the door shut and run any filter you have.",
        hi: "सबसे साफ़ कमरे में दरवाज़ा बंद करके काम करें और जो भी फ़िल्टर है चलाएँ।",
      },
      tip: "clean-room",
    },
  };
  const c = commute[p.commute];
  if (sev >= 2 || p.commute === "car") {
    const tip = c.tip ? TIPS.find((t) => t.id === c.tip) : undefined;
    items.push({
      id: "commute",
      icon: "route",
      title: tr(c.t, l),
      detail: tr(c.d, l),
      exposure: tip?.exposure,
      emissions: tip?.emissions,
      tipId: c.tip,
    });
  }

  items.push({
    id: "ventilate",
    icon: "window",
    title: best
      ? L(`Air out the house at ${bestTxt}`, `${bestTxt} पर घर में हवा आने दें`)
      : L("Ventilate briefly when readings dip", "प्रदूषण कम होने पर थोड़ी देर हवा आने दें"),
    detail: L(
      `Keep windows closed during the morning and evening peaks${worst ? ` (worst around ${worstTxt})` : ""}. Open for 10–15 minutes in the cleanest window, then close again.`,
      `सुबह-शाम के चरम समय पर खिड़कियाँ बंद रखें${worst ? ` (सबसे खराब ${worstTxt} के आसपास)` : ""}। सबसे साफ़ समय पर 10–15 मिनट खोलें, फिर बंद करें।`,
    ),
    exposure: "10–30% lower indoor PM2.5",
    tipId: "ventilate-window",
  });

  if (p.fuel === "wood" || p.fuel === "kerosene") {
    const t = tipById("clean-fuel");
    items.push({
      id: "cooking",
      icon: "flame",
      title: tr(t.title, l),
      detail: tr(t.body, l),
      exposure: t.exposure,
      emissions: t.emissions,
      tipId: t.id,
    });
  } else {
    const t = tipById("exhaust-cooking");
    items.push({
      id: "cooking",
      icon: "flame",
      title: tr(t.title, l),
      detail: tr(t.body, l),
      exposure: t.exposure,
      tipId: t.id,
    });
  }

  if (sensitive && sev >= 2) {
    const who = [
      p.children && L("children", "बच्चों"),
      p.olderAdult && L("older adults", "बुज़ुर्गों"),
      p.pregnant && L("pregnancy", "गर्भावस्था"),
      p.condition && L("asthma or heart conditions", "दमा या हृदय रोग"),
    ]
      .filter(Boolean)
      .join(", ");
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

  const indoor = rankedTips(["indoor"], p).filter((t) => t.id !== "ventilate-window");
  const pick =
    sev >= 3
      ? (indoor.find((t) => t.effect >= 2 && t.cost <= budgetMaxCost(p.budget)) ?? indoor[0])
      : indoor[0];
  items.push({
    id: "indoor",
    icon: "home",
    title: tr(pick.title, l),
    detail: tr(pick.body, l),
    exposure: pick.exposure,
    tipId: pick.id,
  });

  const civic = tipById("no-burning");
  items.push({
    id: "civic",
    icon: "leaf",
    title: tr(civic.title, l),
    detail: tr(civic.body, l),
    emissions: civic.emissions,
    tipId: civic.id,
  });

  return { headline, summary, items };
}

export type GuidanceIcon = "mask" | "activity" | "window" | "heart" | "shield" | "wind";

export type GuidanceTip = {
  id: string;
  icon: GuidanceIcon;
  priority: "high" | "medium" | "low";
  title: string;
  detail: string;
  tag: string;
};

export type DailyGuidance = {
  headline: string;
  subtext: string;
  aqiLabel: string;
  personalizedFor: string[];
  tips: GuidanceTip[];
};

/**
 * Generates up to 4 prioritized, household-personalized guidance cards for TodayView.
 */
export function buildDailyGuidance(r: AirReport, p: Profile, l: Lang): DailyGuidance {
  const sev = AQI_SEVERITY[r.category];
  const catLabel = tr(CATEGORIES[r.category], l);
  const sensitive = isSensitive(p);
  const bestTxt = r.bestWindow ? `${fmtHour(r.bestWindow.start)}–${fmtHour(r.bestWindow.end)}` : "";
  const worstTxt = r.worstWindow ? `${fmtHour(r.worstWindow.start)}–${fmtHour(r.worstWindow.end)}` : "";
  const L = (en: string, hi: string) => (l === "en" ? en : hi);

  const personalizedFor: string[] = [];
  if (p.children) personalizedFor.push(L("Children", "बच्चे"));
  if (p.olderAdult) personalizedFor.push(L("Older adults", "बुज़ुर्ग"));
  if (p.pregnant) personalizedFor.push(L("Pregnancy", "गर्भावस्था"));
  if (p.condition) personalizedFor.push(L("Respiratory / heart care", "साँस / हृदय देखभाल"));
  if (p.commute === "two_wheeler" || p.commute === "auto" || p.commute === "walk_cycle") {
    personalizedFor.push(L("Open commute", "खुली यात्रा"));
  }

  const headline =
    sev >= 5
      ? L("Severe air — stay indoors and wear an N95 mask if going out", "गंभीर प्रदूषण — घर के अंदर रहें, बाहर जाने पर N95 मास्क पहनें")
      : sev === 4
        ? L("Very poor air — wear an N95/FFP2 mask and avoid outdoor exertion", "बहुत खराब हवा — N95/FFP2 मास्क पहनें और बाहर श्रम से बचें")
        : sev === 3
          ? L("Wear an N95 mask today and limit long outdoor stays", "आज N95 मास्क पहनें और बाहर ज़्यादा देर न रहें")
          : sev === 2
            ? sensitive
              ? L("Moderate air — take extra precautions for sensitive family members", "मध्यम हवा — संवेदनशील सदस्यों के लिए अतिरिक्त सावधानी रखें")
              : L("Moderate air — keep heavy exercise away from busy roads", "मध्यम हवा — व्यस्त सड़कों के पास भारी व्यायाम से बचें")
            : sev === 1
              ? L("Satisfactory air — normal outdoor plans are fine today", "संतोषजनक हवा — आज सामान्य बाहरी गतिविधियाँ ठीक हैं")
              : L("Clean air today — great time to be outdoors and air out your home", "आज साफ़ हवा — बाहर रहने और घर में ताज़ी हवा लाने का अच्छा समय");

  const subtext =
    sev >= 3
      ? L(
          `PM2.5 is currently ${Math.round(r.pm25)} µg/m³ (${catLabel}). Prioritise protection when stepping outside.`,
          `अभी PM2.5 ${Math.round(r.pm25)} µg/m³ (${catLabel}) है। बाहर निकलते समय सुरक्षा को प्राथमिकता दें।`,
        )
      : sev === 2
        ? L(
            `Estimated AQI is ${r.aqi} (${catLabel}). Sensitive groups and open commuters benefit most from simple precautions.`,
            `अनुमानित AQI ${r.aqi} (${catLabel}) है। संवेदनशील समूह और खुली सवारी वाले सरल सावधानियों से सुरक्षित रह सकते हैं।`,
          )
        : L(
            `Estimated AQI is ${r.aqi} (${catLabel}). Air quality is comfortable for most daily routines.`,
            `अनुमानित AQI ${r.aqi} (${catLabel}) है। अधिकतर दैनिक गतिविधियों के लिए हवा अनुकूल है।`,
          );

  const tips: GuidanceTip[] = [];

  if (sev >= 3) {
    tips.push({
      id: "mask",
      icon: "mask",
      priority: "high",
      title:
        sev >= 4
          ? L("Wear a snug N95 or FFP2 mask for every outdoor trip", "हर बाहरी यात्रा पर अच्छी तरह फ़िट N95 या FFP2 मास्क पहनें")
          : L("Wear an N95 mask today when heading outdoors", "आज बाहर निकलते समय N95 मास्क पहनें"),
      detail:
        p.commute === "two_wheeler"
          ? L(
              "Pinch the nose clip firmly under your helmet so there are no cheek gaps. Cloth and surgical masks let fine PM2.5 straight through.",
              "हेलमेट के नीचे नाक की क्लिप अच्छी तरह दबाएँ ताकि गालों पर गैप न हो। कपड़े और सर्जिकल मास्क महीन PM2.5 नहीं रोकते।",
            )
          : L(
              "Check for a tight seal around the nose and cheeks — fit matters more than brand. Cloth and surgical masks offer little protection against fine smog.",
              "नाक और गालों के पास अच्छी सील जाँचें — ब्रांड से ज़्यादा फ़िटिंग मायने रखती है। कपड़े और सर्जिकल मास्क धुंध में कम असर करते हैं।",
            ),
      tag: `${L("AQI", "AQI")} · ${catLabel}`,
    });
  } else if (sev === 2 && (sensitive || p.commute === "two_wheeler" || p.commute === "auto")) {
    tips.push({
      id: "mask-mod",
      icon: "mask",
      priority: "medium",
      title: L("Keep an N95 mask handy near heavy traffic", "भारी ट्रैफ़िक के पास N95 मास्क साथ रखें"),
      detail: L(
        "Roadside pollution spikes well above the city average, especially during rush hours or open-air commutes.",
        "सड़क किनारे प्रदूषण शहर के औसत से काफ़ी ज़्यादा होता है, खासकर भीड़ के समय या खुली यात्रा में।",
      ),
      tag: p.commute === "two_wheeler" || p.commute === "auto" ? L("Commute", "यात्रा") : L("Sensitive care", "संवेदनशील देखभाल"),
    });
  }

  if (sev >= 3) {
    tips.push({
      id: "activity",
      icon: "activity",
      priority: sev >= 4 ? "high" : "medium",
      title:
        sev >= 4
          ? L("Skip outdoor workouts; keep activity indoors", "बाहर व्यायाम न करें; गतिविधि घर के अंदर रखें")
          : L("Shift runs and brisk walks indoors today", "दौड़ और तेज़ सैर आज घर के अंदर करें"),
      detail: bestTxt
        ? L(
            `Deep breathing outdoors pulls far more particles into the lungs. If you must run errands, aim for the cleanest window (${bestTxt}).`,
            `बाहर तेज़ साँस लेने से फेफड़ों में कई गुना अधिक कण जाते हैं। ज़रूरी काम सबसे साफ़ समय (${bestTxt}) में निपटाएँ।`,
          )
        : L(
            "Deep breathing during exercise increases inhaled pollution sharply. Opt for indoor stretching, yoga or light home routines.",
            "व्यायाम में तेज़ साँस लेने से प्रदूषण की मात्रा तेज़ी से बढ़ती है। घर के अंदर योग या स्ट्रेचिंग चुनें।",
          ),
      tag: bestTxt ? `${L("Best", "बेहतर")} ${bestTxt}` : L("Outdoors", "बाहर"),
    });
  } else if (sev === 2) {
    tips.push({
      id: "activity-mod",
      icon: "activity",
      priority: "medium",
      title: L("Choose quieter streets and lighter pace outdoors", "बाहर शांत गलियाँ और हल्की गति चुनें"),
      detail: bestTxt
        ? L(
            `Plan walks or outdoor exercise around ${bestTxt} and stay at least one street away from main traffic corridors.`,
            `सैर या व्यायाम ${bestTxt} के आसपास रखें और मुख्य ट्रैफ़िक सड़कों से कम से कम एक गली दूर रहें।`,
          )
        : L(
            "Avoid jogging alongside busy roads, especially during 8–10 am and 6–9 pm traffic peaks.",
            "व्यस्त सड़कों के किनारे दौड़ने से बचें, खासकर सुबह 8–10 और शाम 6–9 के चरम समय में।",
          ),
      tag: bestTxt ? `${L("Best", "बेहतर")} ${bestTxt}` : L("Activity", "गतिविधि"),
    });
  } else {
    tips.push({
      id: "activity-good",
      icon: "activity",
      priority: "low",
      title: L("Enjoy outdoor walks and exercise today", "आज बाहर सैर और व्यायाम का आनंद लें"),
      detail: bestTxt
        ? L(
            `Air is relatively clear, with the freshest stretch around ${bestTxt}. Still avoid idling traffic where possible.`,
            `हवा अपेक्षाकृत साफ़ है, सबसे ताज़ा समय ${bestTxt} के आसपास है। फिर भी चालू गाड़ियों के धुएँ से दूर रहें।`,
          )
        : L(
            "Conditions are favourable for outdoor movement and children's play. Prefer parks and side streets over main roads.",
            "बाहर व्यायाम और बच्चों के खेलने के लिए मौसम अनुकूल है। मुख्य सड़कों के बजाय पार्क या शांत गलियाँ चुनें।",
          ),
      tag: L("Outdoors", "बाहर"),
    });
  }

  if (p.condition) {
    tips.push({
      id: "condition",
      icon: "heart",
      priority: sev >= 2 ? "high" : "low",
      title:
        sev >= 3
          ? L("Keep your reliever inhaler and doctor's plan close", "अपना रिलीवर इनहेलर और डॉक्टर की योजना पास रखें")
          : L("Monitor breathing comfort near traffic or dust", "ट्रैफ़िक या धूल के पास साँस की सहजता पर ध्यान दें"),
      detail:
        sev >= 3
          ? L(
              "High particulate levels can trigger wheezing, coughing or chest tightness. Rest in your cleanest room and check with a doctor before prolonged mask use if breathless.",
              "अधिक प्रदूषण से घरघराहट, खाँसी या सीने में जकड़न हो सकती है। सबसे साफ़ कमरे में आराम करें और साँस फूलने पर डॉक्टर से सलाह लें।",
            )
          : L(
              "Even on calmer days, carry prescribed reliever medication when travelling through congested areas.",
              "सामान्य दिनों में भी भीड़भाड़ वाले इलाकों में जाते समय डॉक्टर की बताई दवा साथ रखें।",
            ),
      tag: L("Asthma / Heart", "दमा / हृदय"),
    });
  } else if (p.children) {
    tips.push({
      id: "children",
      icon: "shield",
      priority: sev >= 3 ? "high" : "low",
      title:
        sev >= 3
          ? L("Plan indoor play and use a child-sized mask for commutes", "अंदर खेल की योजना बनाएँ और रास्ते में बच्चों का मास्क दें")
          : L("Encourage outdoor play away from idling vehicles", "चालू गाड़ियों से दूर बाहर खेलने को प्रोत्साहित करें"),
      detail:
        sev >= 3
          ? L(
              "Children breathe faster per body weight than adults. Keep car windows shut on recirculate and rinse faces after returning indoors.",
              "बच्चे बड़ों की तुलना में तेज़ी से साँस लेते हैं। कार की खिड़कियाँ बंद (रिसर्कुलेट) रखें और लौटने पर चेहरा धोएँ।",
            )
          : L(
              "Wait away from idling school buses and cars at drop-off and pick-up gates.",
              "स्कूल गेट पर चालू बसों और कारों से दूर खड़े रहें।",
            ),
      tag: L("For children", "बच्चों के लिए"),
    });
  } else if (p.pregnant) {
    tips.push({
      id: "pregnant",
      icon: "heart",
      priority: sev >= 2 ? "high" : "low",
      title:
        sev >= 3
          ? L("Spend peak hours in your cleanest room", "चरम समय सबसे साफ़ कमरे में बिताएँ")
          : L("Keep indoor air free of smoke and incense", "घर की हवा को धुएँ और अगरबत्ती से मुक्त रखें"),
      detail: L(
        "Minimising fine-particle exposure during pregnancy supports both your comfort and wellbeing. Avoid incense, coils and roadside exhaust.",
        "गर्भावस्था के दौरान महीन कणों से बचाव आपकी सेहत के लिए मददगार है। अगरबत्ती, मच्छर कॉइल और सड़क के धुएँ से बचें।",
      ),
      tag: L("Pregnancy care", "गर्भावस्था देखभाल"),
    });
  } else if (p.olderAdult) {
    tips.push({
      id: "older",
      icon: "heart",
      priority: sev >= 3 ? "high" : "low",
      title:
        sev >= 3
          ? L("Pause early-morning walks until smog lifts", "धुंध छँटने तक सुबह की सैर रोकें")
          : L("Take morning walks once traffic and mist clear", "ट्रैफ़िक और कोहरा छँटने के बाद सैर पर जाएँ"),
      detail: L(
        "Cold morning air traps pollutants closest to the ground. A gentle afternoon walk or indoor movement is much easier on the heart and lungs.",
        "सुबह की ठंडी हवा प्रदूषण को ज़मीन के पास रोक लेती है। दोपहर की हल्की सैर या घर में चलना हृदय और फेफड़ों के लिए बेहतर है।",
      ),
      tag: L("Older adults", "बुज़ुर्ग"),
    });
  }

  if (sev >= 3) {
    tips.push({
      id: "indoor-vent",
      icon: "window",
      priority: "medium",
      title: bestTxt
        ? L(`Keep windows closed; ventilate briefly at ${bestTxt}`, `खिड़कियाँ बंद रखें; ${bestTxt} पर थोड़ी देर हवा आने दें`)
        : L("Keep windows closed during morning & evening peaks", "सुबह और शाम के चरम समय पर खिड़कियाँ बंद रखें"),
      detail: worstTxt
        ? L(
            `Pollution peaks around ${worstTxt}. Seal door gaps, skip incense or coils, and run a HEPA purifier or DIY box-fan filter if available.`,
            `${worstTxt} के आसपास प्रदूषण सबसे ज़्यादा रहता है। दरवाज़ों की दरारें बंद करें, अगरबत्ती न जलाएँ और संभव हो तो फ़िल्टर चलाएँ।`,
          )
        : L(
            "Avoid indoor smoke sources like incense, mosquito coils and dry sweeping; wet-mop floors and run a filter in the bedroom.",
            "अगरबत्ती, मच्छर कॉइल और सूखी झाड़ू से बचें; गीला पोछा लगाएँ और सोने के कमरे में फ़िल्टर चलाएँ।",
          ),
      tag: L("Indoor air", "घर की हवा"),
    });
  } else {
    tips.push({
      id: "indoor-fresh",
      icon: "wind",
      priority: "low",
      title: L("Cross-ventilate your home while air is fresher", "हवा साफ़ होने पर घर में क्रॉस-वेंटिलेशन करें"),
      detail:
        p.fuel === "wood" || p.fuel === "kerosene"
          ? L(
              "Open opposite windows for 15–20 minutes to flush out indoor cooking smoke and trapped humidity.",
              "रसोई का धुआँ और जमी नमी बाहर निकालने के लिए 15–20 मिनट तक आमने-सामने की खिड़कियाँ खोलें।",
            )
          : L(
              "Open windows on opposite sides for 15–20 minutes to refresh indoor air, and switch on the kitchen exhaust while cooking.",
              "घर की हवा ताज़ा करने के लिए 15–20 मिनट खिड़कियाँ खोलें, और खाना बनाते समय रसोई का एग्ज़ॉस्ट चलाएँ।",
            ),
      tag: L("Indoor air", "घर की हवा"),
    });
  }

  return {
    headline,
    subtext,
    aqiLabel: `${L("AQI", "AQI")} ${r.aqi} · ${catLabel}`,
    personalizedFor,
    tips: tips.slice(0, 4),
  };
}
