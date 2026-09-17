import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { HttpError, json } from '../http';
import { requireAuth } from '../auth/session';

const nowIso = () => new Date().toISOString();
const PAGE_SIZE = 24;
const PERIODS = ['24h', '7d', '30d', 'all'] as const;
type Period = typeof PERIODS[number];

function periodFrom(request: Request): Period {
  const value = new URL(request.url).searchParams.get('period') || '30d';
  if (!(PERIODS as readonly string[]).includes(value)) throw new HttpError(400, 'Choose 24h, 7d, 30d, or all time', 'marketplace_period_invalid');
  return value as Period;
}

function pageFrom(request: Request): number {
  const value = Number(new URL(request.url).searchParams.get('page') || '1');
  if (!Number.isInteger(value) || value < 1 || value > 10_000) throw new HttpError(400, 'Invalid marketplace page', 'marketplace_page_invalid');
  return value;
}

function viewStartDate(period: Period): string | null {
  if (period === 'all') return null;
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - (period === '24h' ? 0 : period === '7d' ? 6 : 29));
  return date.toISOString().slice(0, 10);
}

function viewFilter(period: Period, alias = 'v'): { sql: string; params: string[] } {
  const start = viewStartDate(period);
  return start ? { sql: `AND ${alias}.view_date >= ?`, params: [start] } : { sql: '', params: [] };
}

// The marketplace lists every published profile backed by an active owner or project.
const eligibleProfiles = `
  FROM profiles p
  LEFT JOIN users owner ON owner.id = p.owner_user_id
  LEFT JOIN organizations organization ON organization.id = p.organization_id
  WHERE p.visibility = 'published'
    AND (p.owner_user_id IS NULL OR owner.status = 'active')
    AND (p.organization_id IS NULL OR organization.status = 'active')`;

export async function recordPublicProfileView(env: Env, username: string): Promise<void> {
  try {
    const db = new Db(requireDb(env));
    const profile = await db.first<{ id: string }>(`SELECT p.id ${eligibleProfiles} AND lower(p.username) = lower(?) LIMIT 1`, [username]);
    if (!profile) return;
    const timestamp = nowIso();
    await db.run(
      `INSERT INTO public_profile_daily_views (profile_id, view_date, views, updated_at) VALUES (?, ?, 1, ?)
       ON CONFLICT(profile_id, view_date) DO UPDATE SET views = views + 1, updated_at = excluded.updated_at`,
      [profile.id, timestamp.slice(0, 10), timestamp],
    );
  } catch {
    // Profile-view analytics must never block a public profile response.
  }
}

type ProfileRow = { profile_id: string; username: string; display_name: string; avatar_url: string | null; banner_url: string | null; banner_ends_at: string | null; profile_type: string; views: number; bid_count: number; auction_id: string | null; starting_bid_cents: number | null; highest_bid_cents: number | null; expires_at: string | null };
type Paged<T> = { items: T[]; total: number };

async function rankedProfiles(db: Db, period: Period, page: number, mode: 'views' | 'bids' | 'active'): Promise<Paged<ProfileRow>> {
  const views = viewFilter(period);
  const offset = (page - 1) * PAGE_SIZE;
  const activeAt = nowIso();
  const additionalWhere = mode === 'active'
    ? `AND EXISTS (SELECT 1 FROM profile_promotion_auctions active WHERE active.profile_id = p.id AND active.status = 'open' AND active.expires_at > ?)`
    : mode === 'bids'
      ? `AND EXISTS (SELECT 1 FROM profile_promotion_bids received JOIN profile_promotion_auctions received_auction ON received_auction.id = received.auction_id WHERE received_auction.profile_id = p.id)`
      : '';
  const additionalParams = mode === 'active' ? [activeAt] : [];
  const order = mode === 'bids'
    ? 'bid_count DESC, views DESC, lower(p.display_name) ASC, p.id ASC'
    : mode === 'active'
      ? 'expires_at ASC, COALESCE(highest_bid_cents, starting_bid_cents) DESC, lower(p.display_name) ASC, p.id ASC'
      : 'views DESC, lower(p.display_name) ASC, p.id ASC';
  const [items, total] = await Promise.all([
    db.all<ProfileRow>(
      `SELECT p.id AS profile_id, p.username, p.display_name, p.avatar_url,
        (SELECT c.banner_url FROM profile_promotion_creatives c JOIN profile_promotion_auctions la ON la.id = c.auction_id WHERE la.profile_id = p.id AND la.status = 'live' AND c.moderation_status = 'approved' AND (la.promotion_ends_at IS NULL OR la.promotion_ends_at > ?) ORDER BY la.live_at DESC, c.id DESC LIMIT 1) AS banner_url,
        (SELECT la.promotion_ends_at FROM profile_promotion_auctions la JOIN profile_promotion_creatives c ON c.auction_id = la.id WHERE la.profile_id = p.id AND la.status = 'live' AND c.moderation_status = 'approved' AND (la.promotion_ends_at IS NULL OR la.promotion_ends_at > ?) ORDER BY la.live_at DESC, c.id DESC LIMIT 1) AS banner_ends_at,
        p.profile_type,
        COALESCE((SELECT SUM(v.views) FROM public_profile_daily_views v WHERE v.profile_id = p.id ${views.sql}), 0) AS views,
        (SELECT COUNT(*) FROM profile_promotion_bids received JOIN profile_promotion_auctions received_auction ON received_auction.id = received.auction_id WHERE received_auction.profile_id = p.id) AS bid_count,
        (SELECT live.id FROM profile_promotion_auctions live WHERE live.profile_id = p.id AND live.status = 'open' AND live.expires_at > ? ORDER BY live.expires_at ASC, live.id ASC LIMIT 1) AS auction_id,
        (SELECT live.starting_bid_cents FROM profile_promotion_auctions live WHERE live.profile_id = p.id AND live.status = 'open' AND live.expires_at > ? ORDER BY live.expires_at ASC, live.id ASC LIMIT 1) AS starting_bid_cents,
        (SELECT live.highest_bid_cents FROM profile_promotion_auctions live WHERE live.profile_id = p.id AND live.status = 'open' AND live.expires_at > ? ORDER BY live.expires_at ASC, live.id ASC LIMIT 1) AS highest_bid_cents,
        (SELECT live.expires_at FROM profile_promotion_auctions live WHERE live.profile_id = p.id AND live.status = 'open' AND live.expires_at > ? ORDER BY live.expires_at ASC, live.id ASC LIMIT 1) AS expires_at
       ${eligibleProfiles}
       ${additionalWhere}
       ORDER BY ${order} LIMIT ? OFFSET ?`,
      [...views.params, activeAt, activeAt, activeAt, activeAt, activeAt, activeAt, ...additionalParams, PAGE_SIZE, offset],
    ),
    db.first<{ count: number }>(`SELECT COUNT(*) AS count ${eligibleProfiles} ${additionalWhere}`, additionalParams),
  ]);
  return { items, total: total?.count || 0 };
}

export async function getBidMarketplace(request: Request, env: Env): Promise<Response> {
  await requireAuth(request, env);
  const db = new Db(requireDb(env));
  const period = periodFrom(request);
  const page = pageFrom(request);
  const views = viewFilter(period);
  const offset = (page - 1) * PAGE_SIZE;
  const activeAt = nowIso();
  const [active, mostViewed, mostBidOn, topBidders, topWinners, summary] = await Promise.all([
    rankedProfiles(db, period, page, 'active'),
    rankedProfiles(db, period, page, 'views'),
    rankedProfiles(db, period, page, 'bids'),
    db.all<{ label: string; bidder_type: string; bid_count: number; total_bid_cents: number; wins: number }>(
      `SELECT CASE WHEN b.bidder_organization_id IS NOT NULL THEN COALESCE(o.name, 'Linkary Project') ELSE COALESCE(NULLIF(u.display_name, ''), 'Linkary bidder') END AS label,
        CASE WHEN b.bidder_organization_id IS NOT NULL THEN 'project' ELSE 'user' END AS bidder_type, COUNT(*) AS bid_count, SUM(b.amount_cents) AS total_bid_cents, SUM(CASE WHEN a.winner_bid_id = b.id THEN 1 ELSE 0 END) AS wins
       FROM profile_promotion_bids b JOIN profile_promotion_auctions a ON a.id = b.auction_id LEFT JOIN organizations o ON o.id = b.bidder_organization_id LEFT JOIN users u ON u.id = b.bidder_user_id
       WHERE (b.bidder_organization_id IS NOT NULL OR u.status = 'active') GROUP BY COALESCE(b.bidder_organization_id, b.bidder_user_id), bidder_type, label
       ORDER BY total_bid_cents DESC, bid_count DESC, label ASC LIMIT ? OFFSET ?`, [PAGE_SIZE, offset]),
    db.all<{ label: string; bidder_type: string; wins: number; winning_value_cents: number }>(
      `SELECT CASE WHEN b.bidder_organization_id IS NOT NULL THEN COALESCE(o.name, 'Linkary Project') ELSE COALESCE(NULLIF(u.display_name, ''), 'Linkary bidder') END AS label,
        CASE WHEN b.bidder_organization_id IS NOT NULL THEN 'project' ELSE 'user' END AS bidder_type, COUNT(*) AS wins, SUM(b.amount_cents) AS winning_value_cents
       FROM profile_promotion_auctions a JOIN profile_promotion_bids b ON b.id = a.winner_bid_id LEFT JOIN organizations o ON o.id = b.bidder_organization_id LEFT JOIN users u ON u.id = b.bidder_user_id
       WHERE (b.bidder_organization_id IS NOT NULL OR u.status = 'active') GROUP BY COALESCE(b.bidder_organization_id, b.bidder_user_id), bidder_type, label
       ORDER BY wins DESC, winning_value_cents DESC, label ASC LIMIT ? OFFSET ?`, [PAGE_SIZE, offset]),
    db.first<{ active_count: number; active_value_cents: number; bids_placed: number; profile_views: number }>(
      `SELECT
        (SELECT COUNT(*) FROM profile_promotion_auctions a JOIN profiles p ON p.id = a.profile_id LEFT JOIN users owner ON owner.id = p.owner_user_id LEFT JOIN organizations organization ON organization.id = p.organization_id WHERE p.visibility = 'published' AND (p.owner_user_id IS NULL OR owner.status = 'active') AND (p.organization_id IS NULL OR organization.status = 'active') AND a.status = 'open' AND a.expires_at > ?) AS active_count,
        (SELECT COALESCE(SUM(COALESCE(a.highest_bid_cents, a.starting_bid_cents)), 0) FROM profile_promotion_auctions a JOIN profiles p ON p.id = a.profile_id LEFT JOIN users owner ON owner.id = p.owner_user_id LEFT JOIN organizations organization ON organization.id = p.organization_id WHERE p.visibility = 'published' AND (p.owner_user_id IS NULL OR owner.status = 'active') AND (p.organization_id IS NULL OR organization.status = 'active') AND a.status = 'open' AND a.expires_at > ?) AS active_value_cents,
        (SELECT COUNT(*) FROM profile_promotion_bids) AS bids_placed,
        (SELECT COALESCE(SUM(v.views), 0) FROM public_profile_daily_views v JOIN profiles p ON p.id = v.profile_id LEFT JOIN users owner ON owner.id = p.owner_user_id LEFT JOIN organizations organization ON organization.id = p.organization_id WHERE p.visibility = 'published' AND (p.owner_user_id IS NULL OR owner.status = 'active') AND (p.organization_id IS NULL OR organization.status = 'active') ${views.sql}) AS profile_views`,
      [activeAt, activeAt, ...views.params],
    ),
  ]);
  return json({ generatedAt: nowIso(), period, page, pageSize: PAGE_SIZE, active, mostViewed, mostBidOn, topBidders, topWinners, summary: summary || { active_count: 0, active_value_cents: 0, bids_placed: 0, profile_views: 0 } });
}
