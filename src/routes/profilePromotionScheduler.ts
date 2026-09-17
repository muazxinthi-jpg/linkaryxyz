import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;

/**
 * Keeps enabled profile promotion slots moving without requiring the owner to
 * press Start auction. A cron tick is deliberately idempotent: the partial
 * unique index on active auctions remains the final race guard.
 */
export async function runPromotionAuctionScheduler(env: Env): Promise<void> {
  const db = new Db(requireDb(env));
  const timestamp = now();
  await db.batch([
    db.statement(`UPDATE profile_promotion_auctions SET status = 'expired', updated_at = ? WHERE status = 'live' AND promotion_ends_at IS NOT NULL AND promotion_ends_at <= ?`, [timestamp, timestamp]),
    db.statement(`UPDATE profile_promotion_payments SET status = 'expired', updated_at = ? WHERE status IN ('pending','submitted','detected') AND auction_id IN (SELECT id FROM profile_promotion_auctions WHERE payment_due_at IS NOT NULL AND payment_due_at <= ?)`, [timestamp, timestamp]),
    db.statement(`UPDATE profile_promotion_auctions SET status = 'payment_expired', updated_at = ? WHERE status IN ('payment_pending','payment_detected') AND payment_due_at IS NOT NULL AND payment_due_at <= ?`, [timestamp, timestamp]),
  ]);

  const expired = await db.all<{ id: string; profile_id: string; seller_payout_wallet_address: string | null }>(
    `SELECT id, profile_id, seller_payout_wallet_address FROM profile_promotion_auctions WHERE status = 'open' AND expires_at <= ? LIMIT 100`,
    [timestamp],
  );
  for (const auction of expired) {
    const winner = await db.first<{ id: string; bidder_user_id: string; amount_cents: number }>(
      `SELECT id, bidder_user_id, amount_cents FROM profile_promotion_bids WHERE auction_id = ? ORDER BY amount_cents DESC, created_at ASC, id ASC LIMIT 1`,
      [auction.id],
    );
    if (!winner || !auction.seller_payout_wallet_address) {
      await db.run(`UPDATE profile_promotion_auctions SET status = 'ended', updated_at = ? WHERE id = ? AND status = 'open'`, [timestamp, auction.id]);
      continue;
    }
    const due = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const paymentId = id('ppm');
    await db.batch([
      db.statement(`UPDATE profile_promotion_auctions SET status = 'payment_pending', winner_bid_id = ?, winner_user_id = ?, highest_bid_id = ?, highest_bid_cents = ?, payment_due_at = ?, updated_at = ? WHERE id = ? AND status = 'open'`, [winner.id, winner.bidder_user_id, winner.id, winner.amount_cents, due, timestamp, auction.id]),
      db.statement(`INSERT OR IGNORE INTO profile_promotion_payments (id, auction_id, winning_bid_id, payer_user_id, recipient_wallet_address, network, asset, required_amount_atomic, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'base', 'USDC', ?, 'pending', ?, ?)`, [paymentId, auction.id, winner.id, winner.bidder_user_id, auction.seller_payout_wallet_address, winner.amount_cents * 10000, timestamp, timestamp]),
    ]);
  }

  const slots = await db.all<{ id: string; profile_id: string; owner_user_id: string; payout_wallet_address: string; default_starting_bid_cents: number }>(
    `SELECT s.id, s.profile_id, s.owner_user_id, s.payout_wallet_address, s.default_starting_bid_cents
       FROM profile_promotion_slots s JOIN profiles p ON p.id = s.profile_id
       LEFT JOIN users u ON u.id = p.owner_user_id
      WHERE s.enabled = 1 AND s.auto_auction_enabled = 1 AND p.visibility = 'published'
        AND (p.owner_user_id IS NULL OR u.status = 'active')
        AND NOT EXISTS (SELECT 1 FROM profile_promotion_auctions a WHERE a.profile_id = s.profile_id AND a.status IN ('scheduled','open','winner_selected','payment_pending','payment_detected','creative_pending','ready','live'))
      LIMIT 100`,
  );
  for (const slot of slots) {
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await db.run(
      `INSERT OR IGNORE INTO profile_promotion_auctions (id, slot_id, profile_id, owner_user_id, seller_payout_wallet_address, status, duration_hours, starting_bid_cents, opens_at, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'open', 24, ?, ?, ?, ?, ?)`,
      [id('pau'), slot.id, slot.profile_id, slot.owner_user_id, slot.payout_wallet_address, Math.max(1, slot.default_starting_bid_cents || 100), timestamp, expires, timestamp, timestamp],
    );
  }
}
