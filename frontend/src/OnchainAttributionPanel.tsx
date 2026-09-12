import { useEffect, useMemo, useState } from 'react';

export type AttributionChain = 'ethereum' | 'base' | 'bnb' | 'solana' | 'robinhood';
type ReviewStatus = 'pending' | 'confirmed' | 'ignored' | 'reorged';
type EvidenceFilter = ReviewStatus | 'all';

type ActivityOption = { id: string; title: string };
type LinkOption = { id: string; code: string; activity_id: string | null };
type WatchTarget = {
  id: string;
  campaign_id: string;
  activity_id: string | null;
  tracked_link_id: string | null;
  chain: AttributionChain;
  address: string;
  label: string | null;
  status: 'active' | 'disabled';
  provider_sync_status: 'pending_config' | 'syncing' | 'active' | 'error' | 'disabled';
  provider_sync_error: string | null;
  created_at: string;
};
type OnchainEvent = {
  id: string;
  activity_id: string | null;
  tracked_link_id: string | null;
  chain: AttributionChain;
  watched_address: string;
  watch_label: string | null;
  direction: 'inbound' | 'outbound' | 'self' | 'unknown';
  transaction_hash: string | null;
  block_number: string | null;
  block_hash: string | null;
  log_index: string | null;
  category: string | null;
  asset: string | null;
  value_text: string | null;
  from_address: string | null;
  to_address: string | null;
  review_status: ReviewStatus;
  linked_conversion_id: string | null;
  occurred_at: string;
};

export const ATTRIBUTION_CHAIN_OPTIONS: readonly { value: AttributionChain; label: string }[] = [
  { value: 'ethereum', label: 'Ethereum' },
  { value: 'base', label: 'Base' },
  { value: 'bnb', label: 'BNB Chain' },
  { value: 'solana', label: 'Solana' },
  { value: 'robinhood', label: 'Robinhood Chain' },
];

const EVIDENCE_FILTERS: readonly { value: EvidenceFilter; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'ignored', label: 'Ignored' },
  { value: 'reorged', label: 'Reorged' },
  { value: 'all', label: 'All' },
];

const OUTCOME_TYPES = [
  ['signup', 'Signup'], ['telegram_join', 'Telegram Join'], ['retained_user', 'Retained User'],
  ['wallet_connect', 'Wallet Connect'], ['lead', 'Lead'], ['purchase', 'Purchase'],
  ['deposit', 'Deposit'], ['subscription', 'Subscription'], ['token_purchase', 'Token Purchase'], ['custom', 'Custom'],
] as const;

class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (!response.ok) throw new ApiError(response.status, payload.error || 'request_failed', payload.message || 'Request failed');
  return payload;
}

function csrfToken() {
  const hit = document.cookie.split('; ').find((part) => part.startsWith('__Host-linkary_csrf='));
  return hit ? decodeURIComponent(hit.split('=').slice(1).join('=')) : null;
}

export function onchainErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  const messages: Record<string, string> = {
    alchemy_not_configured: 'Monitoring is not configured for this network yet.',
    alchemy_sync_failed: 'The wallet was saved, but Alchemy could not start monitoring it. Review the sync error and retry.',
    invalid_wallet_address: 'Enter a valid wallet address for the selected network.',
    unsupported_chain: 'Choose one of the five supported attribution networks.',
    invalid_activity_context: 'That activity does not belong to this campaign.',
    invalid_tracking_context: 'That tracking link does not belong to this campaign.',
    event_reorged: 'This evidence was reorged and can no longer be confirmed.',
    event_already_confirmed: 'This evidence is already confirmed and cannot be ignored.',
    forbidden: 'Your current Project role does not allow this action.',
  };
  return messages[error.code] || fallback;
}

function shortAddress(value: string | null) {
  if (!value) return 'Not available';
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

function displayDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Unknown time' : new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
}

function chainLabel(chain: AttributionChain) {
  return ATTRIBUTION_CHAIN_OPTIONS.find((option) => option.value === chain)?.label || chain;
}

function syncLabel(status: WatchTarget['provider_sync_status']) {
  return status === 'active' ? 'Monitoring' : status === 'pending_config' ? 'Configuration pending' : status === 'syncing' ? 'Syncing' : status === 'error' ? 'Sync error' : 'Disabled';
}

export default function OnchainAttributionPanel({
  campaignId,
  campaignName,
  writable,
  activities,
  links,
  onOutcomeConfirmed,
}: {
  campaignId: string;
  campaignName: string;
  writable: boolean;
  activities: ActivityOption[];
  links: LinkOption[];
  onOutcomeConfirmed: () => void | Promise<void>;
}) {
  const [targets, setTargets] = useState<WatchTarget[]>([]);
  const [events, setEvents] = useState<OnchainEvent[]>([]);
  const [filter, setFilter] = useState<EvidenceFilter>('pending');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reviewing, setReviewing] = useState<OnchainEvent | null>(null);
  const [form, setForm] = useState({ chain: 'base' as AttributionChain, address: '', label: '', activityId: '', trackedLinkId: '' });
  const [reviewForm, setReviewForm] = useState({ eventType: 'purchase', valueUsd: '' });

  const activitiesById = useMemo(() => new Map(activities.map((activity) => [activity.id, activity])), [activities]);
  const linksById = useMemo(() => new Map(links.map((link) => [link.id, link])), [links]);

  async function load() {
    setLoading(true);
    try {
      const eventQuery = new URLSearchParams({ campaignId });
      if (filter !== 'all') eventQuery.set('status', filter);
      const [targetResult, eventResult] = await Promise.all([
        api<{ watchTargets: WatchTarget[] }>(`/api/onchain/watch-targets?campaignId=${encodeURIComponent(campaignId)}`),
        api<{ events: OnchainEvent[] }>(`/api/onchain/events?${eventQuery.toString()}`),
      ]);
      setTargets(targetResult.watchTargets);
      setEvents(eventResult.events);
    } catch (error) {
      setMessage({ text: onchainErrorMessage(error, 'On-chain attribution is temporarily unavailable.'), error: true });
    } finally { setLoading(false); }
  }

  useEffect(() => { setMessage(null); void load(); }, [campaignId, filter]);

  async function saveTarget(event: React.FormEvent, retry?: WatchTarget) {
    event.preventDefault();
    const token = csrfToken();
    if (!token) return;
    setSubmitting(true);
    const payload = retry ? {
      campaignId, chain: retry.chain, address: retry.address, label: retry.label,
      activityId: retry.activity_id, trackedLinkId: retry.tracked_link_id,
    } : {
      campaignId, chain: form.chain, address: form.address.trim(), label: form.label.trim() || undefined,
      activityId: form.activityId || undefined, trackedLinkId: form.trackedLinkId || undefined,
    };
    try {
      await api('/api/onchain/watch-targets', { method: 'POST', headers: { 'x-csrf-token': token }, body: JSON.stringify(payload) });
      setMessage({ text: retry ? 'Wallet monitoring sync completed.' : 'Wallet added and monitoring sync requested.' });
      if (!retry) {
        setShowAdd(false);
        setForm({ chain: 'base', address: '', label: '', activityId: '', trackedLinkId: '' });
      }
      await load();
    } catch (error) {
      setMessage({ text: onchainErrorMessage(error, retry ? 'Monitoring sync could not be retried.' : 'The wallet could not be added.'), error: true });
      await load();
    } finally { setSubmitting(false); }
  }

  async function disableTarget(target: WatchTarget) {
    if (!window.confirm('Stop monitoring this wallet? Historical evidence will remain preserved.')) return;
    const token = csrfToken();
    if (!token) return;
    try {
      await api(`/api/onchain/watch-targets/${encodeURIComponent(target.id)}/disable`, { method: 'POST', headers: { 'x-csrf-token': token } });
      setMessage({ text: 'Wallet monitoring stopped. Historical evidence remains available.' });
      await load();
    } catch (error) {
      setMessage({ text: onchainErrorMessage(error, 'The wallet could not be disabled.'), error: true });
    }
  }

  async function ignoreEvent(item: OnchainEvent) {
    if (!window.confirm('Ignore this on-chain evidence? It will remain stored and auditable.')) return;
    const token = csrfToken();
    if (!token) return;
    try {
      await api(`/api/onchain/events/${encodeURIComponent(item.id)}/ignore`, { method: 'POST', headers: { 'x-csrf-token': token } });
      setMessage({ text: 'Evidence ignored and retained in the audit history.' });
      await load();
    } catch (error) {
      setMessage({ text: onchainErrorMessage(error, 'The evidence could not be ignored.'), error: true });
    }
  }

  async function confirmEvent(event: React.FormEvent) {
    event.preventDefault();
    if (!reviewing) return;
    const token = csrfToken();
    if (!token) return;
    setSubmitting(true);
    try {
      await api(`/api/onchain/events/${encodeURIComponent(reviewing.id)}/confirm`, {
        method: 'POST', headers: { 'x-csrf-token': token },
        body: JSON.stringify({ eventType: reviewForm.eventType, valueUsd: reviewForm.valueUsd ? Number(reviewForm.valueUsd) : undefined }),
      });
      setReviewing(null);
      setMessage({ text: 'Evidence confirmed. A Provider Verified outcome now appears in the Outcome Ledger.' });
      await Promise.all([load(), Promise.resolve(onOutcomeConfirmed())]);
    } catch (error) {
      setMessage({ text: onchainErrorMessage(error, 'The evidence could not be confirmed.'), error: true });
    } finally { setSubmitting(false); }
  }

  const filteredLinks = form.activityId ? links.filter((link) => !link.activity_id || link.activity_id === form.activityId) : links;

  return <div className="onchain-workspace">
    <section className="ops-section onchain-wallets">
      <div className="ops-section-title"><div><span className="ops-kicker">MONITORING</span><h2>Watched wallets</h2><p>Match activity from selected wallets to {campaignName}.</p></div><div className="onchain-title-actions"><button type="button" className="ops-button secondary" onClick={() => void load()}>Refresh</button>{writable && <button type="button" className="ops-button primary" onClick={() => setShowAdd(true)}>+ Add wallet</button>}</div></div>
      {message && <div className={`onchain-message ${message.error ? 'error' : 'success'}`}>{message.text}</div>}
      {loading ? <div className="ops-loading">Loading on-chain attribution...</div> : !targets.length ? <div className="ops-empty"><div className="ops-empty-icon">◇</div><h3>No watched wallets</h3><p>Add a wallet to start matching on-chain activity to this campaign.</p>{writable && <button type="button" className="ops-button secondary" onClick={() => setShowAdd(true)}>Add a wallet</button>}</div> : <div className="onchain-wallet-grid">{targets.map((target) => <article className={`onchain-wallet-card ${target.status}`} key={target.id}><div className="onchain-card-head"><div><span className="onchain-chain">{chainLabel(target.chain)}</span><h3>{target.label || 'Campaign wallet'}</h3></div><span className={`onchain-sync sync-${target.provider_sync_status}`}>{syncLabel(target.provider_sync_status)}</span></div><code title={target.address}>{shortAddress(target.address)}</code><dl><div><dt>Campaign</dt><dd>{campaignName}</dd></div><div><dt>Activity</dt><dd>{target.activity_id ? activitiesById.get(target.activity_id)?.title || 'Linked activity' : 'Campaign-wide'}</dd></div><div><dt>Tracking link</dt><dd>{target.tracked_link_id ? linksById.get(target.tracked_link_id)?.code || 'Linked' : 'None'}</dd></div><div><dt>Created</dt><dd>{displayDate(target.created_at)}</dd></div></dl>{target.provider_sync_error && <details><summary>View sync error</summary><p>{target.provider_sync_error}</p></details>}<div className="onchain-card-actions">{writable && target.status === 'active' && ['error', 'pending_config'].includes(target.provider_sync_status) && <button type="button" className="ops-button small" disabled={submitting} onClick={(event) => void saveTarget(event, target)}>Retry sync</button>}{writable && target.status === 'active' && <button type="button" className="ops-button small ghost" onClick={() => void disableTarget(target)}>Disable</button>}</div></article>)}</div>}
    </section>

    <section className="ops-section onchain-evidence">
      <div className="ops-section-title"><div><span className="ops-kicker">REVIEW QUEUE</span><h2>On-chain evidence</h2><p>Provider activity stays evidence until a Project operator explicitly confirms it.</p></div></div>
      <nav className="onchain-filters" aria-label="On-chain evidence status">{EVIDENCE_FILTERS.map((option) => <button type="button" key={option.value} className={filter === option.value ? 'active' : ''} onClick={() => setFilter(option.value)}>{option.label}</button>)}</nav>
      {loading ? <div className="ops-loading">Loading evidence...</div> : !events.length ? <div className="ops-empty"><div className="ops-empty-icon">✓</div><h3>{filter === 'pending' ? 'No on-chain evidence waiting for review.' : filter === 'confirmed' ? 'Confirmed blockchain outcomes will appear here.' : `No ${filter} on-chain evidence.`}</h3><p>{filter === 'pending' ? 'Use Refresh after activity reaches a watched wallet.' : 'Evidence remains grouped by its review state.'}</p></div> : <div className="onchain-evidence-list">{events.map((item) => <article className={`onchain-evidence-card state-${item.review_status}`} key={item.id}><div className="onchain-evidence-head"><div><span className="onchain-chain">{chainLabel(item.chain)}</span><h3>{item.watch_label || shortAddress(item.watched_address)}</h3></div><span className={`onchain-review review-${item.review_status}`}>{item.review_status === 'reorged' ? 'Reorged — no longer valid on-chain' : item.review_status}</span></div><div className="onchain-transfer"><div><span>FROM</span><code title={item.from_address || ''}>{shortAddress(item.from_address)}</code></div><b aria-label={`Direction: ${item.direction}`}>→<small>{item.direction}</small></b><div><span>TO</span><code title={item.to_address || ''}>{shortAddress(item.to_address)}</code></div></div><dl className="onchain-evidence-meta"><div><dt>Asset / value</dt><dd>{item.asset || 'Unknown asset'}{item.value_text ? ` · ${item.value_text}` : ''}</dd></div><div><dt>Transaction</dt><dd title={item.transaction_hash || ''}>{shortAddress(item.transaction_hash)}</dd></div><div><dt>Block / slot</dt><dd>{item.block_number || 'Not available'}</dd></div><div><dt>Occurred</dt><dd>{displayDate(item.occurred_at)}</dd></div><div><dt>Activity</dt><dd>{item.activity_id ? activitiesById.get(item.activity_id)?.title || 'Linked activity' : 'Campaign-wide'}</dd></div><div><dt>Tracking link</dt><dd>{item.tracked_link_id ? linksById.get(item.tracked_link_id)?.code || 'Linked' : 'None'}</dd></div></dl>{item.review_status === 'reorged' && <p className="onchain-reorg-note">If this evidence was previously confirmed, its linked Provider Verified outcome was revoked automatically. The evidence row remains preserved.</p>}{writable && item.review_status === 'pending' && <div className="onchain-card-actions"><button type="button" className="ops-button small primary" onClick={() => { setReviewing(item); setReviewForm({ eventType: 'purchase', valueUsd: '' }); }}>Confirm as outcome</button><button type="button" className="ops-button small ghost" onClick={() => void ignoreEvent(item)}>Ignore</button></div>}</article>)}</div>}
    </section>

    {showAdd && writable && <div className="ops-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setShowAdd(false); }}><form className="ops-modal onchain-modal" role="dialog" aria-modal="true" aria-labelledby="add-wallet-title" onSubmit={(event) => void saveTarget(event)}><div className="ops-modal-head"><div><span className="ops-kicker">ON-CHAIN ATTRIBUTION</span><h2 id="add-wallet-title">Add watched wallet</h2><p>Linkary will ask the selected Alchemy webhook to monitor this address.</p></div><button type="button" aria-label="Close" onClick={() => setShowAdd(false)}>×</button></div><label>Chain<select value={form.chain} onChange={(event) => setForm({ ...form, chain: event.target.value as AttributionChain })}>{ATTRIBUTION_CHAIN_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label><label>Wallet address<input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder={form.chain === 'solana' ? 'Solana public key' : '0x…'} autoComplete="off" spellCheck={false} required /><small>Address validation is enforced by the backend for the selected network.</small></label><label>Label, optional<input value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} placeholder="Treasury, mint wallet, campaign deposit…" maxLength={120} /></label><div className="ops-field-grid two"><label>Activity, optional<select value={form.activityId} onChange={(event) => setForm({ ...form, activityId: event.target.value, trackedLinkId: '' })}><option value="">Campaign-wide</option>{activities.map((activity) => <option value={activity.id} key={activity.id}>{activity.title}</option>)}</select></label><label>Tracking link, optional<select value={form.trackedLinkId} onChange={(event) => setForm({ ...form, trackedLinkId: event.target.value })}><option value="">No tracking link</option>{filteredLinks.map((link) => <option value={link.id} key={link.id}>{link.code}</option>)}</select></label></div><div className="ops-form-actions"><button type="button" className="ops-button ghost" onClick={() => setShowAdd(false)}>Cancel</button><button className="ops-button primary" disabled={submitting || !form.address.trim()}>{submitting ? 'Starting monitoring…' : 'Add wallet'}</button></div></form></div>}

    {reviewing && writable && reviewing.review_status === 'pending' && <div className="ops-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setReviewing(null); }}><form className="ops-modal onchain-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-evidence-title" onSubmit={confirmEvent}><div className="ops-modal-head"><div><span className="ops-kicker">HUMAN REVIEW REQUIRED</span><h2 id="confirm-evidence-title">Confirm as outcome</h2><p>This creates a verified outcome only after your explicit approval.</p></div><button type="button" aria-label="Close" onClick={() => setReviewing(null)}>×</button></div><div className="onchain-review-summary"><span>{chainLabel(reviewing.chain)} · {reviewing.direction}</span><strong>{reviewing.asset || 'Unknown asset'}{reviewing.value_text ? ` · ${reviewing.value_text}` : ''}</strong><code>{shortAddress(reviewing.transaction_hash)}</code><small>{displayDate(reviewing.occurred_at)}</small></div><div className="ops-field-grid two"><label>Outcome type<select value={reviewForm.eventType} onChange={(event) => setReviewForm({ ...reviewForm, eventType: event.target.value })}>{OUTCOME_TYPES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Attributed value (USD), optional<input type="number" min="0" step="0.01" value={reviewForm.valueUsd} onChange={(event) => setReviewForm({ ...reviewForm, valueUsd: event.target.value })} placeholder="250" /></label></div><p className="onchain-confirm-note">The Outcome Ledger will show source <strong>Provider Verified</strong> and confidence <strong>Verified</strong>.</p><div className="ops-form-actions"><button type="button" className="ops-button ghost" onClick={() => setReviewing(null)}>Cancel</button><button className="ops-button primary" disabled={submitting}>{submitting ? 'Confirming…' : 'Confirm verified outcome'}</button></div></form></div>}
  </div>;
}
