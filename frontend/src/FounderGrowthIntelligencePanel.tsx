import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import './founder-growth-intelligence.css';

type TrendPoint = { day: string; clicks: number; outcomes: number; value: number; spend: number };

type Performance = {
  deliverables: number;
  views: number;
  engagements: number;
  reported_joins: number;
  actual_spend_usd: number | null;
  tracked_clicks: number;
  estimated_unique_clicks: number | null;
  outcomes: number;
  attributed_value_usd: number;
  engagement_rate: number | null;
  ctr: number | null;
  cpm: number | null;
  cpc: number | null;
  cpa: number | null;
  cost_per_reported_join: number | null;
  conversion_rate: number | null;
  roas: number | null;
  value_per_click: number | null;
};

type CampaignPerformance = Performance & {
  id: string;
  name: string;
  source_type: string;
  execution_mode: string;
  status: string;
  budget_usd: number | null;
  starts_at?: string | null;
};

type ActivityPerformance = Performance & {
  id: string;
  campaign_id: string;
  campaign_name: string;
  title: string;
  activity_type: string;
  channel: string;
  status: string;
  planned_cost_usd: number | null;
  partner_kind: string | null;
  partner_key: string | null;
  partner_display_name: string | null;
  partner_handle: string | null;
};

type SnapshotCoverage = {
  link_creation: number;
  legacy_backfill: number;
  current_fallback: number;
};

type GroupPerformance = Performance & {
  key: string;
  label: string;
  kind: string | null;
  handle: string | null;
  activities: number;
  tracking_links?: number;
  spend_scope: 'activity_attached' | 'not_allocated';
  attribution_scope?: 'tracking_link_partner_provenance' | 'activity_channel';
  snapshot_coverage?: SnapshotCoverage;
};

type PartnerAttributionCoverage = SnapshotCoverage & {
  tracking_links: number;
  assigned_links: number;
  unassigned_links: number;
};

type IntelligenceResponse = {
  summary: Performance & {
    campaigns: number;
    activities: number;
    evidence_mix: { manual: number; tracked: number; verified: number; estimated: number };
  };
  campaigns: CampaignPerformance[];
  activities: ActivityPerformance[];
  partners: GroupPerformance[];
  partner_attribution: PartnerAttributionCoverage;
  channels: GroupPerformance[];
  methodology: {
    manual_social_metrics: string;
    unique_clicks: string;
    partner_channel_spend: string;
    partner_attribution: string;
    missing_metrics: string;
  };
  trend: TrendPoint[];
  trend_range_days: number;
};

type Tab = 'campaigns' | 'activities' | 'partners' | 'channels';

function number(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(Number(value || 0));
}

function compact(value: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value || 0));
}

function money(value: number | null): string {
  if (value === null || value === undefined) return 'N/A';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
}

function percent(value: number | null): string {
  return value === null ? 'N/A' : `${(value * 100).toFixed(value * 100 >= 10 ? 1 : 2)}%`;
}

function multiple(value: number | null): string {
  return value === null ? 'N/A' : `${value.toFixed(2)}x`;
}

function change(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? null : 0;
  return (current - previous) / previous;
}

function Delta({ value, label = 'vs prior half' }: { value: number | null; label?: string }) {
  if (value === null) return <small className="fgi-delta neutral">New signal · {label}</small>;
  const direction = value > 0 ? 'up' : value < 0 ? 'down' : 'neutral';
  return <small className={`fgi-delta ${direction}`}>{value > 0 ? '↗' : value < 0 ? '↘' : '→'} {Math.abs(value * 100).toFixed(1)}% · {label}</small>;
}

function human(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function partnerCoverageLabel(coverage?: SnapshotCoverage): string {
  if (!coverage) return 'Tracking-link attribution';
  if (coverage.current_fallback > 0) return `${coverage.current_fallback} link${coverage.current_fallback === 1 ? '' : 's'} use current-assignment fallback`;
  if (coverage.legacy_backfill > 0) return `${coverage.link_creation} creation snapshot${coverage.link_creation === 1 ? '' : 's'} · ${coverage.legacy_backfill} legacy backfill${coverage.legacy_backfill === 1 ? '' : 's'}`;
  return `${coverage.link_creation} creation snapshot${coverage.link_creation === 1 ? '' : 's'}`;
}

function MetricStrip({ value }: { value: Performance }) {
  return <div className="fgi-row-metrics">
    <span><small>SPEND</small><strong>{money(value.actual_spend_usd)}</strong></span>
    <span><small>VIEWS</small><strong>{compact(value.views)}</strong></span>
    <span><small>CLICKS</small><strong>{compact(value.tracked_clicks)}</strong></span>
    <span><small>OUTCOMES</small><strong>{number(value.outcomes)}</strong></span>
    <span><small>CTR</small><strong>{percent(value.ctr)}</strong></span>
    <span><small>CPC</small><strong>{money(value.cpc)}</strong></span>
    <span><small>CPA</small><strong>{money(value.cpa)}</strong></span>
    <span><small>ROAS</small><strong>{multiple(value.roas)}</strong></span>
  </div>;
}

function PartnerMetricStrip({ value }: { value: GroupPerformance }) {
  return <div className="fgi-row-metrics">
    <span><small>TRACKING LINKS</small><strong>{number(value.tracking_links || 0)}</strong></span>
    <span><small>ACTIVITIES</small><strong>{number(value.activities)}</strong></span>
    <span><small>CLICKS</small><strong>{compact(value.tracked_clicks)}</strong></span>
    <span><small>OUTCOMES</small><strong>{number(value.outcomes)}</strong></span>
    <span><small>CONVERSION</small><strong>{percent(value.conversion_rate)}</strong></span>
    <span><small>ATTRIBUTED VALUE</small><strong>{money(value.attributed_value_usd)}</strong></span>
    <span><small>VALUE / CLICK</small><strong>{money(value.value_per_click)}</strong></span>
  </div>;
}

function TrendChart({ points, campaigns }: { points: TrendPoint[]; campaigns: CampaignPerformance[] }) {
  const [activeIndex, setActiveIndex] = useState(Math.max(0, points.length - 1));
  useEffect(() => { setActiveIndex(Math.max(0, points.length - 1)); }, [points]);
  const max = Math.max(1, ...points.flatMap((point) => [point.clicks, point.outcomes]));
  const x = (index: number) => (index / Math.max(1, points.length - 1)) * 100;
  const y = (value: number) => 100 - (value / max) * 92;
  const path = (key: 'clicks' | 'outcomes') => points.map((point, index) => `${index ? 'L' : 'M'} ${(index / Math.max(1, points.length - 1)) * 100} ${100 - (point[key] / max) * 92}`).join(' ');
  const startMarkers = campaigns.flatMap((campaign) => { const index = campaign.starts_at ? points.findIndex((point) => point.day === campaign.starts_at?.slice(0, 10)) : -1; return index < 0 ? [] : [{ name: campaign.name, x: (index / Math.max(1, points.length - 1)) * 100 }]; });
  const clickPath = path('clicks');
  const activePoint = points[activeIndex];
  const activeX = x(activeIndex);
  return <article className="fgi-chart trend-chart"><header><div><span>TRACTION TIMELINE</span><strong>Daily momentum and campaign starts</strong></div><small>Hover, focus or tap a day</small></header><div className="fgi-trend-stage"><svg viewBox="0 0 100 100" role="img" aria-label="Interactive daily Linkary clicks and outcomes trend" preserveAspectRatio="none"><path className="grid" d="M0 8H100M0 50H100M0 92H100"/><path className="click-area" d={`${clickPath} L100 100 L0 100 Z`} /><path className="click-line" d={clickPath} /><path className="outcome-line" d={path('outcomes')} />{startMarkers.map((marker) => <line key={`${marker.name}:${marker.x}`} className="campaign-marker" x1={marker.x} x2={marker.x} y1="4" y2="96"><title>{marker.name} started</title></line>)}{activePoint && <g className="trend-active" aria-hidden="true"><line x1={activeX} x2={activeX} y1="4" y2="96"/><circle className="click-point" cx={activeX} cy={y(activePoint.clicks)} r="2.2"/><circle className="outcome-point" cx={activeX} cy={y(activePoint.outcomes)} r="2.2"/></g>}{points.map((point, index) => <circle key={point.day} className="trend-hit" cx={x(index)} cy={y(point.clicks)} r="4" tabIndex={0} role="button" aria-label={`${point.day}: ${number(point.clicks)} clicks, ${number(point.outcomes)} outcomes, ${money(point.value)} attributed value, ${money(point.spend)} recorded spend`} onPointerEnter={() => setActiveIndex(index)} onPointerDown={() => setActiveIndex(index)} onFocus={() => setActiveIndex(index)} />)}</svg>{activePoint && <div className="fgi-chart-tooltip" style={{ left: `${Math.min(92, Math.max(8, activeX))}%` }} role="status"><strong>{activePoint.day}</strong><span><b>{number(activePoint.clicks)}</b> clicks</span><span><b>{number(activePoint.outcomes)}</b> outcomes</span><span><b>{money(activePoint.value)}</b> value</span><span><b>{money(activePoint.spend)}</b> spend</span></div>}</div><div className="fgi-chart-key"><span><i className="click"/>Clicks</span><span><i className="outcome"/>Outcomes</span>{startMarkers.length > 0 && <span><i className="start"/>Campaign start</span>}<small>{points[0]?.day} — {points.at(-1)?.day}</small></div></article>;
}

function MomentumChart({ points }: { points: TrendPoint[] }) {
  const recent = points.slice(-14);
  const [activeDay, setActiveDay] = useState(recent.at(-1)?.day || '');
  useEffect(() => { setActiveDay(recent.at(-1)?.day || ''); }, [points]);
  const max = Math.max(1, ...recent.map((point) => point.clicks));
  const peak = recent.reduce((best, point) => point.clicks > best.clicks ? point : best, recent[0] || { day: '', clicks: 0, outcomes: 0, value: 0, spend: 0 });
  const active = recent.find((point) => point.day === activeDay) || peak;
  return <article className="fgi-chart momentum-chart"><header><div><span>DAILY MOMENTUM</span><strong>Last 14 days</strong></div><small>{active?.day ? `${active.day.slice(5)} · ${number(active.clicks)} clicks · ${number(active.outcomes)} outcomes` : 'No activity yet'}</small></header><div className="fgi-momentum-bars" role="group" aria-label="Interactive daily click volume for the last fourteen days">{recent.map((point) => <button type="button" key={point.day} className={`${point.day === peak.day ? 'peak ' : ''}${point.day === active?.day ? 'active' : ''}`} style={{ height: `${Math.max(7, (point.clicks / max) * 100)}%` }} aria-label={`${point.day}: ${number(point.clicks)} clicks and ${number(point.outcomes)} outcomes`} onPointerEnter={() => setActiveDay(point.day)} onPointerDown={() => setActiveDay(point.day)} onFocus={() => setActiveDay(point.day)}><span>{point.clicks}</span></button>)}</div><div className="fgi-momentum-axis"><span>{recent[0]?.day.slice(5)}</span><span>{recent.at(-1)?.day.slice(5)}</span></div></article>;
}

function FunnelChart({ value }: { value: Performance }) {
  const rows = [['Reported views', value.views, 'manual'], ['Linkary clicks', value.tracked_clicks, 'tracked'], ['Outcomes', value.outcomes, 'outcomes']] as const;
  const max = Math.max(1, ...rows.map((row) => row[1]));
  return <article className="fgi-chart funnel-chart"><header><div><span>GROWTH FUNNEL</span><strong>From reach to outcomes</strong></div><small>Not a verification ladder</small></header>{rows.map(([label, amount, tone]) => <div className={`fgi-funnel-row ${tone}`} key={label}><div><span>{label}</span><strong>{compact(amount)}</strong></div><i style={{ width: `${Math.max(5, (amount / max) * 100)}%` }} /></div>)}</article>;
}

function ChannelChart({ channels }: { channels: GroupPerformance[] }) {
  const max = Math.max(1, ...channels.map((channel) => channel.tracked_clicks));
  return <article className="fgi-chart channel-chart"><header><div><span>CHANNEL COMPARISON</span><strong>Where clicks came from</strong></div><small>Focus or hover for outcomes and value</small></header>{channels.slice(0, 6).map((channel) => <div className="fgi-channel-row" key={channel.key} tabIndex={0} aria-label={`${human(channel.label)}: ${number(channel.tracked_clicks)} clicks, ${number(channel.outcomes)} outcomes, ${money(channel.attributed_value_usd)} attributed value`}><span>{human(channel.label)}</span><i><b style={{ width: `${(channel.tracked_clicks / max) * 100}%` }} /></i><strong>{compact(channel.tracked_clicks)}</strong><small>{number(channel.outcomes)} outcomes · {money(channel.attributed_value_usd)}</small></div>)}</article>;
}

function EvidenceChart({ mix }: { mix: IntelligenceResponse['summary']['evidence_mix'] }) {
  const entries = [['Manual', mix.manual, '#cbb98c'], ['Tracked', mix.tracked, '#f2613f'], ['Verified', mix.verified, '#27363a'], ['Estimated', mix.estimated, '#91989a']] as const;
  const total = Math.max(1, ...entries.map((entry) => entry[1]), entries.reduce((sum, entry) => sum + entry[1], 0));
  let cursor = 0;
  const stops = entries.map(([, amount, color]) => {
    const next = cursor + (amount / total) * 100;
    const stop = `${color} ${cursor}% ${next}%`;
    cursor = next;
    return stop;
  });
  const style = { background: `conic-gradient(${stops.join(', ')})` } as CSSProperties;
  return <article className="fgi-chart evidence-chart"><header><div><span>DATA CONFIDENCE</span><strong>Evidence composition</strong></div><small>Trust guardrail · not a growth KPI</small></header><div className="fgi-evidence-chart-body"><div className="fgi-donut" style={style} role="img" aria-label={`Evidence composition: ${entries.map(([label, amount]) => `${label} ${amount}`).join(', ')}`}><b>{number(entries.reduce((sum, entry) => sum + entry[1], 0))}</b><small>signals</small></div><div className="fgi-donut-key">{entries.map(([label, amount, color]) => <span key={label} tabIndex={0} aria-label={`${label}: ${number(amount)} signals, ${((amount / total) * 100).toFixed(1)} percent`}><i style={{ background: color }} />{label}<b>{number(amount)} · {((amount / total) * 100).toFixed(0)}%</b></span>)}</div></div></article>;
}

export default function FounderGrowthIntelligencePanel({ organizationId, variant = 'detail' }: { organizationId: string; variant?: 'overview' | 'detail' }) {
  const [data, setData] = useState<IntelligenceResponse | null>(null);
  const [tab, setTab] = useState<Tab>('campaigns');
  const [range, setRange] = useState<7 | 30 | 90>(30);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  async function load() {
    if (!organizationId) return;
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch(`/api/growth-intelligence?organizationId=${encodeURIComponent(organizationId)}&range=${range}`, { credentials: 'same-origin' });
      const payload = (await response.json().catch(() => ({}))) as IntelligenceResponse & { message?: string };
      if (!response.ok) throw new Error(payload.message || 'Growth Intelligence could not be loaded.');
      setData(payload);
    } catch (error) {
      setData(null);
      setMessage(error instanceof Error ? error.message : 'Growth Intelligence could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [organizationId, range]);

  const strongestCampaign = useMemo(() => data?.campaigns.filter((item) => item.roas !== null).sort((a, b) => Number(b.roas || 0) - Number(a.roas || 0))[0] || null, [data]);
  const strongestPartner = useMemo(() => data?.partners.filter((item) => item.outcomes > 0 || item.attributed_value_usd > 0 || item.tracked_clicks > 0).sort((a, b) => b.attributed_value_usd - a.attributed_value_usd || b.outcomes - a.outcomes || b.tracked_clicks - a.tracked_clicks)[0] || null, [data]);
  const strongestChannel = useMemo(() => data?.channels.filter((item) => item.outcomes > 0 || item.tracked_clicks > 0).sort((a, b) => b.attributed_value_usd - a.attributed_value_usd || b.outcomes - a.outcomes || b.tracked_clicks - a.tracked_clicks)[0] || null, [data]);

  if (loading) return <section className="fgi-shell"><div className="fgi-loading">Building Growth Intelligence from recorded Linkary evidence...</div></section>;
  if (message) return <section className="fgi-shell"><div className="fgi-error"><strong>Growth Intelligence unavailable</strong><span>{message}</span><button type="button" onClick={() => void load()}>Retry</button></div></section>;
  if (!data) return null;

  const summary = data.summary;
  const rows: (CampaignPerformance | ActivityPerformance | GroupPerformance)[] = tab === 'campaigns' ? data.campaigns : tab === 'activities' ? data.activities : tab === 'partners' ? data.partners : data.channels;
  const fallbackLinks = data.partner_attribution.current_fallback;
  const midpoint = Math.floor(data.trend.length / 2);
  const earlier = data.trend.slice(0, midpoint).reduce((total, point) => ({ clicks: total.clicks + point.clicks, outcomes: total.outcomes + point.outcomes, value: total.value + point.value }), { clicks: 0, outcomes: 0, value: 0 });
  const recent = data.trend.slice(midpoint).reduce((total, point) => ({ clicks: total.clicks + point.clicks, outcomes: total.outcomes + point.outcomes, value: total.value + point.value }), { clicks: 0, outcomes: 0, value: 0 });

  if (variant === 'overview') return <section className="fgi-shell fgi-overview" aria-label="Project growth overview">
    <header className="fgi-header">
      <div><span className="fgi-kicker">PROJECT HEALTH</span><h2>Growth snapshot</h2><p>Thirty-day movement from recorded Linkary evidence. Open Growth for campaign, partner, channel and methodology detail.</p></div>
      <div className="fgi-actions"><div className="fgi-range" aria-label="Overview trend range">{([7, 30, 90] as const).map((days) => <button type="button" key={days} className={range === days ? 'active' : ''} onClick={() => setRange(days)}>{days}d</button>)}</div><a href="/campaigns">Open Growth →</a></div>
    </header>
    <div className="fgi-summary fgi-overview-summary">
      <article><span>LINKARY CLICKS</span><strong>{compact(summary.tracked_clicks)}</strong><Delta value={change(recent.clicks, earlier.clicks)} /></article>
      <article><span>OUTCOMES</span><strong>{compact(summary.outcomes)}</strong><Delta value={change(recent.outcomes, earlier.outcomes)} /></article>
      <article><span>ATTRIBUTED VALUE</span><strong>{money(summary.attributed_value_usd)}</strong><Delta value={change(recent.value, earlier.value)} /></article>
      <article><span>ACTUAL SPEND</span><strong>{money(summary.actual_spend_usd)}</strong><small>{summary.roas === null ? 'Record spend and value for return' : `${multiple(summary.roas)} return on recorded spend`}</small></article>
    </div>
    <div className="fgi-overview-grid"><TrendChart points={data.trend} campaigns={data.campaigns} /><aside className="fgi-overview-drivers"><span>TOP DRIVERS</span><div><small>CAMPAIGN</small><strong>{strongestCampaign?.name || 'Not enough ROI evidence'}</strong></div><div><small>CHANNEL</small><strong>{strongestChannel ? human(strongestChannel.label) : 'Not enough channel evidence'}</strong></div><div><small>PARTNER</small><strong>{strongestPartner?.label || 'Not enough partner evidence'}</strong></div></aside></div>
    <div className="fgi-baseline-note"><div><span>BASELINE → CURRENT</span><strong>Project popularity baseline is not recorded yet</strong></div><p>Campaign lift requires dated observations for followers, community members, website users, waitlist or sign-ups. Growth currently reports measured movement without inventing overall Project lift.</p></div>
  </section>;

  return <section className="fgi-shell" aria-label="Founder Growth Intelligence">
    <header className="fgi-header">
      <div><span className="fgi-kicker">FOUNDER GROWTH INTELLIGENCE</span><h2>See what actually produced results</h2><p>Compare social performance, Linkary first-party traffic, outcomes, actual spend and attributed value without treating manual evidence as verified.</p></div>
      <div className="fgi-actions"><div className="fgi-range" aria-label="Trend range">{([7, 30, 90] as const).map((days) => <button type="button" key={days} className={range === days ? 'active' : ''} onClick={() => setRange(days)}>{days}d</button>)}</div><button type="button" onClick={() => void load()}>Refresh</button></div>
    </header>

    <div className="fgi-summary">
      <article><span>ACTUAL SPEND</span><strong>{money(summary.actual_spend_usd)}</strong><small>Recorded incurred cost</small></article>
      <article><span>REPORTED VIEWS</span><strong>{compact(summary.views)}</strong><small>{summary.deliverables} measured deliverables</small></article>
      <article><span>LINKARY CLICKS</span><strong>{compact(summary.tracked_clicks)}</strong><Delta value={change(recent.clicks, earlier.clicks)} /></article>
      <article><span>OUTCOMES</span><strong>{compact(summary.outcomes)}</strong><Delta value={change(recent.outcomes, earlier.outcomes)} /></article>
      <article><span>ATTRIBUTED VALUE</span><strong>{money(summary.attributed_value_usd)}</strong><Delta value={change(recent.value, earlier.value)} /></article>
      <article><span>COST / OUTCOME</span><strong>{money(summary.cpa)}</strong><small>{money(summary.cpc)} per Linkary click</small></article>
    </div>

    <div className="fgi-signal-grid">
      <article><span>STRONGEST CAMPAIGN</span><strong>{strongestCampaign?.name || 'Not enough ROI evidence'}</strong><small>{strongestCampaign?.roas === null || !strongestCampaign ? 'Record actual spend and value to compare ROAS.' : `${multiple(strongestCampaign.roas)} return on recorded spend`}</small></article>
      <article><span>STRONGEST PARTNER</span><strong>{strongestPartner?.label || 'Not enough partner evidence'}</strong><small>{strongestPartner ? `${compact(strongestPartner.tracked_clicks)} clicks · ${compact(strongestPartner.outcomes)} outcomes · ${partnerCoverageLabel(strongestPartner.snapshot_coverage)}` : 'Create partner-bound tracking links to build comparable partner evidence.'}</small></article>
      <article><span>STRONGEST CHANNEL</span><strong>{strongestChannel ? human(strongestChannel.label) : 'Not enough channel evidence'}</strong><small>{strongestChannel ? `${compact(strongestChannel.tracked_clicks)} clicks · ${money(strongestChannel.attributed_value_usd)} value` : 'Channel intelligence builds from measured activities.'}</small></article>
    </div>

    <div className="fgi-chart-grid"><TrendChart points={data.trend} campaigns={data.campaigns} /><MomentumChart points={data.trend} /><FunnelChart value={summary} /><EvidenceChart mix={summary.evidence_mix} /><ChannelChart channels={data.channels} /></div>

    <div className="fgi-baseline-note"><div><span>TRACTION BASELINE</span><strong>Project popularity baseline is not recorded yet</strong></div><p>Campaign lift needs a dated starting observation such as followers, community members, website users, waitlist or sign-ups. Until that ledger is available, Linkary shows measured campaign movement without claiming overall Project growth or causality.</p></div>

    <div className="fgi-evidence">
      <div><strong>Evidence mix</strong><span>Manual {summary.evidence_mix.manual}</span><span>Tracked {summary.evidence_mix.tracked}</span><span>Verified {summary.evidence_mix.verified}</span><span>Estimated {summary.evidence_mix.estimated}</span></div>
      <p>Reported views and engagement can be manual. Linkary clicks are first-party. Provider and Telegram verified evidence stays separately labeled.</p>
      <p>Partner comparison uses tracking-link provenance. {data.partner_attribution.link_creation} link{data.partner_attribution.link_creation === 1 ? '' : 's'} have creation-time snapshots, {data.partner_attribution.legacy_backfill} are legacy backfills{fallbackLinks > 0 ? `, and ${fallbackLinks} still use current-assignment fallback until the protected database migration is applied` : ''}.</p>
    </div>

    <nav className="fgi-tabs" aria-label="Growth Intelligence comparison">
      {(['campaigns', 'activities', 'partners', 'channels'] as Tab[]).map((value) => <button type="button" key={value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{human(value)}</button>)}
    </nav>

    {!rows.length ? <div className="fgi-empty">No {tab} have enough recorded evidence yet.</div> : <div className="fgi-list">
      {rows.map((row) => {
        const campaign = 'name' in row ? row as CampaignPerformance : null;
        const activity = 'title' in row ? row as ActivityPerformance : null;
        const group = 'label' in row ? row as GroupPerformance : null;
        const partnerGroup = tab === 'partners' && group ? group : null;
        const key = campaign?.id || activity?.id || group?.key || Math.random().toString();
        const title = campaign?.name || activity?.title || group?.label || 'Growth record';
        const meta = campaign ? `${human(campaign.source_type)} · ${human(campaign.status)} · Budget ${campaign.budget_usd === null ? 'not set' : money(campaign.budget_usd)}` : activity ? `${activity.campaign_name} · ${human(activity.channel)} · ${activity.partner_display_name || 'Unassigned'}` : partnerGroup ? `${partnerGroup.tracking_links || 0} tracking link${partnerGroup.tracking_links === 1 ? '' : 's'} · ${partnerGroup.activities} activit${partnerGroup.activities === 1 ? 'y' : 'ies'}${partnerGroup.handle ? ` · @${partnerGroup.handle.replace(/^@/, '')}` : ''}` : group ? `${group.activities} activit${group.activities === 1 ? 'y' : 'ies'}${group.handle ? ` · @${group.handle.replace(/^@/, '')}` : ''}` : '';
        return <article className="fgi-row" key={key}><div className="fgi-row-head"><div><strong>{title}</strong><span>{meta}</span></div>{partnerGroup ? <small>{partnerCoverageLabel(partnerGroup.snapshot_coverage)} · Spend/social metrics not reassigned</small> : group ? <small>Spend: activity-attached only</small> : null}</div>{partnerGroup ? <PartnerMetricStrip value={partnerGroup} /> : <MetricStrip value={row as Performance} />}</article>;
      })}
    </div>}

    <details className="fgi-methodology"><summary>How these metrics are calculated</summary><p>{data.methodology.manual_social_metrics}</p><p>{data.methodology.unique_clicks}</p><p>{data.methodology.partner_channel_spend}</p><p>{data.methodology.partner_attribution}</p><p>{data.methodology.missing_metrics}</p></details>
  </section>;
}
