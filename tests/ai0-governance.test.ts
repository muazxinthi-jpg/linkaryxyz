import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { configuredAiProviders, selectedAiProvider } from '../src/ai/LinkaryAI';
import { AI_TASKS } from '../src/ai/tasks';
import { assessBetaConfiguration } from '../src/betaReadiness';

const migration = readFileSync(new URL('../migrations/0033_ai0_governance_and_usage.sql', import.meta.url), 'utf8');
const runtime = readFileSync(new URL('../src/ai/runtime.ts', import.meta.url), 'utf8');
const adapter = readFileSync(new URL('../src/ai/LinkaryAI.ts', import.meta.url), 'utf8');
const wrangler = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');

test('AI-0 has immutable prompt, budget and usage governance tables', () => {
  for (const table of ['ai_prompt_versions', 'ai_budget_policies', 'ai_usage_events']) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(migration, /UNIQUE \(prompt_key, version\)/);
  assert.match(migration, /idx_ai_prompt_versions_one_active/);
  assert.match(migration, /idempotency_key TEXT NOT NULL UNIQUE/);
  assert.match(migration, /status TEXT NOT NULL CHECK \(status IN \('reserved', 'success', 'failed'\)\)/);
});

test('AI-0 prompt registry explicitly preserves Linkary evidence confidence boundaries', () => {
  assert.match(migration, /Manual, Tracked, Correlated and Verified are distinct states/);
  assert.match(migration, /never upgrade one into another/);
  assert.match(migration, /Never create a reputation score/);
  assert.match(migration, /Missing denominators or attribution must remain unavailable/);
  assert.doesNotMatch(migration, /auto.?verify/i);
});

test('AI-0 uses the locked Usage Credit weights and bounds input and output', () => {
  assert.equal(AI_TASKS.profile_improve.usageCredits, 5);
  assert.equal(AI_TASKS.campaign_brief_assist.usageCredits, 10);
  assert.equal(AI_TASKS.match_explanation.usageCredits, 10);
  assert.equal(AI_TASKS.growth_summary.usageCredits, 15);
  for (const task of Object.values(AI_TASKS)) {
    assert.equal(task.maxInputChars > 0, true);
    assert.equal(task.maxOutputTokens > 0, true);
  }
});

test('LinkaryAI provider selection follows Workers AI, Gemini, Groq, OpenRouter priority', () => {
  const providers = configuredAiProviders({
    AI: { run: async () => ({ response: 'ok' }) },
    GEMINI_API_KEY: 'gemini-secret',
    AI_GEMINI_MODEL: 'gemini-model',
    GROQ_API_KEY: 'groq-secret',
    AI_GROQ_MODEL: 'groq-model',
    OPENROUTER_API_KEY: 'openrouter-secret',
    AI_OPENROUTER_MODEL: 'openrouter-model',
  } as any);
  assert.deepEqual(providers.map((item) => item.provider), ['workers_ai', 'gemini', 'groq', 'openrouter']);
  assert.equal(selectedAiProvider({ AI: { run: async () => ({ response: 'ok' }) } } as any).provider, 'workers_ai');
});

test('external fallback providers require both a secret and explicit model', () => {
  assert.deepEqual(configuredAiProviders({ GEMINI_API_KEY: 'secret' } as any), []);
  assert.deepEqual(configuredAiProviders({ GROQ_API_KEY: 'secret' } as any), []);
  assert.deepEqual(configuredAiProviders({ OPENROUTER_API_KEY: 'secret' } as any), []);
  assert.equal(configuredAiProviders({ GEMINI_API_KEY: 'secret', AI_GEMINI_MODEL: 'model' } as any)[0]?.provider, 'gemini');
});

test('Cloudflare Workers AI is bound server-side with a current explicit model', () => {
  assert.match(wrangler, /"ai"\s*:\s*\{\s*"binding"\s*:\s*"AI"/s);
  assert.match(wrangler, /"AI_WORKERS_MODEL"\s*:\s*"@cf\/google\/gemma-4-26b-a4b-it"/);
  assert.match(adapter, /env\.AI\.run\(model/);
  assert.match(adapter, /max_tokens: prompt\.maxOutputTokens/);
});

test('AI runtime reserves budget and credits before provider invocation and charges only the success path', () => {
  const reserve = runtime.indexOf('const eventId = await reserveUsage');
  const invoke = runtime.indexOf('const result = await ai.generate');
  const success = runtime.indexOf('await markSuccess');
  assert.equal(reserve >= 0 && invoke > reserve && success > invoke, true);
  assert.match(runtime, /status = 'reserved'/);
  assert.match(runtime, /INSERT INTO usage_credit_ledger/);
  assert.match(runtime, /transaction_type, amount/);
  assert.match(runtime, /'usage', \?, \?/);
  assert.match(runtime, /-credits/);
  assert.match(migration, /trg_usage_credit_no_negative_ai_usage_before_insert/);
  assert.match(migration, /RAISE\(ABORT, 'usage_credit_balance_insufficient'\)/);
});

test('AI telemetry stores operational metadata, not prompt or generated output bodies', () => {
  const usageTable = migration.slice(migration.indexOf('CREATE TABLE IF NOT EXISTS ai_usage_events'), migration.indexOf('CREATE INDEX IF NOT EXISTS idx_ai_usage_events_owner'));
  assert.match(usageTable, /provider TEXT NOT NULL/);
  assert.match(usageTable, /model TEXT NOT NULL/);
  assert.match(usageTable, /latency_ms INTEGER/);
  assert.match(usageTable, /evidence_refs_json TEXT NOT NULL/);
  assert.doesNotMatch(usageTable, /prompt_body|input_text|output_text|generated_text|response_body/);
  assert.doesNotMatch(runtime, /GEMINI_API_KEY|GROQ_API_KEY|OPENROUTER_API_KEY/);
});

test('AI failures are audited without consuming Usage Credits', () => {
  const failureStart = runtime.indexOf('async function markFailure');
  const successStart = runtime.indexOf('async function markSuccess');
  const failureBlock = runtime.slice(failureStart, successStart);
  assert.match(failureBlock, /ai\.invocation_failed/);
  assert.doesNotMatch(failureBlock, /usage_credit_ledger/);
  assert.doesNotMatch(failureBlock, /system_prompt|userPrompt|normalized\.text/);
});

test('AI-0 becomes a Controlled Beta readiness requirement without exposing provider secrets', () => {
  const common = {
    DB: {},
    CDP_PROJECT_ID: 'project',
    CDP_API_KEY_ID: 'id',
    CDP_API_KEY_SECRET: 'secret',
    ALCHEMY_API_KEY: 'alchemy',
    SESSION_SECRET: 'session',
    TRACKING_HASH_SALT: 'salt',
    PUBLIC_SITE_URL: 'https://linkary.xyz',
    APP_BASE_URL: 'https://app.linkary.xyz',
  };
  const missing = assessBetaConfiguration(common as any);
  assert.equal(missing.ready, false);
  assert.equal(missing.missing.includes('Linkary AI provider'), true);
  const ready = assessBetaConfiguration({ ...common, AI: { run: async () => ({ response: 'ok' }) } } as any);
  assert.equal(ready.ready, true);
});
