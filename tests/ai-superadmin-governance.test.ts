import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { LinkaryAI } from '../src/ai/LinkaryAI';

const migration = readFileSync(new URL('../migrations/0050_ai_superadmin_runtime_governance.sql', import.meta.url), 'utf8');
const governance = readFileSync(new URL('../src/ai/governance.ts', import.meta.url), 'utf8');
const runtime = readFileSync(new URL('../src/ai/runtime.ts', import.meta.url), 'utf8');
const adminRoute = readFileSync(new URL('../src/routes/adminAiGovernance.ts', import.meta.url), 'utf8');
const index = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const superadminApp = readFileSync(new URL('../frontend/src/SuperadminApp.tsx', import.meta.url), 'utf8');
const superadminWorkspace = readFileSync(new URL('../frontend/src/SuperadminWorkspace.tsx', import.meta.url), 'utf8');
const adminUi = readFileSync(new URL('../frontend/src/AdminAiGovernanceExperience.tsx', import.meta.url), 'utf8');

test('AI runtime governance stores a master switch and provider/model allowlist without secret fields', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS ai_runtime_settings/);
  assert.match(migration, /ai_enabled INTEGER NOT NULL DEFAULT 1 CHECK \(ai_enabled IN \(0, 1\)\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS ai_provider_model_policies/);
  assert.match(migration, /provider IN \('workers_ai', 'gemini', 'groq', 'openrouter'\)/);
  assert.match(migration, /UNIQUE \(provider, model\)/);
  assert.doesNotMatch(migration, /\b(api_key|api_secret|access_token|secret_value)\s+TEXT/i);
});

test('AI master switch is enforced before credit entitlement or usage reservation', () => {
  const governanceLoad = runtime.indexOf('const governance = await loadAiRuntimeGovernance');
  const disabled = runtime.indexOf("'ai_globally_disabled'");
  const couponCredits = runtime.indexOf('await ensureCouponEntitlementMonthlyCredits');
  const reserve = runtime.indexOf('const eventId = await reserveUsage');
  const invoke = runtime.indexOf('const result = await ai.generate');
  assert.equal(governanceLoad >= 0 && disabled > governanceLoad && couponCredits > disabled && reserve > couponCredits && invoke > reserve, true);
  assert.match(runtime, /new LinkaryAI\(env, governance\.providers\)/);
});

test('explicit provider/model policy becomes the runtime authority while empty policy preserves current provider defaults', () => {
  assert.match(governance, /const explicitModelPolicy = policies\.length > 0/);
  assert.match(governance, /: configuredAiProviders\(env\)/);
  assert.match(governance, /row\.is_active === 1 && isAiProviderConfigured\(env, row\.provider\)/);
  assert.match(governance, /ORDER BY priority ASC, provider ASC, model ASC/);
});

test('LinkaryAI can be restricted to the governed model chain', async () => {
  const originalFetch = globalThis.fetch;
  let workersCalls = 0;
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: 'governed response' } }],
    usage: { prompt_tokens: 3, completion_tokens: 2 },
  }), { status: 200, headers: { 'content-type': 'application/json' } });

  try {
    const ai = new LinkaryAI({
      AI: { run: async () => { workersCalls += 1; return { response: 'workers response' }; } },
      OPENROUTER_API_KEY: 'server-secret',
    } as any, [{ provider: 'openrouter', model: 'governed/model' }]);
    assert.deepEqual(ai.provider(), { provider: 'openrouter', model: 'governed/model' });
    const result = await ai.generate({ system: 'system', user: 'user', maxOutputTokens: 30 });
    assert.equal(result.provider, 'openrouter');
    assert.equal(result.model, 'governed/model');
    assert.equal(result.text, 'governed response');
    assert.equal(workersCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('AI governance endpoint is Superadmin-only, CSRF-protected on writes and audited', () => {
  assert.match(index, /path === '\/api\/admin\/ai-governance'/);
  assert.match(index, /adminAiGovernance\(request, env\)/);
  assert.match(adminRoute, /requireSuperadmin\(request, env\)/);
  assert.match(adminRoute, /await verifyCsrf\(request, env, auth\)/);
  assert.match(adminRoute, /'ai\.governance\.updated'/);
  assert.match(adminRoute, /actor_kind, action/);
  assert.doesNotMatch(adminRoute, /GEMINI_API_KEY|GROQ_API_KEY|OPENROUTER_API_KEY|CDP_API_KEY_SECRET/);
});

test('Superadmin console exposes master AI and model controls without a secret input', () => {
  assert.match(superadminApp, /\/admin\/ai-governance/);
  assert.match(superadminWorkspace, /AI governance/);
  assert.match(adminUi, /MASTER SWITCH/);
  assert.match(adminUi, /MODEL ALLOWLIST/);
  assert.match(adminUi, /Save AI governance/);
  assert.match(adminUi, /Secrets stay in Cloudflare/);
  assert.doesNotMatch(adminUi, /type=["']password["']/i);
});
