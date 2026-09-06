import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const beta = readFileSync(new URL('../frontend/src/ProfileExperienceBeta.tsx', import.meta.url), 'utf8');
const wallets = readFileSync(new URL('../src/routes/wallets.ts', import.meta.url), 'utf8');
const enhancer = readFileSync(new URL('../src/routes/publicProfileEnhancer.ts', import.meta.url), 'utf8');
const identity = readFileSync(new URL('../src/routes/publicProfileIdentity.ts', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../src/worker.ts', import.meta.url), 'utf8');
const trackingEntry = readFileSync(new URL('../src/trackingEntry.ts', import.meta.url), 'utf8');
const wrangler = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const media = readFileSync(new URL('../src/profileMedia.ts', import.meta.url), 'utf8');
const profiles = readFileSync(new URL('../src/routes/profiles.ts', import.meta.url), 'utf8');

test('live Beta profile editor exposes notable social networks and custom social naming', () => {
  assert.equal(beta.includes('const SOCIAL_OPTIONS'), true);
  for (const platform of ['x', 'linkedin', 'tiktok', 'facebook', 'instagram', 'youtube', 'telegram', 'whatsapp', 'reddit', 'discord', 'github', 'farcaster', 'custom']) {
    assert.equal(beta.includes(`key: '${platform}'`), true, `missing ${platform} social option`);
  }
  assert.equal(beta.includes('Choose social network'), true);
  assert.equal(beta.includes('Name this social platform'), true);
  assert.equal(beta.includes("socialPlatform: draft.socialPlatform"), true);
});

test('live Beta profile editor exposes NFT showcase and NFT avatar selection', () => {
  assert.equal(beta.includes('value="nft_item"'), true);
  assert.equal(beta.includes('+ NFT'), true);
  assert.equal(beta.includes('Choose from wallet NFTs'), true);
  assert.equal(beta.includes('includeNfts=1'), true);
  assert.equal(beta.includes('setData({ ...data, avatarUrl: nft.imageUrl })'), true);
  assert.equal(beta.includes('Or add manually'), true);
});

test('NFT click destination stays separate from the artwork source', () => {
  assert.equal(beta.includes("label: 'Open item URL'"), true);
  assert.equal(beta.includes("label: 'Artwork URL'"), true);
  assert.equal(beta.includes('nftImageUrl'), true);
  assert.equal(beta.includes('nftOpenUrl'), true);
});

test('NFT item pages resolve real token artwork through Alchemy metadata instead of social preview cards', () => {
  assert.equal(wallets.includes('getNFTMetadata'), true);
  assert.equal(wallets.includes('resolveNftReference'), true);
  assert.equal(wallets.includes('opensea'), true);
});

test('wallet NFT discovery stays server-side and uses attached profile wallets', () => {
  assert.equal(wallets.includes('listProfileNfts'), true);
  assert.equal(wallets.includes('profile_wallet_destinations'), true);
  assert.equal(wallets.includes('ALCHEMY_API_KEY'), true);
});

test('profile editor preview renders the actual saved public profile instead of a separate mock layout', () => {
  assert.equal(beta.includes('PUBLIC PROFILE PREVIEW'), true);
  assert.equal(beta.includes('<iframe'), true);
  assert.equal(beta.includes('editorPreview='), true);
  assert.equal(beta.includes('Save changes to refresh'), true);
  assert.equal(beta.includes('const previewBlocks'), false);
  assert.equal(enhancer.includes("['work_with_me', 'media_kit']"), true);
  assert.equal(enhancer.includes('profile-enhanced-ctas'), true);
});

test('public profile enhancement supports WhatsApp and Farcaster beneath the Personal Profile identity layer', () => {
  assert.equal(enhancer.includes("return 'whatsapp'"), true);
  assert.equal(enhancer.includes("return 'farcaster'"), true);
  assert.equal(enhancer.includes("import { getPublishedProfile, renderPublicProfile as renderBasePublicProfile } from './profiles'"), true);
  assert.equal(identity.includes("import { renderPublicProfileEnhanced } from './publicProfileEnhancer'"), true);
  assert.equal(identity.includes('renderPublicProfileEnhanced(request, env, username)'), true);
  assert.equal(worker.includes('renderPublicProfileWithIdentity'), true);
  assert.equal(wrangler.includes('"main": "src/trackingEntry.ts"'), true);
  assert.equal(trackingEntry.includes("import worker from './worker'"), true);
  assert.equal(trackingEntry.includes('return worker.fetch(request, env, ctx)'), true);
});

test('saving Personal Profile identity still cache-busts the exact public iframe', () => {
  assert.equal(beta.includes('editorPreview='), true);
  assert.equal(beta.includes('Date.now()'), true);
});

test('wallet NFT actions and public identity card span the full Identity editor width', () => {
  assert.equal(beta.includes('profile-identity-span-2'), true);
});
