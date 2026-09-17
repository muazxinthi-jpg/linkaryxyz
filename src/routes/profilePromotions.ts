import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { HttpError, json, readJson } from '../http';
import { requireAuth, verifyCsrf } from '../auth/session';

const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
const now = () => new Date().toISOString();
const ACTIVE_STATUSES = "('scheduled','open','winner_selected','payment_pending','payment_detected','creative_pending','ready','live')";

interface ProfileAccessRow {
  id: string;
  profile_type: 'creator' | 'project';
  owner_user_id: string | null;
  organization_id: string | null;
}

interface AuctionRow {
  id: string;
  slot_id: string;
  profile_id: string;
  owner_user_id: string;
  status: string;
  duration_hours: number;
  starting_bid_cents: number;
  highest_bid_cents: number | null;
  highest_bid_id: string | null;
  winner_bid_id: string | null;
  winner_user_id: string | null;
  opens_at: string;
  expires_at: string;
  payment_due_at: string | null;
  promotion_ends_at: string | null;
  seller_payout_wallet_address: string | null;
}

async function requireProfileManager(db: Db, profileId: string, userId: string): Promise<ProfileAccessRow> {
  const profile = await db.first<ProfileAccessRow>(
    `SELECT id, profile_type, owner_user_id, organization_id FROM profiles WHERE id = ?`,
    [profileId],
  );
  if (!profile) throw new HttpError(404, 'Profile not found', 'profile_not_found');
  if (profile.owner_user_id === userId) return profile;
  if (profile.organization_id) {
    const membership = await db.first<{ id: string }>(
      `SELECT id FROM organization_memberships WHERE organization_id = ? AND user_id = ? AND status = 'active' AND role IN ('owner','admin','marketing_manager') LIMIT 1`,
      [profile.organization_id, userId],
    );
    if (membership) return profile;
  }
  throw new HttpError(403, 'Profile management access required', 'profile_forbidden');
}

function evmAddress(value: unknown): string {
  const address = String(value || '').trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(address)) throw new HttpError(400, 'Valid EVM payout wallet required', 'invalid_payout_wallet');
  return address;
}

function integerCents(value: unknown, field: string): number {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 900_000_000_000) throw new HttpError(400, `${field} must be a positive integer`, 'invalid_amount');
  return amount;
}

async function isProfileOwnerOrMember(db: Db, profileId: string, userId: string): Promise<boolean> {
  const profile = await db.first<ProfileAccessRow>(
    `SELECT id, profile_type, owner_user_id, organization_id FROM profiles WHERE id = ?`,
    [profileId],
  );
  if (!profile) throw new HttpError(404, 'Profile not found', 'profile_not_found');
  if (profile.owner_user_id === userId) return true;
  if (!profile.organization_id) return false;
  const membership = await db.first<{ id: string }>(
    `SELECT id FROM organization_memberships WHERE organization_id = ? AND user_id = ? AND status = 'active' LIMIT 1`,
    [profile.organization_id, userId],
  );
  return Boolean(membership);
}

export async function configurePromotionSlot(request: Request, env: Env, profileId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ enabled?: boolean; payoutWalletAddress?: string; liveDurationHours?: number; startingBidCents?: number }>(request);
  const db = new Db(requireDb(env));
  await requireProfileManager(db, profileId, auth.user.id);
  const timestamp = now();
  const liveDurationHours = body.liveDurationHours === undefined ? null : Number(body.liveDurationHours);
  if (liveDurationHours !== null && ![24, 72, 168, 720].includes(liveDurationHours)) throw new HttpError(400, 'Live banner duration must be 24 hours, 3 days, 7 days, or 30 days', 'invalid_live_duration');
  const existing = await db.first<{ id: string }>(`SELECT id FROM profile_promotion_slots WHERE profile_id = ?`, [profileId]);
  const startingBidCents = body.startingBidCents === undefined ? null : integerCents(body.startingBidCents, 'startingBidCents');
  const payout = body.payoutWalletAddress ? evmAddress(body.payoutWalletAddress) : null;
  if (!existing && !payout) throw new HttpError(400, 'Payout wallet is required to enable monetization', 'payout_wallet_required');
  if (existing) {
    if (payout) {
      await db.run(`UPDATE profile_promotion_slots SET enabled = ?, payout_wallet_address = ?, owner_user_id = ?, default_starting_bid_cents = COALESCE(?, default_starting_bid_cents), live_duration_hours = CASE WHEN ? = 720 THEN live_duration_hours ELSE COALESCE(?, live_duration_hours) END, live_duration_days = CASE WHEN ? = 720 THEN 30 ELSE NULL END, updated_at = ? WHERE id = ?`, [body.enabled === false ? 0 : 1, payout, auth.user.id, startingBidCents, liveDurationHours, liveDurationHours, liveDurationHours, timestamp, existing.id]);
    } else {
      await db.run(`UPDATE profile_promotion_slots SET enabled = ?, owner_user_id = ?, default_starting_bid_cents = COALESCE(?, default_starting_bid_cents), live_duration_hours = CASE WHEN ? = 720 THEN live_duration_hours ELSE COALESCE(?, live_duration_hours) END, live_duration_days = CASE WHEN ? = 720 THEN 30 ELSE NULL END, updated_at = ? WHERE id = ?`, [body.enabled === false ? 0 : 1, auth.user.id, startingBidCents, liveDurationHours, liveDurationHours, liveDurationHours, timestamp, existing.id]);
    }
  } else {
    await db.run(
      `INSERT INTO profile_promotion_slots (id, profile_id, owner_user_id, enabled, payout_wallet_address, settlement_network, settlement_asset, live_duration_hours, live_duration_days, default_starting_bid_cents, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'base', 'USDC', ?, ?, ?, ?, ?)`,
      [id('pps'), profileId, auth.user.id, body.enabled === false ? 0 : 1, payout, liveDurationHours === 720 ? 168 : (liveDurationHours ?? 24), liveDurationHours === 720 ? 30 : null, startingBidCents || 100, timestamp, timestamp],
    );
  }
  return json({ ok: true });
}

export async function getPromotionSlot(request: Request, env: Env, profileId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  const db = new Db(requireDb(env));
  await requireProfileManager(db, profileId, auth.user.id);
  const timestamp = now();
  const slot = await db.first<{ enabled: number; payout_wallet_address: string; live_duration_hours: number; live_duration_days: number | null; default_starting_bid_cents: number }>(`SELECT enabled, payout_wallet_address, live_duration_hours, live_duration_days, default_starting_bid_cents FROM profile_promotion_slots WHERE profile_id = ? LIMIT 1`, [profileId]);
  const liveBanner = await db.first<{ banner_url: string; promotion_ends_at: string | null }>(`SELECT c.banner_url, a.promotion_ends_at FROM profile_promotion_auctions a JOIN profile_promotion_creatives c ON c.auction_id = a.id WHERE a.profile_id = ? AND a.status = 'live' AND c.moderation_status = 'approved' AND (a.promotion_ends_at IS NULL OR a.promotion_ends_at > ?) ORDER BY a.live_at DESC, a.id DESC LIMIT 1`, [profileId, timestamp]);
  return json({ slot: slot ? { enabled: slot.enabled === 1, payoutWalletAddress: slot.payout_wallet_address, liveDurationHours: slot.live_duration_days ? slot.live_duration_days * 24 : slot.live_duration_hours, defaultStartingBidCents: slot.default_starting_bid_cents } : null, liveBanner: liveBanner ? { bannerUrl: liveBanner.banner_url, endsAt: liveBanner.promotion_ends_at } : null });
}

export async function createPromotionAuction(request: Request, env: Env, profileId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ startingBidCents?: number; durationHours?: number }>(request);
  const db = new Db(requireDb(env));
  await requireProfileManager(db, profileId, auth.user.id);
  const timestamp = now();
  await db.batch([
    db.statement(`UPDATE profile_promotion_payments SET status = 'expired', updated_at = ? WHERE status IN ('pending','submitted','detected') AND auction_id IN (SELECT id FROM profile_promotion_auctions WHERE profile_id = ? AND payment_due_at IS NOT NULL AND payment_due_at <= ?)`, [timestamp, profileId, timestamp]),
    db.statement(`UPDATE profile_promotion_auctions SET status = 'payment_expired', updated_at = ? WHERE profile_id = ? AND status IN ('payment_pending','payment_detected') AND payment_due_at IS NOT NULL AND payment_due_at <= ?`, [timestamp, profileId, timestamp]),
    db.statement(`UPDATE profile_promotion_auctions SET status = 'expired', updated_at = ? WHERE profile_id = ? AND status = 'live' AND promotion_ends_at IS NOT NULL AND promotion_ends_at <= ?`, [timestamp, profileId, timestamp]),
  ]);
  const slot = await db.first<{ id: string; enabled: number; payout_wallet_address: string }>(`SELECT id, enabled, payout_wallet_address FROM profile_promotion_slots WHERE profile_id = ?`, [profileId]);
  if (!slot || slot.enabled !== 1) throw new HttpError(409, 'Profile promotion monetization is not enabled', 'promotion_slot_disabled');
  const existing = await db.first<{ id: string }>(`SELECT id FROM profile_promotion_auctions WHERE profile_id = ? AND status IN ${ACTIVE_STATUSES} LIMIT 1`, [profileId]);
  if (existing) throw new HttpError(409, 'An active promotion auction already exists for this profile', 'active_auction_exists');
  const durationHours = Number(body.durationHours);
  if (![6, 12, 24].includes(durationHours)) throw new HttpError(400, 'Auction duration must be 6, 12, or 24 hours', 'invalid_auction_duration');
  const startingBidCents = integerCents(body.startingBidCents, 'startingBidCents');
  const opens = new Date();
  const expires = new Date(opens.getTime() + durationHours * 60 * 60 * 1000);
  const auctionId = id('pau');
  await db.run(
    `INSERT INTO profile_promotion_auctions (id, slot_id, profile_id, owner_user_id, seller_payout_wallet_address, status, duration_hours, starting_bid_cents, opens_at, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?)`,
    [auctionId, slot.id, profileId, auth.user.id, slot.payout_wallet_address, durationHours, startingBidCents, opens.toISOString(), expires.toISOString(), opens.toISOString(), opens.toISOString()],
  );
  return json({ auctionId, status: 'open', opensAt: opens.toISOString(), expiresAt: expires.toISOString(), startingBidCents }, { status: 201 });
}

export async function getPromotionAuction(request: Request, env: Env, auctionId: string): Promise<Response> {
  await requireAuth(request, env);
  const db = new Db(requireDb(env));
  const auction = await db.first<AuctionRow>(`SELECT * FROM profile_promotion_auctions WHERE id = ?`, [auctionId]);
  if (!auction) throw new HttpError(404, 'Auction not found', 'auction_not_found');
  const profile = await db.first<{ id: string; username: string; display_name: string | null }>(
    `SELECT id, username, display_name FROM profiles WHERE id = ?`,
    [auction.profile_id],
  );
  const bids = await db.all<{ id: string; amount_cents: number; created_at: string }>(`SELECT id, amount_cents, created_at FROM profile_promotion_bids WHERE auction_id = ? ORDER BY amount_cents DESC, created_at ASC, id ASC LIMIT 50`, [auctionId]);
  return json({ auction, profile, bids });
}

export async function placePromotionBid(request: Request, env: Env, auctionId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ amountCents?: number; organizationId?: string; idempotencyKey?: string }>(request);
  const db = new Db(requireDb(env));
  const amountCents = integerCents(body.amountCents, 'amountCents');
  const auction = await db.first<AuctionRow>(`SELECT * FROM profile_promotion_auctions WHERE id = ?`, [auctionId]);
  if (!auction) throw new HttpError(404, 'Auction not found', 'auction_not_found');
  const timestamp = now();
  if (auction.status !== 'open' || auction.expires_at <= timestamp) throw new HttpError(409, 'Auction is closed', 'auction_closed');
  if (await isProfileOwnerOrMember(db, auction.profile_id, auth.user.id)) throw new HttpError(409, 'Profile owner or organization member cannot bid on their own auction', 'self_bid_forbidden');
  const minimum = Math.max(auction.starting_bid_cents, (auction.highest_bid_cents || 0) + 1);
  if (amountCents < minimum) throw new HttpError(409, `Bid must be at least ${minimum} cents`, 'bid_too_low');
  const idem = String(body.idempotencyKey || request.headers.get('idempotency-key') || '').trim() || null;
  if (idem) {
    const existing = await db.first<{ id: string; amount_cents: number }>(`SELECT id, amount_cents FROM profile_promotion_bids WHERE auction_id = ? AND bidder_user_id = ? AND idempotency_key = ?`, [auctionId, auth.user.id, idem]);
    if (existing) return json({ bidId: existing.id, amountCents: existing.amount_cents, idempotent: true });
  }
  if (body.organizationId) {
    const member = await db.first<{ id: string }>(`SELECT id FROM organization_memberships WHERE organization_id = ? AND user_id = ? AND status = 'active' AND role IN ('owner','admin','marketing_manager') LIMIT 1`, [body.organizationId, auth.user.id]);
    if (!member) throw new HttpError(403, 'Organization bidding access required', 'bidder_org_forbidden');
  }
  const bidId = id('pbd');
  try {
    await db.batch([
      db.statement(`INSERT INTO profile_promotion_bids (id, auction_id, bidder_user_id, bidder_organization_id, amount_cents, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, [bidId, auctionId, auth.user.id, body.organizationId || null, amountCents, idem, timestamp]),
      db.statement(`UPDATE profile_promotion_auctions SET highest_bid_cents = ?, highest_bid_id = ?, updated_at = ? WHERE id = ? AND status = 'open' AND expires_at > ? AND COALESCE(highest_bid_cents, 0) < ?`, [amountCents, bidId, timestamp, auctionId, timestamp, amountCents]),
    ]);
  } catch {
    const latest = await db.first<AuctionRow>(`SELECT * FROM profile_promotion_auctions WHERE id = ?`, [auctionId]);
    const nextMinimum = Math.max(latest?.starting_bid_cents || auction.starting_bid_cents, (latest?.highest_bid_cents || 0) + 1);
    throw new HttpError(409, `Bid lost a concurrent update. Bid at least ${nextMinimum} cents.`, 'bid_race_lost');
  }
  const confirmed = await db.first<{ highest_bid_id: string | null; highest_bid_cents: number | null }>(`SELECT highest_bid_id, highest_bid_cents FROM profile_promotion_auctions WHERE id = ?`, [auctionId]);
  if (confirmed?.highest_bid_id !== bidId) throw new HttpError(409, `Bid was overtaken. Current highest bid is ${confirmed?.highest_bid_cents || 0} cents.`, 'bid_overtaken');
  return json({ bidId, amountCents, highest: true }, { status: 201 });
}

export async function finalizePromotionAuction(request: Request, env: Env, auctionId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const db = new Db(requireDb(env));
  const auction = await db.first<AuctionRow>(`SELECT * FROM profile_promotion_auctions WHERE id = ?`, [auctionId]);
  if (!auction) throw new HttpError(404, 'Auction not found', 'auction_not_found');
  if (!auth.isSuperadmin) await requireProfileManager(db, auction.profile_id, auth.user.id);
  if (auction.winner_bid_id && ['winner_selected','payment_pending','payment_detected','creative_pending','ready','live'].includes(auction.status)) return json({ auctionId, winnerBidId: auction.winner_bid_id, winnerUserId: auction.winner_user_id, status: auction.status, idempotent: true });
  const timestamp = now();
  if (auction.expires_at > timestamp && !auth.isSuperadmin) throw new HttpError(409, 'Auction has not ended yet', 'auction_not_ended');
  const winner = await db.first<{ id: string; bidder_user_id: string; amount_cents: number }>(`SELECT id, bidder_user_id, amount_cents FROM profile_promotion_bids WHERE auction_id = ? ORDER BY amount_cents DESC, created_at ASC, id ASC LIMIT 1`, [auctionId]);
  if (!winner) {
    await db.run(`UPDATE profile_promotion_auctions SET status = 'ended', updated_at = ? WHERE id = ?`, [timestamp, auctionId]);
    return json({ auctionId, status: 'ended', winner: null });
  }
  const recipientWalletAddress = auction.seller_payout_wallet_address;
  if (!recipientWalletAddress) throw new HttpError(409, 'Auction seller payout wallet is missing', 'promotion_payout_snapshot_missing');
  const paymentDueAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const paymentId = id('ppm');
  const amountAtomic = winner.amount_cents * 10000;
  await db.batch([
    db.statement(`UPDATE profile_promotion_auctions SET status = 'payment_pending', winner_bid_id = ?, winner_user_id = ?, highest_bid_id = ?, highest_bid_cents = ?, payment_due_at = ?, updated_at = ? WHERE id = ? AND winner_bid_id IS NULL`, [winner.id, winner.bidder_user_id, winner.id, winner.amount_cents, paymentDueAt, timestamp, auctionId]),
    db.statement(`INSERT OR IGNORE INTO profile_promotion_payments (id, auction_id, winning_bid_id, payer_user_id, recipient_wallet_address, network, asset, required_amount_atomic, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'base', 'USDC', ?, 'pending', ?, ?)`, [paymentId, auctionId, winner.id, winner.bidder_user_id, recipientWalletAddress, amountAtomic, timestamp, timestamp]),
  ]);
  return json({ auctionId, status: 'payment_pending', winnerBidId: winner.id, winnerUserId: winner.bidder_user_id, amountCents: winner.amount_cents, amountAtomic, recipientWalletAddress, paymentDueAt });
}

export async function submitPromotionCreative(request: Request, env: Env, auctionId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ bannerUrl?: string; destinationUrl?: string; ctaType?: string }>(request);
  const db = new Db(requireDb(env));
  const auction = await db.first<AuctionRow>(`SELECT * FROM profile_promotion_auctions WHERE id = ?`, [auctionId]);
  if (!auction) throw new HttpError(404, 'Auction not found', 'auction_not_found');
  if (auction.winner_user_id !== auth.user.id) throw new HttpError(403, 'Only the auction winner can submit creative', 'creative_forbidden');
  if (!['creative_pending','ready','live'].includes(auction.status)) throw new HttpError(409, 'Payment must be verified before creative submission', 'payment_not_verified');
  let destination: URL;
  let banner: URL;
  try { destination = new URL(String(body.destinationUrl || '')); } catch { throw new HttpError(400, 'Valid destination URL required', 'invalid_destination_url'); }
  try { banner = new URL(String(body.bannerUrl || '')); } catch { throw new HttpError(400, 'Valid banner URL required', 'invalid_banner_url'); }
  if (!['http:', 'https:'].includes(destination.protocol) || !['http:', 'https:'].includes(banner.protocol)) throw new HttpError(400, 'Only HTTP(S) URLs are supported', 'invalid_url_protocol');
  const allowedCta = new Set(['join','register','book_now','learn_more','visit','explore','trade','mint','buy','view']);
  const cta = String(body.ctaType || 'visit');
  if (!allowedCta.has(cta)) throw new HttpError(400, 'Unsupported CTA type', 'invalid_cta');
  const timestamp = now();
  const trackingCode = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  const existing = await db.first<{ id: string }>(`SELECT id FROM profile_promotion_creatives WHERE auction_id = ?`, [auctionId]);
  if (existing) {
    await db.run(`UPDATE profile_promotion_creatives SET banner_url = ?, destination_url = ?, cta_type = ?, moderation_status = 'pending', updated_at = ? WHERE id = ?`, [banner.toString(), destination.toString(), cta, timestamp, existing.id]);
    return json({ creativeId: existing.id, moderationStatus: 'pending' });
  }
  const creativeId = id('pcr');
  await db.run(`INSERT INTO profile_promotion_creatives (id, auction_id, advertiser_user_id, banner_url, destination_url, tracking_code, cta_type, moderation_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`, [creativeId, auctionId, auth.user.id, banner.toString(), destination.toString(), trackingCode, cta, timestamp, timestamp]);
  return json({ creativeId, trackingCode, moderationStatus: 'pending' }, { status: 201 });
}

export async function getLiveProfilePromotion(_request: Request, env: Env, profileId: string): Promise<Response> {
  const db = new Db(requireDb(env));
  const row = await db.first<{ auction_id: string; creative_id: string; banner_url: string; destination_url: string; cta_type: string; tracking_code: string; promotion_ends_at: string | null }>(
    `SELECT a.id AS auction_id, c.id AS creative_id, c.banner_url, c.destination_url, c.cta_type, c.tracking_code, a.promotion_ends_at
       FROM profile_promotion_auctions a
       JOIN profile_promotion_creatives c ON c.auction_id = a.id
      WHERE a.profile_id = ? AND a.status = 'live' AND c.moderation_status = 'approved' AND (a.promotion_ends_at IS NULL OR a.promotion_ends_at > ?)
      ORDER BY a.live_at DESC LIMIT 1`,
    [profileId, now()],
  );
  return json({ promotion: row || null });
}
