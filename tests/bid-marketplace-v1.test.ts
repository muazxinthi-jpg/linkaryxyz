import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path: string) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('bid marketplace uses the existing promotion auction system', () => {
  const entry = read('src/promotionEntry.ts');
  const marketplace = read('src/routes/bidMarketplace.ts');
  assert.match(entry, /\/api\/bid-marketplace/);
  assert.match(entry, /getBidMarketplace/);
  assert.match(marketplace, /profile_promotion_auctions/);
  assert.match(marketplace, /profile_promotion_bids/);
  assert.match(marketplace, /active\.status = 'open'/);
  assert.match(marketplace, /active\.expires_at > \?/);
});

test('public profile views are aggregated daily and fail open', () => {
  const migration = read('migrations/0053_bid_marketplace_profile_views.sql');
  const marketplace = read('src/routes/bidMarketplace.ts');
  const entry = read('src/promotionEntry.ts');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public_profile_daily_views/);
  assert.match(migration, /PRIMARY KEY \(profile_id, view_date\)/);
  assert.match(marketplace, /ON CONFLICT\(profile_id, view_date\)/);
  assert.match(marketplace, /analytics must never block a public profile response/);
  assert.match(entry, /ctx\.waitUntil\(recordPublicProfileView\(env, username\)\)/);
});

test('the authenticated editor preview does not inflate public marketplace views', () => {
  const entry = read('src/promotionEntry.ts');
  assert.match(entry, /searchParams\.has\('editorPreview'\)/);
  assert.match(entry, /if \(!new URL\(request\.url\)\.searchParams\.has\('editorPreview'\)\) \{\s*ctx\.waitUntil\(recordPublicProfileView\(env, username\)\)/s);
});

test('Bids is a first-class workspace route for creator and project workspaces', () => {
  const workspace = read('frontend/src/ProductWorkspace.tsx');
  const app = read('frontend/src/AppV3.tsx');
  assert.equal((workspace.match(/\['\/bids', 'Bids'\]/g) || []).length, 2);
  assert.match(app, /location\.pathname === '\/bids'/);
  assert.match(app, /experience === 'bids'/);
  assert.match(app, /BidMarketplaceExperience/);
});

test('marketplace exposes operational discovery and personal auction views', () => {
  const ui = read('frontend/src/BidMarketplaceExperience.tsx');
  for (const label of ['Live auctions', 'Ending soon', 'Most viewed', 'Most bid on', 'My bids', 'Won auctions']) {
    assert.ok(ui.includes(label), `missing marketplace tab ${label}`);
  }
  assert.match(ui, /Search profiles, creators or projects/);
  assert.match(ui, /Minimum profile views/);
  assert.match(ui, /Minimum current bid/);
  assert.match(ui, /Profiles available/);
  assert.match(ui, /setInterval\(\(\) => void refresh\(true\), 30000\)/);
});

test('auction cards and detail panel preserve real bid actions', () => {
  const components = read('frontend/src/bidMarketplaceComponents.tsx');
  assert.match(components, /View profile/);
  assert.match(components, /Place bid/);
  assert.match(components, /promotion-auction/);
  assert.match(components, /You will only pay if you win this auction/);
  assert.match(components, /idempotency-key/);
  assert.match(components, /x-csrf-token/);
  assert.match(components, /BidHistoryChart/);
});

test('marketplace UI is responsive and scoped', () => {
  const ui = read('frontend/src/BidMarketplaceExperience.tsx');
  const css = read('frontend/src/bid-marketplace.css');
  assert.match(ui, /import '\.\/bid-marketplace\.css'/);
  assert.match(css, /@media\(max-width:820px\)/);
  assert.match(css, /@media\(max-width:620px\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css, /\.bid-marketplace/);
  assert.match(css, /\.bid-auction-grid/);
  assert.match(css, /\.bid-detail-panel/);
});
