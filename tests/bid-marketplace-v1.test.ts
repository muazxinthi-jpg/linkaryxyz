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
  assert.match(marketplace, /a\.status = 'open'/);
  assert.match(marketplace, /a\.expires_at > \?/);
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

test('marketplace exposes requested leaderboards and discovery actions', () => {
  const ui = read('frontend/src/BidMarketplaceExperience.tsx');
  for (const label of ['Current Active', 'Top Bidders', 'Top Winners', 'Most Viewed', 'Most Bid On']) {
    assert.ok(ui.includes(label), `missing leaderboard ${label}`);
  }
  assert.match(ui, /View profile/);
  assert.match(ui, /Place bid/);
  assert.match(ui, /promotion-auction/);
  assert.match(ui, /setInterval\(\(\) => void refresh\(\), 30000\)/);
});

test('Current Active is reserved for open bidding and orders by auction expiry', () => {
  const marketplace = read('src/routes/bidMarketplace.ts');
  const ui = read('frontend/src/BidMarketplaceExperience.tsx');
  assert.match(marketplace, /active\.status = 'open'/);
  assert.doesNotMatch(marketplace, /active_live\.status = 'live'/);
  assert.match(marketplace, /expires_at ASC/);
  assert.match(marketplace, /profile_featured_headers/);
  assert.match(ui, /Expiry leaderboard/);
  assert.match(ui, /OPEN FOR BIDDING/);
  assert.match(ui, /Creators open for bidding/);
  assert.match(ui, /LIVE BANNER/);
  assert.match(ui, /Banner live until/);
});

test('promotion auctions cycle automatically using the owner minimum bid', () => {
  const migration = read('migrations/0059_auto_promotion_auction_cycle.sql');
  const scheduler = read('src/routes/profilePromotionScheduler.ts');
  const entry = read('src/promotionEntry.ts');
  assert.match(migration, /default_starting_bid_cents/);
  assert.match(scheduler, /expires_at <= \?/);
  assert.match(scheduler, /duration_hours, starting_bid_cents/);
  assert.match(scheduler, /24 \* 60 \* 60 \* 1000/);
  assert.match(entry, /runPromotionAuctionScheduler/);
});

test('marketplace UI is responsive and scoped', () => {
  const ui = read('frontend/src/BidMarketplaceExperience.tsx');
  const css = read('frontend/src/bid-marketplace.css');
  assert.match(ui, /import '\.\/bid-marketplace\.css'/);
  assert.match(css, /@media\(max-width:820px\)/);
  assert.match(css, /@media\(max-width:520px\)/);
  assert.match(css, /\.bid-marketplace/);
});

test('workspace density keeps Bids and Profile full-width and regression-proof', () => {
  const density = read('frontend/src/workspace-density.css');
  const app = read('frontend/src/main.tsx');
  assert.match(app, /import '\.\/workspace-density\.css'/);
  assert.match(density, /\.ops-page\{width:100%;max-width:none;margin:0/);
  assert.match(density, /\.bid-market-card-grid\{grid-template-columns:repeat\(auto-fit,minmax\(250px,1fr\)\)/);
  assert.match(density, /\.ops-sidebar\{position:sticky/);
});

test('Bids Stitch redesign keeps the Linkary shell and real marketplace controls responsive', () => {
  const workspace = read('frontend/src/ProductWorkspace.tsx');
  const ui = read('frontend/src/BidMarketplaceExperience.tsx');
  const css = read('frontend/src/bid-marketplace-stitch.css');
  assert.match(workspace, /currentPath === '\/bids' \? ' bids-workspace-page'/);
  assert.match(ui, /import '\.\/bid-marketplace-stitch\.css'/);
  for (const label of ['Current Active', 'Top Bidders', 'Top Winners', 'Most Viewed', 'Most Bid On']) {
    assert.ok(ui.includes(label), `missing marketplace tab ${label}`);
  }
  assert.match(ui, /aria-label="Profile view ranking period"/);
  assert.match(ui, /Updated \$\{new Intl\.DateTimeFormat/);
  assert.match(ui, /to=\{`\/promotion-auction\/\$\{item\.auction_id\}`\}/);
  assert.match(css, /@media\(max-width:900px\)/);
  assert.match(css, /@media\(max-width:640px\)/);
  assert.match(css, /@media\(max-width:380px\)/);
  assert.match(css, /bid-market-leaderboard-row>span:before\{[^}]*content:attr\(data-label\)/);
});
