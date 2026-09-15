import { useEffect, useMemo, useState } from 'react';
import './admin-platform-intelligence.css';
import AdminReferralRewardsPanel from './AdminReferralRewardsPanel';

type RangeDays = 30 | 90 | 180;
type Tab = 'overview' | 'referrals' | 'growth-plan';
type TargetMetric = 'registered_users' | 'mau' | 'paid_accounts' | 'mrr_cents' | 'referral_redemptions';
type RewardStatus = 'review' | 'approved' | 'paid' | 'void';

type TrendPoint = { day: string; registeredUsers: number; newUsers: number; referrals: number; revenueCents: number };
type VelocityMetric = { current: number; previous: number; change: number | null };
type MonthlyHistoryPoint = { month: string; newUsers: number; referrals: number; revenueCents: number };
type GrowthTarget = { id: string; period_key: string; metric_key: TargetMetric; target_value: number; notes: string | null; updated_at: string };
type ReferralLeader = { userId: string; displayName: string; username: string | null; directReferrals: number; networkSize: number; referrals30d: number; lastReferralAt: string | null };
type Reward = {
  id: string;
  beneficiaryUserId: string;
  displayName: string;
  username: string | null;
  periodKey: string;
  amountCents: number;
  currency: string;
  status: RewardStatus;
  reason: string;
  evidence: { directReferrals?: number; networkSize?: number; capturedAt?: string; basis?: string };
  paymentReference: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type Intelligence = {
  generatedAt: string;
  rangeDays: number;
  privateOpsReady: boolean;
  activity: { dau: number; wau: number; mau: number; dauMau: number | null; wauMau: number | null; methodology: string };
  financials: {
    allTimeRevenueCents: number;
    revenue30dCents: number;
    mrrCents: number;
    activePaidAccounts: number;
    arpaCents: number | null;
    paidAccountShare: number | null;
    discountRate30d: number | null;
    reversalRate: number | null;
    freePassRedemptions30d: number;
    methodology: string;
  };
  growth: {
    totalUsers: number;
    activeProfiles: number;
    referralRedemptionsThisMonth: number;
    currentMonth: string;
    profileActivationRate: number | null;
    paidConversionRate: number | null;
    referralContribution30d: number | null;
    velocity: { newUsers: VelocityMetric; referrals: VelocityMetric; revenueCents: VelocityMetric };
    monthlyHistory: MonthlyHistoryPoint[];
    trend: TrendPoint[];
    targets: GrowthTarget[];
    methodology: string;
  };
  referrals: {
    funnel: null | { inviteClicks: number; uniqueVisitors: number; redemptions: number; acceptedReferrals: number; clickToRedemption: number | null };
    leaders: ReferralLeader[];
    rewards: Reward[];
    rewardSummary: { reviewCents: number; approvedCents: number; paidCents: number };
    privacy: string;
  };
};

const metricLabels: Record<TargetMetric, string> = {
  registered_users: 'Registered users',
  mau: 'MAU',
  paid_accounts: 'Paid accounts',
  mrr_cents: 'MRR',
  referral_redemptions: 'Referral signups',
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

function number(value: number): string { return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(value || 0)); }
function compact(value: number): string { return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value || 0)); }
function money(cents: number | null): string {
  if (cents === null || cents === undefined) return 'N/A';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(cents / 100);
}
function percent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'N/A';
  return `${(value * 100).toFixed(Math.abs(value * 100) >= 10 ? 1 : 2)}%`;
}
function signedPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'N/A';
  const amount = value * 100;
  return `${amount > 0 ? '+' : ''}${amount.toFixed(Math.abs(amount) >= 10 ? 1 : 2)}%`;
}
function changeTone(value: number | null): 'positive' | 'negative' | 'flat' | 'unknown' {
  if (value === null || !Number.isFinite(value)) return 'unknown';
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'flat';
}
function shortDate(value: string | null): string {
  if (!value) return 'Never';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
}
function waitingDays(value: string | null, generatedAt: string): number | null {
  if (!value) return null;
  const start = new Date(value).getTime();
  const end = new Date(generatedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

function AcquisitionChart({ points }: { points: TrendPoint[] }) {
  const last = Math.max(0, points.length - 1);
  const [hoverIndex, setHoverIndex] = useState(last);
  const [pinnedIndex, setPinnedIndex] = useState<number | null>(null);
  useEffect(() => { setHoverIndex(Math.max(0, points.length - 1)); setPinnedIndex(null); }, [points.length]);

  const width = 760;
  const height = 260;
  const left = 22;
  const right = 738;
  const top = 18;
  const bottom = 226;
  const max = Math.max(1, ...points.flatMap((point) => [point.newUsers, point.referrals]));
  const x = (index: number) => left + (index / Math.max(1, points.length - 1)) * (right - left);
  const y = (value: number) => bottom - (value / max) * (bottom - top);
  const path = (key: 'newUsers' | 'referrals') => points.map((point, index) => `${index ? 'L' : 'M'} ${x(index)} ${y(point[key])}`).join(' ');
  const activeIndex = pinnedIndex ?? hoverIndex;
  const active = points[activeIndex];
  const activeX = active ? x(activeIndex) : left;
  const activeTop = active ? Math.min(y(active.newUsers), y(active.referrals)) : top;
  const hitWidth = (right - left) / Math.max(1, points.length);

  function select(index: number) { if (pinnedIndex === null) setHoverIndex(index); }
  function pin(index: number) { setHoverIndex(index); setPinnedIndex((current) => current === index ? null : index); }

  return <article className="pai-chart pai-acquisition-chart">
    <header><div><span>PLATFORM ACQUISITION</span><strong>New users and referral signups</strong></div><small>{pinnedIndex === null ? 'Hover a dot · click to pin' : 'Point pinned · click again to release'}</small></header>
    <div className="pai-line-stage pai-dot-chart" onPointerLeave={() => { if (pinnedIndex === null) setHoverIndex(last); }}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Interactive platform acquisition chart with selectable data points">
        <path className="pai-grid pai-grid-wide" d={`M${left} ${top}H${right}M${left} ${(top + bottom) / 2}H${right}M${left} ${bottom}H${right}`} />
        <path className="pai-user-line" d={path('newUsers')} />
        <path className="pai-referral-line" d={path('referrals')} />
        {points.map((point, index) => <g key={`dots:${point.day}`} aria-hidden="true">
          <circle className="pai-point-dot user" cx={x(index)} cy={y(point.newUsers)} r="3.2" />
          <circle className="pai-point-dot referral" cx={x(index)} cy={y(point.referrals)} r="3.2" />
        </g>)}
        {active && <g className={`pai-active-point pai-active-dot ${pinnedIndex === activeIndex ? 'pinned' : ''}`} aria-hidden="true">
          <line x1={activeX} x2={activeX} y1={top} y2={bottom} />
          <circle className="halo user" cx={activeX} cy={y(active.newUsers)} r="10" />
          <circle className="user" cx={activeX} cy={y(active.newUsers)} r="5.5" />
          <circle className="halo referral" cx={activeX} cy={y(active.referrals)} r="10" />
          <circle className="referral" cx={activeX} cy={y(active.referrals)} r="5.5" />
        </g>}
        {points.map((point, index) => <rect key={`hit:${point.day}`} className="pai-hit-zone" x={Math.max(left, x(index) - hitWidth / 2)} y={top} width={Math.max(7, hitWidth)} height={bottom - top} tabIndex={0} role="button" aria-label={`${point.day}: ${point.newUsers} new users, ${point.referrals} referral signups, ${point.registeredUsers} total registered users`} onPointerEnter={() => select(index)} onPointerDown={() => pin(index)} onFocus={() => setHoverIndex(index)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pin(index); } }} />)}
      </svg>
      {active && <div className={`pai-tooltip pai-dot-tooltip ${pinnedIndex === activeIndex ? 'pinned' : ''}`} style={{ left: `${Math.min(90, Math.max(10, (activeX / width) * 100))}%`, top: `${Math.max(2, (activeTop / height) * 100 - 17)}%` }} role="status"><strong>{active.day}</strong><span><i className="user" />{number(active.newUsers)} new users</span><span><i className="referral" />{number(active.referrals)} referred</span><span>{number(active.registeredUsers)} registered total</span>{pinnedIndex === activeIndex && <em>PINNED</em>}</div>}
    </div>
    <div className="pai-chart-key"><span><i className="user" />New users</span><span><i className="referral" />Referral signups</span><small>{points[0]?.day} to {points.at(-1)?.day}</small></div>
  </article>;
}

function RevenueChart({ points }: { points: TrendPoint[] }) {
  const recent = points.slice(-Math.min(points.length, 45));
  const [activeDay, setActiveDay] = useState(recent.at(-1)?.day || '');
  useEffect(() => setActiveDay(recent.at(-1)?.day || ''), [points.length]);
  const max = Math.max(1, ...recent.map((point) => point.revenueCents));
  const active = recent.find((point) => point.day === activeDay) || recent.at(-1);
  return <article className="pai-chart pai-revenue-chart">
    <header><div><span>VERIFIED REVENUE</span><strong>Daily Base USDC receipts</strong></div><small>{active ? `${active.day} · ${money(active.revenueCents)}` : 'No receipts yet'}</small></header>
    <div className="pai-revenue-bars" role="group" aria-label="Interactive daily verified revenue">
      {recent.map((point) => <button type="button" key={point.day} className={point.day === active?.day ? 'active' : ''} style={{ height: `${Math.max(5, (point.revenueCents / max) * 100)}%` }} onPointerEnter={() => setActiveDay(point.day)} onPointerDown={() => setActiveDay(point.day)} onFocus={() => setActiveDay(point.day)} aria-label={`${point.day}: ${money(point.revenueCents)} verified revenue`}><span>{money(point.revenueCents)}</span></button>)}
    </div>
    <div className="pai-revenue-axis"><span>{recent[0]?.day}</span><span>{recent.at(-1)?.day}</span></div>
  </article>;
}

function ActivityBars({ data }: { data: Intelligence['activity'] }) {
  const max = Math.max(1, data.mau);
  return <article className="pai-panel pai-activity-bars">
    <header><div><span>ACTIVE USERS</span><strong>Rolling engagement windows</strong></div><small>Authenticated users</small></header>
    {([['DAU', data.dau], ['WAU', data.wau], ['MAU', data.mau]] as const).map(([label, value]) => <div className="pai-activity-row" key={label}><div><span>{label}</span><strong>{number(value)}</strong></div><i><b style={{ width: `${(value / max) * 100}%` }} /></i></div>)}
    <footer><span>DAU / MAU <strong>{percent(data.dauMau)}</strong></span><span>WAU / MAU <strong>{percent(data.wauMau)}</strong></span></footer>
  </article>;
}

function MetricCard({ label, value, note }: { label: string; value: string; note: string }) { return <article className="pai-metric-card"><span>{label}</span><strong>{value}</strong><small>{note}</small></article>; }
function VelocityCard({ label, metric, formatter = number }: { label: string; metric: VelocityMetric; formatter?: (value: number) => string }) {
  const tone = changeTone(metric.change);
  return <article className="pai-velocity-card"><div><span>{label}</span><strong>{formatter(metric.current)}</strong></div><b className={`pai-change ${tone}`}>{signedPercent(metric.change)}</b><small>Previous 30D: {formatter(metric.previous)}</small></article>;
}
function HistorySeries({ label, points, value, formatter }: { label: string; points: MonthlyHistoryPoint[]; value: (point: MonthlyHistoryPoint) => number; formatter: (value: number) => string }) {
  const max = Math.max(1, ...points.map(value));
  return <div className="pai-history-series"><div className="pai-history-series-title"><strong>{label}</strong><small>{formatter(value(points.at(-1) || { month: '', newUsers: 0, referrals: 0, revenueCents: 0 }))} this month</small></div><div className="pai-history-bars" role="group" aria-label={`${label} six month history`}>{points.map((point) => { const amount = value(point); return <div key={`${label}:${point.month}`} className="pai-history-column"><i><b style={{ height: `${Math.max(amount > 0 ? 8 : 2, (amount / max) * 100)}%` }} title={`${point.month}: ${formatter(amount)}`} /></i><span>{point.month.slice(5)}</span></div>; })}</div></div>;
}
function MonthlyHistoryChart({ points }: { points: MonthlyHistoryPoint[] }) {
  return <article className="pai-panel pai-history-panel"><header><div><span>6-MONTH OPERATING HISTORY</span><strong>Acquisition, referrals and verified revenue</strong></div><small>Calendar-month actuals</small></header><div className="pai-history-grid"><HistorySeries label="New users" points={points} value={(point) => point.newUsers} formatter={number} /><HistorySeries label="Referral signups" points={points} value={(point) => point.referrals} formatter={number} /><HistorySeries label="Verified revenue" points={points} value={(point) => point.revenueCents} formatter={money} /></div></article>;
}
function Progress({ actual, target, moneyMetric = false }: { actual: number; target: number | null; moneyMetric?: boolean }) {
  const ratio = target && target > 0 ? actual / target : null;
  return <div className="pai-target-progress"><div><span>{moneyMetric ? money(actual) : number(actual)} actual</span><span>{target === null ? 'No target' : `${moneyMetric ? money(target) : number(target)} target`}</span></div><i><b style={{ width: `${ratio === null ? 0 : Math.min(100, ratio * 100)}%` }} /></i><small>{ratio === null ? 'Set a target to measure progress' : `${(ratio * 100).toFixed(1)}% of target`}</small></div>;
}
function TargetAttainmentChart({ actuals, targets }: { actuals: Record<TargetMetric, number>; targets: Map<TargetMetric, GrowthTarget> }) {
  return <article className="pai-panel pai-attainment-panel"><header><div><span>TARGET ATTAINMENT</span><strong>Current month operating plan</strong></div><small>Actual vs internal target</small></header><div className="pai-attainment-list">{(Object.keys(metricLabels) as TargetMetric[]).map((metric) => { const target = targets.get(metric); const targetValue = target ? Number(target.target_value) : null; const actual = actuals[metric]; const ratio = targetValue && targetValue > 0 ? actual / targetValue : null; return <div className="pai-attainment-row" key={metric}><div><strong>{metricLabels[metric]}</strong><span>{metric === 'mrr_cents' ? money(actual) : number(actual)} actual · {targetValue === null ? 'target unset' : `${metric === 'mrr_cents' ? money(targetValue) : number(targetValue)} target`}</span></div><i><b style={{ width: `${ratio === null ? 0 : Math.min(100, ratio * 100)}%` }} /></i><small>{ratio === null ? 'N/A' : `${(ratio * 100).toFixed(1)}%`}</small></div>; })}</div></article>;
}

export default function AdminPlatformIntelligenceExperience() {
  const [range, setRange] = useState<RangeDays>(90);
  const [tab, setTab] = useState<Tab>('overview');
  const [data, setData] = useState<Intelligence | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [targetPeriod, setTargetPeriod] = useState('');
  const [targetMetric, setTargetMetric] = useState<TargetMetric>('registered_users');
  const [targetValue, setTargetValue] = useState('');
  const [targetNotes, setTargetNotes] = useState('Internal monthly growth target');

  async function load(nextRange = range) {
    setLoading(true);
    setMessage('');
    try {
      const result = await api<Intelligence>(`/api/admin/platform-intelligence?range=${nextRange}`);
      setData(result);
      setTargetPeriod((current) => current || result.growth.currentMonth);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Platform intelligence could not be loaded.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(range); }, [range]);

  async function mutate(path: string, body: unknown, key: string) {
    const token = csrf();
    if (!token) { setMessage('Security token is unavailable. Refresh Superadmin and try again.'); return false; }
    setBusy(key); setMessage('');
    try { await api(path, { method: 'POST', headers: { 'x-csrf-token': token }, body: JSON.stringify(body) }); await load(); return true; }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Private operation could not be saved.'); return false; }
    finally { setBusy(''); }
  }

  async function legacyRewardStatus(reward: Reward, status: 'paid' | 'void') {
    let paymentReference: string | null = null;
    if (status === 'paid') { paymentReference = window.prompt('Enter the payment reference, transaction hash, invoice reference, or internal settlement ID:')?.trim() || null; if (!paymentReference) return; }
    if (!window.confirm(status === 'paid' ? 'Mark this legacy discretionary reward as paid?' : 'Void this legacy discretionary reward?')) return;
    if (await mutate(`/api/admin/platform-intelligence/referral-rewards/${encodeURIComponent(reward.id)}/status`, { status, paymentReference }, `legacy:${status}:${reward.id}`)) setMessage(status === 'paid' ? 'Legacy reward marked paid.' : 'Legacy reward voided.');
  }

  async function saveTarget(event: React.FormEvent) {
    event.preventDefault();
    if (!targetValue.trim()) return;
    const raw = Number(targetValue);
    const normalized = targetMetric === 'mrr_cents' ? Math.round(raw * 100) : Math.round(raw);
    if (await mutate('/api/admin/platform-intelligence/growth-targets', { periodKey: targetPeriod, metricKey: targetMetric, targetValue: normalized, notes: targetNotes }, 'save-target')) { setMessage(`${metricLabels[targetMetric]} target saved for ${targetPeriod}.`); setTargetValue(''); }
  }

  const currentTargets = useMemo(() => { const map = new Map<TargetMetric, GrowthTarget>(); if (!data) return map; for (const target of data.growth.targets) if (target.period_key === data.growth.currentMonth) map.set(target.metric_key, target); return map; }, [data]);
  const legacyApprovedRewards = useMemo(() => data ? data.referrals.rewards.filter((reward) => reward.status === 'approved').sort((a, b) => (a.approvedAt || '').localeCompare(b.approvedAt || '')) : [], [data]);

  if (loading && !data) return <section className="pai-page"><div className="pai-loading">Loading platform intelligence…</div></section>;
  if (!data) return <section className="pai-page"><div className="pai-error">{message || 'Platform intelligence is unavailable.'}<button type="button" onClick={() => void load()}>Retry</button></div></section>;

  const targetActuals: Record<TargetMetric, number> = { registered_users: data.growth.totalUsers, mau: data.activity.mau, paid_accounts: data.financials.activePaidAccounts, mrr_cents: data.financials.mrrCents, referral_redemptions: data.growth.referralRedemptionsThisMonth };
  const revenuePerMau = data.activity.mau > 0 ? Math.round(data.financials.revenue30dCents / data.activity.mau) : null;
  const legacyPeopleWaiting = new Set(legacyApprovedRewards.map((reward) => reward.beneficiaryUserId)).size;
  const legacyOldestWaiting = legacyApprovedRewards.reduce<number | null>((oldest, reward) => { const days = waitingDays(reward.approvedAt, data.generatedAt); if (days === null) return oldest; return oldest === null ? days : Math.max(oldest, days); }, null);

  return <section className="pai-page">
    <header className="pai-page-head"><div><span>LINKARY OPERATING INTELLIGENCE</span><h1>Platform intelligence</h1><p>Private growth, revenue, activity and referral operations for Superadmin.</p></div><div className="pai-head-actions"><label>Range<select value={range} onChange={(event) => setRange(Number(event.target.value) as RangeDays)}><option value={30}>30 days</option><option value={90}>90 days</option><option value={180}>180 days</option></select></label><button type="button" onClick={() => void load()} disabled={loading}>Refresh</button></div></header>

    {!data.privateOpsReady && <div className="pai-migration-note"><strong>Read-only intelligence is live.</strong><span>Production migration 0044 is required before private legacy rewards and growth targets can be saved.</span></div>}
    {message && <div className="pai-message" role="status">{message}</div>}

    <nav className="pai-tabs" aria-label="Platform intelligence sections"><button type="button" className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>Overview & financials</button><button type="button" className={tab === 'referrals' ? 'active' : ''} onClick={() => setTab('referrals')}>Referral operations</button><button type="button" className={tab === 'growth-plan' ? 'active' : ''} onClick={() => setTab('growth-plan')}>Growth plan</button></nav>

    <div className="pai-kpis"><MetricCard label="DAU" value={compact(data.activity.dau)} note="Rolling 24 hours" /><MetricCard label="WAU" value={compact(data.activity.wau)} note="Rolling 7 days" /><MetricCard label="MAU" value={compact(data.activity.mau)} note="Rolling 30 days" /><MetricCard label="MRR" value={money(data.financials.mrrCents)} note={`${number(data.financials.activePaidAccounts)} paid accounts`} /><MetricCard label="Revenue · 30D" value={money(data.financials.revenue30dCents)} note="Verified receipts" /><MetricCard label="Legacy rewards" value={money(data.referrals.rewardSummary.approvedCents)} note="Older discretionary records only" /></div>

    {tab === 'overview' && <>
      <article className="pai-panel pai-executive-pulse"><header><div><span>EXECUTIVE PULSE</span><strong>Platform conversion and engagement</strong></div><small>Recorded actuals only</small></header><div className="pai-pulse-grid"><MetricCard label="Profile activation" value={percent(data.growth.profileActivationRate)} note="Active profiles / registered users" /><MetricCard label="Paid conversion" value={percent(data.growth.paidConversionRate)} note="Paid accounts / registered users" /><MetricCard label="Referral contribution" value={percent(data.growth.referralContribution30d)} note="Referred users / new users · 30D" /><MetricCard label="DAU / MAU" value={percent(data.activity.dauMau)} note="Daily stickiness" /><MetricCard label="WAU / MAU" value={percent(data.activity.wauMau)} note="Weekly stickiness" /></div></article>
      <article className="pai-panel pai-velocity-panel"><header><div><span>GROWTH VELOCITY</span><strong>Latest 30 days vs preceding 30 days</strong></div><small>N/A when the prior period is zero</small></header><div className="pai-velocity-grid"><VelocityCard label="New users" metric={data.growth.velocity.newUsers} /><VelocityCard label="Referral signups" metric={data.growth.velocity.referrals} /><VelocityCard label="Verified revenue" metric={data.growth.velocity.revenueCents} formatter={money} /></div></article>
      <div className="pai-chart-grid"><AcquisitionChart points={data.growth.trend} /><RevenueChart points={data.growth.trend} /></div>
      <div className="pai-overview-grid"><ActivityBars data={data.activity} /><article className="pai-panel pai-financial-ratios"><header><div><span>FINANCIAL RATIOS</span><strong>Commercial health from recorded billing</strong></div><small>Actuals only</small></header><div className="pai-ratio-grid"><MetricCard label="ARPA" value={money(data.financials.arpaCents)} note="MRR / paid accounts" /><MetricCard label="Paid account share" value={percent(data.financials.paidAccountShare)} note="Paid accounts / active profiles" /><MetricCard label="Revenue / MAU" value={money(revenuePerMau)} note="30D revenue / MAU" /><MetricCard label="Discount rate" value={percent(data.financials.discountRate30d)} note="Paid checkouts · 30D" /><MetricCard label="Reversal ratio" value={percent(data.financials.reversalRate)} note="Refunded + reversed payment value" /><MetricCard label="Free passes" value={number(data.financials.freePassRedemptions30d)} note="100% coupon redemptions · 30D" /></div></article></div>
      <MonthlyHistoryChart points={data.growth.monthlyHistory} />
      <div className="pai-methodology"><strong>Measurement rules</strong><p>{data.activity.methodology}</p><p>{data.financials.methodology}</p><p>{data.growth.methodology}</p><p>Cost-based metrics such as gross margin, burn, CAC and LTV are intentionally not invented. We can add them once actual operating costs and attributable acquisition spend are recorded.</p></div>
    </>}

    {tab === 'referrals' && <>
      <div className="pai-private-banner"><div><span>PRIVATE OPERATIONS</span><strong>Referral reward intelligence stays inside Superadmin</strong></div><p>Automatic estimates are based on verified paid direct referrals only. Free access produces $0, seven-generation descendants do not create downstream payouts, and no amount becomes payable without Superadmin approval.</p></div>
      <AdminReferralRewardsPanel />
      {data.referrals.funnel && <article className="pai-panel pai-funnel"><header><div><span>REFERRAL FUNNEL · 30D</span><strong>From invite traffic to accepted network members</strong></div><small>Indexed, date-bounded</small></header><div className="pai-funnel-grid"><MetricCard label="Invite clicks" value={number(data.referrals.funnel.inviteClicks)} note={`${number(data.referrals.funnel.uniqueVisitors)} unique visitors`} /><MetricCard label="Redemptions" value={number(data.referrals.funnel.redemptions)} note={`${percent(data.referrals.funnel.clickToRedemption)} click conversion`} /><MetricCard label="Accepted network" value={number(data.referrals.funnel.acceptedReferrals)} note="Canonical referral edges" /></div></article>}
      <article className="pai-panel pai-leaderboard"><header><div><span>7-GENERATION NETWORK ANALYTICS</span><strong>Network reach, not downstream reward entitlement</strong></div><small>Top 75 inviters</small></header><div className="pai-table-wrap"><table><thead><tr><th>User</th><th>Direct</th><th>7-gen network</th><th>Last 30D</th><th>Last referral</th></tr></thead><tbody>{data.referrals.leaders.length ? data.referrals.leaders.map((leader) => <tr key={leader.userId}><td><strong>{leader.displayName}</strong><small>{leader.username ? `@${leader.username}` : leader.userId}</small></td><td>{number(leader.directReferrals)}</td><td>{number(leader.networkSize)}</td><td>{number(leader.referrals30d)}</td><td>{shortDate(leader.lastReferralAt)}</td></tr>) : <tr><td colSpan={5}>No referral network activity recorded yet.</td></tr>}</tbody></table></div></article>

      {data.referrals.rewards.length > 0 && <article className="pai-panel pai-reward-ledger"><header><div><span>LEGACY DISCRETIONARY REWARDS</span><strong>Historical manual records created before automatic reward intelligence</strong></div><small>{money(data.referrals.rewardSummary.approvedCents)} still approved · {legacyPeopleWaiting} people</small></header>{legacyApprovedRewards.length > 0 && <div className="pai-payables-summary"><MetricCard label="Legacy to pay" value={money(data.referrals.rewardSummary.approvedCents)} note="Older manual records" /><MetricCard label="People waiting" value={number(legacyPeopleWaiting)} note={`${number(legacyApprovedRewards.length)} records`} /><MetricCard label="Oldest waiting" value={legacyOldestWaiting === null ? 'N/A' : `${legacyOldestWaiting}d`} note="Since approval" /></div>}<div className="pai-table-wrap"><table><thead><tr><th>User</th><th>Period</th><th>Amount</th><th>Evidence snapshot</th><th>Status</th><th>Action</th></tr></thead><tbody>{data.referrals.rewards.map((reward) => <tr key={reward.id}><td><strong>{reward.displayName}</strong><small>{reward.username ? `@${reward.username}` : reward.beneficiaryUserId}</small></td><td>{reward.periodKey}</td><td>{money(reward.amountCents)}</td><td><small>{number(reward.evidence.directReferrals || 0)} direct · {number(reward.evidence.networkSize || 0)} network</small></td><td><span className={`pai-status ${reward.status}`}>{reward.status}</span>{reward.paymentReference && <small>{reward.paymentReference}</small>}</td><td><div className="pai-row-actions">{reward.status === 'approved' && <><button type="button" onClick={() => void legacyRewardStatus(reward, 'paid')} disabled={Boolean(busy)}>Mark paid</button><button type="button" onClick={() => void legacyRewardStatus(reward, 'void')} disabled={Boolean(busy)}>Void</button></>}</div></td></tr>)}</tbody></table></div></article>}
    </>}

    {tab === 'growth-plan' && <>
      <div className="pai-plan-head"><div><span>MONTHLY OPERATING PLAN</span><h2>{data.growth.currentMonth} growth targets</h2><p>Set internal targets, then compare them with measured platform actuals. Missing targets stay visibly unset.</p></div><MetricCard label="Registered users" value={number(data.growth.totalUsers)} note={`${number(data.growth.activeProfiles)} active profiles`} /></div>
      <TargetAttainmentChart actuals={targetActuals} targets={currentTargets} />
      <div className="pai-target-grid">{(Object.keys(metricLabels) as TargetMetric[]).map((metric) => { const target = currentTargets.get(metric); return <article className="pai-panel pai-target-card" key={metric}><header><span>{metricLabels[metric]}</span><strong>{metric === 'mrr_cents' ? money(targetActuals[metric]) : number(targetActuals[metric])}</strong></header><Progress actual={targetActuals[metric]} target={target ? Number(target.target_value) : null} moneyMetric={metric === 'mrr_cents'} />{target?.notes && <p>{target.notes}</p>}</article>; })}</div>
      <form className="pai-panel pai-target-form" onSubmit={(event) => void saveTarget(event)}><header><div><span>SET OR UPDATE TARGET</span><strong>Internal growth plan</strong></div><small>Audited change</small></header><div className="pai-form-grid"><label>Month<input type="month" value={targetPeriod} onChange={(event) => setTargetPeriod(event.target.value)} required /></label><label>Metric<select value={targetMetric} onChange={(event) => setTargetMetric(event.target.value as TargetMetric)}>{(Object.keys(metricLabels) as TargetMetric[]).map((metric) => <option key={metric} value={metric}>{metricLabels[metric]}</option>)}</select></label><label>Target {targetMetric === 'mrr_cents' ? '· USD' : ''}<input type="number" min="0" step={targetMetric === 'mrr_cents' ? '0.01' : '1'} value={targetValue} onChange={(event) => setTargetValue(event.target.value)} required /></label><label className="wide">Notes<input value={targetNotes} onChange={(event) => setTargetNotes(event.target.value)} maxLength={240} /></label></div><button type="submit" disabled={busy === 'save-target' || !data.privateOpsReady}>{busy === 'save-target' ? 'Saving…' : 'Save growth target'}</button></form>
      <MonthlyHistoryChart points={data.growth.monthlyHistory} />
      <div className="pai-chart-grid"><AcquisitionChart points={data.growth.trend} /><RevenueChart points={data.growth.trend} /></div>
    </>}

    <footer className="pai-page-foot">Generated {new Date(data.generatedAt).toLocaleString()} · Superadmin data is private and noindexed.</footer>
  </section>;
}
