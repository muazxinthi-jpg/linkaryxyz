import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { probeAiProvider } from '../src/ai/LinkaryAI';

const adminRoute = readFileSync(new URL('../src/routes/adminAiGovernance.ts', import.meta.url), 'utf8');
const appRouter = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const adminUi = readFileSync(new URL('../frontend/src/AdminAiGovernanceExperience.tsx', import.meta.url), 'utf8');
const adapter = readFileSync(new URL('../src/ai/LinkaryAI.ts', import.meta.url), 'utf8');

test('Workers AI probe preserves Cloudflare free-allocation diagnostics without exposing credentials', async () => {
  const providerError = Object.assign(new Error('AiError 3036: daily allocation reached'), { code: 3036, status: 429 });
  const result = await probeAiProvider({
    AI: { run: async () => { throw providerError; } },
  } as any, { provider: 'workers_ai', model: '@cf/google/gemma-4-26b-a4b-it' });

  assert.equal(result.healthy, false);
  assert.equal(result.provider, 'workers_ai');
  assert.equal(result.providerStatus, 429);
  assert.equal(result.providerCode, '3036');
  assert.match(result.hint || '', /10,000-Neuron allowance resets at 00:00 UTC/);
});

test('Workers AI probe distinguishes temporary capacity pressure', async () => {
  const providerError = Object.assign(new Error('3040 out of capacity'), { code: 3040, status: 429 });
  const result = await probeAiProvider({
    AI: { run: async () => { throw providerError; } },
  } as any, { provider: 'workers_ai', model: '@cf/google/gemma-4-26b-a4b-it' });

  assert.equal(result.healthy, false);
  assert.equal(result.providerCode, '3040');
  assert.match(result.hint || '', /temporary model capacity pressure/);
});

test('OpenRouter probe reports HTTP rate limiting safely', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 429, message: 'rate limited' } }), {
    status: 429,
    headers: { 'content-type': 'application/json' },
  });
  try {
    const result = await probeAiProvider({ OPENROUTER_API_KEY: 'server-secret' } as any, {
      provider: 'openrouter',
      model: 'openrouter/free',
    });
    assert.equal(result.healthy, false);
    assert.equal(result.providerStatus, 429);
    assert.equal(result.providerCode, '429');
    assert.match(result.hint || '', /free-model rate limits/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Superadmin provider probe is CSRF protected and follows the active governed provider chain', () => {
  assert.match(adminRoute, /request\.method === 'PATCH' && url\.searchParams\.get\('action'\) === 'probe'/);
  assert.match(adminRoute, /await verifyCsrf\(request, env, auth\)/);
  assert.match(adminRoute, /loadAiRuntimeGovernance\(db, env\)/);
  assert.match(adminRoute, /probeAiProvider\(env, provider\)/);
  assert.doesNotMatch(adminRoute, /OPENROUTER_API_KEY|GEMINI_API_KEY|GROQ_API_KEY/);
});

test('health probe uses a method accepted by the top-level API router', () => {
  assert.match(appRouter, /\/api\/admin\/ai-governance'[\s\S]*request\.method !== 'GET' && request\.method !== 'PATCH'/);
  assert.match(adminUi, /method: 'PATCH'/);
  assert.match(adminUi, /\/api\/admin\/ai-governance\?action=probe/);
  assert.doesNotMatch(adminUi, /api<ProbeResponse>\(\{ method: 'POST'/);
});

test('Superadmin clearly presents automatic routing and keeps manual model entry advanced-only', () => {
  assert.match(adminUi, /AUTOMATIC ROUTING ACTIVE/);
  assert.match(adminUi, /No manual model selection is required/);
  assert.match(adminUi, /Test active providers/);
  assert.match(adminUi, /Provider health test complete/);
  assert.match(adminUi, /admin-ai-provider-status/);
  assert.match(adminUi, /Advanced: pin or override a model/);
  assert.match(adminUi, /openrouter\/free/);
  assert.match(adapter, /providerErrorMeta\(error\)/);
});
