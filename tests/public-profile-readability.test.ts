import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const enhancer = readFileSync(new URL('../src/routes/publicProfileEnhancer.ts', import.meta.url), 'utf8');

test('public profile uses a much wider white desktop canvas and keeps matrix rain behind content', () => {
  assert.equal(enhancer.includes('width:min(1180px,calc(100% - 56px))!important'), true);
  assert.equal(enhancer.includes('body{background:radial-gradient'), true);
  assert.equal(enhancer.includes('#fff!important;color:#17110e!important'), true);
  assert.equal(enhancer.includes('.matrix{z-index:0!important;opacity:.28!important;mix-blend-mode:multiply!important'), true);
  assert.equal(enhancer.includes('background:rgba(255,255,255,.94)!important'), true);
});

test('hero and profile copy are dark on the white reading surface', () => {
  assert.equal(enhancer.includes('.hero h1{color:#111!important'), true);
  assert.equal(enhancer.includes('.bio{max-width:820px!important;color:#292421!important'), true);
  assert.equal(enhancer.includes('.brand{color:#17110e!important'), true);
  assert.equal(enhancer.includes('.handle{color:#7e6e67!important'), true);
});

test('Book a Call and other conversion CTAs fill the row', () => {
  assert.equal(enhancer.includes('.cta-grid,.profile-enhanced-ctas{display:grid!important;grid-template-columns:1fr!important'), true);
  assert.equal(enhancer.includes('min-height:98px!important'), true);
  assert.equal(enhancer.includes("!html.includes('class=\"cta-grid\"')"), true, 'enhancer must not duplicate a base CTA grid');
});

test('public content cards use readable white surfaces', () => {
  assert.equal(enhancer.includes('.feature{min-height:430px!important'), true);
  assert.equal(enhancer.includes('.showcase-item,.product-item{min-height:250px!important'), true);
  assert.equal(enhancer.includes('.proof-card{background:#fff!important'), true);
  assert.equal(enhancer.includes('.relationship-card,.team-card,.link-card,.opportunity-card{border:1px solid #e9e2dd!important;background:#fff!important'), true);
});

test('desktop galleries expand on the wider canvas while mobile stays responsive', () => {
  assert.equal(enhancer.includes('.image-showcase .showcase-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important'), true);
  assert.equal(enhancer.includes('.product-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important'), true);
  assert.equal(enhancer.includes('@media(max-width:650px)'), true);
});
