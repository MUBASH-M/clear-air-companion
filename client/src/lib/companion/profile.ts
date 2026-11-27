/**
 * Household profile types, sensitivity detection, and conversational profile extraction.
 * Privacy note: Household attributes stay in browser session memory unless explicitly
 * shared by the user during an active AI assistant query.
 */

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

export type ProfilePatch = Partial<Profile>;

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

/**
 * Returns true if the household includes any clinically higher-sensitivity group
 * (children, older adults 60+, pregnancy, or asthma/COPD/heart conditions).
 */
export function isSensitive(p: Profile): boolean {
  return p.children || p.olderAdult || p.pregnant || p.condition;
}

/** Maps a household budget preference to the maximum tip cost tier (0–3). */
export function budgetMaxCost(b: Profile["budget"]): number {
  return b === "tight" ? 1 : b === "some" ? 2 : 3;
}

const hasAny = (s: string, words: string[]) => words.some((w) => s.includes(w));

/**
 * Extracts explicit household context signals from a user message so the daily plan
 * can adapt immediately. Never infers medical diagnoses beyond user-stated flags.
 */
export function extractProfile(text: string): ProfilePatch {
  const s = text.toLowerCase();
  const patch: ProfilePatch = {};
  if (hasAny(s, ["my child", "my kid", "my son", "my daughter", "children", "kids", "बच्चा", "बच्चे", "बेटा", "बेटी"])) {
    patch.children = true;
  }
  if (hasAny(s, ["asthma", "copd", "heart condition", "heart problem", "bronchitis", "दमा", "अस्थमा", "हृदय"])) {
    patch.condition = true;
  }
  if (hasAny(s, ["pregnant", "expecting", "गर्भवती"])) {
    patch.pregnant = true;
  }
  if (hasAny(s, ["grandparent", "grandmother", "grandfather", "elderly", "my mother", "my father", "older parent", "बुज़ुर्ग", "दादी", "दादा", "नानी", "नाना"])) {
    patch.olderAdult = true;
  }
  if (hasAny(s, ["wood", "chulha", "dung", "uple", "लकड़ी", "चूल्हा", "उपले"])) {
    patch.fuel = "wood";
  }
  if (hasAny(s, ["kerosene", "मिट्टी का तेल"])) {
    patch.fuel = "kerosene";
  }
  if (hasAny(s, ["scooter", "bike to work", "motorbike", "two-wheeler", "two wheeler", "स्कूटर"])) {
    patch.commute = "two_wheeler";
  }
  if (hasAny(s, ["i drive", "by car", "my car", "कार से"])) {
    patch.commute = "car";
  }
  if (hasAny(s, ["by metro", "take the metro", "मेट्रो से"])) {
    patch.commute = "metro";
  }
  return patch;
}
