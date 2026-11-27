// Barrel re-export for single-responsibility companion domain modules.
export { DEFAULT_PROFILE, budgetMaxCost, extractProfile, isSensitive } from "./companion/profile";
export type { Profile, ProfilePatch } from "./companion/profile";
export { safetyCheck } from "./companion/safety";
export type { ChatMsg } from "./companion/safety";
export { AQI_SEVERITY, buildDailyGuidance, buildPlan, rankedTips } from "./companion/planning";
export type { DailyGuidance, GuidanceIcon, GuidanceTip, PlanItem } from "./companion/planning";
export { SUGGESTIONS, respond } from "./companion/offline-assistant";
