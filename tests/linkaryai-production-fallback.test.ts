import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { errorResponse } from '../src/http';
import { LinkaryAI, LinkaryAiProviderError } from '../src/ai/LinkaryAI';

const wrangler = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const devVars = readFileSync(new URL('../.dev.vars.example', import.meta.url), 'utf8');

test('production OpenRouter fallback defaults to the official free-model router', () => {
  assert.match(wrangler, /"AI_OPENROUTER_MODEL"\s*:\s*"openrouter\/free"/);
  assert.match(devVars, /AI_OPENROUTER_MODEL=openrouter\/free/);
  assert.doesNotMatch(wrangler, /OPENROUTER_API_KEY/);
});

test('OpenRouter free fallback is used automatically when Workers AI is unavailable', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; model: string | null }> = [];
  globalThis.fetch = async (input, init) => {
    const payload = JSON.parse(String(init?.body || '{}')) as { model?: string };
    requests.push({ url: String(input), model: payload.model || null });
    return new Response(JSON.stringify({
      choices: [{ message: { content: 'free fallback ok' } }],
      usage: { prompt_tokens: 5, completion_tokens: 3 },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const ai = new LinkaryAI({
      AI: { run: async () => { throw new Error('Workers AI unavailable'); } },
      OPENROUTER_API_KEY: 'server-secret',
      AI_OPENROUTER_MODEL: 'openrouter/free',
    } as any);
    const result = await ai.generate({ system: 'system', user: 'user', maxOutputTokens: 40 });
    assert.equal(result.provider, 'openrouter');
    assert.equal(result.model, 'openrouter/free');
    assert.equal(result.text, 'free fallback ok');
    assert.deepEqual(requests, [{ url: 'https://openrouter.ai/api/v1/chat/completions', model: 'openrouter/free' }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('provider exhaustion returns a safe retryable 503 instead of a generic unexpected 500', async () => {
  const error = new LinkaryAiProviderError('workers_ai', 429);
  assert.equal(error.status, 503);
  assert.equal(error.providerStatus, 429);
  assert.equal(error.code, 'ai_provider_unavailable');

  const response = errorResponse(error);
  assert.equal(response.status, 503);
  const body = await response.json() as { error: string; message: string };
  assert.equal(body.error, 'service_unavailable');
  assert.equal(body.message, 'LinkaryAI is temporarily unavailable. Please try again shortly.');
});
