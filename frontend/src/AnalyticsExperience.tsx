import { useEffect, useMemo, useState } from 'react';
import FounderGrowthIntelligencePanel from './FounderGrowthIntelligencePanel';
import { ProductWorkspace, type ProductMe, type ProductProfile, type ProductStatus } from './ProductWorkspace';
import './analytics.css';

type Point = { month: string; count: number };
type FilteredSeries = { range: string; interval: 'day' | 'week' | 'month'; from: string; to: string; linkId: string; profileViews: number; linkClicks: number; series: Array<{ date: string; profileViews: number; linkClicks: number }>; links: Array<{ id: string; label: string }>; linkFilterAppliesTo: 'linkClicksOnly' };
type SocialSource = { label: string; value: number; color?: string };
type SocialProfile = { platform: string; audience?: number; impressions?: number; engagements?: number; clicks?: number; status?: string; metrics?: Record<string, number> };
type SocialContentItem = { date: string; views: number | null; likes: number | null; reposts: number | null; replies: number | null; quotes: number | null; bookmarks: number | null };
type SocialAudienceSnapshot = { date: string; followers: number };
type Analytics = { linkClicks: number; profileViews: number; sections: number; connectedChannels: number; monthlyClicks: Point[]; monthlyProfileViews: Point[]; filteredSeries?: FilteredSeries; monthlySocialAudience?: Point[]; monthlySocialImpressions?: Point[]; monthlySocialEngagements?: Point[]; socialAudienceSnapshots?: SocialAudienceSnapshot[]; platformClicks?: Array<{ platform: string; count: number }>; socialSources?: SocialSource[]; socialProfiles?: SocialProfile[]; socialContent?: SocialContentItem[]; proof?: { metrics: Array<{ label: string; value: string }> } | null };
type IconName = 'eye' | 'link' | 'users' | 'cube' | 'coin' | 'trend' | 'target' | 'check';

async function loadAnalytics(profileId: string, range: string, interval: string, linkId: string): Promise<Analytics> {
  const params = new URLSearchParams({ range, interval, linkId });
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

function SoftLineChart({ data, interval = 'day', emptyNote = 'No recorded profile views or tracked clicks in this period yet.', legendLabels = ['Profile views', 'Link clicks'] }: { data: TrendPoint[]; interval?: 'day' | 'week' | 'month'; emptyNote?: string; legendLabels?: [string, string] }) {
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
    <div className="analytics-legend"><span><i className="views" />{legendLabels[0]}</span><span><i className="clicks" />{legendLabels[1]}</span></div>
    <div className="analytics-chart-stage" onPointerLeave={() => setActive(null)}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${legendLabels[0]} and ${legendLabels[1]} over time`} preserveAspectRatio="none">
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
            <rect className="analytics-hit" x={Math.max(left, x - hitWidth / 2)} y={top} width={Math.min(hitWidth, width - right - Math.max(left, x - hitWidth / 2))} height={plotHeight} tabIndex={0} role="button" aria-label={`${formatPeriod(point.date, interval, true)}: ${point.profileViews.toLocaleString()} ${legendLabels[0]} and ${point.linkClicks.toLocaleString()} ${legendLabels[1]}`} onPointerEnter={() => setActive(index)} onPointerDown={() => setActive(index)} onFocus={() => setActive(index)} onBlur={() => setActive(null)} />
          </g>;
        })}
      </svg>
      {selected && <div className="analytics-tooltip" style={{ left: `${Math.min(91, Math.max(9, selectedX / width * 100))}%` }} role="status"><strong>{formatPeriod(selected.date, interval, true)}</strong><span><i className="views" />{selected.profileViews.toLocaleString()} {legendLabels[0]}</span><span><i className="clicks" />{selected.linkClicks.toLocaleString()} {legendLabels[1]}</span></div>}
    </div>
    <div className="analytics-axis">{labelIndexes.map((index) => <span key={data[index].date}>{formatPeriod(data[index].date, interval)}</span>)}</div>
    {!nonZero && <p className="analytics-zero-note">{emptyNote}</p>}
  </div>;
}

function SocialSources({ sources = [] }: { sources?: SocialSource[] }) {
  const rows = [['X followers', 'Awaiting linked X identity'], ['Telegram', 'Connect Telegram to view metrics'], ['YouTube', 'Coming soon'], ['Instagram', 'Coming soon']]; const total = sources.reduce((sum, source) => sum + source.value, 0); const colors = ['#1769e8', '#23a5e8', '#ee4a7c', '#8a54ea', '#c7cfda']; let progress = 0;
  const segments = total ? sources.map((source, index) => { const start = progress; progress += source.value / total * 100; return `${source.color || colors[index % colors.length]} ${start}% ${progress}%`; }).join(',') : '';
  return <article className="analytics-panel analytics-audience"><header><div><h2>Audience & socials</h2><p>Connected social accounts populate automatically.</p></div><span>Social metrics</span></header><div className={`analytics-donut ${total ? 'has-data' : ''}`} style={total ? { background: `conic-gradient(${segments})` } : undefined}><b>{total ? total.toLocaleString() : '—'}</b><small>{total ? 'audience\nsize' : 'no social\nmetrics yet'}</small></div><div className="analytics-social-list">{total ? sources.map((source, index) => <div key={source.label}><i style={{ background: source.color || colors[index % colors.length] }} /><strong>{source.label}</strong><small>{source.value.toLocaleString()} followers</small></div>) : rows.map(([label, state]) => <div key={label}><i /><strong>{label}</strong><small>{state}</small></div>)}</div></article>;
}

function SocialAnalytics({ profiles = [], sources = [], audience = [], impressions = [], content = [] }: { profiles?: SocialProfile[]; sources?: SocialSource[]; audience?: Point[]; impressions?: Point[]; content?: SocialContentItem[] }) {
  const platforms = [
    { platform: 'X data', short: 'X', color: '#121820', state: 'Awaiting X public metrics' },
    { platform: 'Telegram', short: 'TG', color: '#239bd8', state: 'Connect Telegram to view its metrics' },
    { platform: 'YouTube', short: 'YT', color: '#ff3d35', state: 'YouTube metrics coming soon' },
    { platform: 'Instagram', short: 'IG', color: '#d94d91', state: 'Instagram metrics coming soon' },
    { platform: 'TikTok', short: 'TT', color: '#1a1a1a', state: 'TikTok metrics coming soon' },
    { platform: 'LinkedIn', short: 'in', color: '#0a66c2', state: 'LinkedIn metrics coming soon' },
  ];
  const values = new Map(profiles.map((profile) => [profile.platform.toLowerCase(), profile]));
  const [selectedPlatform, setSelectedPlatform] = useState('X data');
  const latest = (points: Point[]) => points.length ? points[points.length - 1].count.toLocaleString() : '—';
  const totalEngagements = profiles.reduce((sum, profile) => sum + (profile.engagements || 0), 0);
  const totalClicks = profiles.reduce((sum, profile) => sum + (profile.clicks || 0), 0);
  const hasAudience = audience.length > 0 || profiles.some((profile) => typeof profile.audience === 'number');
  const hasImpressions = impressions.length > 0 || profiles.some((profile) => typeof profile.impressions === 'number');
  const hasEngagements = profiles.some((profile) => typeof profile.engagements === 'number');
  const hasClicks = profiles.some((profile) => typeof profile.clicks === 'number');
  const selectedProfile = values.get(selectedPlatform.toLowerCase());
  const selectedDefinition = platforms.find((platform) => platform.platform === selectedPlatform) || platforms[0];
  const metricSets: Record<string, string[]> = {
    'X data': ['Followers', 'Recent post views', 'Public engagements', 'Posts sampled', 'Likes', 'Reposts', 'Replies', 'Quotes', 'Bookmarks', 'Profile link clicks'],
    Telegram: ['Audience', 'Views', 'Reactions', 'Forwards', 'Link clicks', 'Posts'],
    YouTube: ['Subscribers', 'Views', 'Watch time', 'Likes', 'Comments', 'Uploads'],
    Instagram: ['Audience', 'Reach', 'Impressions', 'Likes', 'Comments', 'Saves', 'Shares'],
    TikTok: ['Followers', 'Video views', 'Likes', 'Comments', 'Shares', 'Average watch time'],
    LinkedIn: ['Followers', 'Impressions', 'Reactions', 'Comments', 'Reposts', 'Link clicks'],
  };
  const selectedMetrics = metricSets[selectedPlatform] || metricSets['X data'];
  const selectedValues = selectedProfile?.metrics || {};
  const detailKeys: Record<string, string> = {
    Followers: 'followers', 'Recent post views': 'recent_post_views', 'Public engagements': 'public_engagements',
    'Posts sampled': 'posts_sampled', Likes: 'likes', Reposts: 'reposts', Replies: 'replies', Quotes: 'quotes',
    Bookmarks: 'bookmarks', 'Profile link clicks': 'linkary_clicks',
  };
  const detailValue = (label: string) => {
    const key = detailKeys[label] || label.toLowerCase().replaceAll(' ', '_');
    if (typeof selectedValues[key] === 'number') return selectedValues[key].toLocaleString();
    const fallback: Record<string, number | undefined> = {
      audience: selectedProfile?.audience, impressions: selectedProfile?.impressions,
      engagements: selectedProfile?.engagements, link_clicks: selectedProfile?.clicks,
      followers: selectedProfile?.audience, recent_post_views: selectedProfile?.impressions,
      public_engagements: selectedProfile?.engagements, linkary_clicks: selectedProfile?.clicks,
    };
    return typeof fallback[key] === 'number' ? fallback[key]!.toLocaleString() : '—';
  };
  const impressionsByMonth = new Map(impressions.map((point) => [point.month, point.count]));
  const chartData = audience.map((point) => ({ date: point.month, profileViews: point.count, linkClicks: impressionsByMonth.get(point.month) || 0 }));
  const maxViews = Math.max(1, ...content.map((post) => post.views || 0));
  const xProfile = values.get('x data');
  const xMetricsReady = typeof xProfile?.audience === 'number';

  return <div className="analytics-social-dashboard">
    <section className="analytics-social-summary">
      <article><span>Social audience</span><strong>{latest(audience)}</strong><small>{hasAudience ? 'Latest X follower count' : 'Awaiting linked X identity'}</small></article>
      <article><span>Recent post views</span><strong>{latest(impressions)}</strong><small>{hasImpressions ? 'Across sampled public posts' : 'Awaiting X post metrics'}</small></article>
      <article><span>Public engagements</span><strong>{hasEngagements ? totalEngagements.toLocaleString() : '—'}</strong><small>{hasEngagements ? 'Likes, reposts, replies and quotes' : 'Awaiting X post metrics'}</small></article>
      <article><span>Linkary clicks</span><strong>{hasClicks ? totalClicks.toLocaleString() : '—'}</strong><small>Tracked first-party link clicks</small></article>
    </section>
    <section className="analytics-primary-grid analytics-social-primary">
      <article className="analytics-panel analytics-performance">
        <header><div><h2>Social growth</h2><p>Follower audience and sampled post-view snapshots.</p></div><span>Last 12 months</span></header>
        <SoftLineChart data={chartData} interval="month" emptyNote="Connect an X identity to start tracking public follower and post metrics." legendLabels={['X followers', 'Recent post views']} />
      </article>
      <SocialSources sources={sources} />
    </section>
    <article className="analytics-panel analytics-social-analytics">
      <header><div><h2>Channel performance</h2><p>Select a social network to inspect its metrics.</p></div><span>Social metrics</span></header>
      <div className="analytics-social-cards">{platforms.map((platform) => {
        const profile = values.get(platform.platform.toLowerCase());
        const hasData = Boolean(profile && [profile.audience, profile.impressions, profile.engagements, profile.clicks].some((value) => typeof value === 'number'));
        const isX = platform.platform === 'X data';
        return <button type="button" className={'analytics-social-card ' + (hasData ? 'has-data ' : '') + (selectedPlatform === platform.platform ? 'selected' : '')} key={platform.platform} onClick={() => setSelectedPlatform(platform.platform)} aria-pressed={selectedPlatform === platform.platform}>
          <div className="analytics-social-card-heading"><i style={{ background: platform.color }}>{platform.short}</i><div><strong>{platform.platform}</strong><small>{profile?.status || platform.state}</small></div></div>
          <dl>
            <div><dt>{isX ? 'Followers' : 'Audience'}</dt><dd>{typeof profile?.audience === 'number' ? profile.audience.toLocaleString() : '—'}</dd></div>
            <div><dt>{isX ? 'Recent post views' : 'Impressions'}</dt><dd>{typeof profile?.impressions === 'number' ? profile.impressions.toLocaleString() : '—'}</dd></div>
            <div><dt>{isX ? 'Public engagements' : 'Engagements'}</dt><dd>{typeof profile?.engagements === 'number' ? profile.engagements.toLocaleString() : '—'}</dd></div>
            <div><dt>{isX ? 'Linkary clicks' : 'Link clicks'}</dt><dd>{typeof profile?.clicks === 'number' ? profile.clicks.toLocaleString() : '—'}</dd></div>
          </dl>
        </button>;
      })}</div>
      <section className="analytics-social-detail">
        <header><div><h3>{selectedDefinition.platform} metrics</h3><p>{selectedProfile?.status || selectedDefinition.state}. X public metrics use the active linked identity.</p></div><span>{selectedProfile ? 'Latest snapshot' : 'Coming soon'}</span></header>
        <dl>{selectedMetrics.map((metric) => <div key={metric}><dt>{metric}</dt><dd>{detailValue(metric)}</dd></div>)}</dl>
      </section>
    </article>
    <section className="analytics-lower-grid analytics-social-lower">
      <article className="analytics-panel">
        <header><div><h2>Recent social content</h2><p>Recent X posts with public post metrics.</p></div><span>{content.length ? content.length + ' sampled' : 'Social metrics'}</span></header>
        {content.length ? <div className="analytics-top-links">{content.slice(0, 5).map((post, index) => <div key={post.date + '-' + index}><span>{index + 1}</span><strong>{post.date ? formatPeriod(post.date.slice(0, 10), 'day') : 'Recent post'}</strong><i><b style={{ width: Math.max(3, (post.views || 0) / maxViews * 100) + '%' }} /></i><em>{typeof post.views === 'number' ? post.views.toLocaleString() : '—'}</em></div>)}</div> : <p className="analytics-panel-empty">No sampled public post metrics yet.</p>}
      </article>
      <article className="analytics-panel"><header><div><h2>Social activity</h2><p>Social activity and connection history appear here.</p></div><span>Social metrics</span></header><p className="analytics-panel-empty">Social activity events are not available yet.</p></article>
      <article className="analytics-panel"><header><div><h2>Data readiness</h2><p>Linkary attribution remains available before social integrations.</p></div><span>Truth first</span></header><div className="analytics-readiness"><div><i className="ready" />Linkary tracked clicks <small>Ready</small></div><div><i className={xMetricsReady ? 'ready' : ''} />X public metrics <small>{xMetricsReady ? 'Ready' : 'Awaiting linked X identity'}</small></div><div><i />X deep analytics <small>Planned integration</small></div></div></article>
    </section>
  </div>;
}

function ProjectFollowerChart({ snapshots, currentFollowers }: { snapshots: SocialAudienceSnapshot[]; currentFollowers?: number }) {
  const width = 900; const height = 300; const left = 48; const top = 18; const right = 8; const bottom = 38;
  const [active, setActive] = useState<number | null>(null);
  const dated = snapshots.filter((point) => /^\d{4}-\d{2}-\d{2}$/.test(point.date) && Number.isFinite(point.followers))
    .sort((a, b) => a.date.localeCompare(b.date));
  const points = dated.length ? dated : typeof currentFollowers === 'number' ? [{ date: new Date().toISOString().slice(0, 10), followers: currentFollowers }] : [];
  const baselineOnly = points.length === 1;
  const max = Math.max(1, ...points.map((point) => point.followers));
  const axisMax = niceAxisMax(max);
  const plotWidth = width - left - right; const plotHeight = height - top - bottom;
  const yFor = (value: number) => top + plotHeight - value / axisMax * plotHeight;
  const dataCoords = points.map((point, index) => ({
    ...point,
    x: left + (points.length === 1 ? plotWidth : index / (points.length - 1) * plotWidth),
    y: yFor(point.followers),
  }));
  const coords = baselineOnly ? [{ date: '', followers: 0, x: left, y: yFor(0), baseline: true }, { ...dataCoords[0], baseline: false }] : dataCoords.map((point) => ({ ...point, baseline: false }));
  const line = coords.map((point, index) => {
    if (!index) return `M${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
    const previous = coords[index - 1]; const third = (point.x - previous.x) / 3;
    return `C${(previous.x + third).toFixed(2)} ${previous.y.toFixed(2)} ${(point.x - third).toFixed(2)} ${point.y.toFixed(2)} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
  }).join(' ');
  const area = `${line} L${coords[coords.length - 1]?.x ?? left} ${top + plotHeight} L${coords[0]?.x ?? left} ${top + plotHeight} Z`;
  const selected = active === null ? null : coords[active];
  const dateLabel = (date: string) => date ? new Date(`${date}T00:00:00Z`).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : 'Tracking baseline';
  const displayedDates = points.length > 1 ? [dateLabel(points[0].date), dateLabel(points[points.length - 1].date)] : ['Tracking start', points.length ? dateLabel(points[0].date) : 'Today'];
  return <div className="analytics-trend analytics-project-follower-chart">
    <div className="analytics-legend"><span><i className="views" />X followers</span></div>
    <div className="analytics-chart-stage" onPointerLeave={() => setActive(null)}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Interactive X follower growth" preserveAspectRatio="none">
        <defs><linearGradient id="project-follower-fill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#c83b24" stopOpacity=".2" /><stop offset="1" stopColor="#c83b24" stopOpacity=".015" /></linearGradient></defs>
        {[0, 1, 2, 3, 4].map((tick) => {
          const y = top + plotHeight - tick / 4 * plotHeight;
          return <g key={tick}><line className="analytics-gridline" x1={left} x2={width} y1={y} y2={y} /><text className="analytics-y-label" x={left - 9} y={y + 3} textAnchor="end">{Math.round(axisMax * tick / 4).toLocaleString()}</text></g>;
        })}
        {points.length > 0 && <><path d={area} fill="url(#project-follower-fill)" /><path className="analytics-view-line" d={line} />{coords.map((point, index) => !point.baseline && <circle key={`${point.date}-${index}`} className="analytics-point" cx={point.x} cy={point.y} r={selected && active === index ? 4.5 : 3.5} />)}</>}
        {selected && <line className="analytics-active-line" x1={selected.x} x2={selected.x} y1={top} y2={top + plotHeight} />}
        {coords.map((point, index) => {
          const previousX = coords[index - 1]?.x ?? left; const nextX = coords[index + 1]?.x ?? left + plotWidth;
          const hitX = index === 0 ? left : (previousX + point.x) / 2; const hitRight = index === coords.length - 1 ? left + plotWidth : (point.x + nextX) / 2;
          return <rect key={`hit-${index}`} className="analytics-hit" x={hitX} y={top} width={Math.max(1, hitRight - hitX)} height={plotHeight} tabIndex={0} role="button" aria-label={point.baseline ? 'Tracking baseline: 0 followers, not historical data' : `${dateLabel(point.date)}: ${point.followers.toLocaleString()} X followers`} onPointerEnter={() => setActive(index)} onPointerDown={() => setActive(index)} onFocus={() => setActive(index)} onBlur={() => setActive(null)} />;
        })}
      </svg>
      {selected && <div className="analytics-tooltip" style={{ left: `${Math.min(91, Math.max(9, selected.x / width * 100))}%` }} role="status"><strong>{selected.baseline ? 'Tracking baseline' : dateLabel(selected.date)}</strong><span><i className="views" />{selected.followers.toLocaleString()} X followers</span>{selected.baseline && <span>Baseline only · not a historical count</span>}</div>}
    </div>
    <div className="analytics-axis"><span>{displayedDates[0]}</span><span>{displayedDates[1]}</span></div>
    <p className="analytics-zero-note">{points.length === 0 ? 'No public follower snapshot is available yet. Connect an X identity to begin tracking.' : baselineOnly ? 'Current followers start from a zero tracking baseline; zero is not historical data. New snapshots will build the measured trend.' : `${points.length.toLocaleString()} dated follower snapshots · hover, focus or tap the chart to inspect values.`}</p>
  </div>;
}

function ProjectSocialAnalytics({ profiles = [], sources = [], snapshots = [], content = [] }: { profiles?: SocialProfile[]; sources?: SocialSource[]; snapshots?: SocialAudienceSnapshot[]; content?: SocialContentItem[] }) {
  const platforms = [
    { platform: 'X', key: 'x data', short: 'X', color: '#121820' },
    { platform: 'Telegram', key: 'telegram', short: 'TG', color: '#239bd8' },
    { platform: 'YouTube', key: 'youtube', short: 'YT', color: '#ff3d35' },
    { platform: 'Instagram', key: 'instagram', short: 'IG', color: '#d94d91' },
    { platform: 'TikTok', key: 'tiktok', short: 'TT', color: '#1a1a1a' },
    { platform: 'LinkedIn', key: 'linkedin', short: 'in', color: '#0a66c2' },
  ];
  const profileMap = new Map(profiles.map((item) => [item.platform.toLowerCase(), item]));
  const xProfile = profileMap.get('x data'); const xMetrics = xProfile?.metrics || {};
  const [selected, setSelected] = useState('x data');
  const xFollowers = xProfile?.audience;
  const value = (candidate: number | null | undefined) => typeof candidate === 'number' ? candidate.toLocaleString() : '—';
  const metricValue = (key: string, fallback?: number | null) => typeof xMetrics[key] === 'number' ? value(xMetrics[key]) : value(fallback);
  const totalAudience = sources.reduce((sum, source) => sum + source.value, 0);
  let audienceProgress = 0;
  const audienceGradient = sources.map((source) => {
    const start = audienceProgress;
    audienceProgress += totalAudience ? source.value / totalAudience * 100 : 0;
    return `${source.color || '#121820'} ${start}% ${audienceProgress}%`;
  }).join(',');
  const maxViews = Math.max(1, ...content.map((post) => post.views || 0));
  const metricTiles = [
    ['Followers', metricValue('followers', xFollowers)],
    ['Recent post views', metricValue('recent_post_views', xProfile?.impressions)],
    ['Public engagements', metricValue('public_engagements', xProfile?.engagements)],
    ['Posts sampled', metricValue('posts_sampled')],
    ['Likes', metricValue('likes')], ['Reposts', metricValue('reposts')], ['Replies', metricValue('replies')],
    ['Quotes', metricValue('quotes')], ['Bookmarks', metricValue('bookmarks')],
    ['Profile link clicks', metricValue('linkary_clicks', xProfile?.clicks)],
  ];
  const selectedPlatform = platforms.find((platform) => platform.key === selected) || platforms[0];
  const selectedProfile = profileMap.get(selectedPlatform.key);
  const engagementValue = xProfile?.engagements ?? (typeof xMetrics.public_engagements === 'number' ? xMetrics.public_engagements : undefined);
  const viewsValue = xProfile?.impressions ?? (typeof xMetrics.recent_post_views === 'number' ? xMetrics.recent_post_views : undefined);
  const clicksValue = xProfile?.clicks;
  return <div className="analytics-social-dashboard analytics-project-social">
    <section className="analytics-social-summary">
      <article><span>X followers</span><strong>{value(xFollowers)}</strong><small>{xProfile?.status || (xProfile ? 'Latest public profile snapshot' : 'Connect an X identity to see public metrics')}</small></article>
      <article><span>Recent public post views</span><strong>{value(viewsValue)}</strong><small>{typeof viewsValue === 'number' ? 'Views reported across sampled posts' : 'Shown when view counts are available'}</small></article>
      <article><span>Public engagements</span><strong>{value(engagementValue)}</strong><small>{typeof engagementValue === 'number' ? 'Likes, reposts, replies and quotes' : 'Measured public interactions across sampled posts'}</small></article>
      <article><span>Linkary clicks</span><strong>{value(clicksValue)}</strong><small>Tracked first-party clicks for this Project profile</small></article>
    </section>
    <article className="analytics-panel analytics-performance analytics-project-social-growth">
      <header><div><h2>X audience growth</h2><p>Dated public follower snapshots. New snapshots extend this trend over time.</p></div><span>{snapshots.length ? `${snapshots.length} snapshot${snapshots.length === 1 ? '' : 's'}` : 'Public metrics'}</span></header>
      <ProjectFollowerChart snapshots={snapshots} currentFollowers={xFollowers} />
    </article>
    <section className="analytics-project-social-pair">
      <article className="analytics-panel analytics-project-audience">
        <header><div><h2>Audience & socials</h2><p>Public follower audience across connected social channels.</p></div><span>{sources.length ? 'Latest snapshot' : 'No audience data'}</span></header>
        <div className={`analytics-project-donut ${totalAudience ? 'has-data' : ''}`} style={totalAudience ? { background: `conic-gradient(${audienceGradient})` } : undefined}><b>{totalAudience ? totalAudience.toLocaleString() : '—'}</b><small>followers</small></div>
        <div className="analytics-project-audience-list">{sources.length ? sources.map((source) => <div key={source.label}><i style={{ background: source.color || '#121820' }} /><span>{source.label}</span><strong>{source.value.toLocaleString()}</strong></div>) : <p className="analytics-panel-empty">A public audience snapshot will appear here when available.</p>}</div>
      </article>
      <article className="analytics-panel analytics-project-channels">
        <header><div><h2>Channel performance</h2><p>Select a channel to inspect its available public metrics.</p></div><span>Social metrics</span></header>
        <div className="analytics-social-cards">{platforms.map((platform) => {
          const item = profileMap.get(platform.key); const connected = Boolean(item && [item.audience, item.impressions, item.engagements, item.clicks].some((metric) => typeof metric === 'number'));
          return <button type="button" className={`analytics-social-card ${connected ? 'has-data' : ''} ${selected === platform.key ? 'selected' : ''}`} key={platform.key} onClick={() => setSelected(platform.key)} aria-pressed={selected === platform.key}>
            <div className="analytics-social-card-heading"><i style={{ background: platform.color }}>{platform.short}</i><div><strong>{platform.platform}</strong><small>{item?.status || (platform.key === 'x data' ? 'Awaiting public metrics' : 'Not connected')}</small></div></div>
            <dl><div><dt>{platform.key === 'x data' ? 'Followers' : 'Audience'}</dt><dd>{value(item?.audience)}</dd></div><div><dt>{platform.key === 'x data' ? 'Post views' : 'Impressions'}</dt><dd>{value(item?.impressions)}</dd></div><div><dt>Engagements</dt><dd>{value(item?.engagements)}</dd></div><div><dt>Link clicks</dt><dd>{value(item?.clicks)}</dd></div></dl>
          </button>;
        })}</div>
        <section className="analytics-social-detail"><header><div><h3>{selectedPlatform.platform} metrics</h3><p>{selectedProfile?.status || (selected === 'x data' ? 'Public X post metrics appear as they are measured.' : 'Connect this social account to show its metrics.')}</p></div><span>{selectedProfile ? 'Latest snapshot' : 'No snapshot'}</span></header>
          {selected === 'x data' ? <dl>{metricTiles.map(([label, number]) => <div key={label}><dt>{label}</dt><dd>{number}</dd></div>)}</dl> : <p className="analytics-panel-empty">Metrics for this channel are not available yet.</p>}
        </section>
      </article>
    </section>
    <section className="analytics-lower-grid analytics-project-social-lower">
      <article className="analytics-panel"><header><div><h2>Recent public posts</h2><p>Post views and interactions from sampled public posts.</p></div><span>{content.length ? `${content.length} sampled` : 'Post metrics'}</span></header>
        {content.length ? <div className="analytics-project-posts">{content.slice(0, 10).map((post, index) => <div key={`${post.date}-${index}`}><span>{index + 1}</span><strong>{post.date ? formatPeriod(post.date.slice(0, 10), 'day') : 'Recent post'}</strong><i><b style={{ width: `${typeof post.views === 'number' ? Math.max(3, post.views / maxViews * 100) : 0}%` }} /></i><em>{value(post.views)} views</em><small>♥ {value(post.likes)} · ↻ {value(post.reposts)} · Replies {value(post.replies)} · Quotes {value(post.quotes)} · Bookmarks {value(post.bookmarks)}</small></div>)}</div> : <p className="analytics-panel-empty">No sampled public posts are available yet.</p>}
      </article>
      <article className="analytics-panel"><header><div><h2>Social activity</h2><p>Recent social metric snapshots for this Project.</p></div><span>Activity</span></header>
        {xProfile?.status ? <p className="analytics-panel-empty">Latest X metrics: {xProfile.status}.</p> : <p className="analytics-panel-empty">No social metric activity has been recorded yet.</p>}
      </article>
      <article className="analytics-panel"><header><div><h2>Data readiness</h2><p>Measured values appear only when recorded.</p></div><span>Truth first</span></header><div className="analytics-readiness"><div><i className={typeof clicksValue === 'number' ? 'ready' : ''} />Linkary tracked clicks <small>{typeof clicksValue === 'number' ? 'Ready' : 'Awaiting data'}</small></div><div><i className={typeof xFollowers === 'number' ? 'ready' : ''} />X public metrics <small>{typeof xFollowers === 'number' ? 'Ready' : 'Awaiting linked account'}</small></div><div><i />Deeper X insights <small>Planned</small></div></div></article>
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
    void loadAnalytics(profile.id, range, interval, linkId)
      .then((result) => { if (current) setAnalytics(result); })
      .catch(() => { if (current) setError(true); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [profile?.id, range, interval, linkId]);
  const outcome = useMemo(() => analytics?.proof?.metrics.find((metric) => metric.label === 'Verified outcomes')?.value || 'Unavailable', [analytics]);
  if (!profile) return null;
  const filtered = analytics?.filteredSeries;
  const rangeLabels: Record<string, string> = { '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days', '12m': 'Last 12 months' };
  const metrics = [{ label: 'PROFILE VIEWS', value: !loading && filtered ? String(filtered.profileViews) : '—', note: 'Selected range · profile-wide', icon: 'eye' as const }, { label: 'LINK CLICKS', value: !loading && filtered ? String(filtered.linkClicks) : '—', note: linkId === 'all' ? 'Selected range · all links' : 'Selected range · selected link', icon: 'link' as const }, { label: 'ENGAGEMENTS', value: 'Unavailable', note: 'Social metrics not connected', icon: 'users' as const, status: 'Social metrics' }, { label: 'VERIFIED OUTCOMES', value: outcome, note: outcome === 'Unavailable' ? 'No verified evidence yet' : 'Verified evidence', icon: 'cube' as const }, { label: 'ATTRIBUTED VALUE', value: 'Unavailable', note: profile.profile_type === 'project' ? 'See project intelligence below' : 'No campaign value recorded', icon: 'coin' as const }];
  function changeProfile(id: string) { setProfileId(id); setLinkId('all'); setAnalytics(null); window.localStorage.setItem('linkary.active.profile', id); }
  const destinations = analytics?.platformClicks || []; const destinationMax = Math.max(1, ...destinations.map((row) => row.count));
  const tabs = profile.profile_type === 'project'
    ? [['overview', 'Overview'], ['social', 'Social connections'], ['campaigns', 'Campaigns & attribution'], ['onchain', 'Onchain & auctions']] as const
    : [['overview', 'Overview'], ['social', 'Social analytics'], ['campaigns', 'Campaigns & attribution'], ['onchain', 'Onchain & auctions']] as const;
  const contentLinks = <article className="analytics-panel"><header><div><h2>Top-performing profile links</h2><p>Measured outbound destinations and links.</p></div><a href="/profile">Edit links →</a></header>{destinations.length ? <div className="analytics-rank-list">{destinations.slice(0, 5).map((row, index) => <div key={row.platform}><b>{index + 1}</b><span>{row.platform}</span><i><em style={{ width: `${row.count / destinationMax * 100}%` }} /></i><strong>{row.count}</strong></div>)}</div> : <p className="analytics-panel-empty">No tracked content clicks yet.</p>}</article>;
  const onchainActivity = <article className="analytics-panel"><header><div><h2>Onchain & auction activity</h2><p>Actual Linkary records only.</p></div><a href="/bids">View all →</a></header><div className="analytics-activity-list"><div><i><Icon name="trend" /></i><span><strong>Profile promotion auctions</strong><small>Live, next available and completed placements appear in Bids.</small></span></div><div><i><Icon name="target" /></i><span><strong>UTM attribution</strong><small>Tracked links populate campaign and source performance.</small></span></div><div><i><Icon name="check" /></i><span><strong>Evidence and outcomes</strong><small>Only verified or recorded outcomes are reported.</small></span></div></div></article>;
  const campaigns = <article className="analytics-panel"><header><div><h2>Top campaigns & partners</h2><p>Campaign intelligence is ready for tracked activity.</p></div><a href="/campaigns">View all →</a></header><div className="analytics-readiness"><div><i className="ready" />Linkary tracked clicks <small>Ready</small></div><div><i className="ready" />Raw profile views <small>Ready</small></div><div><i />X data <small>Awaiting integration</small></div><div><i />Telegram engagement <small>Awaiting integration</small></div></div></article>;
  return <ProductWorkspace me={me} status={status} profile={profile as ProductProfile} onProfileChange={changeProfile}><div className="ops-stack analytics-page"><header className="analytics-hero"><div><span className="ops-kicker">{profile.profile_type === 'project' ? 'PROJECT ANALYTICS' : 'LINKARY ANALYTICS'}</span><h1>{profile.profile_type === 'project' ? 'Analytics & Provenance' : 'Analytics'}</h1><p>{profile.profile_type === 'project' ? 'Truthful telemetry from Linkary first-party activity and recorded campaign evidence.' : 'Track your profile, campaigns, attribution and onchain impact.'}</p></div><div className="analytics-actions"><span>{rangeLabels[range]} · Linkary tracked</span><button type="button" className="ops-button primary" onClick={() => window.print()}>↓ Export report</button></div></header><nav className="analytics-tabs" aria-label="Analytics sections">{tabs.map(([id, label]) => <button key={id} type="button" className={tab === id ? 'active' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>{label}</button>)}</nav>{tab === 'overview' && <section className="analytics-filter-bar" aria-label="Analytics filters"><label><span>Date range</span><select value={range} onChange={(event) => setRange(event.target.value)}><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option><option value="12m">Last 12 months</option></select></label><label><span>Profile link</span><select value={linkId} onChange={(event) => setLinkId(event.target.value)}><option value="all">All links</option>{(filtered?.links || []).map((link) => <option key={link.id} value={link.id}>{link.label}</option>)}</select></label><label><span>Interval</span><select value={interval} onChange={(event) => setInterval(event.target.value as 'day' | 'week' | 'month')}><option value="day">Daily</option><option value="week">Weekly</option><option value="month">Monthly</option></select></label><p>Link selection filters clicks; profile views remain profile-wide.</p></section>}{error ? <section className="analytics-empty"><strong>Analytics are still warming up</strong><span>We could not load your recorded analytics right now. Your existing profile, wallet, campaign and auction data are unchanged.</span></section> : <>{tab === 'overview' && <><section className="analytics-kpis">{metrics.map((metric) => <article key={metric.label} className={`analytics-metric analytics-metric-${metric.icon}`}><i><Icon name={metric.icon} /></i><div><span>{metric.label}</span><strong className={metric.value === 'Unavailable' ? 'is-unavailable' : ''}>{metric.value}</strong><small>{metric.note}</small></div>{metric.status && <em>{metric.status}</em>}</article>)}</section><section className="analytics-primary-grid"><article className="analytics-panel analytics-performance"><header><div><h2>Performance over time</h2><p>Daily profile views and outbound clicks from recorded Linkary events.</p></div><span>{rangeLabels[range]} · {interval}</span></header>{!loading && analytics?.filteredSeries ? <SoftLineChart data={analytics.filteredSeries.series} interval={interval} /> : <div className="analytics-chart-skeleton" />}</article></section><section className="analytics-lower-grid analytics-overview-details">{contentLinks}<SocialSources sources={analytics?.socialSources} />{onchainActivity}{campaigns}</section></>}{tab === 'social' && (profile.profile_type === 'project'
          ? <ProjectSocialAnalytics profiles={analytics?.socialProfiles} sources={analytics?.socialSources} snapshots={analytics?.socialAudienceSnapshots} content={analytics?.socialContent} />
          : <SocialAnalytics profiles={analytics?.socialProfiles} sources={analytics?.socialSources} audience={analytics?.monthlySocialAudience} impressions={analytics?.monthlySocialImpressions} content={analytics?.socialContent} />)}{tab === 'campaigns' && <section className="analytics-lower-grid analytics-tab-grid">{contentLinks}{campaigns}</section>}{tab === 'onchain' && <section className="analytics-tab-grid"><div>{onchainActivity}</div>{profile.profile_type === 'project' && profile.organization_id ? <FounderGrowthIntelligencePanel organizationId={profile.organization_id} /> : <section className="analytics-empty"><strong>Onchain reporting is ready for Project workspaces</strong><span>Promotion auctions are visible above. Project campaign outcomes and verified onchain actions appear here when recorded.</span></section>}</section>}</>}</div></ProductWorkspace>;
}

