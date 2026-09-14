import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const layout = readFileSync(new URL('../src/routes/profilePromotionLayout.ts', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../src/promotionEntry.ts', import.meta.url), 'utf8');

test('public promotion holder follows the profile shell and sits lower', () => {
  assert.ok(layout.includes('.page.linkary-promotion-page .linkary-sponsored-header'));
  assert.ok(layout.includes('width:100%!important;margin:0!important;transform:none!important'));
  assert.ok(layout.includes('.linkary-promotion-top{top:14px!important;width:100%!important'));
  assert.ok(layout.includes('height:clamp(285px,25vw,320px)!important'));
  assert.ok(layout.includes('@media(min-width:641px) and (max-width:1024px)'));
  assert.ok(layout.includes('@media(max-width:640px)'));
  assert.ok(!layout.includes('width:min(900px'));
  assert.ok(!layout.includes('margin-top:-44px!important'));
});

test('avatar is pulled further into the holder and CTA has a larger protected gap', () => {
  assert.ok(layout.includes('--linkary-cta-avatar-gap:clamp(68px,4.8vw,78px)'));
  assert.ok(layout.includes('transform:translateY(-24px)!important'));
  assert.ok(layout.includes('transform:translateY(-18px)!important'));
  assert.ok(layout.includes('transform:translateY(-12px)!important'));
});

test('layout refinement is applied only after the existing promotion enhancer', () => {
  assert.ok(entry.includes("import { refinePublicProfilePromotionLayout } from './routes/profilePromotionLayout'"));
  assert.ok(entry.includes('const enhanced = await enhancePublicProfileWithPromotion(response, request, env, username)'));
  assert.ok(entry.includes('return await refinePublicProfilePromotionLayout(enhanced)'));
  assert.ok(layout.includes('hasPromotionHolder'));
  assert.ok(layout.includes('linkary-sponsored-header-style'));
});
