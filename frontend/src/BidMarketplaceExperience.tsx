import { useEffect, useState } from 'react';
import { ProductWorkspace, type ProductMe, type ProductProfile, type ProductStatus } from './ProductWorkspace';
import {
  AuctionCard,
  AuctionDetailPanel,
  MyAuctionCard,
  money,
  type Marketplace,
  type MarketplaceTab,
  type Period,
  type ProfileRow,
} from './bidMarketplaceComponents';
import './bid-marketplace.css';

function Pagination({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (page: number) => void }) {
  if (total <= pageSize) return null;
  const pages = Math.ceil(total / pageSize);
  return <nav className="bid-pagination" aria-label="Marketplace pages">
    <button type="button" disabled={page === 1} onClick={() => onPage(page - 1)}>← Previous</button>
    <span>Page <b>{page}</b> of {pages}</span>
    <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next →</button>
  </nav>;
}

function MarketplaceEmpty({ title, copy }: { title: string; copy: string }) {
  return <div className="bid-market-empty"><div className="bid-empty-mark" aria-hidden="true">L</div><strong>{title}</strong><span>{copy}</span></div>;
}

export default function BidMarketplaceExperience({ me, status }: { me: ProductMe; status: ProductStatus }) {
  const creatorFirst = status.profiles.find((item) => item.profile_type === 'creator') || status.profiles[0];
  const stored = window.localStorage.getItem('linkary.active.profile');
  const [profileId, setProfileId] = useState(stored && status.profiles.some((item) => item.id === stored) ? stored : creatorFirst?.id || '');
  const profile = status.profiles.find((item) => item.id === profileId) || creatorFirst;
  const [tab, setTab] = useState<Tab>('active');
  const [period, setPeriod] = useState<Period>('30d');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Marketplace | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [profileType, setProfileType] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [minimumViews, setMinimumViews] = useState('');
  const [minimumPrice, setMinimumPrice] = useState('');
  const [maximumPrice, setMaximumPrice] = useState('');
  const [selected, setSelected] = useState<ProfileRow | null>(null);

  function changeProfile(id: string) {
    setProfileId(id);
    window.localStorage.setItem('linkary.active.profile', id);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  async function refresh(silent = false) {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({ period, page: String(page) });
      if (search) params.set('q', search);
      if (profileType) params.set('profileType', profileType);
      const response = await fetch(`/api/bid-marketplace?${params.toString()}`, { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error('Could not load the bid marketplace.');
      setData(await response.json() as Marketplace);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the bid marketplace.');
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(true), 30000);
    return () => window.clearInterval(interval);
  }, [period, page, search, profileType]);

  if (!profile) return null;

  const tabs: Array<[MarketplaceTab, string, number | null]> = [
    ['active', 'Live auctions', data?.summary.active_count ?? null],
    ['ending', 'Ending soon', data?.summary.ending_soon_count ?? null],
    ['views', 'Most viewed', data?.mostViewed.total ?? null],
    ['bids', 'Most bid on', data?.mostBidOn.total ?? null],
    ['mine', 'My bids', data?.myBids.length ?? null],
    ['won', 'Won auctions', data?.wonAuctions.length ?? null],
  ];

  const source = tab === 'active' ? data?.active : tab === 'ending' ? data?.endingSoon : tab === 'views' ? data?.mostViewed : tab === 'bids' ? data?.mostBidOn : null;
  const minViews = Math.max(0, Number(minimumViews || '0'));
  const minPriceCents = Math.max(0, Number(minimumPrice || '0') * 100);
  const maxPriceCents = maximumPrice ? Math.max(0, Number(maximumPrice) * 100) : Infinity;
  const visibleItems = (source?.items || []).filter((item) => {
    if (Number.isFinite(minViews) && item.views < minViews) return false;
    if (item.auction_id) {
      const price = item.highest_bid_cents ?? item.starting_bid_cents ?? 0;
      if (Number.isFinite(minPriceCents) && price < minPriceCents) return false;
      if (Number.isFinite(maxPriceCents) && price > maxPriceCents) return false;
    } else if (minimumPrice || maximumPrice) {
      return false;
    }
    return true;
  });

  const activeFilterCount = [profileType, minimumViews, minimumPrice, maximumPrice].filter(Boolean).length;
  const switchTab = (next: MarketplaceTab) => { setTab(next); setPage(1); };
  const switchPeriod = (next: Period) => { setPeriod(next); setPage(1); };

  const emptyCopy = tab === 'active'
    ? 'When a profile owner opens a sponsored-header auction, it will appear here automatically.'
    : tab === 'ending'
      ? 'No live auctions are within the final two hours right now.'
      : tab === 'views'
        ? 'Published Linkary profiles will appear here as soon as they are eligible for discovery.'
        : 'Profiles will rank here after their banner auctions receive valid bids.';

  return <ProductWorkspace me={me} status={status} profile={profile as ProductProfile} onProfileChange={changeProfile}>
    <main className="ops-stack bid-marketplace">
      <header className="bid-market-hero">
        <div className="bid-market-heading"><span className="ops-kicker">BID MARKETPLACE</span><h1>Live banner auctions</h1><p>Discover high-attention Linkary profiles and bid for premium banner placement.</p></div>
        <div className="bid-market-header-actions"><button type="button" className="bid-header-button" onClick={() => switchTab('mine')}>My bids</button><button type="button" className="bid-header-button icon" onClick={() => void refresh()} aria-label="Refresh marketplace">↻</button></div>
      </header>

      <section className="bid-market-summary" aria-label="Marketplace overview">
        <article><span>LIVE AUCTIONS</span><strong>{data?.summary.active_count ?? 0}</strong><small>Open now</small></article>
        <article><span>ACTIVE VALUE</span><strong>{money(data?.summary.active_value_cents || 0)}</strong><small>Current auction value</small></article>
        <article><span>BIDS PLACED</span><strong>{data?.summary.bids_placed?.toLocaleString() ?? '0'}</strong><small>Across banner auctions</small></article>
        <article><span>PROFILES AVAILABLE</span><strong>{data?.summary.profiles_available?.toLocaleString() ?? '0'}</strong><small>Published profiles</small></article>
        <article className={data?.summary.ending_soon_count ? 'attention' : ''}><span>ENDING SOON</span><strong>{data?.summary.ending_soon_count ?? 0}</strong><small>Within 2 hours</small></article>
      </section>

      <section className="bid-market-controls" aria-label="Marketplace controls">
        <div className="bid-search-wrap"><span aria-hidden="true">⌕</span><input type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search profiles, creators or projects" aria-label="Search marketplace" />{searchInput ? <button type="button" onClick={() => setSearchInput('')} aria-label="Clear search">×</button> : null}</div>
        <button type="button" className={filtersOpen || activeFilterCount ? 'bid-filter-button active' : 'bid-filter-button'} onClick={() => setFiltersOpen((value) => !value)}>Filters{activeFilterCount ? <b>{activeFilterCount}</b> : null}</button>
        <div className="bid-period-control" aria-label="Analytics period">{([['24h', '24H'], ['7d', '7D'], ['30d', '30D'], ['all', 'All time']] as Array<[Period, string]>).map(([value, label]) => <button key={value} type="button" className={period === value ? 'active' : ''} onClick={() => switchPeriod(value)}>{label}</button>)}</div>
      </section>

      {filtersOpen ? <section className="bid-filter-panel" aria-label="Marketplace filters">
        <label><span>Profile type</span><select value={profileType} onChange={(event) => { setProfileType(event.target.value); setPage(1); }}><option value="">All profiles</option><option value="creator">Creators</option><option value="project">Projects</option></select></label>
        <label><span>Minimum profile views</span><input type="number" min="0" inputMode="numeric" value={minimumViews} onChange={(event) => setMinimumViews(event.target.value)} placeholder="Any" /></label>
        <label><span>Minimum current bid</span><div className="bid-filter-money"><span>$</span><input type="number" min="0" inputMode="decimal" value={minimumPrice} onChange={(event) => setMinimumPrice(event.target.value)} placeholder="Any" /></div></label>
        <label><span>Maximum current bid</span><div className="bid-filter-money"><span>$</span><input type="number" min="0" inputMode="decimal" value={maximumPrice} onChange={(event) => setMaximumPrice(event.target.value)} placeholder="Any" /></div></label>
        <button type="button" className="bid-filter-reset" onClick={() => { setProfileType(''); setMinimumViews(''); setMinimumPrice(''); setMaximumPrice(''); setPage(1); }}>Reset filters</button>
      </section> : null}

      <nav className="bid-market-tabs" role="tablist" aria-label="Bid marketplace views">{tabs.map(([value, label, count]) => <button key={value} type="button" role="tab" aria-selected={tab === value} className={tab === value ? 'active' : ''} onClick={() => switchTab(value)}><span>{label}</span>{count != null ? <b>{count}</b> : null}</button>)}</nav>

      {error ? <div className="ops-message">{error} <button type="button" onClick={() => void refresh()}>Try again</button></div> : null}
      {loading && !data ? <div className="bid-market-loading" aria-live="polite">Loading marketplace…</div> : null}

      {data && (tab === 'active' || tab === 'ending' || tab === 'views' || tab === 'bids') ? <>
        <div className="bid-market-result-head"><div><strong>{tab === 'active' ? 'Open inventory' : tab === 'ending' ? 'Closing soon' : tab === 'views' ? 'Profile attention leaderboard' : 'Most competitive profiles'}</strong><span>{source?.total.toLocaleString() || 0} results · {period === 'all' ? 'All time' : period.toUpperCase()}</span></div>{tab === 'views' ? <span className="bid-data-note">Ranked by current raw public-profile views</span> : null}</div>
        {visibleItems.length ? <div className="bid-auction-grid">{visibleItems.map((item, index) => <AuctionCard key={item.profile_id} item={item} rank={tab === 'views' || tab === 'bids' ? (page - 1) * data.pageSize + index + 1 : undefined} onSelect={setSelected} />)}</div> : <MarketplaceEmpty title={activeFilterCount ? 'No profiles match these filters.' : tab === 'views' ? 'No eligible public profiles yet.' : tab === 'bids' ? 'No profiles have received bids yet.' : tab === 'ending' ? 'Nothing is ending soon.' : 'No live auctions right now.'} copy={activeFilterCount ? 'Try clearing one or more filters to broaden the marketplace.' : emptyCopy} />}
        <Pagination page={page} total={source?.total || 0} pageSize={data.pageSize} onPage={setPage} />
      </> : null}

      {data && tab === 'mine' ? <section className="bid-personal-section"><div className="bid-market-result-head"><div><strong>My bids</strong><span>Auctions where your canonical Linkary account has placed a bid.</span></div></div>{data.myBids.length ? <div className="bid-my-list">{data.myBids.map((row) => <MyAuctionCard key={row.auction_id} row={row} />)}</div> : <MarketplaceEmpty title="You have not placed a bid yet." copy="Explore live auctions and bid for a banner placement to see your activity here." />}</section> : null}

      {data && tab === 'won' ? <section className="bid-personal-section"><div className="bid-market-result-head"><div><strong>Won auctions</strong><span>Your won placements, payment state and campaign lifecycle.</span></div></div>{data.wonAuctions.length ? <div className="bid-my-list">{data.wonAuctions.map((row) => <MyAuctionCard key={row.auction_id} row={row} won />)}</div> : <MarketplaceEmpty title="No won auctions yet." copy="Auctions you win will appear here with the correct payment or campaign action." />}</section> : null}
    </main>

    <AuctionDetailPanel item={selected} onClose={() => setSelected(null)} onUpdated={() => void refresh(true)} />
  </ProductWorkspace>;
}
