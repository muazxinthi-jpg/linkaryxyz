import { useEffect, useMemo, useState } from 'react';
import './activity-measurement.css';

type Deliverable = {
  id: string;
  activity_id: string;
  platform: 'x' | 'telegram' | 'youtube' | 'article' | 'website' | 'other';
  content_url: string;
  published_at: string | null;
  evidence_state: 'submitted' | 'accepted' | 'rejected';
  created_at: string;
};

type Metric = {
  id: string;
  activity_id: string;
  deliverable_id: string;
  metric_key: string;
  metric_value: number;
  provenance: 'creator_manual' | 'partner_manual' | 'founder_manual' | 'linkary_first_party' | 'telegram_verified' | 'provider_verified' | 'estimated';
  observed_at: string | null;
  updated_at: string;
};

type FirstParty = {
  clicks: number;
  identifiedClicks: number;
  estimatedUniqueClicks: number | null;
  repeatClicks: number | null;
  outcomes: number;
  attributedValueUsd: number;
};

type MeasurementResponse = {
  deliverables: Deliverable[];
  metrics: Metric[];
  firstParty: FirstParty | null;
};

type ApiPayload = { error?: string; message?: string };

type Field = { key: string; label: string };

const PROVENANCE_PRIORITY: Metric['provenance'][] = [
  'provider_verified',
  'telegram_verified',
  'linkary_first_party',
  'founder_manual',
  'partner_manual',
  'creator_manual',
  'estimated',
];

const FIELDS: Record<Deliverable['platform'], Field[]> = {
  x: [
    { key: 'views', label: 'Views / impressions' },
    { key: 'likes', label: 'Likes' },
    { key: 'comments', label: 'Replies / comments' },
    { key: 'reposts', label: 'Reposts' },
    { key: 'quotes', label: 'Quotes' },
    { key: 'bookmarks', label: 'Bookmarks' },
  ],
  telegram: [
    { key: 'views', label: 'Views' },
    { key: 'reactions', label: 'Reactions' },
    { key: 'forwards', label: 'Forwards' },
    { key: 'reported_joins', label: 'Reported joins' },
  ],
  youtube: [
    { key: 'views', label: 'Views' },
    { key: 'likes', label: 'Likes' },
    { key: 'comments', label: 'Comments' },
  ],
  article: [
    { key: 'pageviews', label: 'Pageviews' },
    { key: 'publisher_clicks', label: 'Publisher-reported clicks' },
  ],
  website: [
    { key: 'pageviews', label: 'Pageviews' },
    { key: 'publisher_clicks', label: 'Publisher-reported clicks' },
  ],
  other: [
    { key: 'views', label: 'Views / reach' },
    { key: 'engagements', label: 'Engagements' },
  ],
};

function csrf(): string | null {
  const hit = document.cookie.split('; ').find((part) => part.startsWith('__Host-linkary_csrf='));
  return hit ? decodeURIComponent(hit.split('=').slice(1).join('=')) : null;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  const payload = (await response.json().catch(() => ({}))) as T & ApiPayload;
  if (!response.ok) throw new Error(payload.message || 'Performance evidence could not be updated.');
  return payload;
}

function human(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function number(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value);
}

function money(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
}

function date(value: string | null): string {
  if (!value) return 'Date not supplied';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Date not supplied';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
}

function preferredMetric(metrics: Metric[], deliverableId: string, key: string): Metric | null {
  const candidates = metrics.filter((metric) => metric.deliverable_id === deliverableId && metric.metric_key === key);
  return candidates.sort((a, b) => PROVENANCE_PRIORITY.indexOf(a.provenance) - PROVENANCE_PRIORITY.indexOf(b.provenance))[0] || null;
}

function metricValue(metrics: Metric[], deliverableId: string, keys: string[]): number {
  for (const key of keys) {
    const metric = preferredMetric(metrics, deliverableId, key);
    if (metric) return Number(metric.metric_value || 0);
  }
  return 0;
}

export default function ActivityMeasurementPanel({ activityId, writable }: { activityId: string; writable: boolean }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState('');
  const [message, setMessage] = useState('');
  const [data, setData] = useState<MeasurementResponse>({ deliverables: [], metrics: [], firstParty: null });
  const [platform, setPlatform] = useState<Deliverable['platform']>('x');
  const [contentUrl, setContentUrl] = useState('');
  const [publishedAt, setPublishedAt] = useState('');
  const [metricDrafts, setMetricDrafts] = useState<Record<string, Record<string, string>>>({});

  async function load() {
    setLoading(true);
    setMessage('');
    try {
      const result = await api<MeasurementResponse>(`/api/tracked-links?measurement=1&activityId=${encodeURIComponent(activityId)}`);
      setData(result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Performance evidence could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) void load();
  }, [open, activityId]);

  const rollup = useMemo(() => {
    let views = 0;
    let engagements = 0;
    let reportedJoins = 0;
    for (const deliverable of data.deliverables) {
      views += metricValue(data.metrics, deliverable.id, ['impressions', 'views', 'pageviews']);
      engagements += metricValue(data.metrics, deliverable.id, ['engagements']);
      engagements += metricValue(data.metrics, deliverable.id, ['likes']);
      engagements += metricValue(data.metrics, deliverable.id, ['comments']);
      engagements += metricValue(data.metrics, deliverable.id, ['reposts']);
      engagements += metricValue(data.metrics, deliverable.id, ['quotes']);
      engagements += metricValue(data.metrics, deliverable.id, ['bookmarks']);
      engagements += metricValue(data.metrics, deliverable.id, ['reactions']);
      engagements += metricValue(data.metrics, deliverable.id, ['forwards']);
      reportedJoins += metricValue(data.metrics, deliverable.id, ['reported_joins']);
    }
    const clicks = Number(data.firstParty?.clicks || 0);
    return {
      views,
      engagements,
      reportedJoins,
      ctr: views > 0 ? clicks / views : null,
      engagementRate: views > 0 ? engagements / views : null,
    };
  }, [data]);

  async function addDeliverable(event: React.FormEvent) {
    event.preventDefault();
    const token = csrf();
    if (!token || !contentUrl.trim()) return;
    setSaving('deliverable');
    setMessage('');
    try {
      await api('/api/tracked-links?operation=deliverable', {
        method: 'POST',
        headers: { 'x-csrf-token': token },
        body: JSON.stringify({ activityId, platform, contentUrl: contentUrl.trim(), publishedAt: publishedAt || null }),
      });
      setContentUrl('');
      setPublishedAt('');
      setMessage('Published work added as submitted evidence. This does not make its performance provider-verified.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Published work could not be added.');
    } finally {
      setSaving('');
    }
  }

  async function review(deliverableId: string, evidenceState: 'accepted' | 'rejected') {
    const token = csrf();
    if (!token) return;
    setSaving(`review:${deliverableId}`);
    try {
      await api(`/api/tracked-links?operation=review-deliverable&deliverableId=${encodeURIComponent(deliverableId)}`, {
        method: 'POST',
        headers: { 'x-csrf-token': token },
        body: JSON.stringify({ evidenceState }),
      });
      setMessage(evidenceState === 'accepted' ? 'Project accepted that this deliverable was supplied. Performance confidence is unchanged.' : 'Deliverable marked not accepted by the Project.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Deliverable review could not be saved.');
    } finally {
      setSaving('');
    }
  }

  async function saveMetrics(deliverable: Deliverable) {
    const token = csrf();
    if (!token) return;
    const draft = metricDrafts[deliverable.id] || {};
    const metrics = Object.fromEntries(Object.entries(draft)
      .filter(([, value]) => value !== '')
      .map(([key, value]) => [key, Number(value)]));
    if (!Object.keys(metrics).length) {
      setMessage('Enter at least one performance metric first.');
      return;
    }
    setSaving(`metrics:${deliverable.id}`);
    setMessage('');
    try {
      const result = await api<{ provenance: string }>(`/api/tracked-links?operation=metrics&deliverableId=${encodeURIComponent(deliverable.id)}`, {
        method: 'POST',
        headers: { 'x-csrf-token': token },
        body: JSON.stringify({ metrics, observedAt: new Date().toISOString() }),
      });
      setMetricDrafts((current) => ({ ...current, [deliverable.id]: {} }));
      setMessage(`Performance saved as ${human(result.provenance)} evidence.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Performance metrics could not be saved.');
    } finally {
      setSaving('');
    }
  }

  return <div className="activity-measurement-control">
    <button type="button" className="activity-measurement-open" onClick={() => setOpen(true)}>Performance evidence</button>
    {open && <div className="activity-measurement-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false); }}>
      <section className="activity-measurement-modal" role="dialog" aria-modal="true" aria-label="Activity performance evidence">
        <header>
          <div><span>MEASUREMENT</span><h2>Performance evidence</h2><p>Compare reported social performance with Linkary first-party traffic and outcomes.</p></div>
          <button type="button" className="activity-measurement-close" onClick={() => setOpen(false)} aria-label="Close">×</button>
        </header>

        {loading ? <div className="activity-measurement-loading">Loading evidence...</div> : <>
          <div className="activity-measurement-summary">
            <article><span>REPORTED VIEWS</span><strong>{number(rollup.views)}</strong><small>Manual/provider evidence</small></article>
            <article><span>LINKARY CLICKS</span><strong>{number(data.firstParty?.clicks || 0)}</strong><small>{data.firstParty?.estimatedUniqueClicks === null || data.firstParty?.estimatedUniqueClicks === undefined ? 'Unique not available' : `${number(data.firstParty.estimatedUniqueClicks)} estimated unique`}</small></article>
            <article><span>OUTCOMES</span><strong>{number(data.firstParty?.outcomes || 0)}</strong><small>Attributed activity outcomes</small></article>
            <article><span>VALUE</span><strong>{money(data.firstParty?.attributedValueUsd || 0)}</strong><small>Attributed value</small></article>
          </div>
          <div className="activity-measurement-rates">
            <span>CTR <strong>{rollup.ctr === null ? 'Not available' : `${(rollup.ctr * 100).toFixed(2)}%`}</strong></span>
            <span>Engagement rate <strong>{rollup.engagementRate === null ? 'Not available' : `${(rollup.engagementRate * 100).toFixed(2)}%`}</strong></span>
            {rollup.reportedJoins > 0 && <span>Reported joins <strong>{number(rollup.reportedJoins)}</strong></span>}
          </div>

          {writable && <form className="activity-measurement-add" onSubmit={addDeliverable}>
            <div><h3>Add published work</h3><p>Attach the exact post, message, video or article. Submission confirms the URL was supplied, not that its reported metrics are verified.</p></div>
            <div className="activity-measurement-fields">
              <label>Platform<select value={platform} onChange={(event) => setPlatform(event.target.value as Deliverable['platform'])}><option value="x">X</option><option value="telegram">Telegram</option><option value="youtube">YouTube</option><option value="article">Article / publication</option><option value="website">Website</option><option value="other">Other</option></select></label>
              <label>Published URL<input type="url" value={contentUrl} onChange={(event) => setContentUrl(event.target.value)} placeholder="https://..." required /></label>
              <label>Published date, optional<input type="datetime-local" value={publishedAt} onChange={(event) => setPublishedAt(event.target.value)} /></label>
            </div>
            <button type="submit" className="ops-button primary" disabled={saving === 'deliverable' || !contentUrl.trim()}>{saving === 'deliverable' ? 'Adding...' : 'Add published work'}</button>
          </form>}

          <div className="activity-measurement-list">
            {!data.deliverables.length ? <div className="activity-measurement-empty"><strong>No published work attached yet</strong><span>Add the exact content URL so Linkary can keep delivery evidence and performance together.</span></div> : data.deliverables.map((deliverable) => {
              const deliverableMetrics = data.metrics.filter((metric) => metric.deliverable_id === deliverable.id);
              const draft = metricDrafts[deliverable.id] || {};
              return <article key={deliverable.id} className="activity-measurement-deliverable">
                <div className="activity-measurement-deliverable-head">
                  <div><span className="activity-measurement-platform">{human(deliverable.platform)}</span><a href={deliverable.content_url} target="_blank" rel="noreferrer">{deliverable.content_url}</a><small>{date(deliverable.published_at)}</small></div>
                  <span className={`activity-measurement-state ${deliverable.evidence_state}`}>{deliverable.evidence_state === 'accepted' ? 'Accepted by Project' : deliverable.evidence_state === 'rejected' ? 'Not accepted' : 'Submitted'}</span>
                </div>

                {!!deliverableMetrics.length && <div className="activity-measurement-existing">{deliverableMetrics.map((metric) => <span key={metric.id}><strong>{human(metric.metric_key)}: {number(metric.metric_value)}</strong><small>{human(metric.provenance)}</small></span>)}</div>}

                {writable && <div className="activity-measurement-edit">
                  <div className="activity-measurement-metric-grid">{FIELDS[deliverable.platform].map((field) => <label key={field.key}>{field.label}<input type="number" min="0" step="1" value={draft[field.key] || ''} onChange={(event) => setMetricDrafts((current) => ({ ...current, [deliverable.id]: { ...(current[deliverable.id] || {}), [field.key]: event.target.value } }))} placeholder="0" /></label>)}</div>
                  <div className="activity-measurement-actions"><button type="button" className="ops-button small primary" onClick={() => void saveMetrics(deliverable)} disabled={saving === `metrics:${deliverable.id}`}>{saving === `metrics:${deliverable.id}` ? 'Saving...' : 'Save reported metrics'}</button>{deliverable.evidence_state === 'submitted' && <><button type="button" className="ops-button small" onClick={() => void review(deliverable.id, 'accepted')} disabled={saving === `review:${deliverable.id}`}>Accept deliverable</button><button type="button" className="ops-button small ghost" onClick={() => void review(deliverable.id, 'rejected')} disabled={saving === `review:${deliverable.id}`}>Reject</button></>}</div>
                  <small className="activity-measurement-note">Metrics entered here are manual evidence. Linkary-tracked clicks and outcomes remain separate first-party signals.</small>
                </div>}
              </article>;
            })}
          </div>
        </>}
        {message && <div className="activity-measurement-message" role="status">{message}</div>}
      </section>
    </div>}
  </div>;
}
