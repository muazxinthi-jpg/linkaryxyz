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

test('Bids identifies the next available profile without inventing auction data', () => {
  const ui = read('frontend/src/BidMarketplaceExperience.tsx');
  assert.match(ui, /Banner live until/);
  assert.match(ui, /Available now/);
  assert.match(ui, /banner_ends_at/);
});
