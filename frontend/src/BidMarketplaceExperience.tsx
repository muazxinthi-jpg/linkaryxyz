import { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { ProductWorkspace, type ProductMe, type ProductProfile, type ProductStatus } from './ProductWorkspace';
import './bid-marketplace.css';
import './bid-marketplace-cards.css';

type Period = '24h' | '7d' | '30d' | 'all';
type Tab = 'active' | 'bidders' | 'winners' | 'views' | 'bids';
type ProfileRow = { profile_id: string; username: string; display_name: string; avatar_url: string | null; banner_url: string | null; banner_ends_at: string | null; profile_type: string; views: number; bid_count: number; auction_id: string | null; starting_bid_cents: number | null; highest_bid_cents: number | null; expires_at: string | null };
type Paged<T> = { items: T[]; total: number };
type BidderRow = { label: string; bidder_type: string; bid_count: number; total_bid_cents: number; wins: number };
type WinnerRow = { label: string; bidder_type: string; wins: number; winning_value_cents: number };
type Marketplace = { generatedAt: string; period: Period; page: number; pageSize: number; active: Paged<ProfileRow>; mostViewed: Paged<ProfileRow>; mostBidOn: Paged<ProfileRow>; topBidders: BidderRow[]; topWinners: WinnerRow[]; summary: { active_count: number; active_value_cents: number; bids_placed: number; profile_views: number } };

const money = (cents: number | null | undefined) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format((cents || 0) / 100);
function timeLeft(expiresAt: string | null): string { if (!expiresAt) return ''; const ms = new Date(expiresAt).getTime() - Date.now(); if (ms <= 0) return 'Ending'; const minutes = Math.floor(ms / 60_000); return minutes >= 1440 ? `${Math.floor(minutes / 1440)}d ${Math.floor(minutes / 60) % 24}h` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`; }
function rank(index: number, page: number, pageSize: number): string { const value = (page - 1) * pageSize + index + 1; return value === 1 ? '🥇 1' : value === 2 ? '🥈 2' : value === 3 ? '🥉 3' : `#${value}`; }

function ProfileList({ items, page, pageSize, empty }: { items: ProfileRow[]; page: number; pageSize: number; empty: string }) {
  if (!items.length) return <div className="bid-market-empty"><strong>{empty}</strong><span>Published profiles remain discoverable here even without a banner auction.</span></div>;
  return <div className="bid-market-auctions bid-market-card-grid">{items.map((item, index) => {
    const current = item.highest_bid_cents ?? item.starting_bid_cents;
    const cover = item.banner_url || item.avatar_url;
    const endsAt = item.banner_url && item.banner_ends_at ? item.banner_ends_at : item.expires_at;
    return <article className="bid-market-card bid-market-visual-card" key={item.profile_id}>
      <div className="bid-card-cover">{cover ? <img src={cover} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} /> : <div className="bid-card-cover-fallback">{item.display_name.slice(0, 1).toUpperCase()}</div>}<span className={item.auction_id ? 'bid-card-status live' : 'bid-card-status'}>{item.auction_id ? 'LIVE' : 'PROFILE'}</span><span className="bid-card-rank">{rank(index, page, pageSize)}</span>{item.auction_id && <span className="bid-card-countdown">{item.banner_url ? 'Banner ends' : 'Ends'} {timeLeft(endsAt)}</span>}</div>
      <div className="bid-card-body"><div className="bid-card-identity"><div className="bid-card-avatar">{item.avatar_url ? <img src={item.avatar_url} alt="" /> : item.display_name.slice(0, 1).toUpperCase()}</div><div><strong>{item.display_name}</strong><span>@{item.username}</span></div><em>{item.profile_type}</em></div><div className="bid-card-tags"><span>{item.views.toLocaleString()} views</span><span>{item.bid_count.toLocaleString()} bids</span></div><div className="bid-card-price"><small>{item.auction_id ? 'Current bid' : 'Auction'}</small><strong>{item.auction_id ? money(current) : 'Banner not available'}</strong></div><div className="bid-market-actions"><a className="ops-button secondary" href={`https://linkary.xyz/${item.username}`} target="_blank" rel="noreferrer">View profile ↗</a>{item.auction_id ? <NavLink className="ops-button primary" to={`/promotion-auction/${item.auction_id}`}>Place bid</NavLink> : null}</div></div>
    </article>;
  })}</div>;
}

function Pagination({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (page: number) => void }) {
  if (total <= pageSize) return null;
  return <div className="bid-market-actions"><button className="ops-button secondary" type="button" disabled={page === 1} onClick={() => onPage(page - 1)}>Previous</button><span>{page} / {Math.ceil(total / pageSize)}</span><button className="ops-button secondary" type="button" disabled={page * pageSize >= total} onClick={() => onPage(page + 1)}>Next</button></div>;
}

export default function BidMarketplaceExperience({ me, status }: { me: ProductMe; status: ProductStatus }) {
  const creatorFirst = status.profiles.find((item) => item.profile_type === 'creator') || status.profiles[0];
  const stored = window.localStorage.getItem('linkary.active.profile');
  const [profileId, setProfileId] = useState(stored && status.profiles.some((item) => item.id === stored) ? stored : creatorFirst?.id || '');
  const profile = status.profiles.find((item) => item.id === profileId) || creatorFirst;
  const [tab, setTab] = useState<Tab>('views');
  const [period, setPeriod] = useState<Period>('30d');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Marketplace | null>(null);
  const [error, setError] = useState('');
  function changeProfile(id: string) { setProfileId(id); window.localStorage.setItem('linkary.active.profile', id); }
  async function refresh() { try { const response = await fetch(`/api/bid-marketplace?period=${period}&page=${page}`, { credentials: 'same-origin', cache: 'no-store' }); if (!response.ok) throw new Error('Could not load bid marketplace.'); setData(await response.json() as Marketplace); setError(''); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load bid marketplace.'); } }
  useEffect(() => { void refresh(); const interval = window.setInterval(() => void refresh(), 30000); return () => window.clearInterval(interval); }, [period, page]);
  const activeValue = useMemo(() => data?.summary.active_value_cents || 0, [data]);
  if (!profile) return null;
  const tabs: Array<[Tab, string]> = [['active', 'Current Active'], ['bidders', 'Top Bidders'], ['winners', 'Top Winners'], ['views', 'Most Viewed'], ['bids', 'Most Bid On']];
  const switchTab = (next: Tab) => { setTab(next); setPage(1); };
  const switchPeriod = (next: Period) => { setPeriod(next); setPage(1); };
  const profileList = tab === 'active' ? data?.active : tab === 'views' ? data?.mostViewed : data?.mostBidOn;
  return <ProductWorkspace me={me} status={status} profile={profile as ProductProfile} onProfileChange={changeProfile}><div className="ops-stack bid-marketplace">
    <div className="bid-market-hero"><div><span className="ops-kicker">BID MARKETPLACE</span><h1>Profiles and live banner auctions</h1><p>Browse public Linkary profiles, compare attention, and bid when a banner is available.</p></div><button type="button" className="ops-button secondary" onClick={() => void refresh()}>Refresh</button></div>
    <section className="bid-market-summary"><article><span>LIVE AUCTIONS</span><strong>{data?.summary.active_count ?? 0}</strong><small>Open now</small></article><article><span>ACTIVE VALUE</span><strong>{money(activeValue)}</strong><small>Current / starting bids</small></article><article><span>BIDS PLACED</span><strong>{data?.summary.bids_placed ?? 0}</strong><small>Across banner auctions</small></article><article><span>PROFILE VIEWS</span><strong>{data?.summary.profile_views?.toLocaleString() ?? '0'}</strong><small>{period === 'all' ? 'All-time public views' : `${period.toUpperCase()} public views`}</small></article></section>
    <div className="bid-market-tabs" role="tablist" aria-label="Bid marketplace leaderboards">{tabs.map(([value, label]) => <button key={value} type="button" className={tab === value ? 'active' : ''} onClick={() => switchTab(value)}>{label}</button>)}</div>
    <div className="bid-market-tabs" aria-label="Profile view ranking period">{([['24h', '24H'], ['7d', '7D'], ['30d', '30D'], ['all', 'All Time']] as Array<[Period, string]>).map(([value, label]) => <button key={value} type="button" className={period === value ? 'active' : ''} onClick={() => switchPeriod(value)}>{label}</button>)}</div>
    {error && <div className="ops-message">{error}</div>}{!data && !error && <div className="bid-market-empty"><strong>Loading marketplace...</strong></div>}
    {data && (tab === 'active' || tab === 'views' || tab === 'bids') && <><ProfileList items={profileList?.items || []} page={page} pageSize={data.pageSize} empty={tab === 'views' ? 'No eligible public profiles yet.' : tab === 'bids' ? 'No profiles have received bids yet.' : 'No live auctions right now.'} /><Pagination page={page} total={profileList?.total || 0} pageSize={data.pageSize} onPage={setPage} /></>}
    {data && tab === 'bidders' && <section className="bid-market-leaderboard"><div className="bid-market-leaderboard-head"><span>Rank</span><span>Bidder</span><span>Bids</span><span>Total bid value</span><span>Wins</span></div>{data.topBidders.length ? data.topBidders.map((row, index) => <div className="bid-market-leaderboard-row" key={`${row.bidder_type}-${row.label}-${index}`}><strong>{rank(index, page, data.pageSize)}</strong><div><b>{row.label}</b><small>{row.bidder_type}</small></div><span>{row.bid_count}</span><span>{money(row.total_bid_cents)}</span><span>{row.wins}</span></div>) : <div className="bid-market-empty"><strong>No bids have been placed yet.</strong></div>}</section>}
    {data && tab === 'winners' && <section className="bid-market-leaderboard"><div className="bid-market-leaderboard-head winner"><span>Rank</span><span>Winner</span><span>Wins</span><span>Winning value</span></div>{data.topWinners.length ? data.topWinners.map((row, index) => <div className="bid-market-leaderboard-row winner" key={`${row.bidder_type}-${row.label}-${index}`}><strong>{rank(index, page, data.pageSize)}</strong><div><b>{row.label}</b><small>{row.bidder_type}</small></div><span>{row.wins}</span><span>{money(row.winning_value_cents)}</span></div>) : <div className="bid-market-empty"><strong>No completed auction winners yet.</strong></div>}</section>}
  </div></ProductWorkspace>;
}
