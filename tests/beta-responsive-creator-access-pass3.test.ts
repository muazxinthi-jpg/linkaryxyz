import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const creatorAccess = readFileSync(new URL('../frontend/src/creator-access.css', import.meta.url), 'utf8');

function squash(value: string) {
  return value.replace(/\s+/g, '');
}

const css = squash(creatorAccess);

test('Creator Earn Access and review surfaces fail safe against long content', () => {
  assert.equal(css.includes('.signup-gateway,.role-grid-real.compact,.creator-entry-card,.invite-code-card,'), true);
  assert.equal(css.includes('.claim-introh1,.claim-introp,.claim-card-top,.claim-copy-cardpre,'), true);
  assert.equal(css.includes('overflow-wrap:anywhere;word-break:break-word;'), true);
  assert.equal(css.includes('.claim-copy-cardpre,.review-mainpre{max-width:100%;box-sizing:border-box;overflow-x:hidden;'), true);
});

test('Creator Earn Access phone actions keep practical 44px targets', () => {
  assert.equal(css.includes('@media(max-width:640px)'), true);
  for (const selector of [
    '.creator-entry-cardbutton',
    '.invite-code-cardbutton',
    '.claim-actions>*',
    '.claim-status-cardbutton',
    '.claim-status-cardinput',
  ]) {
    assert.equal(css.includes(selector), true, `${selector} should be covered`);
  }
  assert.equal(css.includes('min-height:44px;box-sizing:border-box;'), true);
});

test('Superadmin creator-review actions remain usable on phones', () => {
  for (const selector of [
    '.review-main>a',
    '.review-actionsbutton',
    '.admin-headingbutton',
    '.verification-modebutton',
  ]) {
    assert.equal(css.includes(selector), true, `${selector} should be covered`);
  }
  assert.equal(css.includes('.review-actionsbutton{width:100%;'), true);
});

test('Creator claim shell and form controls cannot exceed a phone viewport', () => {
  assert.equal(css.includes('.claim-shell{width:100%;box-sizing:border-box;padding-left:14px;padding-right:14px;'), true);
  assert.equal(css.includes('.claim-status-cardinput,.review-actionstextarea{width:100%;max-width:100%;box-sizing:border-box;'), true);
});

test('Creator claim typography scales down for 430px and 340px phones', () => {
  assert.equal(css.includes('@media(max-width:430px)'), true);
  assert.equal(css.includes('.claim-introh1{font-size:36px;line-height:1;letter-spacing:-.04em;'), true);
  assert.equal(css.includes('.admin-headingh1{font-size:34px;line-height:1.02;'), true);
  assert.equal(css.includes('@media(max-width:340px)'), true);
  assert.equal(css.includes('.claim-introh1{font-size:32px;'), true);
});

test('verification mode and review cards stack safely on narrow phones', () => {
  assert.equal(css.includes('.verification-mode{align-items:stretch;'), true);
  assert.equal(css.includes('.verification-mode>div:first-child{flex:11100%;margin-right:0;'), true);
  assert.equal(css.includes('.verification-modebutton,.mode-pill{flex:11120px;'), true);
  assert.equal(css.includes('.claim-copy-card,.claim-status-card,.review-card,.verification-mode{padding:14px;border-radius:14px;'), true);
});
