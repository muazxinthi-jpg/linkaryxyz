export const AI_TASKS = {
  profile_improve: { promptKey: 'profile_improve', usageCredits: 5, maxInputChars: 16_000, maxOutputTokens: 700 },
  campaign_brief_assist: { promptKey: 'campaign_brief_assist', usageCredits: 10, maxInputChars: 24_000, maxOutputTokens: 1_000 },
  match_explanation: { promptKey: 'match_explanation', usageCredits: 10, maxInputChars: 24_000, maxOutputTokens: 700 },
  growth_summary: { promptKey: 'growth_summary', usageCredits: 15, maxInputChars: 40_000, maxOutputTokens: 1_200 },
} as const;

export type AiTaskKey = keyof typeof AI_TASKS;

export function isAiTaskKey(value: string): value is AiTaskKey {
  return Object.prototype.hasOwnProperty.call(AI_TASKS, value);
}
