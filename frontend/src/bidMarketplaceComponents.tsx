import { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';

export type Period = '24h' | '7d' | '30d' | 'all';
export type MarketplaceTab = 'active' | 'ending' | 'views' | 'bids' | 'mine' | 'won';

export type ProfileRow = {
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

export type MyAuctionRow = {
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

export type Marketplace = {
  generatedAt: string;
  period: Period;
  page: number;
  pageSize: number;
  search: string;
  profileType: string;
  active: { items: ProfileRow[]; total: number };
  endingSoon: { items: ProfileRow[]; total: number };
  mostViewed: { items: ProfileRow[]; total: number };
  mostBidOn: { items: ProfileRow[]; total: number };
  myBids: MyAuctionRow[];
  wonAuctions: MyAuctionRow[];
  summary: {
    active_count: number;
    active_value_cents: number;
    bids_placed: number;
    profile_views: number;
    profiles_available: number;
    ending_soon_count: number;
  };
};

type AuctionDetail = {
  auction: {
    id: string;
    status: string;
    duration_hours: number;
    starting_bid_cents: number;
    highest_bid_cents: number | null;
    expires_at: string;
    payment_due_at: string | null;
  };
  profile: { id: string; username: string; display_name: string | null } | null;
  bids: Array<{ id: string; amount_cents: number; created_at: string }>;
};

export const money = (cents: number | null | undefined) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 2,
}).format((cents || 0) / 100);

export function timeLeft(expiresAt: string | null): string {
  if (!expiresAt) return '—';
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Ended';
  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds % 60}s`;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'L';
}

function statusFor(item: ProfileRow): { label: string; tone: string } {
  if (!item.auction_id) return { label: 'Banner not available', tone: 'neutral' };
  const current = item.highest_bid_cents ?? item.starting_bid_cents ?? 0;
  if (item.my_bid_cents != null && item.my_bid_cents === current) return { label: 'Leading', tone: 'success' };
  if (item.my_bid_cents != null && item.my_bid_cents < current) return { label: 'Outbid', tone: 'warning' };
  const left = item.expires_at ? new Date(item.expires_at).getTime() - Date.now() : Infinity;
  if (left <= 2 * 60 * 60 * 1000) return { label: 'Ending soon', tone: 'urgent' };
  return { label: 'Live', tone: 'live' };
}

export function AuctionStatusBadge({ label, tone = 'neutral' }: { label: string; tone?: string }) {
  return <span className={`bid-status bid-status-${tone}`}><span aria-hidden="true" />{label}</span>;
}

export function CountdownTimer({ expiresAt }: { expiresAt: string | null }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!expiresAt) return;
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);
  const urgent = expiresAt ? new Date(expiresAt).getTime() - Date.now() < 15 * 60 * 1000 : false;
  return <strong className={urgent ? 'bid-countdown urgent' : 'bid-countdown'}>{timeLeft(expiresAt)}</strong>;
}

export function AuctionCard({ item, rank, onSelect }: { item: ProfileRow; rank?: number; onSelect: (item: ProfileRow) => void }) {
  const current = item.highest_bid_cents ?? item.starting_bid_cents;
  const status = statusFor(item);
  return <article className={`bid-auction-card ${item.auction_id ? 'has-auction' : 'profile-only'}`}>
    <button className="bid-card-cover" type="button" onClick={() => item.auction_id ? onSelect(item) : window.open(`https://linkary.xyz/${item.username}`, '_blank')} aria-label={`${item.display_name} ${item.auction_id ? 'auction details' : 'profile'}`}>
      {item.avatar_url ? <img src={item.avatar_url} alt="" /> : <div className="bid-cover-fallback" aria-hidden="true">{initials(item.display_name)}</div>}
      <div className="bid-cover-scrim" />
      {rank ? <span className="bid-card-rank">#{rank}</span> : null}
      <AuctionStatusBadge label={status.label} tone={status.tone} />
      {item.auction_id ? <div className="bid-cover-clock"><span>ENDS IN</span><CountdownTimer expiresAt={item.expires_at} /></div> : null}
    </button>

    <div className="bid-card-body">
      <div className="bid-card-person">
        <div className="bid-card-avatar">{item.avatar_url ? <img src={item.avatar_url} alt="" /> : <span>{initials(item.display_name)}</span>}</div>
        <div className="bid-card-name"><strong>{item.display_name}</strong><span>@{item.username}</span></div>
        <span className="bid-card-type">{item.profile_type}</span>
      </div>

      <div className="bid-card-metrics">
        <div><span>{item.auction_id ? 'Current bid' : '30D views'}</span><strong>{item.auction_id ? money(current) : item.views.toLocaleString()}</strong></div>
        <div><span>{item.auction_id ? 'Starting bid' : 'Total bids'}</span><strong>{item.auction_id ? money(item.starting_bid_cents) : item.bid_count.toLocaleString()}</strong></div>
        <div><span>{item.auction_id ? 'Bidders' : 'Profile type'}</span><strong>{item.auction_id ? item.bidder_count.toLocaleString() : item.profile_type}</strong></div>
      </div>

      {item.auction_id ? <div className="bid-attention-row"><span><b>{item.views.toLocaleString()}</b> profile views</span><span><b>{item.bid_count.toLocaleString()}</b> bids</span></div> : <div className="bid-attention-row"><span>Discover this public Linkary profile.</span></div>}

      <div className="bid-card-actions">
        <a className="bid-secondary-action" href={`https://linkary.xyz/${item.username}`} target="_blank" rel="noreferrer">View profile ↗</a>
        {item.auction_id ? <button className="bid-primary-action" type="button" onClick={() => onSelect(item)}>Place bid</button> : null}
      </div>
    </div>
  </article>;
}

function csrfToken(): string {
  const pair = document.cookie.split('; ').find((item) => item.startsWith('__Host-linkary_csrf='));
  return pair ? decodeURIComponent(pair.slice(pair.indexOf('=') + 1)) : '';
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers || {});
  if (init?.body) headers.set('content-type', 'application/json');
  if (init?.method && !['GET', 'HEAD'].includes(init.method.toUpperCase())) headers.set('x-csrf-token', csrfToken());
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...init, headers });
  const payload = await response.json().catch(() => ({})) as T & { message?: string };
  if (!response.ok) throw new Error(payload.message || `Request failed (${response.status})`);
  return payload;
}

function BidHistoryChart({ bids }: { bids: AuctionDetail['bids'] }) {
  const points = useMemo(() => [...bids].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)).slice(-12), [bids]);
  if (points.length < 2) return <div className="bid-chart-empty">Bid history will appear after more bids are placed.</div>;
  const values = points.map((bid) => bid.amount_cents);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const coordinates = points.map((bid, index) => {
    const x = points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
    const y = 82 - ((bid.amount_cents - min) / range) * 64;
    return `${x},${y}`;
  }).join(' ');
  return <div className="bid-history-chart" aria-label="Bid history chart">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Bid values over time">
      <polyline points={coordinates} fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
    <div><span>{money(min)}</span><span>{money(max)}</span></div>
  </div>;
}

export function AuctionDetailPanel({ item, onClose, onUpdated }: { item: ProfileRow | null; onClose: () => void; onUpdated: () => void }) {
  const [detail, setDetail] = useState<AuctionDetail | null>(null);
  const [bidUsd, setBidUsd] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    if (!item?.auction_id) return;
    const next = await api<AuctionDetail>(`/api/promotion-auctions/${encodeURIComponent(item.auction_id)}`);
    setDetail(next);
  }

  useEffect(() => {
    setDetail(null); setMessage(''); setBidUsd('');
    if (!item?.auction_id) return;
    void refresh().catch((error) => setMessage(error instanceof Error ? error.message : 'Could not load auction.'));
  }, [item?.auction_id]);

  useEffect(() => {
    if (!item) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, onClose]);

  if (!item) return null;
  const auction = detail?.auction;
  const current = auction?.highest_bid_cents ?? item.highest_bid_cents ?? auction?.starting_bid_cents ?? item.starting_bid_cents ?? 0;
  const starting = auction?.starting_bid_cents ?? item.starting_bid_cents ?? 0;
  const minimum = Math.max(starting, current ? current + 1 : starting);
  const enteredCents = Math.round(Number(bidUsd || '0') * 100);
  const valid = Number.isFinite(enteredCents) && enteredCents >= minimum;
  const alreadyLeading = item.my_bid_cents != null && item.my_bid_cents === (item.highest_bid_cents ?? item.starting_bid_cents);

  async function placeBid() {
    if (!item.auction_id || !valid || busy) return;
    setBusy(true); setMessage('');
    try {
      await api(`/api/promotion-auctions/${encodeURIComponent(item.auction_id)}/bids`, {
        method: 'POST', headers: { 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify({ amountCents: enteredCents }),
      });
      setMessage('You are now the leading bidder.');
      setBidUsd('');
      await refresh();
      onUpdated();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Bid failed.');
    } finally { setBusy(false); }
  }

  const recent = detail?.bids.slice(0, 8) || [];
  return <div className="bid-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="bid-detail-panel" role="dialog" aria-modal="true" aria-labelledby="bid-detail-title">
      <div className="bid-detail-topbar"><div><span className="ops-kicker">AUCTION DETAIL</span><h2 id="bid-detail-title">{item.display_name}</h2></div><button type="button" className="bid-icon-button" onClick={onClose} aria-label="Close auction details">×</button></div>

      <div className="bid-detail-preview">
        {item.avatar_url ? <img src={item.avatar_url} alt="" /> : <div className="bid-cover-fallback">{initials(item.display_name)}</div>}
        <div className="bid-detail-preview-overlay"><span>Sponsored header placement</span><strong>{item.display_name}</strong><small>linkary.xyz/{item.username}</small></div>
      </div>

      <div className="bid-detail-price-row">
        <div><span>Current highest bid</span><strong>{money(current)}</strong></div>
        <div><span>Minimum next bid</span><strong>{money(minimum)}</strong></div>
        <div><span>Time remaining</span><CountdownTimer expiresAt={auction?.expires_at ?? item.expires_at} /></div>
      </div>

      <div className="bid-detail-stats">
        <div><span>Profile views</span><strong>{item.views.toLocaleString()}</strong><small>Selected marketplace period</small></div>
        <div><span>Bidders</span><strong>{item.bidder_count.toLocaleString()}</strong><small>{item.bid_count.toLocaleString()} total bids</small></div>
        <div><span>Auction window</span><strong>{auction ? `${auction.duration_hours}h` : '—'}</strong><small>Server controlled</small></div>
      </div>

      <section className="bid-detail-section">
        <div className="bid-detail-section-head"><div><span className="ops-kicker">BID ACTIVITY</span><h3>Price history</h3></div><span>{detail?.bids.length || item.bid_count} bids</span></div>
        <BidHistoryChart bids={detail?.bids || []} />
      </section>

      <section className="bid-detail-section">
        <div className="bid-detail-section-head"><div><span className="ops-kicker">RECENT BIDS</span><h3>Auction activity</h3></div></div>
        <div className="bid-activity-list">{recent.length ? recent.map((bid, index) => <div key={bid.id}><span className="bid-activity-index">{index + 1}</span><div><strong>{money(bid.amount_cents)}</strong><small>{new Date(bid.created_at).toLocaleString()}</small></div></div>) : <p>No bids yet. Be the first bidder.</p>}</div>
      </section>

      <section className="bid-place-box">
        <div><span className="ops-kicker">PLACE BID</span><h3>Bid for this banner placement</h3><p>You will only pay if you win this auction. Payment is settled afterward from your Linkary Wallet in USDC on Base.</p></div>
        {alreadyLeading ? <div className="bid-inline-warning">You are already leading this auction. Increasing your bid will replace your current highest bid.</div> : null}
        <label><span>Your bid (USDC)</span><div className="bid-input-wrap"><input inputMode="decimal" value={bidUsd} onChange={(event) => setBidUsd(event.target.value)} placeholder={(minimum / 100).toFixed(2)} /><b>USDC</b></div></label>
        <div className="bid-commitment"><span>Minimum valid bid</span><strong>{money(minimum)}</strong></div>
        <button type="button" className="bid-primary-action large" disabled={!valid || busy || (auction?.status != null && auction.status !== 'open')} onClick={placeBid}>{busy ? 'Submitting bid…' : `Place bid${valid ? ` · ${money(enteredCents)}` : ''}`}</button>
        {message ? <div className="ops-message">{message}</div> : null}
        <NavLink className="bid-secondary-action centered" to={`/promotion-auction/${item.auction_id}`}>Open full auction & payment page</NavLink>
      </section>
    </aside>
  </div>;
}

export function MyAuctionCard({ row, won = false }: { row: MyAuctionRow; won?: boolean }) {
  const current = row.highest_bid_cents ?? row.starting_bid_cents;
  const isWinner = won || ['winner_selected', 'payment_pending', 'payment_detected', 'creative_pending', 'ready', 'live', 'expired'].includes(row.status);
  const leading = !isWinner && row.status === 'open' && row.my_bid_cents === current;
  const outbid = !isWinner && row.status === 'open' && row.my_bid_cents < current;
  const label = isWinner ? (row.payment_status === 'verified' ? 'Paid' : row.status === 'live' ? 'Banner live' : row.status === 'expired' ? 'Completed' : 'Won') : leading ? 'Leading' : outbid ? 'Outbid' : row.status === 'open' ? 'Active' : 'Ended';
  const tone = isWinner ? 'success' : leading ? 'success' : outbid ? 'warning' : 'neutral';
  return <article className="bid-my-card">
    <div className="bid-my-avatar">{row.avatar_url ? <img src={row.avatar_url} alt="" /> : <span>{initials(row.display_name)}</span>}</div>
    <div className="bid-my-info"><AuctionStatusBadge label={label} tone={tone} /><strong>{row.display_name}</strong><span>@{row.username} · {row.profile_type}</span></div>
    <div className="bid-my-metric"><span>Your bid</span><strong>{money(row.my_bid_cents)}</strong></div>
    <div className="bid-my-metric"><span>{isWinner ? 'Payment' : 'Current bid'}</span><strong>{isWinner ? (row.payment_status || 'Required') : money(current)}</strong></div>
    <div className="bid-my-metric"><span>{row.status === 'open' ? 'Ends in' : 'Status'}</span><strong>{row.status === 'open' ? timeLeft(row.expires_at) : row.status.replaceAll('_', ' ')}</strong></div>
    <NavLink className="bid-primary-action" to={`/promotion-auction/${row.auction_id}`}>{isWinner && row.payment_status !== 'verified' ? 'Pay / continue' : 'View auction'}</NavLink>
  </article>;
}
