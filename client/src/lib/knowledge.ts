// Trusted knowledge library (demo). In the pilot, every entry is reviewed by
// public health and environment advisers before it is used (PID §7, §8.1).

export type Lang = "en" | "hi";
export type T = { en: string; hi: string };
export const tr = (t: T, l: Lang) => t[l];

export type Evidence = "strong" | "moderate" | "limited";
export type TipKind = "indoor" | "travel" | "cooking" | "heating" | "waste" | "shopping";

export type Tip = {
  id: string;
  kind: TipKind;
  cost: 0 | 1 | 2 | 3; // 0 free, 1 under ₹500, 2 ₹500–3,000, 3 above ₹3,000
  effect: 1 | 2 | 3; // relative effectiveness
  title: T;
  body: T;
  limits: T; // what it will not fix
  exposure: string; // range, personal exposure change
  emissions: string; // range or qualitative, neighbourhood emissions change
  evidence: Evidence;
};

export const COST_LABEL: Record<Tip["cost"], T> = {
  0: { en: "Free", hi: "मुफ़्त" },
  1: { en: "Under ₹500", hi: "₹500 से कम" },
  2: { en: "₹500–3,000", hi: "₹500–3,000" },
  3: { en: "Above ₹3,000", hi: "₹3,000 से अधिक" },
};

export const EVIDENCE_LABEL: Record<Evidence, T> = {
  strong: { en: "Strong evidence", hi: "मज़बूत प्रमाण" },
  moderate: { en: "Moderate evidence", hi: "मध्यम प्रमाण" },
  limited: { en: "Limited evidence", hi: "सीमित प्रमाण" },
};

export const KIND_LABEL: Record<TipKind, T> = {
  indoor: { en: "Indoor air", hi: "घर के अंदर की हवा" },
  travel: { en: "Travel", hi: "यात्रा" },
  cooking: { en: "Cooking", hi: "खाना बनाना" },
  heating: { en: "Heating", hi: "गर्माहट" },
  waste: { en: "Waste", hi: "कचरा" },
  shopping: { en: "Shopping", hi: "खरीदारी" },
};

export const TIPS: Tip[] = [
  {
    id: "ventilate-window",
    kind: "indoor", cost: 0, effect: 2,
    title: { en: "Ventilate only in the cleanest window", hi: "सबसे साफ़ समय में ही खिड़की खोलें" },
    body: {
      en: "Keep windows shut during the morning and evening peaks. Open them for 10–15 minutes when the forecast shows the lowest reading of the day, usually early afternoon.",
      hi: "सुबह और शाम के प्रदूषण के चरम समय पर खिड़कियाँ बंद रखें। दिन के सबसे कम प्रदूषण वाले समय (अक्सर दोपहर) में 10–15 मिनट के लिए खोलें।",
    },
    limits: { en: "Homes are never sealed, so some smog always gets in. This lowers indoor levels; it does not make them clean.", hi: "घर पूरी तरह बंद नहीं होते, कुछ धुंध अंदर आती ही है। इससे स्तर कम होता है, हवा पूरी साफ़ नहीं होती।" },
    exposure: "10–30% lower indoor PM2.5", emissions: "No direct change", evidence: "moderate",
  },
  {
    id: "no-smoke-indoors",
    kind: "indoor", cost: 0, effect: 2,
    title: { en: "Skip incense, coils and indoor smoke", hi: "अगरबत्ती, मच्छर कॉइल और धुआँ घर में न करें" },
    body: {
      en: "Incense sticks, mosquito coils, candles and tobacco add fine particles right where you breathe. On smog days, switch to a plug-in repellent or a net and light lamps outdoors if needed.",
      hi: "अगरबत्ती, मच्छर कॉइल, मोमबत्ती और तंबाकू ठीक वहीं महीन कण जोड़ते हैं जहाँ आप साँस लेते हैं। धुंध वाले दिनों में प्लग-इन रिपेलेंट या मच्छरदानी अपनाएँ।",
    },
    limits: { en: "Removes one indoor source; outdoor smog still leaks in.", hi: "यह केवल एक अंदरूनी स्रोत हटाता है; बाहर की धुंध फिर भी आती है।" },
    exposure: "Avoids short indoor spikes of 2–10×", emissions: "Small local reduction", evidence: "strong",
  },
  {
    id: "wet-mop",
    kind: "indoor", cost: 0, effect: 1,
    title: { en: "Wet-mop and damp-dust instead of sweeping", hi: "झाड़ू की जगह गीला पोछा और गीले कपड़े से सफ़ाई" },
    body: {
      en: "Dry sweeping throws settled dust back into the air. A damp cloth and wet mop capture it instead. Do it daily during smog season.",
      hi: "सूखी झाड़ू जमी धूल को फिर हवा में उड़ा देती है। गीला कपड़ा और पोछा उसे पकड़ लेते हैं। धुंध के मौसम में रोज़ करें।",
    },
    limits: { en: "Helps with coarse dust (PM10) more than fine smoke particles.", hi: "मोटी धूल (PM10) में ज़्यादा मदद करता है, महीन धुएँ के कणों में कम।" },
    exposure: "5–15% lower indoor PM10", emissions: "No direct change", evidence: "moderate",
  },
  {
    id: "seal-gaps",
    kind: "indoor", cost: 1, effect: 2,
    title: { en: "Seal obvious gaps around doors and windows", hi: "दरवाज़ों और खिड़कियों की दरारें बंद करें" },
    body: {
      en: "Foam weather strip or a rolled towel under the door slows how fast smog leaks in. Focus on the room where you sleep.",
      hi: "फ़ोम स्ट्रिप या दरवाज़े के नीचे लपेटा तौलिया धुंध के अंदर आने की गति कम करता है। सोने वाले कमरे से शुरुआत करें।",
    },
    limits: { en: "Do not seal rooms where you burn gas, coal or wood – you need fresh air there.", hi: "जहाँ गैस, कोयला या लकड़ी जलती हो, उस कमरे को बंद न करें – वहाँ ताज़ी हवा ज़रूरी है।" },
    exposure: "10–25% lower in the sealed room", emissions: "No direct change", evidence: "moderate",
  },
  {
    id: "clean-room",
    kind: "indoor", cost: 0, effect: 2,
    title: { en: "Make one clean room for the family", hi: "परिवार के लिए एक 'साफ़ कमरा' बनाएँ" },
    body: {
      en: "Pick one room, keep its door and windows shut, and gather there for sleep and long indoor stretches. Put any filter you have in this room.",
      hi: "एक कमरा चुनें, उसके दरवाज़े-खिड़कियाँ बंद रखें, और सोने व लंबे समय के लिए वहीं रहें। जो भी फ़िल्टर है उसे इसी कमरे में रखें।",
    },
    limits: { en: "Works best combined with a filter; on its own the gain is modest.", hi: "फ़िल्टर के साथ सबसे अच्छा काम करता है; अकेले फ़ायदा सीमित है।" },
    exposure: "Concentrates other gains where you spend most hours", emissions: "No direct change", evidence: "moderate",
  },
  {
    id: "diy-filter",
    kind: "indoor", cost: 2, effect: 3,
    title: { en: "Build a do-it-yourself filter fan", hi: "घर पर फ़िल्टर-पंखा बनाएँ" },
    body: {
      en: "Tape a MERV-13 or HEPA-type filter to the back of a box or table fan, airflow going through the filter. Run it in your clean room with the door closed.",
      hi: "बॉक्स या टेबल फ़ैन के पीछे MERV-13 या HEPA जैसा फ़िल्टर टेप से लगाएँ ताकि हवा फ़िल्टर से होकर जाए। इसे साफ़ कमरे में दरवाज़ा बंद करके चलाएँ।",
    },
    limits: { en: "Cleans one room, not the house. Filters clog fast in severe smog – check every 2–4 weeks.", hi: "एक कमरा साफ़ करता है, पूरा घर नहीं। गंभीर धुंध में फ़िल्टर जल्दी भरते हैं – हर 2–4 हफ़्ते जाँचें।" },
    exposure: "40–70% lower PM2.5 in that room", emissions: "Small electricity use", evidence: "moderate",
  },
  {
    id: "purifier",
    kind: "indoor", cost: 3, effect: 3,
    title: { en: "If affordable, a correctly sized HEPA purifier", hi: "अगर संभव हो, सही आकार का HEPA प्यूरीफ़ायर" },
    body: {
      en: "Choose one whose clean-air delivery rate (CADR) suits your room size, keep it on high during smog hours, and keep the door closed. Avoid ionisers and ozone generators.",
      hi: "ऐसा चुनें जिसका CADR आपके कमरे के आकार के अनुसार हो, धुंध के समय तेज़ चलाएँ और दरवाज़ा बंद रखें। आयोनाइज़र और ओज़ोन मशीनों से बचें।",
    },
    limits: { en: "We never recommend a brand. Undersized units on low speed do very little.", hi: "हम किसी ब्रांड की सलाह नहीं देते। छोटी मशीन धीमी गति पर बहुत कम असर करती है।" },
    exposure: "50–80% lower PM2.5 in that room", emissions: "Electricity use", evidence: "strong",
  },
  {
    id: "mask",
    kind: "travel", cost: 1, effect: 3,
    title: { en: "Wear a well-fitted N95 or FFP2 outdoors", hi: "बाहर अच्छी तरह फ़िट N95 या FFP2 मास्क पहनें" },
    body: {
      en: "Fit matters more than brand: press the nose clip, check there are no gaps at the cheeks. Cloth and surgical masks do little against smog.",
      hi: "ब्रांड से ज़्यादा फ़िट मायने रखता है: नाक की क्लिप दबाएँ, गालों पर कोई गैप न हो। कपड़े और सर्जिकल मास्क धुंध में कम काम करते हैं।",
    },
    limits: { en: "Not suitable for very young children. People with heart or lung conditions should ask their doctor first.", hi: "बहुत छोटे बच्चों के लिए नहीं। हृदय या फेफड़ों की बीमारी वाले पहले डॉक्टर से पूछें।" },
    exposure: "Up to 80–95% less inhaled PM2.5 when well fitted", emissions: "No direct change", evidence: "strong",
  },
  {
    id: "metro",
    kind: "travel", cost: 0, effect: 2,
    title: { en: "Choose metro or an enclosed bus over open transport", hi: "खुली सवारी की जगह मेट्रो या बंद बस चुनें" },
    body: {
      en: "Enclosed public transport usually means lower exposure than walking beside traffic or riding a two-wheeler or auto, and far lower emissions per person than driving alone.",
      hi: "बंद सार्वजनिक परिवहन में अक्सर ट्रैफ़िक के पास पैदल चलने या दोपहिया/ऑटो से कम प्रदूषण मिलता है, और अकेले कार चलाने से प्रति व्यक्ति उत्सर्जन बहुत कम होता है।",
    },
    limits: { en: "Exposure on platforms and the walk to the station still counts – wear a mask there.", hi: "प्लेटफ़ॉर्म और स्टेशन तक पैदल रास्ते में भी प्रदूषण है – वहाँ मास्क पहनें।" },
    exposure: "20–50% lower trip exposure (varies by route)", emissions: "60–90% less per person vs driving alone", evidence: "moderate",
  },
  {
    id: "carpool",
    kind: "travel", cost: 0, effect: 2,
    title: { en: "Carpool and switch off while waiting", hi: "कारपूल करें और रुकने पर इंजन बंद करें" },
    body: {
      en: "Sharing a ride with two colleagues cuts per-person exhaust by roughly half or more. Switching off at long signals and school gates avoids idling smoke where children stand.",
      hi: "दो सहकर्मियों के साथ सवारी साझा करने से प्रति व्यक्ति धुआँ लगभग आधा या उससे कम होता है। लंबे सिग्नल और स्कूल गेट पर इंजन बंद रखें।",
    },
    limits: { en: "Keep car windows closed and air on recirculate in heavy traffic.", hi: "भारी ट्रैफ़िक में कार की खिड़कियाँ बंद और AC रिसर्कुलेट पर रखें।" },
    exposure: "10–30% lower in-cabin exposure on recirculate", emissions: "40–70% less per person", evidence: "moderate",
  },
  {
    id: "quiet-route",
    kind: "travel", cost: 0, effect: 1,
    title: { en: "Walk or cycle on quieter streets, off-peak", hi: "शांत गलियों से और कम भीड़ वाले समय में चलें" },
    body: {
      en: "Moving even one street away from a main road can noticeably lower what you breathe. Shift trips away from the 8–10 am and 6–9 pm peaks where you can.",
      hi: "मुख्य सड़क से एक गली दूर चलना भी साँस में जाने वाले प्रदूषण को कम करता है। जहाँ संभव हो, सुबह 8–10 और शाम 6–9 के चरम समय से बचें।",
    },
    limits: { en: "On severe days, keep active travel short and gentle.", hi: "गंभीर दिनों में पैदल/साइकिल यात्रा छोटी और धीमी रखें।" },
    exposure: "10–40% lower trip exposure", emissions: "Zero-emission trip", evidence: "moderate",
  },
  {
    id: "exhaust-cooking",
    kind: "cooking", cost: 0, effect: 2,
    title: { en: "Run the exhaust and lid your pots", hi: "एग्ज़ॉस्ट चलाएँ और बर्तन ढककर पकाएँ" },
    body: {
      en: "Switch on the chimney or exhaust fan before you start, cook on back burners, and use lids. Frying and tadka release a burst of fine particles.",
      hi: "खाना बनाना शुरू करने से पहले चिमनी या एग्ज़ॉस्ट चालू करें, पीछे वाले बर्नर पर पकाएँ और ढक्कन लगाएँ। तलने और तड़के से महीन कण निकलते हैं।",
    },
    limits: { en: "If you have no exhaust, crack the kitchen window during cooking only, and keep the kitchen door shut.", hi: "एग्ज़ॉस्ट न हो तो केवल पकाते समय रसोई की खिड़की थोड़ी खोलें और रसोई का दरवाज़ा बंद रखें।" },
    exposure: "20–50% lower kitchen PM2.5", emissions: "No direct change", evidence: "moderate",
  },
  {
    id: "clean-fuel",
    kind: "cooking", cost: 2, effect: 3,
    title: { en: "Move from wood, dung or kerosene to LPG or induction", hi: "लकड़ी, उपले या मिट्टी के तेल से LPG या इंडक्शन पर जाएँ" },
    body: {
      en: "Solid fuels are among the biggest sources of indoor smoke in Indian homes. Check eligibility for PM Ujjwala Yojana LPG support, or use a low-cost induction plate for some dishes.",
      hi: "ठोस ईंधन भारतीय घरों में अंदरूनी धुएँ के सबसे बड़े स्रोतों में हैं। PM उज्ज्वला योजना की पात्रता जाँचें, या कुछ व्यंजनों के लिए सस्ती इंडक्शन प्लेट अपनाएँ।",
    },
    limits: { en: "Even LPG needs ventilation – gas stoves still emit NO2.", hi: "LPG के साथ भी हवा का आना-जाना ज़रूरी है – गैस भी NO2 छोड़ती है।" },
    exposure: "50–90% lower kitchen smoke vs solid fuel", emissions: "Large cut in local smoke", evidence: "strong",
  },
  {
    id: "heating",
    kind: "heating", cost: 0, effect: 2,
    title: { en: "Avoid coal braziers (angithi) indoors", hi: "घर के अंदर अंगीठी न जलाएँ" },
    body: {
      en: "Burning coal or wood in a closed room adds heavy smoke and dangerous carbon monoxide. Use layers, blankets and a hot-water bottle; use an electric heater if you can.",
      hi: "बंद कमरे में कोयला या लकड़ी जलाने से भारी धुआँ और खतरनाक कार्बन मोनोऑक्साइड बनती है। कपड़ों की परतें, कंबल और गर्म पानी की बोतल अपनाएँ।",
    },
    limits: { en: "Never sleep with an angithi burning in a closed room – it can be fatal.", hi: "बंद कमरे में जलती अंगीठी के साथ कभी न सोएँ – यह जानलेवा हो सकता है।" },
    exposure: "Removes a major indoor source", emissions: "Cuts local smoke and CO", evidence: "strong",
  },
  {
    id: "no-burning",
    kind: "waste", cost: 0, effect: 3,
    title: { en: "Never burn leaves or rubbish – segregate instead", hi: "पत्ते या कचरा कभी न जलाएँ – अलग-अलग करें" },
    body: {
      en: "Open burning is a big winter source in many neighbourhoods. Separate wet and dry waste, compost leaves, and report burning to your local body or the Sameer app.",
      hi: "खुले में कचरा जलाना कई मोहल्लों में सर्दियों का बड़ा स्रोत है। गीला-सूखा कचरा अलग करें, पत्तों से खाद बनाएँ, और जलाने की शिकायत स्थानीय निकाय या 'समीर' ऐप पर करें।",
    },
    limits: { en: "One household's choice is small; it adds up when the whole lane joins in.", hi: "एक घर का असर छोटा है; पूरी गली जुड़े तो बड़ा फ़र्क पड़ता है।" },
    exposure: "Lower exposure for you and neighbours", emissions: "Avoids a high-smoke local source", evidence: "strong",
  },
  {
    id: "local-shopping",
    kind: "shopping", cost: 0, effect: 1,
    title: { en: "Batch errands and shop locally on smog days", hi: "धुंध वाले दिनों में काम इकट्ठे करें और पास से खरीदें" },
    body: {
      en: "Combine trips, walk to the nearest market, or group deliveries with neighbours to cut vehicle trips on the worst days.",
      hi: "यात्राएँ मिलाएँ, पास के बाज़ार तक पैदल जाएँ, या पड़ोसियों के साथ मिलकर डिलीवरी मँगवाएँ ताकि सबसे खराब दिनों में गाड़ियाँ कम चलें।",
    },
    limits: { en: "A modest effect; most useful when many households do it.", hi: "असर सीमित है; कई घर करें तो ज़्यादा उपयोगी।" },
    exposure: "Less time outdoors in traffic", emissions: "Small cut in local traffic", evidence: "limited",
  },
];

export const tipById = (id: string) => TIPS.find((t) => t.id === id)!;

// Hindi renderings of the effect ranges shown in the impact view.
const EFFECT_HI: Record<string, string> = {
  "10–30% lower indoor PM2.5": "घर के अंदर PM2.5 में 10–30% कमी",
  "No direct change": "कोई सीधा बदलाव नहीं",
  "Avoids short indoor spikes of 2–10×": "घर में 2–10 गुना तक के अचानक उछाल से बचाव",
  "Small local reduction": "स्थानीय स्तर पर थोड़ी कमी",
  "5–15% lower indoor PM10": "घर के अंदर PM10 में 5–15% कमी",
  "10–25% lower in the sealed room": "बंद कमरे में 10–25% कमी",
  "Concentrates other gains where you spend most hours": "जहाँ आप सबसे ज़्यादा समय बिताते हैं, वहाँ बाकी उपायों का असर बढ़ाता है",
  "40–70% lower PM2.5 in that room": "उस कमरे में PM2.5 में 40–70% कमी",
  "Small electricity use": "थोड़ी बिजली खपत",
  "50–80% lower PM2.5 in that room": "उस कमरे में PM2.5 में 50–80% कमी",
  "Electricity use": "बिजली खपत",
  "Up to 80–95% less inhaled PM2.5 when well fitted": "अच्छी फ़िटिंग पर साँस में 80–95% तक कम PM2.5",
  "20–50% lower trip exposure (varies by route)": "यात्रा में 20–50% कम प्रदूषण (रास्ते पर निर्भर)",
  "60–90% less per person vs driving alone": "अकेले कार चलाने की तुलना में प्रति व्यक्ति 60–90% कम",
  "10–30% lower in-cabin exposure on recirculate": "रिसर्कुलेट पर कार के अंदर 10–30% कम प्रदूषण",
  "40–70% less per person": "प्रति व्यक्ति 40–70% कम",
  "10–40% lower trip exposure": "यात्रा में 10–40% कम प्रदूषण",
  "Zero-emission trip": "शून्य-उत्सर्जन यात्रा",
  "20–50% lower kitchen PM2.5": "रसोई में PM2.5 में 20–50% कमी",
  "50–90% lower kitchen smoke vs solid fuel": "ठोस ईंधन की तुलना में रसोई के धुएँ में 50–90% कमी",
  "Large cut in local smoke": "स्थानीय धुएँ में बड़ी कमी",
  "Removes a major indoor source": "घर का एक बड़ा प्रदूषण स्रोत हटता है",
  "Cuts local smoke and CO": "स्थानीय धुआँ और CO घटता है",
  "Lower exposure for you and neighbours": "आपके और पड़ोसियों के लिए कम प्रदूषण",
  "Avoids a high-smoke local source": "एक भारी धुएँ वाले स्थानीय स्रोत से बचाव",
  "Less time outdoors in traffic": "ट्रैफ़िक में कम समय",
  "Small cut in local traffic": "स्थानीय ट्रैफ़िक में थोड़ी कमी",
};
export const fx = (s: string, l: Lang) => (l === "hi" ? EFFECT_HI[s] ?? s : s);
