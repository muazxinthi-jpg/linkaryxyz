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
  assert.equal(beta.includes('Destination URL'), true);
  assert.equal(beta.includes('NFT artwork source'), true);
});

test('NFT click destination stays separate from the artwork source', () => {
  assert.equal(beta.includes('A collection page, individual NFT page, or another relevant destination is allowed.'), true);
  assert.equal(beta.includes('Linkary uses this only to resolve the artwork; it does not control where the card clicks.'), true);
  assert.equal(profiles.includes('function validateNftDestinationUrl'), true);
  assert.equal(profiles.includes("'nft_item_url_required'"), false);
});

test('NFT item pages resolve real token artwork through Alchemy metadata instead of social preview cards', () => {
  assert.equal(media.includes('resolveNftArtworkPreview'), true);
  assert.equal(media.includes('parseOpenSeaNftItemUrl'), true);
  assert.equal(media.includes('getNFTMetadata'), true);
  assert.equal(media.includes('image.originalUrl'), true);
  assert.equal(profiles.includes("className === 'nft-showcase'"), true);
  assert.equal(profiles.includes("className === 'nfts'"), true);
});

test('wallet NFT discovery stays server-side and uses attached profile wallets', () => {
  assert.equal(wallets.includes('env.ALCHEMY_API_KEY'), true);
  assert.equal(wallets.includes('getNFTsForOwner'), true);
  assert.equal(wallets.includes('getAssetsByOwner'), true);
  assert.equal(wallets.includes('profile_wallet_destinations'), true);
  assert.equal(wallets.includes('coinbase_cdp'), true);
  assert.equal(wallets.includes("return json({ destinations, embeddedWallets, ...(nftDiscovery ? { nftDiscovery } : {}) });"), true);
  assert.equal(wallets.includes('nftDiscovery: { apiKey'), false, 'API key must never be serialized in the NFT response');
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
