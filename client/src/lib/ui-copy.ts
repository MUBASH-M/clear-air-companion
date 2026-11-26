export type TabId = "today" | "map" | "ask" | "tips" | "impact" | "community" | "profile";

export type DoneAction = {
  ts: number;
  title?: string;
};

export const TAB_ORDER: TabId[] = ["today", "map", "ask", "tips", "impact", "community", "profile"];

export const UI = {
  tagline: { en: "Daily guidance for living well through winter smog", hi: "सर्दियों की धुंध में बेहतर जीने के लिए रोज़ का मार्गदर्शन" },
  airNow: { en: "Air right now", hi: "अभी की हवा" },
  estAqi: { en: "Estimated India AQI", hi: "अनुमानित भारत AQI" },
  next24: { en: "Next 24 hours", hi: "अगले 24 घंटे" },
  cleanest: { en: "Cleanest window", hi: "सबसे साफ़ समय" },
  peak: { en: "Worst window", hi: "सबसे खराब समय" },
  source: {
    en: "Model estimate from CAMS via Open-Meteo. Check official CPCB stations for regulatory readings.",
    hi: "CAMS (Open-Meteo) से मॉडल अनुमान। आधिकारिक आँकड़ों के लिए CPCB स्टेशन देखें।",
  },
  updated: { en: "Reading for", hi: "समय" },
  useLocation: { en: "Use my location", hi: "मेरा स्थान" },
  searchCity: { en: "Search a city", hi: "शहर खोजें" },
  tabs: {
    today: { en: "Today", hi: "आज" },
    map: { en: "Map", hi: "नक्शा" },
    ask: { en: "Ask", hi: "पूछें" },
    tips: { en: "Tips", hi: "सुझाव" },
    impact: { en: "Impact", hi: "प्रभाव" },
    community: { en: "Community", hi: "समुदाय" },
    profile: { en: "Profile", hi: "प्रोफ़ाइल" },
  },
  didThis: { en: "I did this", hi: "मैंने किया" },
  done: { en: "Done", hi: "हो गया" },
  you: { en: "For you", hi: "आपके लिए" },
  neighbourhood: { en: "For your neighbourhood", hi: "आपके मोहल्ले के लिए" },
  disclaimer: {
    en: "General wellbeing guidance, not medical advice. In an emergency call 112.",
    hi: "सामान्य स्वास्थ्य मार्गदर्शन, चिकित्सा सलाह नहीं। आपात स्थिति में 112 पर कॉल करें।",
  },
};
