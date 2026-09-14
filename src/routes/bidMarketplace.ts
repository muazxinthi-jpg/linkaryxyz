import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { json } from '../http';
import { requireAuth } from '../auth/session';

const nowIso = () => new Date().toISOString();

function viewStartDate(days = 30): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - (days - 1));
  return date.toISOString().slice(0, 10);
}

export async function recordPublicProfileView(env: Env, username: string): Promise<void> {
  try {
    const db = new Db(requireDb(env));
    const profile = await db.first<{ id: string }>(
      `SELECT id FROM profiles WHERE lower(username) = lower(?) AND visibility = 'published' LIMIT 1`,
      [username],
    );
    if (!profile) return;
    const timestamp = nowIso();
    const day = timestamp.slice(0, 10);
    await db.run(
      `INSERT INTO public_profile_daily_views (profile_id, view_date, views, updated_at)
       VALUES (?, ?, 1, ?)
       ON CONFLICT(profile_id, view_date)
       DO UPDATE SET views = views + 1, updated_at = excluded.updated_at`,
      [profile.id, day, timestamp],
    );
  } catch {
    // Profile-view analytics must never block a public profile response.
  }
}

export async function getBidMarketplace(request: Request, env: Env): Promise<Response> {
  await requireAuth(request, env);
  const db = new Db(requireDb(env));
  const timestamp = nowIso();
  const viewStart = viewStartDate(30);

  const active = await db.all<{
    auction_id: string;
    profile_id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    profile_type: string;
    starting_bid_cents: number;
    highest_bid_cents: number | null;
    expires_at: string;
    bid_count: number;
    views_30d: number;
  }>(
    `SELECT
       a.id AS auction_id,
       a.profile_id,
       p.username,
       p.display_name,
       p.avatar_url,
       p.profile_type,
       a.starting_bid_cents,
       a.highest_bid_cents,
       a.expires_at,
       (SELECT COUNT(*) FROM profile_promotion_bids b WHERE b.auction_id = a.id) AS bid_count,
       COALESCE((SELECT SUM(v.views) FROM public_profile_daily_views v WHERE v.profile_id = p.id AND v.view_date >= ?), 0) AS views_30d
     FROM profile_promotion_auctions a
     JOIN profiles p ON p.id = a.profile_id
     WHERE a.status = 'open' AND a.expires_at > ? AND p.visibility = 'published'
     ORDER BY COALESCE(a.highest_bid_cents, a.starting_bid_cents) DESC, a.expires_at ASC
     LIMIT 100`,
    [viewStart, timestamp],
  );

  const topBidders = await db.all<{
    label: string;
    bidder_type: string;
    bid_count: number;
    total_bid_cents: number;
    wins: number;
  }>(
    `SELECT
       CASE WHEN b.bidder_organization_id IS NOT NULL THEN COALESCE(o.name, 'Linkary Project') ELSE COALESCE(NULLIF(u.display_name, ''), 'Linkary bidder') END AS label,
       CASE WHEN b.bidder_organization_id IS NOT NULL THEN 'project' ELSE 'user' END AS bidder_type,
       COUNT(*) AS bid_count,
       SUM(b.amount_cents) AS total_bid_cents,
       SUM(CASE WHEN a.winner_bid_id = b.id THEN 1 ELSE 0 END) AS wins
     FROM profile_promotion_bids b
     JOIN profile_promotion_auctions a ON a.id = b.auction_id
     LEFT JOIN organizations o ON o.id = b.bidder_organization_id
     LEFT JOIN users u ON u.id = b.bidder_user_id
     GROUP BY COALESCE(b.bidder_organization_id, b.bidder_user_id), bidder_type, label
     ORDER BY total_bid_cents DESC, bid_count DESC
     LIMIT 50`,
  );

  const topWinners = await db.all<{
    label: string;
    bidder_type: string;
    wins: number;
    winning_value_cents: number;
  }>(
    `SELECT
       CASE WHEN b.bidder_organization_id IS NOT NULL THEN COALESCE(o.name, 'Linkary Project') ELSE COALESCE(NULLIF(u.display_name, ''), 'Linkary bidder') END AS label,
       CASE WHEN b.bidder_organization_id IS NOT NULL THEN 'project' ELSE 'user' END AS bidder_type,
       COUNT(*) AS wins,
       SUM(b.amount_cents) AS winning_value_cents
     FROM profile_promotion_auctions a
     JOIN profile_promotion_bids b ON b.id = a.winner_bid_id
     LEFT JOIN organizations o ON o.id = b.bidder_organization_id
     LEFT JOIN users u ON u.id = b.bidder_user_id
     WHERE a.winner_bid_id IS NOT NULL
     GROUP BY COALESCE(b.bidder_organization_id, b.bidder_user_id), bidder_type, label
     ORDER BY wins DESC, winning_value_cents DESC
     LIMIT 50`,
  );

  const mostBidOn = [...active].sort((a, b) => b.bid_count - a.bid_count || (b.highest_bid_cents || 0) - (a.highest_bid_cents || 0));
  const mostViewed = [...active].sort((a, b) => b.views_30d - a.views_30d || b.bid_count - a.bid_count);

  return json({
    generatedAt: timestamp,
    active,
    topBidders,
    topWinners,
    mostBidOn,
    mostViewed,
  });
}
