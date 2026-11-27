import { MapsGroundingSource, WebGroundingSource } from "../ai";
import { Lang } from "../knowledge";

/**
 * Deterministic emergency and medical-boundary safety layer.
 *
 * Architectural rule (ADR-002):
 * Emergency breathing symptoms and medication/diagnosis requests MUST be intercepted
 * deterministically on the client before any AI model call so emergency numbers
 * (112 / 108 in India) are never delayed, altered, or omitted by an LLM.
 */

export type ChatMsg = {
  role: "user" | "assistant";
  text: string;
  kind?: "safety" | "normal" | "unknown" | "error";
  tips?: string[];
  sources?: MapsGroundingSource[];
  webSources?: WebGroundingSource[];
  groundingUsed?: "maps" | "search";
};

const EMERGENCY_TRIGGERS = [
  "can't breathe",
  "cant breathe",
  "cannot breathe",
  "difficulty breathing",
  "trouble breathing",
  "struggling to breathe",
  "breathless",
  "short of breath",
  "shortness of breath",
  "chest pain",
  "chest tight",
  "lips blue",
  "blue lips",
  "fainted",
  "unconscious",
  "collapsed",
  "साँस नहीं",
  "सांस नहीं",
  "साँस लेने में तकलीफ",
  "सांस लेने में तकलीफ",
  "सीने में दर्द",
  "बेहोश",
];

const MEDICAL_BOUNDARY_TRIGGERS = [
  "diagnos",
  "prescri",
  "dose",
  "dosage",
  "which medicine",
  "what medicine",
  "inhaler dose",
  "antibiotic",
  "steroid",
  "दवा",
  "दवाई",
  "इलाज",
];

const matchesAny = (text: string, triggers: string[]) => triggers.some((w) => text.includes(w));

/**
 * Evaluates a user message for red-flag breathing emergencies or medical-advice requests.
 * Returns a fixed, clinically-aligned response when triggered, or `null` otherwise.
 */
export function safetyCheck(text: string, lang: Lang): ChatMsg | null {
  const normalized = text.toLowerCase();
  if (matchesAny(normalized, EMERGENCY_TRIGGERS)) {
    return {
      role: "assistant",
      kind: "safety",
      text:
        lang === "en"
          ? "This sounds like it could be serious. If someone is struggling to breathe, has chest pain, blue lips or has collapsed, call 112 (or 108 for an ambulance) now. If they have a reliever inhaler and an action plan from their doctor, follow it. Move them to the cleanest indoor air you have, keep them sitting upright and calm. I can't assess symptoms, so please get medical help right away."
          : "यह गंभीर हो सकता है। अगर किसी को साँस लेने में कठिनाई, सीने में दर्द, होंठ नीले हों या वह बेहोश हो, तो अभी 112 (या एम्बुलेंस के लिए 108) पर कॉल करें। अगर डॉक्टर का दिया इनहेलर और कार्य योजना है, तो उसका पालन करें। उन्हें सबसे साफ़ हवा वाले कमरे में सीधा बैठाएँ और शांत रखें। मैं लक्षणों का आकलन नहीं कर सकता, कृपया तुरंत चिकित्सा सहायता लें।",
    };
  }
  if (matchesAny(normalized, MEDICAL_BOUNDARY_TRIGGERS)) {
    return {
      role: "assistant",
      kind: "safety",
      text:
        lang === "en"
          ? "I can only share general wellbeing guidance, not diagnosis, medicines or doses. Please ask your doctor or pharmacist about treatment. I'm happy to help with ways to lower exposure at home and outdoors."
          : "मैं केवल सामान्य स्वास्थ्य संबंधी मार्गदर्शन दे सकता हूँ, निदान, दवा या खुराक नहीं। इलाज के बारे में अपने डॉक्टर या फ़ार्मासिस्ट से पूछें। घर और बाहर प्रदूषण कम करने के तरीकों में मैं मदद कर सकता हूँ।",
    };
  }
  return null;
}
