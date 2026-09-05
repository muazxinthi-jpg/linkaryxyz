import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const boundary = readFileSync(new URL('../frontend/src/OnboardingCompletionBoundary.tsx', import.meta.url), 'utf8');
const main = readFileSync(new URL('../frontend/src/main.tsx', import.meta.url), 'utf8');
const appV3 = readFileSync(new URL('../frontend/src/AppV3.tsx', import.meta.url), 'utf8');

test('onboarding completion boundary is installed inside the authenticated router', () => {
  assert.equal(main.includes("import OnboardingCompletionBoundary from './OnboardingCompletionBoundary';"), true);
  assert.equal(main.includes('<OnboardingCompletionBoundary />'), true);
});

test('completion boundary is active only on the legacy onboarding route', () => {
  assert.equal(boundary.includes("location.pathname !== '/onboarding'"), true);
  assert.equal(boundary.includes('window.fetch = async'), true);
  assert.equal(boundary.includes('window.fetch = originalFetch;'), true);
});

test('only a successful onboarding completion POST triggers the hard dashboard transition', () => {
  assert.equal(boundary.includes("method === 'POST'"), true);
  assert.equal(boundary.includes("pathname === '/api/onboarding/complete'"), true);
  assert.equal(boundary.includes('response.ok'), true);
  assert.equal(boundary.includes("window.location.replace('/dashboard');"), true);
});

test('successful completion does not return to the legacy caller for a second inline status request', () => {
  const replaceIndex = boundary.indexOf("window.location.replace('/dashboard');");
  const pendingIndex = boundary.indexOf('new Promise<Response>');
  assert.ok(replaceIndex > 0);
  assert.ok(pendingIndex > replaceIndex);
});

test('failed onboarding POSTs are returned to the existing form error handling', () => {
  assert.equal(boundary.includes('return response;'), true);
  assert.equal(boundary.includes("pathname === '/api/onboarding/complete' && response.ok"), true);
});

test('fresh dashboard load is governed by AppV3 ProductGate with unavailable retry handling', () => {
  assert.equal(appV3.includes("location.pathname === '/dashboard' || location.pathname === '/'"), true);
  assert.equal(appV3.includes('<ProductGate experience="dashboard" />'), true);
  assert.equal(appV3.includes("if (state === 'unavailable') return <UnavailableScreen"), true);
  assert.equal(appV3.includes('setRetryKey((value) => value + 1)'), true);
});
