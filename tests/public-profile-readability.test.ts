import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const enhancer = readFileSync(new URL('../src/routes/publicProfileEnhancer.ts', import.meta.url), 'utf8');

test('public profile uses a wider desktop canvas and keeps matrix rain behind content', () => {
  assert.equal(enhancer.includes('width:min(980px,calc(100% - 36px))!important'), true);
  assert.equal(enhancer.includes('.matrix{z-index:0!important;opacity:.58!important'), true);
  assert.equal(enhancer.includes('.page{width:min(980px'), true);
});

test('Book a Call and other conversion CTAs fill the row', () => {
  assert.equal(enhancer.includes('.cta-grid,.profile-enhanced-ctas{display:grid!important;grid-template-columns:1fr!important'), true);
  assert.equal(enhancer.includes('min-height:94px!important'), true);
  assert.equal(enhancer.includes("!html.includes('class=\"cta-grid\"')"), true, 'enhancer must not duplicate a base CTA grid');
});

test('public content cards use readable white surfaces', () => {
  assert.equal(enhancer.includes('.feature{min-height:390px!important'), true);
  assert.equal(enhancer.includes('background:#fff!important;color:#17110e!important'), true);
  assert.equal(enhancer.includes('.showcase-item,.product-item{min-height:230px!important'), true);
  assert.equal(enhancer.includes('.proof-card{background:#fff!important'), true);
  assert.equal(enhancer.includes('.relationship-card,.team-card,.link-card,.opportunity-card{border:1px solid #eee8e3!important;background:#fff!important'), true);
});

test('desktop featured image gallery can use three columns on the wider canvas', () => {
  assert.equal(enhancer.includes('.image-showcase .showcase-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important'), true);
  assert.equal(enhancer.includes('@media(max-width:650px)'), true);
});
