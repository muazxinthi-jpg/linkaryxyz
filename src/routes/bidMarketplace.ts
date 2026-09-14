import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { HttpError, json } from '../http';
import { requireAuth } from '../auth/session';

const nowIso = () => new Date().toISOString();
const PAGE_SIZE = 24;
const PERIODS = ['24h', '7d', '30d', 'all'] as const;
type Period = typeof PERIODS[number];
type RankedMode = 'views' | 'bids' | 'active' | 'ending';

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

function searchFrom(request: Request): string {
  return (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 80);
}

function profileTypeFrom(request: Request): string {
  const value = (new URL(request.url).searchParams.get('profileType') || '').trim().toLowerCase();
  return value === 'creator' || value === 'project' ? value : '';
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

type ProfileRow = {
  profile_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  profile_type: string;
  views: number;
  bid_count: number;
  bidder_count: number;
  auction_id: string | null;
  starting_bid_cents: number | null;
  highest_bid_cents: number | null;
  highest_bidder_user_id: string | null;
  my_bid_cents: number | null;
  expires_at: string | null;
};

type Paged<T> = { items: T[]; total: number };

type MyAuctionRow = {
  auction_id: string;
  profile_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  profile_type: string;
  status: string;
  starting_bid_cents: number;
  highest_bid_cents: number | null;
  my_bid_cents: number;
  expires_at: string;
  payment_due_at: string | null;
  promotion_ends_at: string | null;
  payment_status: string | null;
};

function discoveryWhere(search: string, profileType: string): { sql: string; params: string[] } {
  const clauses: string[] = [];
  const params: string[] = [];
  if (search) {
    const like = `%${search.toLowerCase()}%`;
    clauses.push(`AND (lower(p.display_name) LIKE ? OR lower(p.username) LIKE ? OR lower(p.profile_type) LIKE ?)`);
    params.push(like, like, like);
  }
  if (profileType) {
    clauses.push('AND p.profile_type = ?');
    params.push(profileType);
  }
  return { sql: clauses.join('\n'), params };
}

async function rankedProfiles(
  db: Db,
  period: Period,
  page: number,
  mode: RankedMode,
  userId: string,
  search: string,
  profileType: string,
): Promise<Paged<ProfileRow>> {
  const views = viewFilter(period);
  const offset = (page - 1) * PAGE_SIZE;
  const activeAt = nowIso();
  const endingAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const discovery = discoveryWhere(search, profileType);
  const additionalWhere = mode === 'active'
    ? `AND EXISTS (SELECT 1 FROM profile_promotion_auctions active WHERE active.profile_id = p.id AND active.status = 'open' AND active.expires_at > ?)`
    : mode === 'ending'
      ? `AND EXISTS (SELECT 1 FROM profile_promotion_auctions active WHERE active.profile_id = p.id AND active.status = 'open' AND active.expires_at > ? AND active.expires_at <= ?)`
      : mode === 'bids'
        ? `AND EXISTS (SELECT 1 FROM profile_promotion_bids received JOIN profile_promotion_auctions received_auction ON received_auction.id = received.auction_id WHERE received_auction.profile_id = p.id)`
        : '';
  const additionalParams = mode === 'active' ? [activeAt] : mode === 'ending' ? [activeAt, endingAt] : [];
  const order = mode === 'bids'
    ? 'bid_count DESC, bidder_count DESC, views DESC, lower(p.display_name) ASC, p.id ASC'
    : mode === 'active'
      ? 'COALESCE(highest_bid_cents, starting_bid_cents) DESC, expires_at ASC, p.id ASC'
      : mode === 'ending'
        ? 'expires_at ASC, COALESCE(highest_bid_cents, starting_bid_cents) DESC, p.id ASC'
        : 'views DESC, lower(p.display_name) ASC, p.id ASC';

  const select = `SELECT p.id AS profile_id, p.username, p.display_name, p.avatar_url, p.profile_type,
        COALESCE((SELECT SUM(v.views) FROM public_profile_daily_views v WHERE v.profile_id = p.id ${views.sql}), 0) AS views,
        (SELECT COUNT(*) FROM profile_promotion_bids received JOIN profile_promotion_auctions received_auction ON received_auction.id = received.auction_id WHERE received_auction.profile_id = p.id) AS bid_count,
        (SELECT COUNT(DISTINCT received.bidder_user_id) FROM profile_promotion_bids received JOIN profile_promotion_auctions received_auction ON received_auction.id = received.auction_id WHERE received_auction.profile_id = p.id) AS bidder_count,
        (SELECT live.id FROM profile_promotion_auctions live WHERE live.profile_id = p.id AND live.status = 'open' AND live.expires_at > ? ORDER BY live.expires_at ASC, live.id ASC LIMIT 1) AS auction_id,
        (SELECT live.starting_bid_cents FROM profile_promotion_auctions live WHERE live.profile_id = p.id AND live.status = 'open' AND live.expires_at > ? ORDER BY live.expires_at ASC, live.id ASC LIMIT 1) AS starting_bid_cents,
        (SELECT live.highest_bid_cents FROM profile_promotion_auctions live WHERE live.profile_id = p.id AND live.status = 'open' AND live.expires_at > ? ORDER BY live.expires_at ASC, live.id ASC LIMIT 1) AS highest_bid_cents,
        (SELECT high_bid.bidder_user_id FROM profile_promotion_auctions live LEFT JOIN profile_promotion_bids high_bid ON high_bid.id = live.highest_bid_id WHERE live.profile_id = p.id AND live.status = 'open' AND live.expires_at > ? ORDER BY live.expires_at ASC, live.id ASC LIMIT 1) AS highest_bidder_user_id,
        (SELECT MAX(mine.amount_cents) FROM profile_promotion_bids mine JOIN profile_promotion_auctions mine_auction ON mine_auction.id = mine.auction_id WHERE mine_auction.profile_id = p.id AND mine_auction.status = 'open' AND mine_auction.expires_at > ? AND mine.bidder_user_id = ?) AS my_bid_cents,
        (SELECT live.expires_at FROM profile_promotion_auctions live WHERE live.profile_id = p.id AND live.status = 'open' AND live.expires_at > ? ORDER BY live.expires_at ASC, live.id ASC LIMIT 1) AS expires_at`;

  const selectParams = [...views.params, activeAt, activeAt, activeAt, activeAt, activeAt, userId, activeAt];
  const [items, total] = await Promise.all([
    db.all<ProfileRow>(
      `${select}
       ${eligibleProfiles}
       ${discovery.sql}
       ${additionalWhere}
       ORDER BY ${order} LIMIT ? OFFSET ?`,
      [...selectParams, ...discovery.params, ...additionalParams, PAGE_SIZE, offset],
    ),
    db.first<{ count: number }>(`SELECT COUNT(*) AS count ${eligibleProfiles} ${discovery.sql} ${additionalWhere}`, [...discovery.params, ...additionalParams]),
  ]);
  return { items, total: total?.count || 0 };
}

export async function getBidMarketplace(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const db = new Db(requireDb(env));
  const period = periodFrom(request);
  const page = pageFrom(request);
  const search = searchFrom(request);
  const profileType = profileTypeFrom(request);
  const views = viewFilter(period);
  const offset = (page - 1) * PAGE_SIZE;
  const activeAt = nowIso();
  const endingAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const discovery = discoveryWhere(search, profileType);

  const [active, endingSoon, mostViewed, mostBidOn, topBidders, topWinners, myBids, wonAuctions, summary] = await Promise.all([
    rankedProfiles(db, period, page, 'active', auth.user.id, search, profileType),
    rankedProfiles(db, period, page, 'ending', auth.user.id, search, profileType),
    rankedProfiles(db, period, page, 'views', auth.user.id, search, profileType),
    rankedProfiles(db, period, page, 'bids', auth.user.id, search, profileType),
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
    db.all<MyAuctionRow>(
      `SELECT a.id AS auction_id, p.id AS profile_id, p.username, p.display_name, p.avatar_url, p.profile_type,
        a.status, a.starting_bid_cents, a.highest_bid_cents, MAX(b.amount_cents) AS my_bid_cents, a.expires_at, a.payment_due_at, a.promotion_ends_at,
        (SELECT payment.status FROM profile_promotion_payments payment WHERE payment.auction_id = a.id LIMIT 1) AS payment_status
       FROM profile_promotion_bids b JOIN profile_promotion_auctions a ON a.id = b.auction_id JOIN profiles p ON p.id = a.profile_id
       WHERE b.bidder_user_id = ?
       GROUP BY a.id, p.id, p.username, p.display_name, p.avatar_url, p.profile_type, a.status, a.starting_bid_cents, a.highest_bid_cents, a.expires_at, a.payment_due_at, a.promotion_ends_at
       ORDER BY MAX(b.created_at) DESC LIMIT ? OFFSET ?`, [auth.user.id, PAGE_SIZE, offset]),
    db.all<MyAuctionRow>(
      `SELECT a.id AS auction_id, p.id AS profile_id, p.username, p.display_name, p.avatar_url, p.profile_type,
        a.status, a.starting_bid_cents, a.highest_bid_cents, COALESCE(winner.amount_cents, a.highest_bid_cents, a.starting_bid_cents) AS my_bid_cents, a.expires_at, a.payment_due_at, a.promotion_ends_at,
        (SELECT payment.status FROM profile_promotion_payments payment WHERE payment.auction_id = a.id LIMIT 1) AS payment_status
       FROM profile_promotion_auctions a JOIN profiles p ON p.id = a.profile_id LEFT JOIN profile_promotion_bids winner ON winner.id = a.winner_bid_id
       WHERE a.winner_user_id = ?
       ORDER BY COALESCE(a.payment_due_at, a.expires_at) DESC LIMIT ? OFFSET ?`, [auth.user.id, PAGE_SIZE, offset]),
    db.first<{ active_count: number; active_value_cents: number; bids_placed: number; profile_views: number; profiles_available: number; ending_soon_count: number }>(
      `SELECT
        (SELECT COUNT(*) FROM profile_promotion_auctions a JOIN profiles p ON p.id = a.profile_id LEFT JOIN users owner ON owner.id = p.owner_user_id LEFT JOIN organizations organization ON organization.id = p.organization_id WHERE p.visibility = 'published' AND (p.owner_user_id IS NULL OR owner.status = 'active') AND (p.organization_id IS NULL OR organization.status = 'active') AND a.status = 'open' AND a.expires_at > ?) AS active_count,
        (SELECT COALESCE(SUM(COALESCE(a.highest_bid_cents, a.starting_bid_cents)), 0) FROM profile_promotion_auctions a JOIN profiles p ON p.id = a.profile_id LEFT JOIN users owner ON owner.id = p.owner_user_id LEFT JOIN organizations organization ON organization.id = p.organization_id WHERE p.visibility = 'published' AND (p.owner_user_id IS NULL OR owner.status = 'active') AND (p.organization_id IS NULL OR organization.status = 'active') AND a.status = 'open' AND a.expires_at > ?) AS active_value_cents,
        (SELECT COUNT(*) FROM profile_promotion_bids) AS bids_placed,
        (SELECT COALESCE(SUM(v.views), 0) FROM public_profile_daily_views v JOIN profiles p ON p.id = v.profile_id LEFT JOIN users owner ON owner.id = p.owner_user_id LEFT JOIN organizations organization ON organization.id = p.organization_id WHERE p.visibility = 'published' AND (p.owner_user_id IS NULL OR owner.status = 'active') AND (p.organization_id IS NULL OR organization.status = 'active') ${views.sql}) AS profile_views,
        (SELECT COUNT(*) ${eligibleProfiles} ${discovery.sql}) AS profiles_available,
        (SELECT COUNT(*) FROM profile_promotion_auctions a JOIN profiles p ON p.id = a.profile_id LEFT JOIN users owner ON owner.id = p.owner_user_id LEFT JOIN organizations organization ON organization.id = p.organization_id WHERE p.visibility = 'published' AND (p.owner_user_id IS NULL OR owner.status = 'active') AND (p.organization_id IS NULL OR organization.status = 'active') AND a.status = 'open' AND a.expires_at > ? AND a.expires_at <= ?) AS ending_soon_count`,
      [activeAt, activeAt, ...views.params, ...discovery.params, activeAt, endingAt],
    ),
  ]);

  return json({
    generatedAt: nowIso(), period, page, pageSize: PAGE_SIZE, search, profileType,
    active, endingSoon, mostViewed, mostBidOn, topBidders, topWinners, myBids, wonAuctions,
    summary: summary || { active_count: 0, active_value_cents: 0, bids_placed: 0, profile_views: 0, profiles_available: 0, ending_soon_count: 0 },
  });
}
