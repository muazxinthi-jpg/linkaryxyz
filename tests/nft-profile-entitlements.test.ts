import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const entitlement = readFileSync(new URL('../src/nftProfileEntitlement.ts', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../src/trackingEntry.ts', import.meta.url), 'utf8');
const profileIntegrity = readFileSync(new URL('../src/routes/profileRoleIntegrity.ts', import.meta.url), 'utf8');
const gallery = readFileSync(new URL('../frontend/src/NftWalletGallery.tsx', import.meta.url), 'utf8');
const galleryCss = readFileSync(new URL('../frontend/src/nft-wallet-gallery.css', import.meta.url), 'utf8');

test('Personal NFT features resolve from the existing billing architecture and fail closed to Free', () => {
  assert.equal(entitlement.includes("const PERSONAL_NFT_PLAN_CODE = 'personal_pro'"), true);
  assert.equal(entitlement.includes('billing_entitlement_grants'), true);
  assert.equal(entitlement.includes('billing_subscription_periods'), true);
  assert.equal(entitlement.includes("return 'free'"), true);
  assert.equal(entitlement.includes("'nft_profile_upgrade_required'"), true);
  assert.equal(entitlement.includes('402'), true);
});

test('Free Personal NFT discovery is rejected before the wallet provider route runs', () => {
  assert.equal(entry.includes("url.pathname === '/api/profile-wallets'"), true);
  assert.equal(entry.includes("url.searchParams.get('includeNfts') === '1'"), true);
  const guardIndex = entry.indexOf('await requirePersonalNftEntitlement(request, env, profileId)');
  const workerIndex = entry.indexOf('return worker.fetch(request, env, ctx)');
  assert.equal(guardIndex > -1, true);
  assert.equal(workerIndex > guardIndex, true);
});

test('NFT Showcase writes are protected server-side while legacy items can still be hidden or removed', () => {
  assert.equal(profileIntegrity.includes("body?.type === 'nft_item'"), true);
  assert.equal(profileIntegrity.includes("existing?.block_type === 'nft_item'"), true);
  assert.equal(profileIntegrity.includes('requirePersonalNftEntitlement(request, env, profileId)'), true);
  assert.equal(profileIntegrity.includes('isDisableOnly'), true);
  assert.equal(profileIntegrity.includes('deleteProfileBlock(request, env, profileId, blockId)'), true);
});

test('Free Personal NFT picker shows an explicit upgrade state including collection presentation', () => {
  assert.equal(gallery.includes('/api/billing/current?profileId='), true);
  assert.equal(gallery.includes("billing.plan.code === 'personal_pro'"), true);
  assert.equal(gallery.includes('Upgrade to Personal Pro / Collector'), true);
  assert.equal(gallery.includes('wallet NFT discovery, NFT avatar, NFT Showcase and NFT collection presentation'), true);
  assert.equal(gallery.includes('href="/settings/plan"'), true);
  assert.equal(gallery.includes("if (loading || access !== 'allowed') return"), true);
  assert.equal(gallery.includes('Alchemy configuration'), false);
});

test('locked NFT Showcase UI removes editable NFT controls and submit action while backend stays authoritative', () => {
  assert.equal(galleryCss.includes('.profile-beta-modal:has(.nft-wallet-gallery-locked) > label'), true);
  assert.equal(galleryCss.includes('.profile-beta-nft-editor:has(.nft-wallet-gallery-locked) .profile-beta-nft-manual'), true);
  assert.equal(galleryCss.includes('.profile-beta-modal:has(.nft-wallet-gallery-locked) .ops-form-actions .ops-button.primary'), true);
});

test('NFT entitlement repair adds no D1 migration', () => {
  const migrations = readdirSync(new URL('../migrations/', import.meta.url));
  assert.equal(migrations.some((name) => name.startsWith('0035_')), false);
});
