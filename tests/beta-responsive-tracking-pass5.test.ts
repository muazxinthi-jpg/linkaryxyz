import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const trackingCss = readFileSync(new URL('../frontend/src/tracking-assignment.css', import.meta.url), 'utf8');
const trackingView = readFileSync(new URL('../frontend/src/TrackingExperience.tsx', import.meta.url), 'utf8');

function squash(value: string) {
  return value.replace(/\s+/g, '');
}

const css = squash(trackingCss);
const view = squash(trackingView);

test('tracking tabs and tracking-link actions keep practical phone targets', () => {
  assert.equal(css.includes('.tracking-v2.ops-tabsbutton{flex:00auto;min-height:44px;'), true);
  assert.equal(css.includes('.tracking-v2.ops-link-urlbutton{min-width:64px;min-height:44px;'), true);
  assert.equal(css.includes('.tracking-v2.ops-link-footerbutton{width:100%;min-height:44px;'), true);
});

test('tracking-link cards fail safe for long links and compact phone widths', () => {
  assert.equal(css.includes('.tracking-v2.ops-link-url{grid-template-columns:minmax(0,1fr);gap:8px;border:0;overflow:visible;'), true);
  assert.equal(css.includes('.tracking-v2.ops-link-destinationa{white-space:normal;overflow:visible;text-overflow:clip;word-break:break-word;'), true);
  assert.equal(css.includes('.tracking-v2.ops-link-footer,.tracking-v2.ops-link-footer>div{align-items:stretch;flex-direction:column;width:100%;'), true);
});

test('outcome filters collapse without the legacy two-column search span', () => {
  assert.equal(css.includes('@media(max-width:600px)'), true);
  assert.equal(css.includes('.tracking-v2.ops-filters{display:grid;grid-template-columns:minmax(0,1fr);'), true);
  assert.equal(css.includes('.tracking-v2.ops-filtersinput{grid-column:auto;'), true);
  assert.equal(css.includes('.tracking-v2.ops-filtersinput,.tracking-v2.ops-filtersselect,.tracking-v2.ops-filters.ops-button{width:100%;min-height:44px;box-sizing:border-box;'), true);
});

test('outcome ledger becomes readable cards instead of a 720px phone table', () => {
  assert.equal(css.includes('.tracking-v2.ops-outcome-header{display:none;'), true);
  assert.equal(css.includes('.tracking-v2.ops-outcome-tablearticle{min-width:0;display:grid;grid-template-columns:minmax(0,1fr)minmax(0,1fr);'), true);
  assert.equal(css.includes("content:'VALUE';"), true);
  assert.equal(css.includes("content:'DATE';"), true);
  assert.equal(css.includes('@media(max-width:360px)'), true);
  assert.equal(css.includes('.tracking-v2.ops-outcome-tablearticle{grid-template-columns:minmax(0,1fr);'), true);
});

test('tracking activity and outcome modals stay inside the phone viewport', () => {
  assert.equal(css.includes('.tracking-assignment-modal,.tracking-v2.ops-modal{width:calc(100vw-16px);max-height:calc(100dvh-16px);border-radius:16px;'), true);
  assert.equal(css.includes('.tracking-v2.ops-modal-headbutton{width:44px;height:44px;flex-basis:44px;'), true);
  assert.equal(css.includes('.tracking-v2.ops-modal.ops-form-actions.ops-button'), true);
  assert.equal(css.includes('.tracking-v2.ops-modalinput,.tracking-v2.ops-modalselect,.tracking-v2.ops-modaltextarea'), true);
});

test('tracking evidence semantics remain explicit and unchanged by the UI pass', () => {
  assert.equal(view.includes('className="ops-stacktracking-v2"'), true);
  assert.equal(view.includes('<optionvalue="manual">Manual</option>'), true);
  assert.equal(view.includes('<optionvalue="linkary_tracked">Linkarytracked</option>'), true);
  assert.equal(view.includes('<optionvalue="telegram_verified">Telegramverified</option>'), true);
  assert.equal(view.includes('<optionvalue="provider_verified">Providerverified</option>'), true);
  assert.equal(view.includes('Everyoutcomekeepsitsevidencesourceandconfidencelevel.'), true);
});
