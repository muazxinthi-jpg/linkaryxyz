import { useEffect, useMemo, useState } from 'react';
import FounderGrowthIntelligencePanel from './FounderGrowthIntelligencePanel';
import { ProductWorkspace, type ProductMe, type ProductProfile, type ProductStatus } from './ProductWorkspace';
import './analytics.css';

type Point = { month: string; count: number };
type FilteredSeries = { range: string; interval: 'day' | 'week' | 'month'; from: string; to: string; linkId: string; profileViews: number; linkClicks: number; series: Array<{ date: string; profileViews: number; linkClicks: number }>; links: Array<{ id: string; label: string }>; linkFilterAppliesTo: 'linkClicksOnly' };
type SocialSource = { label: string; value: number; color?: string };
type SocialProfile = { platform: string; audience?: number; impressions?: number; engagements?: number; clicks?: number; status?: string; refreshState?: string; refreshErrorCode?: string | null; metrics?: Record<string, number>; posts?: SocialPost[]; lastRefreshedAt?: string | null };
type SocialPost = { id: string; url: string; createdAt: string | null; views: number | null; likes: number | null; replies: number | null; reposts: number | null; quotes: number | null; bookmarks: number | null; capturedAt: string };
type SocialAudienceSnapshot = { capturedAt: string; followers: number };
type Analytics = { linkClicks: number; profileViews: number; sections: number; connectedChannels: number; monthlyClicks: Point[]; monthlyProfileViews: Point[]; filteredSeries?: FilteredSeries; monthlySocialAudience?: Point[]; socialAudienceSnapshots?: SocialAudienceSnapshot[]; socialTrackingStartedAt?: string | null; socialPostMetricsEnabled?: boolean; socialPostMetricsWindowDays?: number; monthlySocialImpressions?: Point[]; monthlySocialEngagements?: Point[]; platformClicks?: Array<{ platform: string; count: number }>; socialSources?: SocialSource[]; socialProfiles?: SocialProfile[]; topSocialPosts?: SocialPost[]; socialStatus?: { platform: string; status: string; errorCode?: string | null; lastRefreshedAt: string | null }; proof?: { metrics: Array<{ label: string; value: string }> } | null };
type IconName = 'eye' | 'link' | 'users' | 'cube' | 'coin' | 'trend' | 'target' | 'check';

async function loadAnalytics(profileId: string, range: string, interval: string, linkId: string, includeSocial = false): Promise<Analytics> {
  const params = new URLSearchParams({ range, interval, linkId });
  if (includeSocial) params.set('includeSocial', '1');
  const response = await fetch(`/api/profiles/${encodeURIComponent(profileId)}/analytics?${params}`, { credentials: 'same-origin' });
  if (!response.ok) throw new Error('Analytics are not available yet.');
  return response.json() as Promise<Analytics>;
}

function Icon({ name }: { name: IconName }) {
  const paths = { eye: 'M2.5 12s3.6-6.5 9.5-6.5S21.5 12 21.5 12 17.9 18.5 12 18.5 2.5 12 2.5 12Zm12.5 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z', link: 'M6 3v14l4-4 3.5 7 2.2-1.1-3.4-6.8H18L6 3Zm13 1v3m-1.5-1.5h3', users: 'M12 20s-7.5-4.6-9.2-8.6C1.3 8.2 3.1 5 6.4 5c2.2 0 3.8 1.4 4.6 2.8C11.8 6.4 13.5 5 15.7 5c3.2 0 5 3.2 3.6 6.4C17.5 15.4 12 20 12 20Z', cube: 'm12 2 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5m-18 0v8l9 5 9-5v-8', coin: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm3 7.5c-.2-1.2-1.1-2-3-2-1.7 0-2.8.8-2.8 2 0 3 5.8 1.5 5.8 5 0 1.2-1 2.1-2.9 2.1-1.8 0-3-.8-3.2-2.2M12 5.5v13', trend: 'M3 17l6-6 4 4 7-8M15 7h5v5', target: 'M12 2a10 10 0 1 0 10 10M12 6a6 6 0 1 0 6 6M12 10a2 2 0 1 0 2 2', check: 'm5 12 4 4L19 6' } as const;
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}

type TrendPoint = { date: string; profileViews: number; linkClicks: number };

function smoothPath(values: number[], max: number, width: number, height: number, left: number, top: number, right: number, bottom: number) {
  if (!values.length) return '';
  const plotWidth = width - left - right; const plotHeight = height - top - bottom;
  const coords = values.map((value, index) => ({ x: left + (values.length <= 1 ? 0 : index / (values.length - 1) * plotWidth), y: top + plotHeight - value / max * plotHeight }));
  return coords.map((point, index) => {
    if (!index) return `M${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
    const previous = coords[index - 1]; const third = (point.x - previous.x) / 3;
    return `C${(previous.x + third).toFixed(2)} ${previous.y.toFixed(2)} ${(point.x - third).toFixed(2)} ${point.y.toFixed(2)} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
  }).join(' ');
}

function niceAxisMax(value: number) {
  const roughStep = Math.max(value / 4, 1); const magnitude = 10 ** Math.floor(Math.log10(roughStep)); const normalized = roughStep / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude * 4;
}

function formatPeriod(date: string, interval: 'day' | 'week' | 'month', full = false) {
  const parsed = new Date(`${date.length === 7 ? `${date}-01` : date}T00:00:00.000Z`);
  return parsed.toLocaleDateString('en', full
    ? { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }
    : interval === 'month' ? { month: 'short', timeZone: 'UTC' } : { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function SoftLineChart({ data, interval = 'day', emptyNote = 'No recorded profile views or tracked clicks in this period yet.', labels = ['Profile views', 'Link clicks'] }: { data: TrendPoint[]; interval?: 'day' | 'week' | 'month'; emptyNote?: string; labels?: [string, string] }) {
  const width = 900; const height = 300; const left = 48; const top = 18; const right = 8; const bottom = 38;
  const [active, setActive] = useState<number | null>(null);
  const maximum = Math.max(0, ...data.map((point) => point.profileViews), ...data.map((point) => point.linkClicks)); const axisMax = niceAxisMax(maximum || 1);
  const plotWidth = width - left - right; const plotHeight = height - top - bottom;
  const viewsPath = smoothPath(data.map((point) => point.profileViews), axisMax, width, height, left, top, right, bottom);
  const clicksPath = smoothPath(data.map((point) => point.linkClicks), axisMax, width, height, left, top, right, bottom);
  const first = data[0]; const last = data[data.length - 1];
  const areaFor = (path: string) => first && last ? `${path} L${left + plotWidth} ${top + plotHeight} L${left} ${top + plotHeight} Z` : '';
  const selected = active === null ? null : data[active];
  const selectedX = active === null || data.length <= 1 ? left : left + active / (data.length - 1) * plotWidth;
  const nonZero = maximum > 0;
  const tickStep = Math.max(1, Math.ceil(Math.max(1, data.length - 1) / 6));
  const labelIndexes = data.map((_, index) => index).filter((index) => index === 0 || index === data.length - 1 || index % tickStep === 0);
  return <div className="analytics-trend">
    <div className="analytics-legend"><span><i className="views" />{labels[0]}</span><span><i className="clicks" />{labels[1]}</span></div>
    <div className="analytics-chart-stage" onPointerLeave={() => setActive(null)}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${labels[0]} and ${labels[1]} over time`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="analytics-view-fill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#c83b24" stopOpacity=".2" /><stop offset="1" stopColor="#c83b24" stopOpacity=".015" /></linearGradient>
          <linearGradient id="analytics-click-fill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#5048e5" stopOpacity=".12" /><stop offset="1" stopColor="#5048e5" stopOpacity=".01" /></linearGradient>
        </defs>
        {[0, 1, 2, 3, 4].map((tick) => {
          const y = top + plotHeight - tick / 4 * plotHeight; const value = Math.round(axisMax * tick / 4);
          return <g key={tick}><line className="analytics-gridline" x1={left} x2={width} y1={y} y2={y} /><text className="analytics-y-label" x={left - 9} y={y + 3} textAnchor="end">{value.toLocaleString()}</text></g>;
        })}
        {nonZero && <><path d={areaFor(viewsPath)} fill="url(#analytics-view-fill)" /><path d={areaFor(clicksPath)} fill="url(#analytics-click-fill)" /><path className="analytics-view-line" d={viewsPath} /><path className="analytics-click-line" d={clicksPath} /></>}
        {selected && <line className="analytics-active-line" x1={selectedX} x2={selectedX} y1={top} y2={top + plotHeight} />}
        {data.map((point, index) => {
          const x = left + (data.length <= 1 ? 0 : index / (data.length - 1) * plotWidth);
          const viewY = top + plotHeight - point.profileViews / axisMax * plotHeight;
          const clickY = top + plotHeight - point.linkClicks / axisMax * plotHeight;
          const hitWidth = plotWidth / Math.max(1, data.length - 1);
          return <g key={point.date}>
            {selected && active === index && <><circle className="analytics-point" cx={x} cy={viewY} r="4.5" /><circle className="analytics-click-point" cx={x} cy={clickY} r="4.5" /></>}
            <rect className="analytics-hit" x={Math.max(left, x - hitWidth / 2)} y={top} width={Math.min(hitWidth, width - right - Math.max(left, x - hitWidth / 2))} height={plotHeight} tabIndex={0} role="button" aria-label={`${formatPeriod(point.date, interval, true)}: ${point.profileViews.toLocaleString()} ${labels[0]} and ${point.linkClicks.toLocaleString()} ${labels[1]}`} onPointerEnter={() => setActive(index)} onPointerDown={() => setActive(index)} onFocus={() => setActive(index)} onBlur={() => setActive(null)} />
          </g>;
        })}
      </svg>
      {selected && <div className="analytics-tooltip" style={{ left: `${Math.min(91, Math.max(9, selectedX / width * 100))}%` }} role="status"><strong>{formatPeriod(selected.date, interval, true)}</strong><span><i className="views" />{selected.profileViews.toLocaleString()} {labels[0]}</span><span><i className="clicks" />{selected.linkClicks.toLocaleString()} {labels[1]}</span></div>}
    </div>
    <div className="analytics-axis">{labelIndexes.map((index) => <span key={data[index].date}>{formatPeriod(data[index].date, interval)}</span>)}</div>
    {!nonZero && <p className="analytics-zero-note">{emptyNote}</p>}
  </div>;
}

function SocialSources({ sources = [], compact = false }: { sources?: SocialSource[]; compact?: boolean }) {
  const rows = [['X data', 'Awaiting provider snapshot'], ['Telegram', 'Awaiting provider snapshot'], ['YouTube', 'Provider integration not enabled'], ['Instagram', 'Provider integration not enabled']]; const total = sources.reduce((sum, source) => sum + source.value, 0); const colors = ['#1769e8', '#23a5e8', '#ee4a7c', '#8a54ea', '#c7cfda']; let progress = 0;
  const segments = total ? sources.map((source, index) => { const start = progress; progress += source.value / total * 100; return `${source.color || colors[index % colors.length]} ${start}% ${progress}%`; }).join(',') : '';
  if (compact) return <article className="analytics-panel analytics-audience analytics-audience-compact"><header><div><h2>Audience & socials</h2><p>Latest verified audience snapshots by connected source.</p></div><span>{sources.length ? `${sources.length} source${sources.length === 1 ? '' : 's'}` : 'Provider data'}</span></header>{total ? <div className="analytics-audience-source-list">{sources.map((source, index) => <div key={source.label}><i style={{ background: source.color || colors[index % colors.length] }} /><span>{source.label}</span><strong>{source.value.toLocaleString()}</strong></div>)}</div> : <p className="analytics-panel-empty">No verified audience snapshot is available yet.</p>}</article>;
  return <article className="analytics-panel analytics-audience"><header><div><h2>Audience & socials</h2><p>Connected sources populate automatically.</p></div><span>Provider data</span></header><div className={`analytics-donut ${total ? 'has-data' : ''}`} style={total ? { background: `conic-gradient(${segments})` } : undefined}><b>{total ? total.toLocaleString() : '—'}</b><small>{total ? 'provider\nsignals' : 'no provider\ndata yet'}</small></div><div className="analytics-social-list">{total ? sources.map((source, index) => <div key={source.label}><i style={{ background: source.color || colors[index % colors.length] }} /><strong>{source.label}</strong><small>{source.value.toLocaleString()} provider signals</small></div>) : rows.map(([label, state]) => <div key={label}><i /><strong>{label}</strong><small>{state}</small></div>)}</div></article>;
}

function smoothPixelPath(coords: Array<{ x: number; y: number }>) {
  if (!coords.length) return '';
  return coords.map((point, index) => {
    if (!index) return `M${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
    const previous = coords[index - 1]; const third = (point.x - previous.x) / 3;
    return `C${(previous.x + third).toFixed(2)} ${previous.y.toFixed(2)} ${(point.x - third).toFixed(2)} ${point.y.toFixed(2)} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
  }).join(' ');
}

function SocialGrowthChart({ snapshots = [] }: { snapshots?: SocialAudienceSnapshot[] }) {
  const width = 900; const height = 300; const left = 48; const top = 18; const right = 8; const bottom = 38;
  const [active, setActive] = useState<number | null>(null);
  const end = Date.now(); const start = end - 7 * 24 * 60 * 60 * 1000;
  const points = snapshots.map((snapshot) => ({ ...snapshot, timestamp: Date.parse(snapshot.capturedAt) }))
    .filter((snapshot) => Number.isFinite(snapshot.timestamp) && snapshot.timestamp >= start && snapshot.timestamp <= end)
    .sort((a, b) => a.timestamp - b.timestamp);
  const maxValue = Math.max(0, ...points.map((point) => point.followers));
  const axisMax = niceAxisMax(maxValue);
  const plotWidth = width - left - right; const plotHeight = height - top - bottom;
  const coords = points.map((point) => ({
    ...point,
    x: left + (point.timestamp - start) / (end - start) * plotWidth,
    y: top + plotHeight - point.followers / axisMax * plotHeight,
  }));
  const line = smoothPixelPath(coords);
  const area = coords.length > 1 ? `${line} L${coords[coords.length - 1].x.toFixed(2)} ${top + plotHeight} L${coords[0].x.toFixed(2)} ${top + plotHeight} Z` : '';
  const dateLabels = Array.from({ length: 4 }, (_, index) => new Date(start + (end - start) * index / 3).toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }));
  const selected = active === null ? null : coords[active];
  return <div className="analytics-trend analytics-social-growth-chart">
    <div className="analytics-legend"><span><i className="views" />X followers</span></div>
    <>
      <div className="analytics-chart-stage" onPointerLeave={() => setActive(null)}>
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Verified X follower snapshots over the last 7 days" preserveAspectRatio="none">
          <defs><linearGradient id="analytics-social-follower-fill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#c83b24" stopOpacity=".2" /><stop offset="1" stopColor="#c83b24" stopOpacity=".015" /></linearGradient></defs>
          {[0, 1, 2, 3, 4].map((tick) => {
            const y = top + plotHeight - tick / 4 * plotHeight;
            return <g key={tick}><line className="analytics-gridline" x1={left} x2={width} y1={y} y2={y} /><text className="analytics-y-label" x={left - 9} y={y + 3} textAnchor="end">{Math.round(axisMax * tick / 4).toLocaleString()}</text></g>;
          })}
          {coords.length > 1 && <><path d={area} fill="url(#analytics-social-follower-fill)" /><path className="analytics-view-line" d={line} />{coords.map((point, index) => <circle key={point.capturedAt} className={`analytics-point${selected && active === index ? ' active' : ''}`} cx={point.x} cy={point.y} r={selected && active === index ? 4.5 : 3.5} />)}</>}
          {selected && <line className="analytics-active-line" x1={selected.x} x2={selected.x} y1={top} y2={top + plotHeight} />}
          {coords.map((point, index) => {
            const previousX = coords[index - 1]?.x ?? left;
            const nextX = coords[index + 1]?.x ?? left + plotWidth;
            const hitX = index === 0 ? left : (previousX + point.x) / 2;
            const hitRight = index === coords.length - 1 ? left + plotWidth : (point.x + nextX) / 2;
            const hitWidth = Math.max(1, hitRight - hitX);
            return <g key={point.capturedAt}>
              {coords.length === 1 && <circle className="analytics-point" cx={point.x} cy={point.y} r={selected && active === index ? 4.5 : 3.5} />}
              <rect className="analytics-hit" x={hitX} y={top} width={hitWidth} height={plotHeight} tabIndex={0} role="button" aria-label={`${new Date(point.capturedAt).toLocaleString()}: ${point.followers.toLocaleString()} X followers`} onPointerEnter={() => setActive(index)} onPointerDown={() => setActive(index)} onFocus={() => setActive(index)} onBlur={() => setActive(null)} />
            </g>;
          })}
        </svg>
        {selected && <div className="analytics-tooltip" style={{ left: `${Math.min(91, Math.max(9, selected.x / width * 100))}%` }} role="status"><strong>{new Date(selected.capturedAt).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}</strong><span><i className="views" />{selected.followers.toLocaleString()} X followers</span></div>}
      </div>
      <div className="analytics-axis">{dateLabels.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}</div>
      <p className="analytics-zero-note">{points.length === 0 ? 'No follower history in this 7-day window. The latest verified follower count remains available above; a trend needs dated snapshots.' : points.length === 1 ? 'One verified snapshot shown. A trend needs at least two dated snapshots.' : `${points.length} verified follower snapshots · last 7 days`}</p>
    </>
  </div>;
}

function SocialAnalytics({ profiles = [], sources = [], audienceSnapshots = [], trackingStartedAt, postMetricsEnabled = false }: { profiles?: SocialProfile[]; sources?: SocialSource[]; audienceSnapshots?: SocialAudienceSnapshot[]; trackingStartedAt?: string | null; postMetricsEnabled?: boolean }) {
  const platforms = [
    { platform: 'X data', short: 'X', color: '#121820', state: 'Awaiting X provider integration' },
    { platform: 'Telegram', short: 'TG', color: '#239bd8', state: 'Awaiting Telegram provider integration' },
    { platform: 'YouTube', short: 'YT', color: '#ff3d35', state: 'Awaiting YouTube provider integration' },
    { platform: 'Instagram', short: 'IG', color: '#d94d91', state: 'Awaiting Instagram provider integration' },
    { platform: 'TikTok', short: 'TT', color: '#1a1a1a', state: 'Awaiting TikTok provider integration' },
    { platform: 'LinkedIn', short: 'in', color: '#0a66c2', state: 'Awaiting LinkedIn provider integration' },
  ];
  const values = new Map(profiles.map((profile) => [profile.platform.toLowerCase(), profile]));
  const [selectedPlatform, setSelectedPlatform] = useState('X data');
  const selectedProfile = values.get(selectedPlatform.toLowerCase());
  const selectedDefinition = platforms.find((platform) => platform.platform === selectedPlatform) || platforms[0];
  const xProfile = values.get('x data');
  const xValues = xProfile?.metrics || {};
  const totalEngagements = profiles.reduce((sum, profile) => sum + (profile.engagements || 0), 0);
  const totalClicks = profiles.reduce((sum, profile) => sum + (profile.clicks || 0), 0);
  const hasProviderData = profiles.some((profile) => [profile.audience, profile.impressions, profile.engagements, profile.clicks].some((value) => typeof value === 'number')) || audienceSnapshots.length > 0;
  const metricSets: Record<string, string[]> = { 'X data': ['Followers', 'Public post views', 'Engagements', 'Linkary clicks', 'Posts', 'Likes', 'Reposts', 'Replies', 'Quotes', 'Bookmarks', 'Profile visits'], Telegram: ['Audience', 'Views', 'Reactions', 'Forwards', 'Link clicks', 'Posts'], YouTube: ['Subscribers', 'Views', 'Watch time', 'Likes', 'Comments', 'Uploads'], Instagram: ['Audience', 'Reach', 'Impressions', 'Likes', 'Comments', 'Saves', 'Shares'], TikTok: ['Followers', 'Video views', 'Likes', 'Comments', 'Shares', 'Average watch time'], LinkedIn: ['Followers', 'Impressions', 'Reactions', 'Comments', 'Reposts', 'Link clicks'] };
  const selectedMetrics = metricSets[selectedPlatform] || metricSets['X data'];
  const selectedValues = selectedProfile?.metrics || {};
  const detailValue = (label: string) => {
    const keys: Record<string, string> = { Followers: 'audience', 'Public post views': 'post_views', 'Linkary clicks': 'linkary_clicks', 'Profile visits': 'profile_visits' };
    const key = keys[label] || label.toLowerCase().replaceAll(' ', '_');
    if (typeof selectedValues[key] === 'number') return selectedValues[key].toLocaleString();
    const fallback: Record<string, number | undefined> = { audience: selectedProfile?.audience, impressions: selectedProfile?.impressions, engagements: selectedProfile?.engagements, 'link_clicks': selectedProfile?.clicks };
    return typeof fallback[key] === 'number' ? fallback[key]!.toLocaleString() : '—';
  };
  const xPosts = xProfile?.posts || [];
  const xStatusText: Record<string, string> = { ready: 'Public post engagement is shown when the provider returns it. X owner-only analytics, such as private impressions and profile activity, need a separate authorized connection.', disabled: 'X post metrics are disabled; follower snapshots and Linkary clicks remain available.', provider_not_configured: 'Social analytics are enabled but the data provider is not configured.', budget_exhausted: 'The daily social data request limit was reached; cached metrics are shown.', provider_error: 'X metrics could not be refreshed; cached values are shown when available.', identity_mismatch: 'The data provider identity did not match the verified X profile.', awaiting_snapshot: 'Waiting for the first X follower snapshot.', not_linked: 'Connect a verified X identity to enable X metrics.', plan_required: 'Recent public post analytics are available on eligible paid plans. Follower snapshots and Linkary clicks remain available.' };
  const providerErrorText: Record<string, string> = { provider_http_401: 'The social data provider rejected its configured credentials. The site administrator should check the provider key.', provider_http_403: 'The social data provider denied this request. The site administrator should check account access.', provider_http_429: 'The social data provider rate-limited this request. Cached values remain visible; retry after the provider cooldown.', provider_http_5xx: 'The social data provider is temporarily unavailable. Cached values remain visible and can be retried later.', invalid_payload: 'The social data provider returned an unexpected timeline format; no metrics were saved.', cache_write_failed: 'Data was returned, but Linkary could not save the analytics snapshot.', provider_request_failed: 'The X data request failed before metrics could be saved.' };
  const xStatus = xProfile?.refreshState || (xProfile ? postMetricsEnabled ? 'awaiting_snapshot' : 'plan_required' : 'not_linked');
  const xMessage = xStatus === 'provider_error' && selectedPlatform === 'X data'
    ? (providerErrorText[xProfile?.refreshErrorCode || ''] || xStatusText[xStatus])
    : xStatusText[xStatus];
  const postStat = (value: number | null) => typeof value === 'number' ? value.toLocaleString() : '—';
  return <div className="analytics-social-dashboard">
    <section className="analytics-social-summary">
      <article><span>X followers</span><strong>{typeof xProfile?.audience === 'number' ? xProfile.audience.toLocaleString() : '—'}</strong><small>{hasProviderData ? 'Latest verified provider snapshot' : 'Awaiting provider data'}</small></article>
      <article><span>X public post views</span><strong>{typeof xValues.post_views === 'number' ? xValues.post_views.toLocaleString() : '—'}</strong><small>{typeof xValues.post_views === 'number' ? `Latest ${xPosts.length} posts · provider-reported public views` : 'Shown when the provider returns a public view count; never estimated from engagement'}</small></article>
      <article><span>X engagements</span><strong>{typeof xProfile?.engagements === 'number' ? xProfile.engagements.toLocaleString() : '—'}</strong><small>{typeof xProfile?.engagements === 'number' ? `Public interactions across the latest ${xPosts.length} posts` : xStatus === 'plan_required' ? 'Available on eligible paid plans' : 'No measured X post metrics yet'}</small></article>
      <article><span>Linkary clicks to X</span><strong>{typeof xProfile?.clicks === 'number' ? xProfile.clicks.toLocaleString() : '—'}</strong><small>First-party Linkary clicks · last 7 days</small></article>
    </section>
    <section className="analytics-primary-grid analytics-social-primary">
      <article className="analytics-panel analytics-performance"><header><div><h2>Social growth</h2><p>Verified X follower snapshots captured over the last 7 days.</p></div><span>Last 7 days</span></header><SocialGrowthChart snapshots={audienceSnapshots} /></article>
      <SocialSources sources={sources} compact />
    </section>
    <article className="analytics-panel analytics-social-analytics">
      <header><div><h2>Channel performance</h2><p>Select a network to inspect its available native metrics.</p></div><span>Provider data</span></header>
      <div className="analytics-social-cards">{platforms.map((platform) => {
        const profile = values.get(platform.platform.toLowerCase());
        const hasData = Boolean(profile && [profile.audience, profile.impressions, profile.engagements, profile.clicks].some((value) => typeof value === 'number'));
        const isX = platform.platform === 'X data';
        return <button type="button" className={`analytics-social-card ${hasData ? 'has-data' : ''} ${selectedPlatform === platform.platform ? 'selected' : ''}`} key={platform.platform} onClick={() => setSelectedPlatform(platform.platform)} aria-pressed={selectedPlatform === platform.platform}>
          <div className="analytics-social-card-heading"><i style={{ background: platform.color }}>{platform.short}</i><div><strong>{platform.platform}</strong><small>{profile?.status || platform.state}</small></div></div>
          <dl><div><dt>{isX ? 'Followers' : 'Audience'}</dt><dd>{typeof profile?.audience === 'number' ? profile.audience.toLocaleString() : '—'}</dd></div><div><dt>{isX ? 'Post views' : 'Impressions'}</dt><dd>{typeof profile?.metrics?.post_views === 'number' ? profile.metrics.post_views.toLocaleString() : typeof profile?.impressions === 'number' ? profile.impressions.toLocaleString() : '—'}</dd></div><div><dt>Engagements</dt><dd>{typeof profile?.engagements === 'number' ? profile.engagements.toLocaleString() : '—'}</dd></div><div><dt>{isX ? 'Linkary clicks' : 'Link clicks'}</dt><dd>{typeof profile?.clicks === 'number' ? profile.clicks.toLocaleString() : '—'}</dd></div></dl>
        </button>;
      })}</div>
      <section className="analytics-social-detail"><header><div><h3>{selectedDefinition.platform} metrics</h3><p>{selectedPlatform === 'X data' ? (xMessage || 'Showing the latest cached X metrics.') : `${selectedProfile?.status || selectedDefinition.state}. Metrics appear when this provider is connected.`}</p></div><span>{selectedProfile ? 'Latest snapshot' : 'Awaiting integration'}</span></header><dl>{selectedMetrics.map((metric) => <div key={metric}><dt>{metric}</dt><dd>{detailValue(metric)}</dd></div>)}</dl></section>
    </article>
    <section className="analytics-lower-grid analytics-social-lower">
      <article className="analytics-panel"><header><div><h2>Top social content</h2><p>Recent public X posts with measured provider metrics.</p></div><span>{xPosts.length ? `${xPosts.length} posts` : 'Provider data'}</span></header>{xPosts.length ? <div className="analytics-social-posts">{xPosts.map((post) => <div key={post.id}><a href={post.url} target="_blank" rel="noreferrer">View X post ↗</a><small>{post.createdAt ? `Published ${new Date(post.createdAt).toLocaleDateString()}` : 'Publication date unavailable'} · Lifetime public views {postStat(post.views)} · Likes {postStat(post.likes)} · Replies {postStat(post.replies)} · Reposts {postStat(post.reposts)}</small></div>)}</div> : <p className="analytics-panel-empty">{xStatus === 'plan_required' ? 'Upgrade to an eligible plan to view public post performance.' : 'No recent X post snapshot is available yet.'}</p>}</article>
      <article className="analytics-panel"><header><div><h2>Social activity</h2><p>Provider refresh status for your verified X identity.</p></div><span>{xPosts.length ? 'X data' : 'Provider data'}</span></header><p className="analytics-panel-empty">{xProfile?.lastRefreshedAt ? `Last X post refresh: ${new Date(xProfile.lastRefreshedAt).toLocaleString()}.` : xStatusText[xStatus] || 'No X post refresh has been recorded yet.'}</p></article>
      <article className="analytics-panel"><header><div><h2>Data readiness</h2><p>Linkary attribution remains available before provider-level metrics.</p></div><span>Truth first</span></header><div className="analytics-readiness"><div><i className="ready" />Linkary tracked clicks <small>Ready</small></div><div><i className={typeof xProfile?.audience === 'number' ? 'ready' : ''} />X follower snapshots <small>{typeof xProfile?.audience === 'number' ? 'Ready' : 'Awaiting data'}</small></div><div><i className={xPosts.length ? 'ready' : ''} />X public post performance <small>{xPosts.length ? 'Ready' : xStatus === 'plan_required' ? 'Plan required' : 'Awaiting snapshot'}</small></div></div></article>
    </section>
  </div>;
}

export default function AnalyticsExperience({ me, status }: { me: ProductMe; status: ProductStatus }) {
  const first = status.profiles.find((item) => item.profile_type === 'creator') || status.profiles[0];
  const saved = typeof window === 'undefined' ? null : window.localStorage.getItem('linkary.active.profile');
  const [profileId, setProfileId] = useState(saved && status.profiles.some((item) => item.id === saved) ? saved : first?.id || '');
  const profile = status.profiles.find((item) => item.id === profileId) || first;
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'social' | 'campaigns' | 'onchain'>('overview');
  const [range, setRange] = useState('30d');
  const [interval, setInterval] = useState<'day' | 'week' | 'month'>('day');
  const [linkId, setLinkId] = useState('all');
  useEffect(() => {
    if (!profile) return;
    let current = true;
    setError(false);
    setLoading(true);
    // Keep analytics reads on the shipped first-party API contract. Social
    // provider snapshots will populate when the separate ingestion backend is released.
    void loadAnalytics(profile.id, range, interval, linkId)
      .then((result) => { if (current) setAnalytics(result); })
      .catch(() => { if (current) setError(true); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [profile?.id, range, interval, linkId, tab]);
  const outcome = useMemo(() => analytics?.proof?.metrics.find((metric) => metric.label === 'Verified outcomes')?.value || 'Unavailable', [analytics]);
  if (!profile) return null;
  const filtered = analytics?.filteredSeries;
  const rangeLabels: Record<string, string> = { '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days', '12m': 'Last 12 months' };
  const metrics = [{ label: 'PROFILE VIEWS', value: !loading && filtered ? String(filtered.profileViews) : '—', note: 'Selected range · profile-wide', icon: 'eye' as const }, { label: 'LINK CLICKS', value: !loading && filtered ? String(filtered.linkClicks) : '—', note: linkId === 'all' ? 'Selected range · all links' : 'Selected range · selected link', icon: 'link' as const }, { label: 'ENGAGEMENTS', value: 'Unavailable', note: 'Social APIs not connected', icon: 'users' as const, status: 'Provider data' }, { label: 'VERIFIED OUTCOMES', value: outcome, note: outcome === 'Unavailable' ? 'No verified evidence yet' : 'Verified evidence', icon: 'cube' as const }, { label: 'ATTRIBUTED VALUE', value: 'Unavailable', note: profile.profile_type === 'project' ? 'See project intelligence below' : 'No campaign value recorded', icon: 'coin' as const }];
  function changeProfile(id: string) { setProfileId(id); setLinkId('all'); setAnalytics(null); window.localStorage.setItem('linkary.active.profile', id); }
  const destinations = analytics?.platformClicks || []; const destinationMax = Math.max(1, ...destinations.map((row) => row.count));
  const tabs = [['overview', 'Overview'], ['social', 'Social analytics'], ['campaigns', 'Campaigns & attribution'], ['onchain', 'Onchain & auctions']] as const;
  const contentLinks = <article className="analytics-panel"><header><div><h2>Top-performing profile links</h2><p>Measured outbound destinations and links.</p></div><a href="/profile">Edit links →</a></header>{destinations.length ? <div className="analytics-rank-list">{destinations.slice(0, 5).map((row, index) => <div key={row.platform}><b>{index + 1}</b><span>{row.platform}</span><i><em style={{ width: `${row.count / destinationMax * 100}%` }} /></i><strong>{row.count}</strong></div>)}</div> : <p className="analytics-panel-empty">No tracked content clicks yet.</p>}</article>;
  const onchainActivity = <article className="analytics-panel"><header><div><h2>Onchain & auction activity</h2><p>Actual Linkary records only.</p></div><a href="/bids">View all →</a></header><div className="analytics-activity-list"><div><i><Icon name="trend" /></i><span><strong>Profile promotion auctions</strong><small>Live, next available and completed placements appear in Bids.</small></span></div><div><i><Icon name="target" /></i><span><strong>UTM attribution</strong><small>Tracked links populate campaign and source performance.</small></span></div><div><i><Icon name="check" /></i><span><strong>Evidence and outcomes</strong><small>Only verified or recorded outcomes are reported.</small></span></div></div></article>;
  const campaigns = <article className="analytics-panel"><header><div><h2>Top campaigns & partners</h2><p>Campaign intelligence is ready for tracked activity.</p></div><a href="/campaigns">View all →</a></header><div className="analytics-readiness"><div><i className="ready" />Linkary tracked clicks <small>Ready</small></div><div><i className="ready" />Raw profile views <small>Ready</small></div><div><i />X data <small>Awaiting integration</small></div><div><i />Telegram engagement <small>Awaiting integration</small></div></div></article>;
  return <ProductWorkspace me={me} status={status} profile={profile as ProductProfile} onProfileChange={changeProfile}><div className="ops-stack analytics-page"><header className="analytics-hero"><div><span className="ops-kicker">LINKARY ANALYTICS</span><h1>Analytics</h1><p>Track your profile, campaigns, attribution and onchain impact.</p></div><div className="analytics-actions"><span>{rangeLabels[range]} · Linkary tracked</span><button type="button" className="ops-button primary" onClick={() => window.print()}>↓ Export report</button></div></header><nav className="analytics-tabs" aria-label="Analytics sections">{tabs.map(([id, label]) => <button key={id} type="button" className={tab === id ? 'active' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>{label}</button>)}</nav>{tab === 'overview' && <section className="analytics-filter-bar" aria-label="Analytics filters"><label><span>Date range</span><select value={range} onChange={(event) => setRange(event.target.value)}><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option><option value="12m">Last 12 months</option></select></label><label><span>Profile link</span><select value={linkId} onChange={(event) => setLinkId(event.target.value)}><option value="all">All links</option>{(filtered?.links || []).map((link) => <option key={link.id} value={link.id}>{link.label}</option>)}</select></label><label><span>Interval</span><select value={interval} onChange={(event) => setInterval(event.target.value as 'day' | 'week' | 'month')}><option value="day">Daily</option><option value="week">Weekly</option><option value="month">Monthly</option></select></label><p>Link selection filters clicks; profile views remain profile-wide.</p></section>}{error ? <section className="analytics-empty"><strong>Analytics are still warming up</strong><span>We could not load your recorded analytics right now. Your existing profile, wallet, campaign and auction data are unchanged.</span></section> : <>{tab === 'overview' && <><section className="analytics-kpis">{metrics.map((metric) => <article key={metric.label} className={`analytics-metric analytics-metric-${metric.icon}`}><i><Icon name={metric.icon} /></i><div><span>{metric.label}</span><strong className={metric.value === 'Unavailable' ? 'is-unavailable' : ''}>{metric.value}</strong><small>{metric.note}</small></div>{metric.status && <em>{metric.status}</em>}</article>)}</section><section className="analytics-primary-grid"><article className="analytics-panel analytics-performance"><header><div><h2>Performance over time</h2><p>Daily profile views and outbound clicks from recorded Linkary events.</p></div><span>{rangeLabels[range]} · {interval}</span></header>{!loading && analytics?.filteredSeries ? <SoftLineChart data={analytics.filteredSeries.series} interval={interval} /> : <div className="analytics-chart-skeleton" />}</article></section><section className="analytics-lower-grid analytics-overview-details">{contentLinks}<SocialSources sources={analytics?.socialSources} />{onchainActivity}{campaigns}</section></>}{tab === 'social' && <SocialAnalytics profiles={analytics?.socialProfiles} sources={analytics?.socialSources} audienceSnapshots={analytics?.socialAudienceSnapshots} trackingStartedAt={analytics?.socialTrackingStartedAt} postMetricsEnabled={analytics?.socialPostMetricsEnabled} />}{tab === 'campaigns' && <section className="analytics-lower-grid analytics-tab-grid">{contentLinks}{campaigns}</section>}{tab === 'onchain' && <section className="analytics-tab-grid"><div>{onchainActivity}</div>{profile.profile_type === 'project' && profile.organization_id ? <FounderGrowthIntelligencePanel organizationId={profile.organization_id} /> : <section className="analytics-empty"><strong>Onchain reporting is ready for Project workspaces</strong><span>Promotion auctions are visible above. Project campaign outcomes and verified onchain actions appear here when recorded.</span></section>}</section>}</>}</div></ProductWorkspace>;
}
