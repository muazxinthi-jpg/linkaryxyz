import { useEffect, useMemo, useState } from 'react';
import './admin-network-rewards.css';

type SettlementStatus = 'review' | 'approved' | 'paid' | 'void';
type Filter = 'all' | 'direct' | 'downstream' | 'approved' | 'reversed';

type Rate = {
  generation: number;
  rateBps: number;
  percent: number;
  label: string;
};

type Projection = {
  generation: number;
  rateBps: number;
  paymentEvents: number;
  beneficiaries: number;
  projectedCents: number;
};

type LedgerRow = {
  id: string;
  sourcePaymentId: string;
  sourceUserId: string;
  sourceName: string;
  sourceUsername: string | null;
  beneficiaryUserId: string;
  beneficiaryName: string;
  beneficiaryUsername: string | null;
  generation: number;
  entryKind: 'accrual' | 'reversal';
  basisAmountCents: number;
  rateBps: number;
  amountCents: number;
  relatedEntryId: string | null;
  paymentStatus: 'verified' | 'refunded' | 'reversed';
  planName: string | null;
  settlementStatus: SettlementStatus | null;
  settlementAmountCents: number | null;
  settlementSource: 'v4' | 'v3_legacy' | null;
  settlementReason: string | null;
  paymentReference: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  effectiveAt: string;
};

type Payable = {
  beneficiaryUserId: string;
  displayName: string;
  username: string | null;
  amountCents: number;
  entryCount: number;
  oldestApprovedAt: string;
};

type Data = {
  ready: boolean;
  requiredMigration?: string;
  message?: string;
  generatedAt?: string;
  settings?: {
    networkRewardsEnabled: boolean;
    updatedAt: string;
    downstreamMode: 'enabled' | 'shadow_only';
  };
  rates?: Rate[];
  summary?: {
    directReferredRevenueCents: number;
    directNetAccrualCents: number;
    downstreamNetAccrualCents: number;
    reversalCents: number;
    unreviewedCents: number;
    reviewCents: number;
    approvedCents: number;
    paidCents: number;
    clawbackCents: number;
    legacyVarianceCents: number;
    approvedPeople: number;
    downstreamShadowCents: number;
  };
  downstreamProjection?: Projection[];
  ledger?: LedgerRow[];
  payables?: Payable[];
  policy?: {
    publicPromise: boolean;
    automaticTransfer: boolean;
    gen1LifetimeRevenue: boolean;
    downstreamRequiresFlag: boolean;
    downstreamCurrentlyPayable: boolean;
    maximumAggregateBps: number;
    downstreamAggregateBps: number;
    explanation: string;
  };
};

function csrf(): string | null {
  const hit = document.cookie.split('; ').find((part) => part.startsWith('__Host-linkary_csrf='));
  return hit ? decodeURIComponent(hit.split('=').slice(1).join('=')) : null;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  const body = (await response.json().catch(() => ({}))) as T & { message?: string };
  if (!response.ok) throw new Error(body.message || 'Request failed');
  return body;
}

function money(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return 'N/A';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(cents / 100);
}

function number(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function shortDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function waitingDays(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.floor((Date.now() - time) / 86_400_000));
}

function Metric({ label, value, note, tone = '' }: { label: string; value: string; note: string; tone?: string }) {
  return <article className={`nr-metric ${tone}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}

function Status({ row, reversed }: { row: LedgerRow; reversed: boolean }) {
  if (row.entryKind === 'reversal') return <span className="nr-status reversed">Reversal</span>;
  if (reversed) return <span className="nr-status reversed">Reversed</span>;
  if (row.settlementStatus) return <span className={`nr-status ${row.settlementStatus}`}>{row.settlementStatus === 'review' ? 'Under review' : row.settlementStatus}</span>;
  return <span className="nr-status unreviewed">Unreviewed</span>;
}

export default function AdminNetworkRewardsExperience() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  async function load() {
    setLoading(true);
    try {
      const result = await api<Data>('/api/admin/platform-intelligence/network-reward-ledger');
      setData(result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Network reward accounting could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function mutate(path: string, body: unknown, key: string): Promise<boolean> {
    const token = csrf();
    if (!token) {
      setMessage('Security token is unavailable. Refresh Superadmin and try again.');
      return false;
    }
    setBusy(key);
    setMessage('');
    try {
      const result = await api<{ message?: string }>(path, {
        method: 'POST',
        headers: { 'x-csrf-token': token },
        body: JSON.stringify(body),
      });
      await load();
      if (result.message) setMessage(result.message);
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The network reward operation could not be saved.');
      return false;
    } finally {
      setBusy('');
    }
  }

  async function reconcileDirect() {
    if (!window.confirm('Reconcile the Gen 1 lifetime ledger against all recorded Linkary billing payments? This is idempotent and will not create Gen 2-7 history.')) return;
    const ok = await mutate('/api/admin/platform-intelligence/network-reward-ledger/sync', { includeDownstreamHistory: false }, 'sync-direct');
    if (ok) setMessage('Gen 1 ledger reconciled. Existing rows were not duplicated.');
  }

  async function reconcileDownstreamHistory() {
    const confirmation = window.prompt('This can create historical Gen 2-7 accruals. Type RECONCILE DOWNSTREAM HISTORY to continue:')?.trim();
    if (confirmation !== 'RECONCILE DOWNSTREAM HISTORY') return;
    const ok = await mutate(
      '/api/admin/platform-intelligence/network-reward-ledger/sync',
      { includeDownstreamHistory: true, confirmation },
      'sync-downstream',
    );
    if (ok) setMessage('Historical downstream ledger reconciliation completed.');
  }

  async function toggleDownstream() {
    if (!data?.settings) return;
    if (data.settings.networkRewardsEnabled) {
      if (!window.confirm('Disable Gen 2-7 reward accounting for future payments? Existing immutable history will remain.')) return;
      await mutate('/api/admin/platform-intelligence/network-reward-settings', { enabled: false }, 'toggle');
      return;
    }
    const confirmation = window.prompt('Enable Gen 2-7 accounting for FUTURE verified payments only. Type ENABLE NETWORK REWARDS to continue:')?.trim();
    if (confirmation !== 'ENABLE NETWORK REWARDS') return;
    await mutate('/api/admin/platform-intelligence/network-reward-settings', { enabled: true, confirmation }, 'toggle');
  }

  async function changeStatus(row: LedgerRow, status: SettlementStatus) {
    if (row.entryKind !== 'accrual') return;
    let reason = '';
    let paymentReference: string | null = null;
    if (status === 'void') {
      reason = window.prompt('Why should this reward be voided?')?.trim() || '';
      if (reason.length < 3) return;
    }
    if (status === 'paid') {
      paymentReference = window.prompt('Settlement reference, transaction hash, invoice, or internal payment ID:')?.trim() || null;
      if (!paymentReference) return;
    }
    const wording: Record<SettlementStatus, string> = {
      review: 'place this accrual under review',
      approved: 'approve this accrual for payment',
      paid: 'mark this accrual as paid',
      void: 'void this accrual',
    };
    if (!window.confirm(`Confirm you want to ${wording[status]}?`)) return;
    const ok = await mutate(
      `/api/admin/platform-intelligence/network-reward-ledger/${encodeURIComponent(row.id)}/status`,
      { status, reason, paymentReference },
      `${status}:${row.id}`,
    );
    if (ok) setMessage(status === 'paid' ? 'Settlement recorded.' : status === 'approved' ? 'Accrual added to approved payables.' : status === 'void' ? 'Accrual voided.' : 'Accrual moved under review.');
  }

  const reversalIds = useMemo(() => new Set((data?.ledger || []).filter((row) => row.entryKind === 'reversal').map((row) => row.relatedEntryId).filter(Boolean)), [data]);
  const filtered = useMemo(() => (data?.ledger || []).filter((row) => {
    const reversed = row.entryKind === 'accrual' && reversalIds.has(row.id);
    if (filter === 'all') return true;
    if (filter === 'direct') return row.generation === 1;
    if (filter === 'downstream') return row.generation > 1;
    if (filter === 'approved') return row.entryKind === 'accrual' && row.settlementStatus === 'approved' && !reversed;
    return row.entryKind === 'reversal' || reversed;
  }), [data, filter, reversalIds]);

  if (loading && !data) return <div className="nr-page"><article className="nr-panel nr-loading">Loading private network reward accounting…</article></div>;
  if (!data) return <div className="nr-page"><article className="nr-panel nr-error">{message || 'Network reward accounting is unavailable.'}</article></div>;
  if (!data.ready) return <div className="nr-page"><article className="nr-panel nr-migration"><span>NETWORK REWARDS V4</span><h1>Production migration 0046 is required</h1><p>{data.message}</p><code>{data.requiredMigration}</code></article></div>;
  if (!data.summary || !data.settings || !data.rates || !data.downstreamProjection || !data.ledger || !data.payables || !data.policy) return <div className="nr-page"><article className="nr-panel nr-error">Network reward response is incomplete.</article></div>;

  const summary = data.summary;
  const downstreamMax = Math.max(1, ...data.downstreamProjection.map((row) => row.projectedCents));
  const enabled = data.settings.networkRewardsEnabled;

  return <div className="nr-page">
    <header className="nr-page-head">
      <div><span>PRIVATE FINANCIAL OPERATIONS</span><h1>Network reward accounting</h1><p>Source-of-truth referral economics, immutable accrual history, reversals, approvals and settlement tracking.</p></div>
      <div className={`nr-mode ${enabled ? 'enabled' : 'shadow'}`}><small>GEN 2-7 MODE</small><strong>{enabled ? 'ENABLED' : 'SHADOW ONLY'}</strong><span>{enabled ? 'Future eligible payments can accrue.' : 'Projected, not accrued or payable.'}</span></div>
    </header>

    {message && <div className="nr-message" role="status">{message}</div>}

    <section className="nr-metrics">
      <Metric label="Referred revenue" value={money(summary.directReferredRevenueCents)} note="Verified revenue with direct lineage" />
      <Metric label="Gen 1 accrued" value={money(summary.directNetAccrualCents)} note="10% lifetime eligible revenue" />
      <Metric label="Gen 2-7 shadow" value={money(summary.downstreamShadowCents)} note={enabled ? 'Historical projection, separate from actual ledger' : 'Projection only, no liability created'} tone={enabled ? '' : 'shadow'} />
      <Metric label="Approved · to pay" value={money(summary.approvedCents)} note={`${number(summary.approvedPeople)} people waiting`} tone="payable" />
      <Metric label="Paid" value={money(summary.paidCents)} note="Recorded settlement decisions" />
      <Metric label="Reversal adjustments" value={money(summary.reversalCents)} note="Append-only corrections" tone={summary.reversalCents > 0 ? 'warning' : ''} />
    </section>

    {(summary.clawbackCents > 0 || summary.legacyVarianceCents > 0) && <section className="nr-alerts">
      {summary.clawbackCents > 0 && <article><strong>{money(summary.clawbackCents)} paid before source reversal</strong><span>Review for internal clawback or accounting adjustment. The original ledger history remains intact.</span></article>}
      {summary.legacyVarianceCents > 0 && <article><strong>{money(summary.legacyVarianceCents)} V3 rule variance</strong><span>Historical V3 first-payment decisions differ from the locked Gen 1 10% calculation. They remain preserved for audit.</span></article>}
    </section>}

    <article className="nr-panel nr-policy">
      <header><div><span>LOCKED ECONOMICS</span><h2>10% direct + 2% downstream maximum</h2></div><small>12.00% maximum aggregate share</small></header>
      <div className="nr-rate-grid">
        {data.rates.map((rate) => <div key={rate.generation} className={rate.generation === 1 ? 'direct' : ''}><span>GEN {rate.generation}</span><strong>{rate.percent.toFixed(2)}%</strong><small>{rate.generation === 1 ? 'Lifetime eligible revenue' : 'Downstream network pool'}</small></div>)}
      </div>
      <p>{data.policy.explanation}</p>
    </article>

    <div className="nr-two-col">
      <article className="nr-panel nr-projection">
        <header><div><span>GEN 2-7 SHADOW MODEL</span><h2>{enabled ? 'Historical downstream projection' : 'What would the downstream pool look like?'}</h2></div><small>{enabled ? 'Projection is not the actual ledger' : 'NOT ACCRUED · NOT PAYABLE'}</small></header>
        <div className="nr-projection-list">
          {data.downstreamProjection.map((row) => <div className="nr-projection-row" key={row.generation}>
            <div><strong>Gen {row.generation} · {(row.rateBps / 100).toFixed(2)}%</strong><small>{number(row.paymentEvents)} payment paths · {number(row.beneficiaries)} beneficiaries</small></div>
            <div className="nr-bar"><i style={{ width: `${Math.max(row.projectedCents > 0 ? 4 : 0, (row.projectedCents / downstreamMax) * 100)}%` }} /></div>
            <b>{money(row.projectedCents)}</b>
          </div>)}
        </div>
      </article>

      <article className="nr-panel nr-controls">
        <header><div><span>ACCOUNTING CONTROLS</span><h2>Safe reconciliation and feature gate</h2></div><small>Superadmin only</small></header>
        <div className="nr-control-row"><div><strong>Reconcile Gen 1</strong><span>Idempotently compare all recorded payments with the lifetime direct ledger.</span></div><button type="button" onClick={() => void reconcileDirect()} disabled={Boolean(busy)}>{busy === 'sync-direct' ? 'Reconciling…' : 'Reconcile direct ledger'}</button></div>
        <div className="nr-control-row"><div><strong>Gen 2-7 feature flag</strong><span>{enabled ? 'Enabled for future verified payments. No historical backfill happens automatically.' : 'Disabled by default. Shadow projections remain private and non-payable.'}</span></div><button className={enabled ? 'danger' : ''} type="button" onClick={() => void toggleDownstream()} disabled={Boolean(busy)}>{busy === 'toggle' ? 'Saving…' : enabled ? 'Disable downstream' : 'Enable downstream'}</button></div>
        {enabled && <div className="nr-control-row high-risk"><div><strong>Historical Gen 2-7 reconciliation</strong><span>Optional. Creates immutable historical downstream accruals from recorded eligible payments.</span></div><button type="button" onClick={() => void reconcileDownstreamHistory()} disabled={Boolean(busy)}>{busy === 'sync-downstream' ? 'Reconciling…' : 'Reconcile history'}</button></div>}
      </article>
    </div>

    <article className="nr-panel nr-payables">
      <header><div><span>PAYABLES COMMAND CENTER</span><h2>Approved rewards waiting for settlement</h2></div><small>{money(summary.approvedCents)} · {number(summary.approvedPeople)} people</small></header>
      {data.payables.length ? <div className="nr-payable-grid">{data.payables.map((row) => <article key={row.beneficiaryUserId}><div><strong>{row.displayName}</strong><small>{row.username ? `@${row.username}` : row.beneficiaryUserId}</small></div><b>{money(row.amountCents)}</b><span>{number(row.entryCount)} approved entr{row.entryCount === 1 ? 'y' : 'ies'} · {waitingDays(row.oldestApprovedAt) ?? 0}d waiting</span></article>)}</div> : <div className="nr-empty">No approved reward balance is waiting for settlement.</div>}
    </article>

    <article className="nr-panel nr-ledger">
      <header><div><span>IMMUTABLE REWARD LEDGER</span><h2>Accruals, reversals and settlement state</h2></div><small>Latest 500 entries</small></header>
      <div className="nr-filters" role="group" aria-label="Network reward ledger filters">
        {([['all', 'All'], ['direct', 'Gen 1'], ['downstream', 'Gen 2-7'], ['approved', 'Approved'], ['reversed', 'Reversed']] as const).map(([key, label]) => <button type="button" key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{label}</button>)}
      </div>
      <div className="nr-table-wrap"><table><thead><tr><th>Beneficiary</th><th>Source</th><th>Gen</th><th>Revenue basis</th><th>Reward</th><th>Status</th><th>Effective</th><th>Action</th></tr></thead><tbody>
        {filtered.length ? filtered.map((row) => {
          const reversed = row.entryKind === 'accrual' && reversalIds.has(row.id);
          const canApprove = row.entryKind === 'accrual' && !reversed && row.paymentStatus === 'verified' && (row.generation === 1 || enabled);
          return <tr key={row.id} className={row.entryKind === 'reversal' ? 'reversal-row' : ''}>
            <td><strong>{row.beneficiaryName}</strong><small>{row.beneficiaryUsername ? `@${row.beneficiaryUsername}` : row.beneficiaryUserId}</small></td>
            <td><strong>{row.sourceName}</strong><small>{row.planName || row.sourcePaymentId}</small></td>
            <td><b>G{row.generation}</b><small>{(row.rateBps / 100).toFixed(2)}%</small></td>
            <td>{money(row.basisAmountCents)}</td>
            <td className={row.entryKind === 'reversal' ? 'negative' : ''}>{row.entryKind === 'reversal' ? '−' : ''}{money(row.amountCents)}{row.settlementSource === 'v3_legacy' && <small>V3 legacy decision</small>}</td>
            <td><Status row={row} reversed={reversed} />{row.paymentReference && <small>{row.paymentReference}</small>}</td>
            <td>{shortDate(row.effectiveAt)}</td>
            <td><div className="nr-actions">
              {row.entryKind === 'accrual' && !reversed && !row.settlementStatus && <><button type="button" onClick={() => void changeStatus(row, 'review')} disabled={Boolean(busy)}>Review</button>{canApprove && <button type="button" onClick={() => void changeStatus(row, 'approved')} disabled={Boolean(busy)}>Approve</button>}<button type="button" onClick={() => void changeStatus(row, 'void')} disabled={Boolean(busy)}>Void</button></>}
              {row.entryKind === 'accrual' && !reversed && row.settlementStatus === 'review' && <>{canApprove && <button type="button" onClick={() => void changeStatus(row, 'approved')} disabled={Boolean(busy)}>Approve</button>}<button type="button" onClick={() => void changeStatus(row, 'void')} disabled={Boolean(busy)}>Void</button></>}
              {row.entryKind === 'accrual' && !reversed && row.settlementStatus === 'approved' && <>{canApprove && <button type="button" onClick={() => void changeStatus(row, 'paid')} disabled={Boolean(busy)}>Mark paid</button>}<button type="button" onClick={() => void changeStatus(row, 'void')} disabled={Boolean(busy)}>Void</button></>}
              {(row.entryKind === 'reversal' || reversed || row.settlementStatus === 'paid' || row.settlementStatus === 'void') && <span>—</span>}
            </div></td>
          </tr>;
        }) : <tr><td colSpan={8}>No ledger entries match this filter.</td></tr>}
      </tbody></table></div>
    </article>

    <footer className="nr-footnote">Private Superadmin accounting. No public referral payout promise is created by this workspace. Gen 2-7 shadow projections are estimates until the downstream feature flag is explicitly enabled and actual ledger entries exist.</footer>
  </div>;
}
