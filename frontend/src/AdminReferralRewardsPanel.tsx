import { useEffect, useMemo, useState } from 'react';
import './admin-referral-rewards.css';

type RewardBasis = 'percentage_first_payment' | 'fixed_first_payment';
type DecisionStatus = 'review' | 'approved' | 'paid' | 'void';
type Eligibility = 'eligible' | 'free_access' | 'no_verified_payment' | 'payment_reversed';
type Filter = 'all' | 'eligible' | 'free' | 'review' | 'approved' | 'paid' | 'reversed';

type Rule = {
  id: string;
  name: string;
  rewardBasis: RewardBasis;
  percentageBps: number | null;
  fixedAmountCents: number | null;
  minimumPayoutCents: number;
  firstPaymentOnly: boolean;
  excludeFreeAccess: boolean;
  excludeRefundedPayments: boolean;
  updatedAt: string;
};

type RewardSummary = {
  totalReferrals: number;
  paidReferrals: number;
  freeUnpaidReferrals: number;
  reversedReferrals: number;
  activePaidReferrals: number;
  freeAccessReferrals: number;
  referralRevenueCents: number;
  eligibleUnreviewedCount: number;
  eligibleUnreviewedCents: number;
  reviewCents: number;
  approvedCents: number;
  paidCents: number;
  voidCents: number;
  estimatedRewardCents: number;
  outstandingCents: number;
};

type Leader = {
  userId: string;
  displayName: string;
  username: string | null;
  directReferrals: number;
  paidReferrals: number;
  freeUnpaidReferrals: number;
  reversedReferrals: number;
  activePaidReferrals: number;
  referralRevenueCents: number;
  eligibleUnreviewedCount: number;
  eligibleUnreviewedCents: number;
  reviewCents: number;
  approvedCents: number;
  paidCents: number;
  estimatedRewardCents: number;
  outstandingCents: number;
};

type LedgerRow = {
  edgeId: string;
  invitedAt: string;
  inviterUserId: string;
  inviterName: string;
  inviterUsername: string | null;
  referredUserId: string;
  referredName: string;
  referredUsername: string | null;
  paymentId: string | null;
  paymentStatus: 'verified' | 'refunded' | 'reversed' | null;
  paymentAmountCents: number | null;
  paymentAt: string | null;
  planCode: string | null;
  planName: string | null;
  basePriceCents: number | null;
  discountCents: number | null;
  couponDiscountCents: number | null;
  couponCode: string | null;
  freeAccessCode: string | null;
  activePaid: boolean;
  lifetimeRevenueCents: number;
  eligibility: Eligibility;
  estimatedRewardCents: number;
  decisionStatus: DecisionStatus | null;
  decisionReason: string | null;
  paymentReference: string | null;
  approvedAt: string | null;
  paidAt: string | null;
};

type Payable = {
  paymentId: string;
  inviterUserId: string;
  displayName: string;
  username: string | null;
  referredUserId: string;
  referredName: string;
  amountCents: number;
  sourcePaymentAmountCents: number;
  reason: string;
  approvedAt: string;
  paymentStatus: string;
};

type RewardIntelligence = {
  ready: boolean;
  requiredMigration?: string;
  message?: string;
  generatedAt?: string;
  activeRule: Rule | null;
  summary: RewardSummary | null;
  leaders: Leader[];
  ledger: LedgerRow[];
  payables: Payable[];
  policy?: {
    directReferralOnly: boolean;
    firstPaidTransactionOnly: boolean;
    freeAccessRewardCents: number;
    fullDiscountRewardCents: number;
    publicPromise: boolean;
    automaticPayout: boolean;
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

function number(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function money(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return 'N/A';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(cents / 100);
}

function percent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'N/A';
  return `${(value * 100).toFixed(value * 100 >= 10 ? 1 : 2)}%`;
}

function shortDate(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <article className="rr-metric"><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}

function rowStatus(row: LedgerRow): { label: string; tone: string } {
  if (row.paymentStatus && row.paymentStatus !== 'verified') return { label: `Payment ${row.paymentStatus}`, tone: 'reversed' };
  if (row.decisionStatus === 'paid') return { label: 'Paid', tone: 'paid' };
  if (row.decisionStatus === 'approved') return { label: 'Approved', tone: 'approved' };
  if (row.decisionStatus === 'review') return { label: 'Under review', tone: 'review' };
  if (row.decisionStatus === 'void') return { label: 'Void', tone: 'void' };
  if (row.eligibility === 'eligible') return { label: 'Eligible', tone: 'eligible' };
  if (row.eligibility === 'free_access') return { label: 'Free access · $0', tone: 'free' };
  return { label: 'Free / unpaid · $0', tone: 'free' };
}

export default function AdminReferralRewardsPanel() {
  const [data, setData] = useState<RewardIntelligence | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [ruleBasis, setRuleBasis] = useState<'percentage' | 'fixed'>('percentage');
  const [ruleValue, setRuleValue] = useState('10');
  const [minimumPayout, setMinimumPayout] = useState('0');

  async function load() {
    setLoading(true);
    try {
      const result = await api<RewardIntelligence>('/api/admin/platform-intelligence/referral-reward-intelligence');
      setData(result);
      if (result.activeRule) {
        if (result.activeRule.rewardBasis === 'fixed_first_payment') {
          setRuleBasis('fixed');
          setRuleValue((Number(result.activeRule.fixedAmountCents || 0) / 100).toFixed(2));
        } else {
          setRuleBasis('percentage');
          setRuleValue((Number(result.activeRule.percentageBps || 0) / 100).toString());
        }
        setMinimumPayout((Number(result.activeRule.minimumPayoutCents || 0) / 100).toFixed(2));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Referral reward intelligence could not be loaded.');
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
      await api(path, { method: 'POST', headers: { 'x-csrf-token': token }, body: JSON.stringify(body) });
      await load();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Referral reward operation could not be saved.');
      return false;
    } finally {
      setBusy('');
    }
  }

  async function saveRule(event: React.FormEvent) {
    event.preventDefault();
    const numeric = Number(ruleValue);
    const threshold = Number(minimumPayout);
    if (!Number.isFinite(numeric) || numeric <= 0 || !Number.isFinite(threshold) || threshold < 0) return;
    const body = ruleBasis === 'percentage'
      ? { rewardBasis: 'percentage', percentageBps: Math.round(numeric * 100), minimumPayoutCents: Math.round(threshold * 100) }
      : { rewardBasis: 'fixed', fixedAmountCents: Math.round(numeric * 100), minimumPayoutCents: Math.round(threshold * 100) };
    if (await mutate('/api/admin/platform-intelligence/referral-reward-rule', body, 'rule')) {
      setMessage('Referral reward rule updated. Unreviewed estimates now use the new rule; reviewed amounts remain snapshotted.');
    }
  }

  async function changeStatus(row: LedgerRow, status: DecisionStatus) {
    if (!row.paymentId) return;
    let paymentReference: string | null = null;
    let reason = '';
    if (status === 'paid') {
      paymentReference = window.prompt('Payment reference, transaction hash, invoice reference, or internal settlement ID:')?.trim() || null;
      if (!paymentReference) return;
    }
    if (status === 'void') {
      reason = window.prompt('Why should this referral reward be voided?')?.trim() || '';
      if (reason.length < 3) return;
    }
    const verbs: Record<DecisionStatus, string> = {
      review: 'place this automatically calculated reward under review',
      approved: 'approve this reward for payment',
      paid: 'mark this reward as paid',
      void: 'void this reward',
    };
    if (!window.confirm(`Confirm you want to ${verbs[status]}?`)) return;
    const ok = await mutate(
      `/api/admin/platform-intelligence/referral-reward-payments/${encodeURIComponent(row.paymentId)}/status`,
      { status, paymentReference, reason },
      `${status}:${row.paymentId}`,
    );
    if (ok) setMessage(status === 'approved' ? 'Reward approved and added to the automatic payables queue.' : status === 'paid' ? 'Reward marked paid with settlement reference.' : status === 'void' ? 'Reward voided.' : 'Reward moved under review.');
  }

  const filteredLedger = useMemo(() => {
    if (!data) return [];
    return data.ledger.filter((row) => {
      if (filter === 'all') return true;
      if (filter === 'eligible') return row.eligibility === 'eligible' && !row.decisionStatus;
      if (filter === 'free') return row.eligibility === 'free_access' || row.eligibility === 'no_verified_payment';
      if (filter === 'reversed') return row.eligibility === 'payment_reversed';
      return row.decisionStatus === filter;
    });
  }, [data, filter]);

  if (loading && !data) return <article className="rr-panel"><div className="rr-loading">Loading automatic referral rewards…</div></article>;
  if (!data) return <article className="rr-panel"><div className="rr-error">{message || 'Referral reward intelligence is unavailable.'}</div></article>;
  if (!data.ready) return <article className="rr-panel rr-migration"><span>REFERRAL REWARDS V3</span><strong>Production migration 0045 is required</strong><p>{data.message}</p><code>{data.requiredMigration}</code></article>;
  if (!data.summary || !data.activeRule) return <article className="rr-panel rr-migration"><span>REFERRAL REWARDS V3</span><strong>Reward rule unavailable</strong><p>{data.message || 'Create an active rule to calculate internal estimates.'}</p></article>;

  const summary = data.summary;
  const paidConversion = summary.totalReferrals > 0 ? summary.paidReferrals / summary.totalReferrals : null;
  const peopleWaiting = new Set(data.payables.map((row) => row.inviterUserId)).size;

  return <section className="rr-stack">
    {message && <div className="rr-message" role="status">{message}</div>}

    <article className="rr-panel rr-hero">
      <header><div><span>AUTOMATIC REFERRAL REWARD INTELLIGENCE</span><strong>Paid referrals create estimates. Free users create $0.</strong></div><small>Direct inviter only · first paid transaction</small></header>
      <p>{data.policy?.explanation}</p>
      <div className="rr-summary-grid">
        <Metric label="Direct referrals" value={number(summary.totalReferrals)} note="Canonical direct invite edges" />
        <Metric label="Paid referrals" value={number(summary.paidReferrals)} note={`${percent(paidConversion)} referral-to-paid`} />
        <Metric label="Free / unpaid" value={number(summary.freeUnpaidReferrals)} note={`${number(summary.freeAccessReferrals)} used recorded free access`} />
        <Metric label="Active paid" value={number(summary.activePaidReferrals)} note="Currently active paid accounts" />
        <Metric label="Referral revenue" value={money(summary.referralRevenueCents)} note="All verified payments from direct referrals" />
        <Metric label="Estimated rewards" value={money(summary.estimatedRewardCents)} note="Eligible + reviewed + approved + paid" />
        <Metric label="Eligible now" value={money(summary.eligibleUnreviewedCents)} note={`${number(summary.eligibleUnreviewedCount)} automatically calculated`} />
        <Metric label="Approved · to pay" value={money(summary.approvedCents)} note="Manual approval still required" />
        <Metric label="Paid" value={money(summary.paidCents)} note="Recorded settlements" />
        <Metric label="Reversed / refunded" value={number(summary.reversedReferrals)} note="Not reward eligible" />
      </div>
    </article>

    <article className="rr-panel rr-rule">
      <header><div><span>REWARD RULE</span><strong>{data.activeRule.name}</strong></div><small>Private internal calculation · configurable</small></header>
      <form onSubmit={(event) => void saveRule(event)}>
        <label>Reward basis<select value={ruleBasis} onChange={(event) => setRuleBasis(event.target.value as 'percentage' | 'fixed')}><option value="percentage">% of first verified payment</option><option value="fixed">Fixed amount per first paid referral</option></select></label>
        <label>{ruleBasis === 'percentage' ? 'Reward percentage' : 'Fixed reward · USD'}<input type="number" min="0.01" max={ruleBasis === 'percentage' ? '100' : '100000'} step="0.01" value={ruleValue} onChange={(event) => setRuleValue(event.target.value)} /></label>
        <label>Minimum payout · USD<input type="number" min="0" max="100000" step="0.01" value={minimumPayout} onChange={(event) => setMinimumPayout(event.target.value)} /></label>
        <button type="submit" disabled={busy === 'rule'}>{busy === 'rule' ? 'Saving…' : 'Save reward rule'}</button>
      </form>
      <div className="rr-rule-locks"><span>✓ First paid transaction only</span><span>✓ 100% coupon / free access = $0</span><span>✓ Refunded or reversed = not payable</span><span>✓ No 7-generation downstream payout</span><span>✓ No automatic payment</span></div>
    </article>

    <article className="rr-panel rr-payables">
      <header><div><span>AUTOMATIC PAYABLES</span><strong>Approved rewards waiting for settlement</strong></div><small>{number(peopleWaiting)} people · {number(data.payables.length)} items</small></header>
      <div className="rr-payable-summary"><Metric label="Amount to pay" value={money(summary.outstandingCents)} note="Approved and source payment still verified" /><Metric label="Under review" value={money(summary.reviewCents)} note="Not yet payable" /><Metric label="Minimum payout" value={money(data.activeRule.minimumPayoutCents)} note="Internal settlement threshold" /></div>
      <div className="rr-table-wrap"><table><thead><tr><th>Inviter</th><th>Referred paid user</th><th>Source payment</th><th>Reward</th><th>Approved</th><th>Action</th></tr></thead><tbody>{data.payables.length ? data.payables.map((row) => <tr key={`payable:${row.paymentId}`}><td><strong>{row.displayName}</strong><small>{row.username ? `@${row.username}` : row.inviterUserId}</small></td><td>{row.referredName}</td><td>{money(row.sourcePaymentAmountCents)}</td><td><strong>{money(row.amountCents)}</strong></td><td>{shortDate(row.approvedAt)}</td><td><button className="rr-small" type="button" disabled={Boolean(busy)} onClick={() => { const ledger = data.ledger.find((item) => item.paymentId === row.paymentId); if (ledger) void changeStatus(ledger, 'paid'); }}>Mark paid</button></td></tr>) : <tr><td colSpan={6}>No automatically calculated rewards are approved for payment.</td></tr>}</tbody></table></div>
    </article>

    <article className="rr-panel">
      <header><div><span>TOP REFERRAL EARNERS</span><strong>Users, paid conversions, revenue and internal reward estimate</strong></div><small>Automatic, no manual allocation required</small></header>
      <div className="rr-table-wrap"><table className="rr-leaders"><thead><tr><th>Inviter</th><th>Users brought</th><th>Paid</th><th>Free / unpaid</th><th>Active paid</th><th>Referral revenue</th><th>Estimated reward</th><th>Approved</th><th>Paid</th></tr></thead><tbody>{data.leaders.length ? data.leaders.map((leader) => <tr key={leader.userId}><td><strong>{leader.displayName}</strong><small>{leader.username ? `@${leader.username}` : leader.userId}</small></td><td>{number(leader.directReferrals)}</td><td><strong>{number(leader.paidReferrals)}</strong></td><td>{number(leader.freeUnpaidReferrals)}</td><td>{number(leader.activePaidReferrals)}</td><td>{money(leader.referralRevenueCents)}</td><td><strong>{money(leader.estimatedRewardCents)}</strong><small>{number(leader.eligibleUnreviewedCount)} eligible now</small></td><td>{money(leader.approvedCents)}</td><td>{money(leader.paidCents)}</td></tr>) : <tr><td colSpan={9}>No referral network members yet.</td></tr>}</tbody></table></div>
    </article>

    <article className="rr-panel rr-ledger">
      <header><div><span>REFERRAL REWARD LEDGER</span><strong>Every direct referral, including $0 free users</strong></div><label>Filter<select value={filter} onChange={(event) => setFilter(event.target.value as Filter)}><option value="all">All referrals</option><option value="eligible">Eligible now</option><option value="free">Free / unpaid</option><option value="review">Under review</option><option value="approved">Approved</option><option value="paid">Paid</option><option value="reversed">Refunded / reversed</option></select></label></header>
      <div className="rr-table-wrap"><table className="rr-ledger-table"><thead><tr><th>Inviter</th><th>Referred user</th><th>Plan / coupon</th><th>First payment</th><th>Lifetime revenue</th><th>Calculated reward</th><th>Status</th><th>Action</th></tr></thead><tbody>{filteredLedger.length ? filteredLedger.map((row) => { const status = rowStatus(row); const canAct = Boolean(row.paymentId) && row.paymentStatus === 'verified'; return <tr key={row.edgeId}><td><strong>{row.inviterName}</strong><small>{row.inviterUsername ? `@${row.inviterUsername}` : row.inviterUserId}</small></td><td><strong>{row.referredName}</strong><small>{row.referredUsername ? `@${row.referredUsername}` : shortDate(row.invitedAt)}</small></td><td><strong>{row.planName || 'Free / no paid plan'}</strong><small>{row.couponCode ? `Coupon ${row.couponCode}` : row.freeAccessCode ? `Free pass ${row.freeAccessCode}` : 'No paid coupon'}</small></td><td>{row.paymentAmountCents === null ? '$0.00' : money(row.paymentAmountCents)}<small>{row.paymentAt ? shortDate(row.paymentAt) : 'No verified payment'}</small></td><td>{money(row.lifetimeRevenueCents)}</td><td><strong>{money(row.estimatedRewardCents)}</strong><small>{row.paymentAmountCents !== null && row.basePriceCents !== null && row.discountCents ? `${money(row.discountCents)} discount applied` : row.eligibility === 'free_access' ? 'Free access never earns' : ''}</small></td><td><span className={`rr-status ${status.tone}`}>{status.label}</span>{row.paymentReference && <small>{row.paymentReference}</small>}</td><td><div className="rr-actions">{canAct && !row.decisionStatus && <><button type="button" disabled={Boolean(busy)} onClick={() => void changeStatus(row, 'review')}>Review</button><button type="button" disabled={Boolean(busy)} onClick={() => void changeStatus(row, 'approved')}>Approve</button></>}{canAct && row.decisionStatus === 'review' && <><button type="button" disabled={Boolean(busy)} onClick={() => void changeStatus(row, 'approved')}>Approve</button><button type="button" disabled={Boolean(busy)} onClick={() => void changeStatus(row, 'void')}>Void</button></>}{row.decisionStatus === 'approved' && <><button type="button" disabled={Boolean(busy) || row.paymentStatus !== 'verified'} onClick={() => void changeStatus(row, 'paid')}>Mark paid</button><button type="button" disabled={Boolean(busy)} onClick={() => void changeStatus(row, 'void')}>Void</button></>}{row.paymentStatus !== 'verified' && row.decisionStatus && row.decisionStatus !== 'paid' && row.decisionStatus !== 'void' && <button type="button" disabled={Boolean(busy)} onClick={() => void changeStatus(row, 'void')}>Void</button>}</div></td></tr>; }) : <tr><td colSpan={8}>No referral records match this filter.</td></tr>}</tbody></table></div>
      <footer>Showing up to 300 recent direct referrals. Estimates are internal operating intelligence, not a public entitlement or automatic payout.</footer>
    </article>
  </section>;
}
