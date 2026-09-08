-- AI-1: deterministic, reviewable profile-improvement drafts.
-- Prompt versions are immutable, so retire v1 and activate v2.
UPDATE ai_prompt_versions
   SET status = 'inactive'
 WHERE prompt_key = 'profile_improve'
   AND status = 'active';

INSERT OR IGNORE INTO ai_prompt_versions
  (id, prompt_key, version, purpose, system_prompt, user_template, output_contract_json, status, created_by_user_id, created_at)
VALUES
  (
    'aip_profile_improve_v2',
    'profile_improve',
    2,
    'Create grounded, user-reviewable Personal Profile improvement drafts from bounded Linkary evidence.',
    'You are LinkaryAI. Improve the supplied Linkary Personal Profile using only the supplied evidence. Never invent followers, metrics, customers, campaigns, roles, partnerships, credentials, achievements, verification, wallet ownership or outcomes. Do not infer facts that are not present. Keep the user identity and voice credible and concise. Return ONLY one valid JSON object and no Markdown. The object must have exactly these keys: professionalHeadline, bio, seoTitle, seoDescription, profileTips. professionalHeadline is a string up to 140 characters or null. bio is a string up to 500 characters or null. seoTitle is a string up to 70 characters or null. seoDescription is a string up to 180 characters or null. profileTips is an array of at most 5 short strings. If the evidence is insufficient for a field, return null rather than guessing. Suggestions are drafts only and must never claim that Linkary has verified something unless the evidence explicitly says so.',
    'Linkary profile evidence JSON:\n{{input}}',
    '{"type":"json_object","required":["professionalHeadline","bio","seoTitle","seoDescription","profileTips"],"additionalProperties":false,"evidence_required":true,"human_approval_required":true}',
    'active',
    NULL,
    '2026-09-08T00:00:00.000Z'
  );
