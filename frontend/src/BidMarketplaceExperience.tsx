import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { NavLink } from 'react-router-dom';
import { ProductWorkspace, type ProductMe, type ProductProfile, type ProductStatus } from './ProductWorkspace';
import './bid-marketplace.css';
import './bid-marketplace-cards.css';
import './bid-marketplace-stitch.css';

type Period = '24h' | '7d' | '30d' | 'all';
type Tab = 'active' | 'bidders' | 'winners' | 'views' | 'bids';
type ProfileRow = { profile_id: string; username: string; display_name: string; avatar_url: string | null; banner_url: string | null; has_live_banner: number; banner_ends_at: string | null; profile_type: string; views: number; bid_count: number; auction_id: string | null; starting_bid_cents: number | null; highest_bid_cents: number | null; expires_at: string | null };
type Paged<T> = { items: T[]; total: number };
type BidderRow = { label: string; bidder_type: string; bid_count: number; total_bid_cents: number; wins: number };
type WinnerRow = { label: string; bidder_type: string; wins: number; winning_value_cents: number };
type Marketplace = { generatedAt: string; period: Period; page: number; pageSize: number; active: Paged<ProfileRow>; mostViewed: Paged<ProfileRow>; mostBidOn: Paged<ProfileRow>; topBidders: BidderRow[]; topWinners: WinnerRow[]; summary: { active_count: number; active_value_cents: number; bids_placed: number; profile_views: number } };

const money = (cents: number | null | undefined) => cents == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(cents / 100);
const metric = (value: number | null | undefined) => value == null ? '—' : value.toLocaleString();
function timeLeft(expiresAt: string | null): string { if (!expiresAt) return ''; const ms = new Date(expiresAt).getTime() - Date.now(); if (ms <= 0) return 'Ending'; const minutes = Math.floor(ms / 60_000); return minutes >= 1440 ? `${Math.floor(minutes / 1440)}d ${Math.floor(minutes / 60) % 24}h` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`; }
function rank(index: number, page: number, pageSize: number): string { const value = (page - 1) * pageSize + index + 1; return value === 1 ? '🥇 1' : value === 2 ? '🥈 2' : value === 3 ? '🥉 3' : `#${value}`; }
function updatedLabel(value: string | undefined): string { if (!value) return 'Updating live marketplace'; const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Marketplace data loaded' : `Updated ${new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date)}`; }

function ProfileList({ items, page, pageSize, empty, period }: { items: ProfileRow[]; page: number; pageSize: number; empty: string; period: Period }) {
  if (!items.length) return <div className="bid-market-empty"><strong>{empty}</strong><span>No profiles match this leaderboard right now.</span></div>;
  return <div className="bid-market-auctions bid-market-card-grid">{items.map((item, index) => {
    const current = item.highest_bid_cents ?? item.starting_bid_cents;
    const cover = item.banner_url || item.avatar_url;
    const isPaidLiveBanner = item.has_live_banner === 1;
    const endsAt = item.auction_id ? item.expires_at : item.banner_ends_at;
    return <article className="bid-market-card bid-market-visual-card" key={item.profile_id}>
      <div className="bid-card-cover">{cover ? <img src={cover} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} /> : <div className="bid-card-cover-fallback">{item.display_name.slice(0, 1).toUpperCase()}</div>}<span className={item.auction_id || isPaidLiveBanner ? 'bid-card-status live' : 'bid-card-status'}>{item.auction_id ? 'OPEN FOR BIDDING' : isPaidLiveBanner ? 'LIVE BANNER' : 'PROFILE'}</span><span className="bid-card-rank">{rank(index, page, pageSize)}</span>{endsAt && <span className="bid-card-countdown">{item.auction_id ? 'Auction ends' : 'Banner ends'} {timeLeft(endsAt)}</span>}</div>
      <div className="bid-card-body"><div className="bid-card-identity"><div className="bid-card-avatar">{item.avatar_url ? <img src={item.avatar_url} alt="" /> : item.display_name.slice(0, 1).toUpperCase()}</div><div><strong>{item.display_name}</strong><span>@{item.username}</span></div><em>{item.profile_type}</em></div><div className="bid-card-tags"><span>{metric(item.views)} {period === 'all' ? 'all-time views' : `${period.toUpperCase()} views`}</span><span>{metric(item.bid_count)} bids</span></div><div className="bid-card-price"><small>{item.auction_id ? 'Current bid' : isPaidLiveBanner ? 'Live banner' : 'Open auction'}</small><strong>{item.auction_id ? money(current) : isPaidLiveBanner ? 'Live now' : 'No open auction'}</strong></div><div className="bid-card-availability">{isPaidLiveBanner ? item.banner_ends_at ? `Banner live until ${new Date(item.banner_ends_at).toLocaleString()}` : 'Banner currently live' : item.auction_id ? `Auction closes ${new Date(item.expires_at || '').toLocaleString()}` : 'Not currently open for bidding'}</div><div className="bid-market-actions"><a className="ops-button secondary" href={`https://linkary.xyz/${item.username}`} target="_blank" rel="noreferrer">View profile ↗</a>{item.auction_id ? <NavLink className="ops-button primary" to={`/promotion-auction/${item.auction_id}`}>Place bid</NavLink> : null}</div></div>
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
  const activeValue = useMemo(() => data?.summary.active_value_cents, [data]);
  if (!profile) return null;
  const tabs: Array<[Tab, string]> = [['views', 'Most Viewed'], ['active', 'Current Active'], ['bids', 'Most Bid On'], ['bidders', 'Top Bidders'], ['winners', 'Top Winners']];
  const switchTab = (next: Tab) => { setTab(next); setPage(1); };
  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const nextIndex = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus();
    switchTab(tabs[nextIndex][0]);
  };
  const switchPeriod = (next: Period) => { setPeriod(next); setPage(1); };
  const profileList = tab === 'active' ? data?.active : tab === 'views' ? data?.mostViewed : data?.mostBidOn;
  return <ProductWorkspace me={me} status={status} profile={profile as ProductProfile} onProfileChange={changeProfile}><div className="ops-stack bid-marketplace">
    <div className="bid-market-hero"><div><span className="ops-kicker">BID MARKETPLACE</span><h1>Profiles and live banner auctions</h1><p>Browse public Linkary profiles, compare attention, and bid when a banner is available.</p></div><div className="bid-market-hero-tools"><span className="bid-market-updated" aria-live="polite"><i aria-hidden="true" />{updatedLabel(data?.generatedAt)}</span><button type="button" className="ops-button secondary" onClick={() => void refresh()} aria-label="Refresh bid marketplace">↻ <span>Refresh</span></button></div></div>
    <section className="bid-market-summary"><article><span>OPEN AUCTIONS</span><strong>{data ? metric(data.summary.active_count) : '—'}</strong><small>Open now</small></article><article><span>OPEN AUCTION VALUE</span><strong>{money(activeValue)}</strong><small>Current / starting bids; not settlement</small></article><article><span>ALL-TIME BIDS</span><strong>{data ? metric(data.summary.bids_placed) : '—'}</strong><small>Across banner auctions</small></article><article><span>PUBLIC PROFILE VIEWS</span><strong>{data ? metric(data.summary.profile_views) : '—'}</strong><small>{period === 'all' ? 'All-time public views' : `${period.toUpperCase()} public views`}</small></article></section>
    <div className="bid-market-toolbar"><div className="bid-market-tabs bid-market-primary-tabs" role="tablist" aria-label="Bid marketplace leaderboards">{tabs.map(([value, label], index) => <button key={value} id={`bid-tab-${value}`} role="tab" aria-controls="bid-market-panel" aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} type="button" className={tab === value ? 'active' : ''} onKeyDown={(event) => handleTabKeyDown(event, index)} onClick={() => switchTab(value)}>{label}</button>)}</div><div className="bid-market-period-control"><span>Profile views</span><div className="bid-market-tabs bid-market-periods" role="group" aria-label="Profile view ranking period">{([['24h', '24H'], ['7d', '7D'], ['30d', '30D'], ['all', 'All Time']] as Array<[Period, string]>).map(([value, label]) => <button key={value} type="button" aria-pressed={period === value} className={period === value ? 'active' : ''} onClick={() => switchPeriod(value)}>{label}</button>)}</div></div></div>
    <div id="bid-market-panel" role="tabpanel" aria-labelledby={`bid-tab-${tab}`} tabIndex={0}>
    {error && <div className="ops-message" role="alert">{error}</div>}{!data && !error && <div className="bid-market-empty"><strong>Loading marketplace...</strong></div>}
    {data && (tab === 'active' || tab === 'views' || tab === 'bids') && <>{tab === 'active' && <div className="bid-market-expiry-note"><strong>Expiry leaderboard</strong><span>Profiles open for bidding are ordered by the nearest auction closing time.</span></div>}{tab !== 'views' && <div className="bid-market-period-note">{tab === 'active' ? 'Showing auctions open now.' : 'Ranked by all recorded bids. The selected period applies only to public profile views.'}</div>}<ProfileList items={profileList?.items || []} page={page} pageSize={data.pageSize} period={period} empty={tab === 'views' ? 'No eligible public profiles yet.' : tab === 'bids' ? 'No profiles have received bids yet.' : 'No profiles are open for bidding right now.'} /><Pagination page={page} total={profileList?.total || 0} pageSize={data.pageSize} onPage={setPage} /></>}
    {data && (tab === 'bidders' || tab === 'winners') && <div className="bid-market-period-note">{tab === 'bidders' ? 'Ranked by total bid value across all recorded bids.' : 'Ranked by completed auction wins. The selected period applies only to public profile views.'}</div>}
    {data && tab === 'bidders' && <section className="bid-market-leaderboard" aria-label="Top bidders"><div className="bid-market-leaderboard-head"><span>Rank</span><span>Bidder</span><span>Bids</span><span>Total bid value</span><span>Wins</span></div>{data.topBidders.length ? data.topBidders.map((row, index) => <div className="bid-market-leaderboard-row" key={`${row.bidder_type}-${row.label}-${index}`}><strong data-label="Rank">{rank(index, page, data.pageSize)}</strong><div data-label="Bidder"><b>{row.label}</b><small>{row.bidder_type}</small></div><span data-label="Bids">{row.bid_count}</span><span data-label="Total bid value">{money(row.total_bid_cents)}</span><span data-label="Wins">{row.wins}</span></div>) : <div className="bid-market-empty"><strong>No bids have been placed yet.</strong></div>}</section>}
    {data && tab === 'winners' && <section className="bid-market-leaderboard" aria-label="Top auction winners"><div className="bid-market-leaderboard-head winner"><span>Rank</span><span>Winner</span><span>Wins</span><span>Winning value</span></div>{data.topWinners.length ? data.topWinners.map((row, index) => <div className="bid-market-leaderboard-row winner" key={`${row.bidder_type}-${row.label}-${index}`}><strong data-label="Rank">{rank(index, page, data.pageSize)}</strong><div data-label="Winner"><b>{row.label}</b><small>{row.bidder_type}</small></div><span data-label="Wins">{row.wins}</span><span data-label="Winning value">{money(row.winning_value_cents)}</span></div>) : <div className="bid-market-empty"><strong>No completed auction winners yet.</strong></div>}</section>}
    </div>
  </div></ProductWorkspace>;
}
