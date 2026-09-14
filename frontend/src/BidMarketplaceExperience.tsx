import { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { ProductWorkspace, type ProductMe, type ProductProfile, type ProductStatus } from './ProductWorkspace';

type AuctionCard = {
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
};

type BidderRow = { label: string; bidder_type: string; bid_count: number; total_bid_cents: number; wins: number };
type WinnerRow = { label: string; bidder_type: string; wins: number; winning_value_cents: number };
type Marketplace = {
  generatedAt: string;
  active: AuctionCard[];
  topBidders: BidderRow[];
  topWinners: WinnerRow[];
  mostBidOn: AuctionCard[];
  mostViewed: AuctionCard[];
};
type Tab = 'active' | 'bidders' | 'winners' | 'views' | 'bids';

function money(cents: number | null | undefined): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format((cents || 0) / 100);
}

function timeLeft(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Ending';
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  return `${hours}h ${minutes}m`;
}

function AuctionList({ items, metric }: { items: AuctionCard[]; metric?: 'views' | 'bids' }) {
  if (!items.length) return <div className="bid-market-empty"><strong>No live auctions right now.</strong><span>When a profile owner opens an auction, it will appear here automatically.</span></div>;
  return <div className="bid-market-auctions">{items.map((item, index) => {
    const current = item.highest_bid_cents || item.starting_bid_cents;
    return <article className="bid-market-card" key={item.auction_id}>
      <div className="bid-market-rank">#{index + 1}</div>
      <div className="bid-market-identity">
        {item.avatar_url ? <img src={item.avatar_url} alt="" /> : <div className="bid-market-avatar-fallback">{item.display_name.slice(0, 1).toUpperCase()}</div>}
        <div><strong>{item.display_name}</strong><span>@{item.username} · {item.profile_type}</span></div>
      </div>
      <div className="bid-market-stat"><span>Current bid</span><strong>{money(current)}</strong></div>
      <div className="bid-market-stat"><span>Bids</span><strong>{item.bid_count}</strong></div>
      <div className="bid-market-stat"><span>30D views</span><strong>{item.views_30d.toLocaleString()}</strong></div>
      <div className="bid-market-stat"><span>Ends in</span><strong>{timeLeft(item.expires_at)}</strong></div>
      {metric === 'views' && <div className="bid-market-highlight">{item.views_30d.toLocaleString()} views</div>}
      {metric === 'bids' && <div className="bid-market-highlight">{item.bid_count} bids</div>}
      <div className="bid-market-actions">
        <a className="ops-button secondary" href={`https://linkary.xyz/${item.username}`} target="_blank" rel="noreferrer">View profile ↗</a>
        <NavLink className="ops-button primary" to={`/promotion-auction/${item.auction_id}`}>Place bid</NavLink>
      </div>
    </article>;
  })}</div>;
}

export default function BidMarketplaceExperience({ me, status }: { me: ProductMe; status: ProductStatus }) {
  const creatorFirst = status.profiles.find((item) => item.profile_type === 'creator') || status.profiles[0];
  const stored = window.localStorage.getItem('linkary.active.profile');
  const [profileId, setProfileId] = useState(stored && status.profiles.some((item) => item.id === stored) ? stored : creatorFirst?.id || '');
  const profile = status.profiles.find((item) => item.id === profileId) || creatorFirst;
  const [tab, setTab] = useState<Tab>('active');
  const [data, setData] = useState<Marketplace | null>(null);
  const [error, setError] = useState('');

  function changeProfile(id: string) {
    setProfileId(id);
    window.localStorage.setItem('linkary.active.profile', id);
  }

  async function refresh() {
    try {
      const response = await fetch('/api/bid-marketplace', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error('Could not load bid marketplace.');
      setData(await response.json() as Marketplace);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load bid marketplace.');
    }
  }

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30000);
    return () => window.clearInterval(interval);
  }, []);

  const activeValue = useMemo(() => data?.active.reduce((sum, item) => sum + (item.highest_bid_cents || item.starting_bid_cents), 0) || 0, [data]);
  if (!profile) return null;

  const tabs: Array<[Tab, string]> = [
    ['active', 'Current Active'],
    ['bidders', 'Top Bidders'],
    ['winners', 'Top Winners'],
    ['views', 'Most Viewed'],
    ['bids', 'Most Bid On'],
  ];

  return <ProductWorkspace me={me} status={status} profile={profile as ProductProfile} onProfileChange={changeProfile}>
    <div className="ops-stack bid-marketplace">
      <div className="bid-market-hero">
        <div><span className="ops-kicker">BID MARKETPLACE</span><h1>Live profile header auctions</h1><p>Discover profiles accepting bids, compare active demand and compete for sponsored header placement.</p></div>
        <button type="button" className="ops-button secondary" onClick={() => void refresh()}>Refresh</button>
      </div>

      <section className="bid-market-summary">
        <article><span>LIVE AUCTIONS</span><strong>{data?.active.length ?? 0}</strong><small>Open now</small></article>
        <article><span>ACTIVE VALUE</span><strong>{money(activeValue)}</strong><small>Current / starting bids</small></article>
        <article><span>BIDS PLACED</span><strong>{data?.active.reduce((sum, item) => sum + item.bid_count, 0) ?? 0}</strong><small>Across live auctions</small></article>
        <article><span>PROFILE VIEWS</span><strong>{data?.active.reduce((sum, item) => sum + item.views_30d, 0).toLocaleString() ?? '0'}</strong><small>30 day live inventory views</small></article>
      </section>

      <div className="bid-market-tabs" role="tablist" aria-label="Bid marketplace leaderboards">
        {tabs.map(([value, label]) => <button key={value} type="button" className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{label}</button>)}
      </div>

      {error && <div className="ops-message">{error}</div>}
      {!data && !error && <div className="bid-market-empty"><strong>Loading marketplace...</strong></div>}
      {data && tab === 'active' && <AuctionList items={data.active} />}
      {data && tab === 'views' && <AuctionList items={data.mostViewed} metric="views" />}
      {data && tab === 'bids' && <AuctionList items={data.mostBidOn} metric="bids" />}
      {data && tab === 'bidders' && <section className="bid-market-leaderboard">
        <div className="bid-market-leaderboard-head"><span>Rank</span><span>Bidder</span><span>Bids</span><span>Total bid value</span><span>Wins</span></div>
        {data.topBidders.length ? data.topBidders.map((row, index) => <div className="bid-market-leaderboard-row" key={`${row.bidder_type}-${row.label}-${index}`}><strong>#{index + 1}</strong><div><b>{row.label}</b><small>{row.bidder_type}</small></div><span>{row.bid_count}</span><span>{money(row.total_bid_cents)}</span><span>{row.wins}</span></div>) : <div className="bid-market-empty"><strong>No bids have been placed yet.</strong></div>}
      </section>}
      {data && tab === 'winners' && <section className="bid-market-leaderboard">
        <div className="bid-market-leaderboard-head winner"><span>Rank</span><span>Winner</span><span>Wins</span><span>Winning value</span></div>
        {data.topWinners.length ? data.topWinners.map((row, index) => <div className="bid-market-leaderboard-row winner" key={`${row.bidder_type}-${row.label}-${index}`}><strong>#{index + 1}</strong><div><b>{row.label}</b><small>{row.bidder_type}</small></div><span>{row.wins}</span><span>{money(row.winning_value_cents)}</span></div>) : <div className="bid-market-empty"><strong>No completed auction winners yet.</strong></div>}
      </section>}
    </div>
  </ProductWorkspace>;
}
