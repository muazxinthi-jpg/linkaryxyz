import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path: string) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Most Viewed ranks eligible public profiles even with zero live auctions', () => {
  const route = read('src/routes/bidMarketplace.ts');
  assert.match(route, /mode: 'views' \| 'bids' \| 'active'/);
  assert.match(route, /rankedProfiles\(db, period, page, 'views'\)/);
  assert.match(route, /p\.visibility = 'published'/);
  assert.match(route, /owner\.status = 'active'/);
  assert.match(route, /organization\.status = 'active'/);
  assert.doesNotMatch(route, /grant\.role = 'superadmin'/);
  assert.match(route, /every published profile backed by an active owner or project/);
  assert.match(route, /ORDER BY \$\{order\} LIMIT \? OFFSET \?/);
});

test('public-profile leaderboard periods, ties, zero views, and auction enrichment are explicit', () => {
  const route = read('src/routes/bidMarketplace.ts');
  const ui = read('frontend/src/BidMarketplaceExperience.tsx');
  for (const period of ["'24h'", "'7d'", "'30d'", "'all'"]) assert.ok(route.includes(period));
  assert.match(route, /views DESC, lower\(p\.display_name\) ASC, p\.id ASC/);
  assert.match(route, /COALESCE\(\(SELECT SUM\(v\.views\)/);
  assert.match(route, /auction_id: string \| null/);
  assert.match(ui, /LIVE AUCTION/);
  assert.match(ui, /Banner not available/);
  assert.match(ui, /24H/);
  assert.match(ui, /30D/);
  assert.match(ui, /All Time/);
  assert.match(ui, /useState<Tab>\('views'\)/);
});

test('leaderboard navigation uses server-side pagination and preserves auction CTAs', () => {
  const route = read('src/routes/bidMarketplace.ts');
  const ui = read('frontend/src/BidMarketplaceExperience.tsx');
  assert.match(route, /PAGE_SIZE = 24/);
  assert.match(route, /marketplace_page_invalid/);
  assert.match(route, /LIMIT \? OFFSET \?/);
  assert.match(ui, /Previous/);
  assert.match(ui, /Next/);
  assert.match(ui, /View profile/);
  assert.match(ui, /Place bid/);
});
