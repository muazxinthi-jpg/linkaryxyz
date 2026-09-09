import { useEffect, useMemo, useState } from 'react';
import './wallet-portfolio.css';

type PortfolioAsset = {
  symbol: string;
  name: string;
  amount: number | null;
  usdValue: number;
  share: number;
  logoUrl: string | null;
  networks: string[];
  isOther?: boolean;
};

type PortfolioSummary = {
  configured: boolean;
  totalUsd: number;
  assets: PortfolioAsset[];
  pricedAssetCount: number;
  walletCount: number;
  partial: boolean;
  updatedAt: string;
  message: string;
};

type WalletPortfolioResponse = { portfolio?: PortfolioSummary };

const SLICE_COLORS = ['#ff5f32', '#171b1d', '#f2a54a', '#7a858a', '#aeb8bc', '#d8a995', '#dfe3e1'];

function money(value: number): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0);
}

function tokenAmount(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '';
  if (value >= 1_000_000) return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 2 }).format(value);
  if (value >= 1000) return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
  if (value >= 1) return new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(value);
  return new Intl.NumberFormat(undefined, { maximumSignificantDigits: 5 }).format(value);
}

function donutBackground(assets: PortfolioAsset[]): string {
  if (!assets.length) return 'conic-gradient(#eceeea 0deg 360deg)';
  let cursor = 0;
  const segments = assets.map((asset, index) => {
    const start = cursor;
    cursor = Math.min(100, cursor + Math.max(0, asset.share));
    return `${SLICE_COLORS[index % SLICE_COLORS.length]} ${start}% ${cursor}%`;
  });
  if (cursor < 100) segments.push(`#eceeea ${cursor}% 100%`);
  return `conic-gradient(${segments.join(', ')})`;
}

export default function WalletPortfolioPanel({ profileId }: { profileId: string }) {
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  async function load(force = false) {
    if (!profileId) return;
    force ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ profileId, includePortfolio: '1' });
      if (force) query.set('refreshPortfolio', '1');
      const response = await fetch(`/api/profile-wallets?${query.toString()}`, { credentials: 'same-origin' });
      const payload = await response.json().catch(() => ({})) as WalletPortfolioResponse & { message?: string };
      if (!response.ok) throw new Error(payload.message || 'Portfolio request failed');
      setPortfolio(payload.portfolio || null);
      if (!payload.portfolio) setError('Portfolio value is temporarily unavailable.');
    } catch {
      setError('Portfolio value is temporarily unavailable. Your wallet settings are still available.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    setPortfolio(null);
    void load(false);
  }, [profileId]);

  const background = useMemo(() => donutBackground(portfolio?.assets || []), [portfolio]);

  return <section className="wallet-portfolio" aria-labelledby="wallet-portfolio-title">
    <div className="wallet-portfolio-head">
      <div>
        <span className="wallet-portfolio-kicker">PORTFOLIO</span>
        <h2 id="wallet-portfolio-title">Wallet balance</h2>
        <p>Your highest-value priced assets across your Linkary wallet and saved wallet destinations.</p>
      </div>
      <button type="button" className="wallet-portfolio-refresh" disabled={refreshing || loading} onClick={() => void load(true)}>{refreshing ? 'Refreshing…' : 'Refresh'}</button>
    </div>

    {loading && <div className="wallet-portfolio-loading" role="status">Loading wallet value…</div>}
    {!loading && error && <div className="wallet-portfolio-error" role="status">{error}</div>}

    {!loading && !error && portfolio && <>
      <div className="wallet-portfolio-main">
        <div className="wallet-portfolio-total">
          <span>Estimated portfolio value</span>
          <strong>{money(portfolio.totalUsd)}</strong>
          <small>{portfolio.walletCount} wallet{portfolio.walletCount === 1 ? '' : 's'} scanned · {portfolio.pricedAssetCount} priced asset{portfolio.pricedAssetCount === 1 ? '' : 's'}</small>
        </div>

        <div className="wallet-portfolio-chart-wrap">
          <div className="wallet-portfolio-donut" role="img" aria-label={`Portfolio allocation. Total estimated value ${money(portfolio.totalUsd)}.`} style={{ background }}>
            <div className="wallet-portfolio-donut-hole"><span>Total</span><strong>{money(portfolio.totalUsd)}</strong></div>
          </div>
        </div>

        <div className="wallet-portfolio-assets" aria-label="Top portfolio assets">
          {portfolio.assets.length ? portfolio.assets.map((asset, index) => <article className="wallet-portfolio-asset" key={`${asset.symbol}-${asset.name}`}>
            <div className="wallet-portfolio-token">
              <span className="wallet-portfolio-swatch" style={{ backgroundColor: SLICE_COLORS[index % SLICE_COLORS.length] }} />
              {asset.logoUrl && !asset.isOther ? <img src={asset.logoUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <div className="wallet-portfolio-token-fallback">{asset.isOther ? '•••' : asset.symbol.slice(0, 3)}</div>}
              <div><strong>{asset.isOther ? 'Other' : asset.symbol}</strong><span>{asset.name}</span>{asset.networks.length > 0 && <small>{asset.networks.join(' · ')}</small>}</div>
            </div>
            <div className="wallet-portfolio-value"><strong>{money(asset.usdValue)}</strong>{asset.amount !== null && <span>{tokenAmount(asset.amount)} {asset.symbol}</span>}<small>{asset.share.toFixed(asset.share >= 10 ? 1 : 2)}%</small></div>
          </article>) : <div className="wallet-portfolio-empty">No non-zero assets with available USD pricing were found.</div>}
        </div>
      </div>

      <div className={`wallet-portfolio-note ${portfolio.partial ? 'partial' : ''}`}>
        <strong>{portfolio.partial ? 'Partial portfolio data' : 'Priced assets only'}</strong>
        <span>{portfolio.message} Unpriced or unsupported tokens are not shown and are not included in the displayed total.</span>
      </div>
    </>}
  </section>;
}
