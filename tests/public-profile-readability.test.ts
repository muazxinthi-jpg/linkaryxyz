import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const enhancer = readFileSync(new URL('../src/routes/publicProfileEnhancer.ts', import.meta.url), 'utf8');

test('public profile keeps a wide light canvas with visible orange matrix rain', () => {
  assert.equal(enhancer.includes('width:min(1180px,calc(100% - 64px))!important'), true);
  assert.equal(enhancer.includes('background:rgba(255,255,255,.92)!important'), true);
  assert.equal(enhancer.includes('background-image:none!important'), true);
  assert.equal(enhancer.includes('.matrix{display:block!important;z-index:0!important;opacity:.64!important;mix-blend-mode:multiply!important'), true);
  assert.equal(enhancer.includes('filter:saturate(1.55) contrast(1.18)!important'), true);
});

test('hero typography is dark, readable and smaller than the previous oversized treatment', () => {
  assert.equal(enhancer.includes('.hero h1{margin:10px 0 6px!important;color:#111!important;font-size:clamp(34px,3.6vw,52px)!important'), true);
  assert.equal(enhancer.includes('.bio{max-width:780px!important;margin:17px auto 0!important;color:#2b2724!important'), true);
  assert.equal(enhancer.includes('.handle{color:#70645e!important'), true);
  assert.equal(enhancer.includes('.eyebrow{margin-top:15px!important;color:#ff5a36!important'), true);
});

test('social brand logos use Linkary orange while preserving the real SVG marks', () => {
  assert.equal(enhancer.includes('border:1.5px solid #ff5a36!important'), true);
  assert.equal(enhancer.includes('.profile-social-brand'), true);
  assert.equal(enhancer.includes('invert(44%) sepia(96%) saturate(2859%)'), true);
  assert.equal(enhancer.includes('.socials a:hover .profile-social-brand,.social:hover .profile-social-brand{filter:brightness(0) invert(1)!important'), true);
});

test('Book a Call and other conversion CTAs fill the row and stay readable', () => {
  assert.equal(enhancer.includes('.cta-grid,.profile-enhanced-ctas{display:grid!important;grid-template-columns:1fr!important'), true);
  assert.equal(enhancer.includes('min-height:96px!important'), true);
  assert.equal(enhancer.includes('.cta-card strong,.profile-enhanced-cta strong{color:#151210!important;font-size:19px!important'), true);
  assert.equal(enhancer.includes("!html.includes('class=\"cta-grid\"')"), true, 'enhancer must not duplicate a base CTA grid');
});

test('featured X posts never become duplicate X profile icons', () => {
  assert.equal(enhancer.includes("if (block.block_type === 'social_link') return true;"), true);
  assert.equal(enhancer.includes("['telegram', 'youtube', 'tiktok', 'instagram', 'facebook', 'reddit', 'linkedin'].includes(block.block_type)"), true);
  assert.equal(enhancer.includes("return block.block_type === 'link' && known.includes(socialPlatform(block));"), true);
});

test('public content modules remain on readable white surfaces', () => {
  assert.equal(enhancer.includes('.feature{min-height:420px!important'), true);
  assert.equal(enhancer.includes('.showcase-item,.product-item{min-height:242px!important'), true);
  assert.equal(enhancer.includes('.proof-card{background:#fff!important;background-image:none!important'), true);
  assert.equal(enhancer.includes('.relationship-card,.team-card,.link-card,.opportunity-card{border:1px solid #e8ded8!important;background:#fff!important'), true);
});

test('desktop galleries stay expanded and public profile cache turns over quickly during beta polish', () => {
  assert.equal(enhancer.includes('.image-showcase .showcase-grid,.product-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important'), true);
  assert.equal(enhancer.includes('@media(max-width:650px)'), true);
  assert.equal(enhancer.includes("headers.set('cache-control', 'public, max-age=30, s-maxage=60')"), true);
});
