import { useEffect, useMemo, useState } from 'react';
import './founder-growth-intelligence.css';

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

export default function FounderGrowthIntelligencePanel({ organizationId }: { organizationId: string }) {
  const [data, setData] = useState<IntelligenceResponse | null>(null);
  const [tab, setTab] = useState<Tab>('campaigns');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  async function load() {
    if (!organizationId) return;
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch(`/api/growth-intelligence?organizationId=${encodeURIComponent(organizationId)}`, { credentials: 'same-origin' });
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

  useEffect(() => { void load(); }, [organizationId]);

  const strongestCampaign = useMemo(() => data?.campaigns.filter((item) => item.roas !== null).sort((a, b) => Number(b.roas || 0) - Number(a.roas || 0))[0] || null, [data]);
  const strongestPartner = useMemo(() => data?.partners.filter((item) => item.outcomes > 0 || item.attributed_value_usd > 0 || item.tracked_clicks > 0).sort((a, b) => b.attributed_value_usd - a.attributed_value_usd || b.outcomes - a.outcomes || b.tracked_clicks - a.tracked_clicks)[0] || null, [data]);
  const strongestChannel = useMemo(() => data?.channels.filter((item) => item.outcomes > 0 || item.tracked_clicks > 0).sort((a, b) => b.attributed_value_usd - a.attributed_value_usd || b.outcomes - a.outcomes || b.tracked_clicks - a.tracked_clicks)[0] || null, [data]);

  if (loading) return <section className="fgi-shell"><div className="fgi-loading">Building Growth Intelligence from recorded Linkary evidence...</div></section>;
  if (message) return <section className="fgi-shell"><div className="fgi-error"><strong>Growth Intelligence unavailable</strong><span>{message}</span><button type="button" onClick={() => void load()}>Retry</button></div></section>;
  if (!data) return null;

  const summary = data.summary;
  const rows: (CampaignPerformance | ActivityPerformance | GroupPerformance)[] = tab === 'campaigns' ? data.campaigns : tab === 'activities' ? data.activities : tab === 'partners' ? data.partners : data.channels;
  const fallbackLinks = data.partner_attribution.current_fallback;

  return <section className="fgi-shell" aria-label="Founder Growth Intelligence">
    <header className="fgi-header">
      <div><span className="fgi-kicker">FOUNDER GROWTH INTELLIGENCE</span><h2>See what actually produced results</h2><p>Compare social performance, Linkary first-party traffic, outcomes, actual spend and attributed value without treating manual evidence as verified.</p></div>
      <button type="button" onClick={() => void load()}>Refresh</button>
    </header>

    <div className="fgi-summary">
      <article><span>ACTUAL SPEND</span><strong>{money(summary.actual_spend_usd)}</strong><small>Recorded incurred cost</small></article>
      <article><span>REPORTED VIEWS</span><strong>{compact(summary.views)}</strong><small>{summary.deliverables} measured deliverables</small></article>
      <article><span>LINKARY CLICKS</span><strong>{compact(summary.tracked_clicks)}</strong><small>{summary.estimated_unique_clicks === null ? 'Unique not measured' : `${compact(summary.estimated_unique_clicks)} est. unique`}</small></article>
      <article><span>OUTCOMES</span><strong>{compact(summary.outcomes)}</strong><small>{percent(summary.conversion_rate)} click conversion</small></article>
      <article><span>ATTRIBUTED VALUE</span><strong>{money(summary.attributed_value_usd)}</strong><small>{multiple(summary.roas)} ROAS</small></article>
      <article><span>COST / OUTCOME</span><strong>{money(summary.cpa)}</strong><small>{money(summary.cpc)} per Linkary click</small></article>
    </div>

    <div className="fgi-signal-grid">
      <article><span>STRONGEST CAMPAIGN</span><strong>{strongestCampaign?.name || 'Not enough ROI evidence'}</strong><small>{strongestCampaign?.roas === null || !strongestCampaign ? 'Record actual spend and value to compare ROAS.' : `${multiple(strongestCampaign.roas)} return on recorded spend`}</small></article>
      <article><span>STRONGEST PARTNER</span><strong>{strongestPartner?.label || 'Not enough partner evidence'}</strong><small>{strongestPartner ? `${compact(strongestPartner.tracked_clicks)} clicks · ${compact(strongestPartner.outcomes)} outcomes · ${partnerCoverageLabel(strongestPartner.snapshot_coverage)}` : 'Create partner-bound tracking links to build comparable partner evidence.'}</small></article>
      <article><span>STRONGEST CHANNEL</span><strong>{strongestChannel ? human(strongestChannel.label) : 'Not enough channel evidence'}</strong><small>{strongestChannel ? `${compact(strongestChannel.tracked_clicks)} clicks · ${money(strongestChannel.attributed_value_usd)} value` : 'Channel intelligence builds from measured activities.'}</small></article>
    </div>

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
