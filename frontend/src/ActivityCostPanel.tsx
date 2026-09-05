import { useEffect, useMemo, useState } from 'react';
import './activity-cost.css';

type CostEntry = {
  id: string;
  activity_id: string | null;
  activity_title: string | null;
  cost_type: string;
  amount_original: number;
  currency: string;
  usd_equivalent: number;
  provenance: string;
  note: string;
  incurred_at: string;
  status: 'active' | 'voided';
  created_at: string;
  void_reason: string | null;
};

type CostPayload = {
  campaign: { id: string; name: string; budget_usd: number | null };
  summary: { actual_spend_usd: number; active_entries: number; budget_remaining_usd: number | null };
  entries: CostEntry[];
};

type ApiPayload = { message?: string };

function csrf(): string | null {
  const hit = document.cookie.split('; ').find((part) => part.startsWith('__Host-linkary_csrf='));
  return hit ? decodeURIComponent(hit.split('=').slice(1).join('=')) : null;
}

function usd(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(value || 0));
}

function human(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function date(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Date not available';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
}

export default function ActivityCostPanel({ activityId, writable }: { activityId: string; writable: boolean }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<CostPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [voidingId, setVoidingId] = useState('');
  const [voidReason, setVoidReason] = useState('');
  const [form, setForm] = useState({ costType: 'partner', amount: '', currency: 'USD', usdEquivalent: '', note: '' });

  const activeEntries = useMemo(() => data?.entries.filter((entry) => entry.status === 'active') || [], [data]);
  const nonUsd = form.currency.trim().toUpperCase() !== 'USD';

  async function load() {
    if (!writable) return;
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch(`/api/campaign-costs?activityId=${encodeURIComponent(activityId)}`, { credentials: 'same-origin' });
      const payload = (await response.json().catch(() => ({}))) as CostPayload & ApiPayload;
      if (!response.ok) throw new Error(payload.message || 'Actual spend could not be loaded.');
      setData(payload);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Actual spend could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) void load();
  }, [open, activityId]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!writable || !data) return;
    const token = csrf();
    if (!token) { setMessage('Refresh your session before recording spend.'); return; }
    const amount = Number(form.amount);
    const usdEquivalent = nonUsd ? Number(form.usdEquivalent) : amount;
    if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(usdEquivalent) || usdEquivalent < 0) {
      setMessage('Enter a valid non-negative amount and USD equivalent.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/campaign-costs', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-csrf-token': token },
        body: JSON.stringify({
          campaignId: data.campaign.id,
          activityId,
          costType: form.costType,
          amount,
          currency: form.currency.trim().toUpperCase(),
          usdEquivalent: nonUsd ? usdEquivalent : undefined,
          note: form.note,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as ApiPayload;
      if (!response.ok) throw new Error(payload.message || 'Actual spend could not be recorded.');
      setForm({ costType: 'partner', amount: '', currency: 'USD', usdEquivalent: '', note: '' });
      setMessage('Actual spend recorded as founder-entered evidence.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Actual spend could not be recorded.');
    } finally {
      setSaving(false);
    }
  }

  async function confirmVoid(entryId: string) {
    if (!writable || !voidReason.trim()) return;
    const token = csrf();
    if (!token) { setMessage('Refresh your session before correcting spend.'); return; }
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch(`/api/campaign-costs/${encodeURIComponent(entryId)}/void`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-csrf-token': token },
        body: JSON.stringify({ reason: voidReason }),
      });
      const payload = (await response.json().catch(() => ({}))) as ApiPayload;
      if (!response.ok) throw new Error(payload.message || 'Cost entry could not be corrected.');
      setVoidingId('');
      setVoidReason('');
      setMessage('Cost entry voided. Historical audit detail was preserved.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Cost entry could not be corrected.');
    } finally {
      setSaving(false);
    }
  }

  if (!writable) return null;

  return <div className="activity-cost-control">
    <button type="button" className="activity-cost-open" onClick={() => setOpen(true)}>Actual spend</button>
    {open && <div className="activity-cost-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false); }}>
      <section className="activity-cost-modal" role="dialog" aria-modal="true" aria-label="Actual spend">
        <header><div><span>ROI INPUT</span><h3>Actual spend</h3><p>Budget and planned cost stay separate. Only active actual-cost entries should feed ROI and cost-efficiency metrics.</p></div><button type="button" aria-label="Close actual spend" onClick={() => setOpen(false)}>×</button></header>
        {loading ? <div className="activity-cost-loading">Loading actual spend...</div> : data && <>
          <div className="activity-cost-summary">
            <span><small>ACTUAL SPEND</small><strong>{usd(data.summary.actual_spend_usd)}</strong></span>
            <span><small>CAMPAIGN BUDGET</small><strong>{data.campaign.budget_usd === null ? 'Not set' : usd(data.campaign.budget_usd)}</strong></span>
            <span><small>ACTIVE COSTS</small><strong>{data.summary.active_entries}</strong></span>
          </div>

          <form className="activity-cost-form" onSubmit={save}>
            <div className="activity-cost-grid">
              <label><span>Cost type</span><select value={form.costType} onChange={(event) => setForm((current) => ({ ...current, costType: event.target.value }))}><option value="partner">Partner / creator</option><option value="media">Media / placement</option><option value="platform">Platform / tool</option><option value="agency">Agency</option><option value="other">Other</option></select></label>
              <label><span>Amount</span><input type="number" min="0" step="any" inputMode="decimal" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} required /></label>
              <label><span>Currency / token</span><input value={form.currency} maxLength={12} onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} required /></label>
              {nonUsd && <label><span>USD equivalent</span><input type="number" min="0" step="any" inputMode="decimal" value={form.usdEquivalent} onChange={(event) => setForm((current) => ({ ...current, usdEquivalent: event.target.value }))} required /></label>}
            </div>
            <label className="activity-cost-note"><span>Note</span><textarea rows={2} value={form.note} maxLength={500} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} placeholder="Creator fee, Telegram placement, agency charge, token payment equivalent..." /></label>
            <div className="activity-cost-provenance"><strong>Founder-entered</strong><span>This is manual financial evidence. Linkary will not present it as provider-verified spend.</span></div>
            <button type="submit" className="ops-button primary" disabled={saving}>{saving ? 'Saving...' : 'Record actual cost'}</button>
          </form>

          <div className="activity-cost-list">
            <div><h4>Recorded costs</h4><span>{activeEntries.length ? `${activeEntries.length} active` : 'No actual costs yet'}</span></div>
            {!data.entries.length ? <p className="activity-cost-empty">Record the real amount incurred for this activity before using ROI, CPC or CPA as decision metrics.</p> : data.entries.map((entry) => <article key={entry.id} className={entry.status === 'voided' ? 'voided' : ''}>
              <div className="activity-cost-entry-main"><strong>{usd(entry.usd_equivalent)}</strong><span>{entry.amount_original.toLocaleString()} {entry.currency} · {human(entry.cost_type)}</span><small>{date(entry.incurred_at)} · {entry.provenance === 'founder_manual' ? 'Founder-entered' : 'Provider verified'}</small>{entry.note && <p>{entry.note}</p>}{entry.status === 'voided' && <p>Voided: {entry.void_reason || 'Corrected entry'}</p>}</div>
              {entry.status === 'active' && (voidingId === entry.id ? <div className="activity-cost-void"><input value={voidReason} maxLength={500} onChange={(event) => setVoidReason(event.target.value)} placeholder="Reason for correction" autoFocus /><div><button type="button" className="ops-button secondary small" onClick={() => { setVoidingId(''); setVoidReason(''); }}>Cancel</button><button type="button" className="ops-button secondary small" disabled={!voidReason.trim() || saving} onClick={() => void confirmVoid(entry.id)}>Void entry</button></div></div> : <button type="button" className="activity-cost-correct" onClick={() => { setVoidingId(entry.id); setVoidReason(''); }}>Correct</button>)}
            </article>)}
          </div>
        </>}
        {message && <div className="activity-cost-message" role="status">{message}</div>}
      </section>
    </div>}
  </div>;
}
