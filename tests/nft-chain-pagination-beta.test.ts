import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const chains = readFileSync(new URL('../src/chains.ts', import.meta.url), 'utf8');
const wallets = readFileSync(new URL('../src/routes/wallets.ts', import.meta.url), 'utf8');
const gallery = readFileSync(new URL('../frontend/src/NftWalletGallery.tsx', import.meta.url), 'utf8');
const profile = readFileSync(new URL('../frontend/src/ProfileExperienceBeta.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../frontend/src/nft-wallet-gallery.css', import.meta.url), 'utf8');

test('Controlled Beta chain registry matches the production Alchemy app', () => {
  for (const key of ['ethereum', 'base', 'bnb', 'solana', 'robinhood']) {
    assert.equal(chains.includes(`key: '${key}'`), true, `missing ${key}`);
  }
  assert.equal(chains.includes("key: 'arbitrum'"), false, 'Arbitrum must not be queried in the current Controlled Beta');
  assert.equal(chains.includes("nftDiscovery: 'probe'"), true, 'BNB NFT discovery should be capability-probed');
  assert.equal(chains.includes("nftDiscovery: 'unavailable'"), true, 'unsupported NFT indexing must be explicit');
});

test('NFT discovery uses bounded 100-item pages and provider cursors', () => {
  assert.equal(wallets.includes('const EVM_PAGE_SIZE = 100'), true);
  assert.equal(wallets.includes("endpoint.searchParams.set('pageSize', String(EVM_PAGE_SIZE))"), true);
  assert.equal(wallets.includes("endpoint.searchParams.set('pageKey', prior.pageKey)"), true);
  assert.equal(wallets.includes('nextCursor'), true);
  assert.equal(wallets.includes('.slice(0, 120)'), false, 'legacy global 120-item truncation must stay removed');
  assert.equal(wallets.includes("url.searchParams.get('nftChain')"), true);
  assert.equal(wallets.includes("url.searchParams.get('nftCursor')"), true);
});

test('specific network selection is passed server-side instead of filtering only in the browser', () => {
  assert.equal(gallery.includes("nftChain: chain"), true);
  assert.equal(gallery.includes("params.set('nftCursor', cursor)"), true);
  assert.equal(gallery.includes("{ key: 'ethereum', label: 'Ethereum' }"), true);
  assert.equal(gallery.includes("{ key: 'base', label: 'Base' }"), true);
  assert.equal(gallery.includes("{ key: 'bnb', label: 'BNB Chain' }"), true);
  assert.equal(gallery.includes("{ key: 'solana', label: 'Solana' }"), true);
  assert.equal(gallery.includes("{ key: 'robinhood', label: 'Robinhood' }"), true);
  assert.equal(gallery.includes('Load more'), true);
});

test('NFT chain preference stays local to the profile and needs no D1 migration', () => {
  assert.equal(gallery.includes('linkary.nft.chain.${profileId}'), true);
  assert.equal(gallery.includes('window.localStorage.setItem'), true);
});

test('avatar and showcase both reuse the same chain-aware gallery', () => {
  const galleryUses = profile.match(/<NftWalletGallery/g)?.length || 0;
  assert.equal(galleryUses >= 2, true);
  assert.equal(profile.includes('<option>Arbitrum</option>'), false);
  assert.equal(profile.includes('<option>Robinhood</option>'), true);
});

test('network picker remains horizontally usable on narrow phones', () => {
  assert.equal(css.includes('overflow-x: auto'), true);
  assert.equal(css.includes('@media (max-width: 360px)'), true);
  assert.equal(css.includes('min-height: 40px'), true);
});

test('unsupported and failed provider states are not silently presented as empty wallets', () => {
  assert.equal(wallets.includes("status: 'unavailable'"), true);
  assert.equal(wallets.includes("NftChainState['status']"), true);
  assert.equal(wallets.includes("status === 'error'"), true);
  assert.equal(wallets.includes('NFT discovery is not currently available for this network.'), true);
  assert.equal(wallets.includes('could not be loaded right now'), true);
});
