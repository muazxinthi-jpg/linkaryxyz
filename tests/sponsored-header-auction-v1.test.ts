import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../migrations/0051_sponsored_header_auction_v1.sql', import.meta.url), 'utf8');
const featuredMigration = readFileSync(new URL('../migrations/0052_free_featured_header.sql', import.meta.url), 'utf8');
const lifecycle = readFileSync(new URL('../src/routes/profilePromotions.ts', import.meta.url), 'utf8');
const payments = readFileSync(new URL('../src/routes/profilePromotionPayments.ts', import.meta.url), 'utf8');
const featured = readFileSync(new URL('../src/routes/profileFeaturedHeaders.ts', import.meta.url), 'utf8');
const delivery = readFileSync(new URL('../src/routes/profilePromotionDelivery.ts', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../src/promotionEntry.ts', import.meta.url), 'utf8');
const wrangler = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const publicWrangler = readFileSync(new URL('../wrangler.public.jsonc', import.meta.url), 'utf8');

test('promotion schema keeps bids immutable and one active auction per profile', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS profile_promotion_bids/);
  assert.doesNotMatch(migration, /UPDATE\s+profile_promotion_bids/i);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_promotion_auction_per_profile/);
  assert.match(migration, /duration_hours INTEGER NOT NULL CHECK \(duration_hours IN \(6,12,24\)\)/);
});

test('auction lifecycle has profile authorization, self-bid prevention and deterministic winner ordering', () => {
  assert.match(lifecycle, /requireProfileManager/);
  assert.match(lifecycle, /Profile owner cannot bid on their own auction/);
  assert.match(lifecycle, /ORDER BY amount_cents DESC, created_at ASC, id ASC LIMIT 1/);
  assert.match(lifecycle, /idempotency-key/);
  assert.match(lifecycle, /bid_race_lost/);
});

test('winner payment is direct Base USDC to profile payout wallet and chain verified', () => {
  assert.match(payments, /BASE_USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'/);
  assert.match(payments, /eth_getTransactionReceipt/);
  assert.match(payments, /receiptContainsExactUsdcTransfer/);
  assert.match(payments, /recipient_wallet_address/);
  assert.match(payments, /profile_promotion_payments WHERE tx_hash = \? AND auction_id <> \?/);
  assert.match(payments, /promotion_payment_transfer_mismatch/);
});

test('creative cannot become live before verified payment and superadmin moderation', () => {
  assert.match(lifecycle, /Payment must be verified before creative submission/);
  assert.match(payments, /requireSuperadmin/);
  assert.match(payments, /Promotion payment is not verified/);
  assert.match(payments, /SET status = 'live'/);
});

test('owner free featured header is independently stored and manager controlled', () => {
  assert.match(featuredMigration, /CREATE TABLE IF NOT EXISTS profile_featured_headers/);
  assert.match(featuredMigration, /profile_id TEXT NOT NULL UNIQUE/);
  assert.match(featuredMigration, /impressions_count/);
  assert.match(featuredMigration, /banner_clicks_count/);
  assert.match(featuredMigration, /cta_clicks_count/);
  assert.match(featured, /requireProfileManager/);
  assert.match(featured, /upsertFeaturedHeader/);
  assert.match(featured, /preferredProjectProfileId/);
  assert.match(featured, /trackingCode/);
});

test('paid live promotion has priority and free header is the public fallback', () => {
  assert.match(delivery, /creative = await liveCreativeByUsername/);
  assert.match(delivery, /if \(!creative\) featured = await featuredHeaderByUsername/);
  assert.match(delivery, /Featured/);
  assert.match(delivery, /featured_profile/);
  assert.match(entry, /featured-header/);
  assert.match(entry, /featured-header-impressions/);
  assert.match(entry, /redirectFeaturedHeaderClick/);
});

test('promotion entry is active for app and public workers while preserving the existing worker chain', () => {
  assert.match(entry, /import baseWorker from '\.\/trackingEntry'/);
  assert.match(entry, /return await baseWorker\.fetch\(request, env, ctx\)/);
  assert.match(entry, /promotion-auctions/);
  assert.match(entry, /payment\\\/verify/);
  assert.match(wrangler, /"main": "src\/promotionEntry\.ts"/);
  assert.match(publicWrangler, /"main": "src\/promotionEntry\.ts"/);
});
