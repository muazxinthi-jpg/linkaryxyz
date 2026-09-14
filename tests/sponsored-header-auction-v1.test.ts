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
  assert.match(lifecycle, /isProfileOwnerOrMember/);
  assert.match(lifecycle, /organization_memberships[\s\S]*status = 'active' LIMIT 1/);
  assert.match(lifecycle, /if \(!auth\.isSuperadmin\) await requireProfileManager\(db, auction\.profile_id, auth\.user\.id\)/);
  assert.match(lifecycle, /Profile owner or organization member cannot bid on their own auction/);
  assert.match(lifecycle, /ORDER BY amount_cents DESC, created_at ASC, id ASC LIMIT 1/);
  assert.match(lifecycle, /idempotency-key/);
  assert.match(lifecycle, /30 \* 60 \* 1000/);
  assert.match(lifecycle, /SET status = 'payment_expired'/);
  assert.match(lifecycle, /SET status = 'expired'[\s\S]*status = 'live'/);
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

test('public promotion header overlays top controls and uses a narrower lifted holder', () => {
  assert.ok(delivery.includes("enhanced.match(/<(section|div)\\s+class=(['\"])hero"));
  assert.ok(delivery.includes('hero linkary-promotion-hero'));
  assert.ok(delivery.includes('linkary-promotion-page'));
  assert.ok(delivery.includes('linkary-promotion-top'));
  assert.ok(delivery.includes('.page.linkary-promotion-page{position:relative!important;overflow:visible!important}'));
  assert.ok(delivery.includes('.linkary-promotion-top{position:absolute!important;top:-6px!important'));
  assert.ok(delivery.includes('width:min(980px,calc(100vw - 56px))'));
  assert.ok(delivery.includes('margin:-20px 50% 0'));
  assert.ok(delivery.includes('height:clamp(300px,28vw,340px)'));
  assert.ok(delivery.includes('clip-path:ellipse(100% 100% at 50% 0)'));
  assert.ok(delivery.includes('@media(min-width:641px) and (max-width:1024px)'));
  assert.ok(!delivery.includes('linkary-sponsored-curve'));
});

test('public promotion avatar is a rounded square pulled further into the banner', () => {
  assert.ok(delivery.includes('linkary-sponsored-header + script + .linkary-promotion-hero'));
  assert.ok(delivery.includes('margin-top:calc(var(--linkary-avatar-overlap) * -1)!important'));
  assert.ok(delivery.includes('.linkary-promotion-hero .avatar'));
  assert.ok(delivery.includes('width:clamp(156px,12vw,184px)!important'));
  assert.ok(delivery.includes('height:clamp(156px,12vw,184px)!important'));
  assert.ok(delivery.includes('border-radius:26px!important'));
  assert.ok(delivery.includes('--linkary-avatar-overlap:clamp(112px,8.5vw,128px)'));
  assert.ok(!delivery.includes('border-radius:50%!important'));
});

test('public promotion CTA stays centered higher above the protected avatar overlap zone', () => {
  const desktop = delivery.match(/--linkary-avatar-overlap:clamp\((\d+)px,[^,]+,(\d+)px\);--linkary-cta-avatar-gap:clamp\((\d+)px,[^,]+,(\d+)px\)/);
  const mobile = delivery.match(/@media\(max-width:640px\)[\s\S]*?--linkary-avatar-overlap:(\d+)px;--linkary-cta-avatar-gap:(\d+)px/);
  assert.ok(delivery.includes('--linkary-avatar-overlap:clamp(112px,8.5vw,128px)'));
  assert.ok(delivery.includes('--linkary-cta-avatar-gap:clamp(58px,4.2vw,68px)'));
  assert.ok(delivery.includes('bottom:calc(var(--linkary-avatar-overlap) + var(--linkary-cta-avatar-gap))'));
  assert.ok(delivery.includes('left:50%'));
  assert.ok(delivery.includes('transform:translateX(-50%)'));
  assert.ok(desktop);
  assert.ok(mobile);
  assert.doesNotMatch(delivery, /\.linkary-sponsored-cta\{[^}]*bottom:(?:1[48]|-\d+)px/);
  assert.ok(Number(desktop[1]) + Number(desktop[3]) >= 170);
  assert.ok(Number(desktop[2]) + Number(desktop[4]) <= 196);
  assert.ok(Number(mobile[1]) >= 78);
  assert.ok(Number(mobile[2]) >= 34);
});

test('promotion entry is active for app and public workers while preserving the existing worker chain', () => {
  assert.match(entry, /import baseWorker from '\.\/trackingEntry'/);
  assert.match(entry, /const response = await baseWorker\.fetch\(request, env, ctx\)/);
  assert.match(entry, /if \(!username\) return response/);
  assert.match(entry, /const enhanced = await enhancePublicProfileWithPromotion\(response, request, env, username\)/);
  assert.match(entry, /return await refinePublicProfilePromotionLayout\(enhanced\)/);
  assert.match(entry, /import \{ refinePublicProfilePromotionLayout \} from '\.\/routes\/profilePromotionLayout'/);
  assert.ok(entry.includes('promotion-auctions'));
  assert.ok(entry.includes('verifyPromotionPayment'));
  assert.match(wrangler, /"main": "src\/promotionEntry\.ts"/);
  assert.match(publicWrangler, /"main": "src\/promotionEntry\.ts"/);
});
