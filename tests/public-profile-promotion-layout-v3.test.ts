import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const delivery = readFileSync(new URL('../src/routes/profilePromotionDelivery.ts', import.meta.url), 'utf8');
const layout = readFileSync(new URL('../src/routes/profilePromotionLayout.ts', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../src/promotionEntry.ts', import.meta.url), 'utf8');

test('public promotion holder is one native profile-shell header', () => {
  assert.ok(delivery.includes('linkary-promotion-shell'));
  assert.ok(delivery.includes('.linkary-promotion-shell .linkary-promotion-top{position:relative!important'));
  assert.ok(delivery.includes('.linkary-sponsored-header{position:relative;z-index:1;width:100%!important;margin:0!important;transform:none!important'));
  assert.ok(delivery.includes('--linkary-profile-shell-inset:46px'));
  assert.ok(delivery.includes('width:calc(100% + (var(--linkary-profile-shell-inset) * 2))'));
  assert.ok(delivery.includes('@media(max-width:899px){.page.linkary-promotion-page{--linkary-profile-shell-inset:20px}}'));
  assert.ok(delivery.includes('height:clamp(300px,28vw,340px)'));
  assert.ok(delivery.includes('@media(min-width:641px) and (max-width:1024px)'));
  assert.ok(delivery.includes('@media(max-width:640px)'));
  assert.ok(!delivery.includes('width:min(900px'));
  assert.ok(!delivery.includes('margin-top:-44px!important'));
});

test('avatar and CTA use one responsive protected overlap zone', () => {
  assert.ok(delivery.includes('--linkary-cta-avatar-gap:clamp(20px,2vw,24px)'));
  assert.ok(delivery.includes('--linkary-avatar-overlap:clamp(80px,7vw,88px)'));
  assert.ok(delivery.includes('bottom:calc(var(--linkary-avatar-overlap) + var(--linkary-cta-avatar-gap))'));
  assert.ok(delivery.includes('margin:calc(var(--linkary-avatar-overlap) * -1) 0 28px!important'));
});

test('worker chain retains the layout compatibility boundary without competing CSS', () => {
  assert.ok(entry.includes("import { refinePublicProfilePromotionLayout } from './routes/profilePromotionLayout'"));
  assert.ok(entry.includes('const enhanced = await enhancePublicProfileWithPromotion(response, request, env, username)'));
  assert.ok(entry.includes('return await refinePublicProfilePromotionLayout(enhanced)'));
  assert.ok(layout.includes('return response'));
  assert.ok(!layout.includes('<style'));
});
