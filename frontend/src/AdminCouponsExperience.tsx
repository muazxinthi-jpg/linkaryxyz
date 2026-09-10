import { useEffect, useMemo, useState } from 'react';
import './admin-coupons.css';

type Plan = { code: string; name: string; base_price_cents: number };
type Coupon = {
  id: string; code: string; label: string;
  discountType: 'percent' | 'fixed_cents' | 'fixed_price_cents';
  discountValue: number; eligiblePlanCodes: string[];
  maxRedemptions: number | null; maxRedemptionsPerAccount: number;
  startsAt: string | null; endsAt: string | null; accessUntil: string | null; accessDurationMonths: number | null;
  active: boolean; stackable: boolean; redeemedCount: number; reservedCount: number;
};
type CouponResponse = {
  plans: Plan[]; coupons: Coupon[]; supportsAccessUntil: boolean; supportsAccessDuration: boolean;
};
type Draft = {
  code: string; label: string; discountType: Coupon['discountType']; discountValue: string;
  eligiblePlanCodes: string[]; maxRedemptions: string; maxRedemptionsPerAccount: string;
  startsAt: string; endsAt: string; accessUntil: string; accessDurationMonths: string; stackable: boolean;
};

const blankDraft = (): Draft => ({
  code: '', label: '', discountType: 'percent', discountValue: '20', eligiblePlanCodes: [],
  maxRedemptions: '', maxRedemptionsPerAccount: '1', startsAt: '', endsAt: '', accessUntil: '', accessDurationMonths: '', stackable: false,
});

function cookie(name: string): string | null {
  const item = document.cookie.split(';').map((value) => value.trim()).find((value) => value.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : null;
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', ...init });
  const payload = await response.json().catch(() => ({})) as T & { message?: string };
  if (!response.ok) throw new Error(payload.message || 'Request failed');
  return payload;
}

const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const localDate = (value: string | null) => value ? new Date(value).toLocaleString() : 'No expiry';
const isFreeCoupon = (discountType: Coupon['discountType'], discountValue: string | number) => discountType === 'percent' && Number(discountValue) === 100;
const discountLabel = (coupon: Coupon) => isFreeCoupon(coupon.discountType, coupon.discountValue)
  ? 'Free access pass'
  : coupon.discountType === 'percent'
    ? `${coupon.discountValue}% off`
    : coupon.discountType === 'fixed_cents' ? `${money(coupon.discountValue)} off` : `${money(coupon.discountValue)} final price`;
const accessLabel = (coupon: Coupon) => coupon.accessDurationMonths
  ? `${coupon.accessDurationMonths} month${coupon.accessDurationMonths === 1 ? '' : 's'} from claim`
  : coupon.accessUntil
    ? `until ${localDate(coupon.accessUntil)}`
    : 'one billing period from redemption';

export default function AdminCouponsExperience() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [supportsAccessUntil, setSupportsAccessUntil] = useState(false);
  const [supportsAccessDuration, setSupportsAccessDuration] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => blankDraft());
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    setState('loading');
    try {
      const result = await apiJson<CouponResponse>('/api/admin/commercial/coupons');
      setPlans(result.plans || []);
      setCoupons(result.coupons || []);
      setSupportsAccessUntil(Boolean(result.supportsAccessUntil));
      setSupportsAccessDuration(Boolean(result.supportsAccessDuration));
      setDraft((current) => current.eligiblePlanCodes.length ? current : { ...current, eligiblePlanCodes: (result.plans || []).map((plan) => plan.code) });
      setState('ready');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Coupon management is temporarily unavailable.');
      setState('error');
    }
  }

  useEffect(() => { void load(); }, []);
  const activeCoupons = useMemo(() => coupons.filter((coupon) => coupon.active).length, [coupons]);
  const draftIsFreeCoupon = isFreeCoupon(draft.discountType, draft.discountValue);
  const allPlansSelected = plans.length > 0 && draft.eligiblePlanCodes.length === plans.length;

  function togglePlan(code: string) {
    setDraft((current) => ({ ...current, eligiblePlanCodes: current.eligiblePlanCodes.includes(code)
      ? current.eligiblePlanCodes.filter((item) => item !== code)
      : [...current.eligiblePlanCodes, code] }));
  }

  async function createCoupon(event: React.FormEvent) {
    event.preventDefault();
    const csrf = cookie('__Host-linkary_csrf');
    if (!csrf) { setMessage('Your admin session needs to be refreshed.'); return; }
    const raw = Number(draft.discountValue);
    if (!Number.isFinite(raw) || raw <= 0) { setMessage('Enter a valid discount value.'); return; }
    if (draft.discountType === 'percent' && raw > 100) { setMessage('Percentage discount cannot exceed 100%.'); return; }
    const type = draft.discountType;
    const value = type === 'percent' ? Math.round(raw) : Math.round(raw * 100);
    const freeCoupon = isFreeCoupon(type, value);
    const duration = draft.accessDurationMonths ? Number(draft.accessDurationMonths) : null;
    if (duration !== null && (!Number.isInteger(duration) || duration < 1 || duration > 60)) {
      setMessage('Free access duration must be between 1 and 60 whole months.'); return;
    }
    setBusy('create');
    setMessage('');
    try {
      await apiJson('/api/admin/commercial/coupons', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({
          code: draft.code, label: draft.label, discountType: type, discountValue: value,
          eligiblePlanCodes: draft.eligiblePlanCodes, maxRedemptions: draft.maxRedemptions || null,
          maxRedemptionsPerAccount: draft.maxRedemptionsPerAccount || '1', startsAt: draft.startsAt || null,
          endsAt: draft.endsAt || null,
          accessDurationMonths: supportsAccessDuration && freeCoupon ? duration : null,
          accessUntil: supportsAccessUntil && freeCoupon && !duration ? draft.accessUntil || null : null,
          stackable: draft.stackable,
        }),
      });
      setMessage(freeCoupon
        ? duration && supportsAccessDuration
          ? `100% coupon created. Free access pass grants ${duration} month${duration === 1 ? '' : 's'} from each account's claim time, with monthly plan credits.`
          : draft.accessUntil && supportsAccessUntil
            ? '100% coupon created. Free access pass uses the configured fixed expiry with no USDC payment.'
            : '100% coupon created. Each redemption grants one paid billing period with no USDC payment.'
        : 'Coupon created. It is active for eligible checkout quotes.');
      setDraft({ ...blankDraft(), eligiblePlanCodes: plans.map((plan) => plan.code) });
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Coupon could not be created.');
    } finally { setBusy(''); }
  }

  async function setCouponActive(coupon: Coupon, active: boolean) {
    const csrf = cookie('__Host-linkary_csrf');
    if (!csrf) { setMessage('Your admin session needs to be refreshed.'); return; }
    setBusy(coupon.id);
    try {
      await apiJson(`/api/admin/commercial/coupons/${encodeURIComponent(coupon.id)}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ active }),
      });
      setMessage(active ? `${coupon.code} activated.` : `${coupon.code} deactivated.`);
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Coupon status could not be changed.'); }
    finally { setBusy(''); }
  }

  async function setCouponAccessDuration(coupon: Coupon) {
    if (!supportsAccessDuration || !isFreeCoupon(coupon.discountType, coupon.discountValue) || coupon.accessUntil) return;
    const requested = window.prompt(
      `Free access duration for ${coupon.code}, in whole months from each account's claim time. Enter 1-60. Leave blank to reset to one billing period.`,
      coupon.accessDurationMonths ? String(coupon.accessDurationMonths) : '12',
    );
    if (requested === null) return;
    const trimmed = requested.trim();
    const durationMonths = trimmed === '' ? null : Number(trimmed);
    if (durationMonths !== null && (!Number.isInteger(durationMonths) || durationMonths < 1 || durationMonths > 60)) {
      setMessage('Access duration must be between 1 and 60 whole months.');
      return;
    }
    const policy = durationMonths === null ? 'one billing period from redemption' : `${durationMonths} month${durationMonths === 1 ? '' : 's'} from each claim`;
    if (!window.confirm(`Set ${coupon.code} free access to ${policy}? This changes future redemptions only.`)) return;
    const csrf = cookie('__Host-linkary_csrf');
    if (!csrf) { setMessage('Your admin session needs to be refreshed.'); return; }
    const busyKey = `duration:${coupon.id}`;
    setBusy(busyKey);
    setMessage('');
    try {
      await apiJson(`/api/admin/commercial/coupons/${encodeURIComponent(coupon.id)}/access-duration`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ durationMonths }),
      });
      setMessage(`${coupon.code} free-access policy saved as ${policy}.`);
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Coupon access duration could not be changed.'); }
    finally { setBusy(''); }
  }

  async function setCouponAccessUntil(coupon: Coupon) {
    if (!supportsAccessUntil || !isFreeCoupon(coupon.discountType, coupon.discountValue) || coupon.accessDurationMonths) return;
    const requested = window.prompt(
      `Fixed Access until for ${coupon.code}, as an ISO 8601 timestamp including timezone. Example: 2028-12-31T23:59:59.000Z`,
      coupon.accessUntil || '',
    );
    if (requested === null) return;
    const trimmed = requested.trim();
    if (!/(Z|[+-]\d{2}:\d{2})$/i.test(trimmed)) {
      setMessage('Access until must include an explicit timezone, for example 2028-12-31T23:59:59.000Z.');
      return;
    }
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) { setMessage('Enter a valid Access until timestamp.'); return; }
    const accessUntil = parsed.toISOString();
    if (!window.confirm(`Set ${coupon.code} fixed entitlement expiry to ${accessUntil}? Only future redemptions use this value.`)) return;
    const csrf = cookie('__Host-linkary_csrf');
    if (!csrf) { setMessage('Your admin session needs to be refreshed.'); return; }
    const busyKey = `access:${coupon.id}`;
    setBusy(busyKey);
    setMessage('');
    try {
      await apiJson(`/api/admin/commercial/coupons/${encodeURIComponent(coupon.id)}/access-until`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ accessUntil }),
      });
      setMessage(`${coupon.code} Access until saved as ${accessUntil}.`);
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Coupon Access until could not be changed.'); }
    finally { setBusy(''); }
  }

  return <main className="admin-coupons-page">
    <header className="admin-coupons-topbar">
      <a className="admin-coupons-brand" href="/admin/readiness">Linkary Superadmin</a>
      <nav aria-label="Superadmin commercial navigation"><a href="/admin/readiness">Readiness</a><a href="/admin/commercial">Accounts</a><a className="active" href="/admin/coupons">Coupons</a></nav>
      <a className="admin-coupons-exit" href="/dashboard">Back to Linkary</a>
    </header>
    <div className="admin-coupons-shell">
      <section className="admin-coupons-heading">
        <div><span>COMMERCIAL CONTROL</span><h1>Coupons & free access</h1><p>Create normal checkout discounts or tracked free-access passes. Superadmin may issue 100% coupons for tracked free access, with claim timing kept separate from entitlement expiry. A free pass can grant a set number of months from each user's claim time, a fixed calendar expiry, or the legacy one billing period.</p></div>
        <div className="admin-coupons-summary"><article><small>Coupons</small><strong>{coupons.length}</strong></article><article><small>Active</small><strong>{activeCoupons}</strong></article></div>
      </section>
      {message && <div className="admin-coupons-message">{message}</div>}
      <div className="admin-coupons-layout">
        <section className="admin-coupons-card">
          <div className="admin-coupons-section-head"><div><span>NEW CODE</span><h2>Create coupon or free pass</h2></div><small>All terms are audited.</small></div>
          <form className="admin-coupons-form" onSubmit={createCoupon}>
            <div className="admin-coupons-two">
              <label>Coupon code<input required maxLength={40} value={draft.code} placeholder="LINKARYFOUNDERS" onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase().replace(/\s+/g, '') })} /></label>
              <label>Internal label<input required maxLength={100} value={draft.label} placeholder="Founder 12-month access" onChange={(e) => setDraft({ ...draft, label: e.target.value })} /></label>
            </div>
            <div className="admin-coupons-two">
              <label>Discount type<select value={draft.discountType} onChange={(e) => setDraft({ ...draft, discountType: e.target.value as Coupon['discountType'], discountValue: e.target.value === 'percent' ? '20' : '1.00', accessUntil: '', accessDurationMonths: '' })}><option value="percent">Percent off</option><option value="fixed_cents">Fixed USD amount off</option><option value="fixed_price_cents">Final monthly price</option></select></label>
              <label>{draft.discountType === 'percent' ? 'Percent' : 'USD amount'}<input required type="number" min={draft.discountType === 'percent' ? '1' : '0.01'} max={draft.discountType === 'percent' ? '100' : undefined} step={draft.discountType === 'percent' ? '1' : '0.01'} value={draft.discountValue} onChange={(e) => setDraft({ ...draft, discountValue: e.target.value, accessUntil: e.target.value === '100' ? draft.accessUntil : '', accessDurationMonths: e.target.value === '100' ? draft.accessDurationMonths : '' })} /></label>
            </div>
            <div className="admin-coupons-actions" role="group" aria-label="Eligible plan selection">
              <button type="button" disabled={!plans.length || allPlansSelected} onClick={() => setDraft((current) => ({ ...current, eligiblePlanCodes: plans.map((plan) => plan.code) }))}>Select all plans</button>
              <button type="button" disabled={!draft.eligiblePlanCodes.length} onClick={() => setDraft((current) => ({ ...current, eligiblePlanCodes: [] }))}>Clear all</button>
            </div>
            <fieldset className="admin-coupons-plans"><legend>Eligible paid plans</legend>{plans.map((plan) => <label key={plan.code}><input type="checkbox" checked={draft.eligiblePlanCodes.includes(plan.code)} onChange={() => togglePlan(plan.code)} /><span><strong>{plan.name}</strong><small>{money(plan.base_price_cents)} / month</small></span></label>)}</fieldset>
            <div className="admin-coupons-two">
              <label>Total redemption limit <small>(blank = unlimited)</small><input type="number" min="1" step="1" value={draft.maxRedemptions} placeholder="100" onChange={(e) => setDraft({ ...draft, maxRedemptions: e.target.value })} /></label>
              <label>Per-account limit<input required type="number" min="1" step="1" value={draft.maxRedemptionsPerAccount} onChange={(e) => setDraft({ ...draft, maxRedemptionsPerAccount: e.target.value })} /></label>
            </div>
            <div className="admin-coupons-two">
              <label>Starts <small>(blank = now)</small><input type="datetime-local" value={draft.startsAt} onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })} /></label>
              <label>Claim ends <small>(blank = no expiry)</small><input type="datetime-local" value={draft.endsAt} onChange={(e) => setDraft({ ...draft, endsAt: e.target.value })} /></label>
            </div>
            {supportsAccessDuration && draftIsFreeCoupon && <label>Free access duration <small>(months from each user's claim time, blank = one billing period)</small><input type="number" min="1" max="60" step="1" value={draft.accessDurationMonths} placeholder="12" onChange={(e) => setDraft({ ...draft, accessDurationMonths: e.target.value, accessUntil: e.target.value ? '' : draft.accessUntil })} /></label>}
            {supportsAccessUntil && draftIsFreeCoupon && !draft.accessDurationMonths && <label>Fixed Access until <small>(alternative to duration from claim)</small><input type="datetime-local" value={draft.accessUntil} onChange={(e) => setDraft({ ...draft, accessUntil: e.target.value })} /></label>}
            <label className="admin-coupons-check"><input type="checkbox" checked={draft.stackable} onChange={(e) => setDraft({ ...draft, stackable: e.target.checked })} /><span><strong>Allow stacking</strong><small>Coupon can combine with another eligible promotion or private account price adjustment.</small></span></label>
            <div className="admin-coupons-warning">Claim end controls when a code may be redeemed. For a 100% coupon, Access until controls the fixed entitlement expiry when configured. Duration from claim instead starts a separate access clock for each account when they redeem. Example: 12 months claimed on 10 Sep 2026 stays active until 10 Sep 2027. Plan usage credits refresh each entitlement month. Leaving both blank keeps the existing one paid billing-period grant. No fake $0 onchain payment is created.</div>
            <button className="admin-coupons-primary" disabled={busy === 'create' || state !== 'ready'}>{busy === 'create' ? 'Creating…' : draftIsFreeCoupon ? 'Create free access pass' : 'Create coupon'}</button>
          </form>
        </section>
        <section className="admin-coupons-card admin-coupons-list-card">
          <div className="admin-coupons-section-head"><div><span>LIVE CODES</span><h2>Manage coupons</h2></div><button type="button" className="admin-coupons-refresh" onClick={() => void load()} disabled={state === 'loading'}>{state === 'loading' ? 'Loading…' : 'Refresh'}</button></div>
          {state === 'error' && <div className="admin-coupons-empty">Coupon data could not be loaded.</div>}
          {state === 'ready' && !coupons.length && <div className="admin-coupons-empty">No coupons yet. Create the first controlled discount code.</div>}
          <div className="admin-coupons-list">{coupons.map((coupon) => {
            const accessBusy = busy === `access:${coupon.id}`;
            const durationBusy = busy === `duration:${coupon.id}`;
            const statusBusy = busy === coupon.id;
            const freeCoupon = isFreeCoupon(coupon.discountType, coupon.discountValue);
            return <article key={coupon.id} className={coupon.active ? '' : 'inactive'}>
              <div className="admin-coupons-code"><strong>{coupon.code}</strong><span className={coupon.active ? 'active' : 'inactive'}>{coupon.active ? 'Active' : 'Inactive'}</span></div>
              <h3>{coupon.label}</h3><div className="admin-coupons-discount">{discountLabel(coupon)}</div>
              <div className="admin-coupons-meta"><span><b>{coupon.redeemedCount}</b> redeemed</span><span><b>{coupon.reservedCount}</b> reserved</span><span><b>{coupon.maxRedemptions ?? '∞'}</b> total limit</span><span><b>{coupon.maxRedemptionsPerAccount}</b> per account</span></div>
              <div className="admin-coupons-plan-tags">{coupon.eligiblePlanCodes.map((code) => <span key={code}>{plans.find((plan) => plan.code === code)?.name || code}</span>)}</div>
              <small>Starts {localDate(coupon.startsAt)} · Claim ends {localDate(coupon.endsAt)}{freeCoupon ? ` · Free access ${accessLabel(coupon)}` : ''} · {coupon.stackable ? 'Stackable' : 'Not stackable'}</small>
              <div className="admin-coupons-actions">
                {supportsAccessDuration && freeCoupon && !coupon.accessUntil && <button type="button" disabled={durationBusy || statusBusy || accessBusy} onClick={() => void setCouponAccessDuration(coupon)}>{durationBusy ? 'Saving duration…' : coupon.accessDurationMonths ? 'Edit duration' : 'Set duration from claim'}</button>}
                {supportsAccessUntil && freeCoupon && !coupon.accessDurationMonths && <button type="button" disabled={accessBusy || statusBusy || durationBusy} onClick={() => void setCouponAccessUntil(coupon)}>{accessBusy ? 'Saving expiry…' : 'Set fixed expiry'}</button>}
                <button type="button" disabled={statusBusy || accessBusy || durationBusy} onClick={() => void setCouponActive(coupon, !coupon.active)}>{statusBusy ? 'Saving…' : coupon.active ? 'Deactivate' : 'Activate'}</button>
              </div>
            </article>;
          })}</div>
        </section>
      </div>
    </div>
  </main>;
}