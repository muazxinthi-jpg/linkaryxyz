import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path: string) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('live sponsored headers support 24 hours, 3 days, 7 days, and 30 days', () => {
  const migration = read('migrations/0055_profile_promotion_30_day_duration.sql');
  const route = read('src/routes/profilePromotions.ts');
  const ui = read('frontend/src/PromotionAuctionExperience.tsx');
  assert.match(migration, /live_duration_days INTEGER/);
  assert.match(migration, /live_duration_days IN \(1,3,7,30\)/);
  assert.match(route, /\[24, 72, 168, 720\]/);
  assert.match(ui, /option value="720">30 days/);
});

test('Bids distinguishes default banners from profiles open for bidding', () => {
  const ui = read('frontend/src/BidMarketplaceExperience.tsx');
  const marketplace = read('src/routes/bidMarketplace.ts');
  assert.match(ui, /OPEN FOR BIDDING/);
  assert.match(ui, /Not currently open for bidding/);
  assert.match(ui, /No open auction/);
  assert.match(ui, /banner_ends_at/);
  assert.match(ui, /item\.has_live_banner === 1/);
  assert.match(marketplace, /la\.status = 'live' AND c\.moderation_status = 'approved'/);
  assert.match(marketplace, /la\.promotion_ends_at IS NULL OR la\.promotion_ends_at > \?/);
  assert.match(marketplace, /AS has_live_banner/);
});
