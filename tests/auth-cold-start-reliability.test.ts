import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  AUTH_INIT_MAX_MS,
  AUTH_INIT_SLOW_MS,
  authenticatedRoute,
  createAuthFetchGuard,
  initializationPhase,
  shouldRecoverSession,
  withPromiseTimeout,
  wouldLoopRedirect,
} from '../frontend/src/authReliability';

const initializationBoundary = readFileSync(new URL('../frontend/src/AuthInitializationBoundary.tsx', import.meta.url), 'utf8');
const continuity = readFileSync(new URL('../frontend/src/AuthSessionContinuity.tsx', import.meta.url), 'utf8');
const main = readFileSync(new URL('../frontend/src/main.tsx', import.meta.url), 'utf8');
const vite = readFileSync(new URL('../frontend/vite.config.ts', import.meta.url), 'utf8');

test('successful provider initialization releases the app immediately', () => {
  assert.equal(initializationPhase(true, 0), 'ready');
  assert.equal(initializationPhase(true, AUTH_INIT_MAX_MS * 2), 'ready');
});

test('slow initialization becomes informative before the hard timeout', () => {
  assert.equal(initializationPhase(false, 0), 'loading');
  assert.equal(initializationPhase(false, AUTH_INIT_SLOW_MS), 'slow');
  assert.equal(initializationPhase(false, AUTH_INIT_MAX_MS - 1), 'slow');
  assert.match(initializationBoundary, /Secure sign-in is taking longer than expected\./);
});

test('permanent initialization failure reaches actionable recovery instead of an endless spinner', () => {
  assert.equal(initializationPhase(false, AUTH_INIT_MAX_MS), 'timeout');
  assert.match(initializationBoundary, /Reference: LK-AUTH-INIT/);
  assert.match(initializationBoundary, />Retry</);
  assert.match(initializationBoundary, />Reload</);
  assert.match(main, /<AuthInitializationBoundary>/);
});

test('promise timeout is bounded and exposes a stable diagnostic code', async () => {
  await assert.rejects(
    withPromiseTimeout(
      'test_stage',
      new Promise<never>(() => undefined),
      10,
      'test_timeout',
      'LK-AUTH-TEST',
      'Test timed out.',
    ),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'test_timeout');
      assert.equal((error as { reference?: string }).reference, 'LK-AUTH-TEST');
      return true;
    },
  );
});

test('authenticated entry routes preserve dashboard or onboarding routing', () => {
  assert.equal(authenticatedRoute(2), '/dashboard');
  assert.equal(authenticatedRoute(0), '/onboarding');
  assert.equal(shouldRecoverSession(true, true, '/signup'), true);
});

test('signed-out signup is released to the normal signup UI after initialization', () => {
  assert.equal(shouldRecoverSession(true, false, '/signup'), false);
  assert.equal(shouldRecoverSession(false, false, '/signup'), false);
});

test('session bridging is single-flight so Strict Mode duplicate effects make one bridge request', async () => {
  const originalWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = { location: { origin: 'https://app.linkary.xyz' } };
  let calls = 0;
  const baseFetch = (async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 15));
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const guarded = createAuthFetchGuard(baseFetch as typeof window.fetch);

  try {
    const [first, second] = await Promise.all([
      guarded('https://app.linkary.xyz/api/auth/cdp/session', { method: 'POST', body: '{}' }),
      guarded('https://app.linkary.xyz/api/auth/cdp/session', { method: 'POST', body: '{}' }),
    ]);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(calls, 1);
  } finally {
    (globalThis as { window?: unknown }).window = originalWindow;
  }
});

test('repeated and reverse auth redirects are blocked inside the loop window', () => {
  const previous = { from: '/signup', to: '/dashboard', at: 1_000 };
  assert.equal(wouldLoopRedirect(previous, '/signup', '/dashboard', 2_000), true);
  assert.equal(wouldLoopRedirect(previous, '/dashboard', '/signup', 2_000), true);
  assert.equal(wouldLoopRedirect(previous, '/onboarding', '/dashboard', 2_000), false);
  assert.equal(wouldLoopRedirect(previous, '/signup', '/dashboard', 20_000), false);
});

test('auth recovery has a bounded maximum, reload and safe account-switch recovery', () => {
  assert.match(continuity, /AUTH_RECOVERY_MAX_MS/);
  assert.match(continuity, /onReload=\{\(\) => window\.location\.reload\(\)\}/);
  assert.match(continuity, /Use a different account/);
  assert.match(continuity, /activeRecovery/);
});

test('structured auth diagnostics never include token or cookie values', () => {
  const reliability = readFileSync(new URL('../frontend/src/authReliability.ts', import.meta.url), 'utf8');
  assert.match(reliability, /event: 'auth_stage'/);
  assert.match(reliability, /stage: 'auth_me'/);
  assert.match(reliability, /stage: 'session_bridge'/);
  assert.match(reliability, /stage: 'onboarding_status'/);
  assert.match(continuity, /'token_retrieval'/);
  assert.doesNotMatch(reliability, /console\.(?:info|log)\([^\n]*(?:accessToken|cookie)/);
});

test('production app assets use the real Vite bundle prefix rather than legacy /app/assets', () => {
  assert.match(vite, /base: '\/assets\/linkary-app\/'/);
  assert.doesNotMatch(vite, /base: '\/app\/'/);
});
