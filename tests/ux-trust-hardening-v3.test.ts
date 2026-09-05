import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const guard = readFileSync(new URL('../frontend/src/UiSafetyGuard.tsx', import.meta.url), 'utf8');
const staticServer = readFileSync(new URL('../src/static.ts', import.meta.url), 'utf8');

test('all rendered ops modals receive baseline dialog semantics', () => {
  assert.equal(guard.includes("const modalSelector = '.ops-modal'"), true);
  assert.equal(guard.includes("modal.setAttribute('role', 'dialog')"), true);
  assert.equal(guard.includes("modal.setAttribute('aria-modal', 'true')"), true);
  assert.equal(guard.includes("modal.setAttribute('aria-labelledby', heading.id)"), true);
  assert.equal(guard.includes("closeButton.setAttribute('aria-label', 'Close dialog')"), true);
});

test('modal keyboard behavior contains focus, supports Escape and restores the opener', () => {
  assert.equal(guard.includes("if (event.key === 'Escape')"), true);
  assert.equal(guard.includes("if (event.key !== 'Tab') return"), true);
  assert.equal(guard.includes('event.shiftKey'), true);
  assert.equal(guard.includes('first.focus()'), true);
  assert.equal(guard.includes('last.focus()'), true);
  assert.equal(guard.includes('returnFocus.focus({ preventScroll: true })'), true);
  assert.equal(guard.includes("document.addEventListener('keydown', onKeyDown)"), true);
  assert.equal(guard.includes("document.removeEventListener('keydown', onKeyDown)"), true);
});

test('public production preview labels static dashboard metrics and fictional profiles as illustrative', () => {
  assert.equal(staticServer.includes('Illustrative product preview · Example data, not live customer results.'), true);
  assert.equal(staticServer.includes('Example data</i>'), true);
  assert.equal(staticServer.includes('Illustrative product preview</em>'), true);
  assert.equal(staticServer.includes('Example creator</span>'), true);
  assert.match(staticServer, /replace\(\/<i class="status live">● Live data/);
  assert.match(staticServer, /replace\(\/<em>Updated 2m ago/);
  assert.equal(staticServer.includes(".replace('<span class=\"status complete\">✓ Verified creator</span>', '<span class=\"status complete\">Example creator</span>')"), true);
});

test('production public footer rewrites dead prototype links to existing destinations', () => {
  assert.equal(staticServer.includes('<a href="#workflow">Campaigns</a><a href="#roles">Creators</a><a href="#attribution">Attribution</a>'), true);
  assert.equal(staticServer.includes('<a href="#roles">About</a><a href="#faq">FAQ</a>'), true);
  assert.equal(staticServer.includes('<a href="#workflow">How it works</a><a href="#faq">Help & questions</a>'), true);
  assert.equal(staticServer.includes('<section class="attribution matrix-light" id="attribution">'), true);
});

test('trust hardening does not fabricate a privacy policy or support address', () => {
  assert.equal(staticServer.includes('support@linkary.xyz'), false);
  assert.equal(staticServer.includes('privacy@linkary.xyz'), false);
  assert.equal(staticServer.includes('We collect'), false);
  assert.equal(staticServer.includes('data retention'), false);
});
