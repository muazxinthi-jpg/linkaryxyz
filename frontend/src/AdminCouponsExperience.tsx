import { useEffect, useMemo, useState } from 'react';
import './admin-coupons.css';

type Plan = {
  code: string;
  name: string;
  base_price_cents: number;
};

type Coupon = {
  id: string;
  code: string;
  label: string;
  discountType: 'percent' | 'fixed_cents' | 'fixed_price_cents';
  discountValue: number;
  eligiblePlanCodes: string[];
  maxRedemptions: number | null;
  maxRedemptionsPerAccount: number;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  stackable: boolean;
  redeemedCount: number;
  reservedCount: number;
  createdAt: string;
  updatedAt: string;
};

type CouponResponse = { plans: Plan[]; coupons: Coupon[] };

type Draft = {
  code: string;
  label: string;
  discountType: Coupon['discountType'];
  discountValue: string;
  eligiblePlanCodes: string[];
  maxRedemptions: string;
  maxRedemptionsPerAccount: string;
  startsAt: string;
  endsAt: string;
  stackable: boolean;
};

function emptyDraft(): Draft {
  return {
    code: '',
    label: '',
    discountType: 'percent',
    discountValue: '20',
    eligiblePlanCodes: [],
    maxRedemptions: '',
    maxRedemptionsPerAccount: '1',
    startsAt: '',
    endsAt: '',
    stackable: false,
  };
}

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

function money(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function discountLabel(coupon: Coupon): string {
  if (coupon.discountType === 'percent') return `${coupon.discountValue}% off`;
  if (coupon.discountType === 'fixed_cents') return `${money(coupon.discountValue)} off`;
  return `${money(coupon.discountValue)} final price`;
}

function localDate(value: string | null): string {
  if (!value) return 'No expiry';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function AdminCouponsExperience() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft());
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    setState('loading');
    setMessage('');
    try {
      const result = await apiJson<CouponResponse>('/api/admin/commercial/coupons');
      setPlans(result.plans || []);
      setCoupons(result.coupons || []);
      setDraft((current) => current.eligiblePlanCodes.length ? current : { ...current, eligiblePlanCodes: (result.plans || []).map((plan) => plan.code) });
      setState('ready');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Coupon management is temporarily unavailable.');
      setState('error');
    }
  }

  useEffect(() => { void load(); }, []);

  const activeCoupons = useMemo(() => coupons.filter((coupon) => coupon.active).length, [coupons]);

  function togglePlan(code: string) {
    setDraft((current) => ({
      ...current,
      eligiblePlanCodes: current.eligiblePlanCodes.includes(code)
        ? current.eligiblePlanCodes.filter((item) => item !== code)
        : [...current.eligiblePlanCodes, code],
    }));
  }

  async function createCoupon(event: React.FormEvent) {
    event.preventDefault();
    const csrf = cookie('__Host-linkary_csrf');
    if (!csrf) { setMessage('Your admin session needs to be refreshed.'); return; }
    const rawValue = Number(draft.discountValue);
    if (!Number.isFinite(rawValue) || rawValue <= 0) { setMessage('Enter a valid discount value.'); return; }
    const discountValue = draft.discountType === 'percent' ? Math.round(rawValue) : Math.round(rawValue * 100);
    setBusy('create');
    setMessage('');
    try {
      await apiJson('/api/admin/commercial/coupons', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({
          code: draft.code,
          label: draft.label,
          discountType: draft.discountType,
          discountValue,
          eligiblePlanCodes: draft.eligiblePlanCodes,
          maxRedemptions: draft.maxRedemptions || null,
          maxRedemptionsPerAccount: draft.maxRedemptionsPerAccount || '1',
          startsAt: draft.startsAt || null,
          endsAt: draft.endsAt || null,
          stackable: draft.stackable,
        }),
      });
      setDraft({ ...emptyDraft(), eligiblePlanCodes: plans.map((plan) => plan.code) });
      setMessage('Coupon created. It is active for eligible checkout quotes.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Coupon could not be created.');
    } finally {
      setBusy('');
    }
  }

  async function setCouponActive(coupon: Coupon, active: boolean) {
    const csrf = cookie('__Host-linkary_csrf');
    if (!csrf) { setMessage('Your admin session needs to be refreshed.'); return; }
    setBusy(coupon.id);
    setMessage('');
    try {
      await apiJson(`/api/admin/commercial/coupons/${encodeURIComponent(coupon.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ active }),
      });
      setMessage(active ? `${coupon.code} activated.` : `${coupon.code} deactivated.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Coupon status could not be changed.');
    } finally {
      setBusy('');
    }
  }

  return (
    <main className="admin-coupons-page">
      <header className="admin-coupons-topbar">
        <a className="admin-coupons-brand" href="/admin/readiness">Linkary Superadmin</a>
        <nav aria-label="Superadmin commercial navigation">
          <a href="/admin/readiness">Readiness</a>
          <a href="/admin/commercial">Accounts</a>
          <a className="active" href="/admin/coupons">Coupons</a>
        </nav>
        <a className="admin-coupons-exit" href="/dashboard">Back to Linkary</a>
      </header>

      <div className="admin-coupons-shell">
        <section className="admin-coupons-heading">
          <div><span>COMMERCIAL CONTROL</span><h1>Discount coupons</h1><p>Create controlled checkout discounts without changing plan prices or granting hidden access. Free or 100% comped access belongs in Superadmin entitlement grants.</p></div>
          <div className="admin-coupons-summary"><article><small>Coupons</small><strong>{coupons.length}</strong></article><article><small>Active</small><strong>{activeCoupons}</strong></article></div>
        </section>

        {message && <div className="admin-coupons-message">{message}</div>}

        <div className="admin-coupons-layout">
          <section className="admin-coupons-card">
            <div className="admin-coupons-section-head"><div><span>NEW COUPON</span><h2>Create discount code</h2></div><small>All terms are audited.</small></div>
            <form className="admin-coupons-form" onSubmit={createCoupon}>
              <div className="admin-coupons-two">
                <label>Coupon code<input required maxLength={40} value={draft.code} placeholder="BETA20" onChange={(event) => setDraft({ ...draft, code: event.target.value.toUpperCase().replace(/\s+/g, '') })} /></label>
                <label>Internal label<input required maxLength={100} value={draft.label} placeholder="Controlled Beta 20%" onChange={(event) => setDraft({ ...draft, label: event.target.value })} /></label>
              </div>
              <div className="admin-coupons-two">
                <label>Discount type<select value={draft.discountType} onChange={(event) => setDraft({ ...draft, discountType: event.target.value as Coupon['discountType'], discountValue: event.target.value === 'percent' ? '20' : '1.00' })}><option value="percent">Percent off</option><option value="fixed_cents">Fixed USD amount off</option><option value="fixed_price_cents">Final monthly price</option></select></label>
                <label>{draft.discountType === 'percent' ? 'Percent' : 'USD amount'}<input required type="number" min="0.01" step={draft.discountType === 'percent' ? '1' : '0.01'} value={draft.discountValue} onChange={(event) => setDraft({ ...draft, discountValue: event.target.value })} /></label>
              </div>

              <fieldset className="admin-coupons-plans"><legend>Eligible paid plans</legend>{plans.map((plan) => <label key={plan.code}><input type="checkbox" checked={draft.eligiblePlanCodes.includes(plan.code)} onChange={() => togglePlan(plan.code)} /><span><strong>{plan.name}</strong><small>{money(plan.base_price_cents)} / month</small></span></label>)}</fieldset>

              <div className="admin-coupons-two">
                <label>Total redemption limit <small>(blank = unlimited)</small><input type="number" min="1" step="1" value={draft.maxRedemptions} placeholder="100" onChange={(event) => setDraft({ ...draft, maxRedemptions: event.target.value })} /></label>
                <label>Per-account limit<input required type="number" min="1" step="1" value={draft.maxRedemptionsPerAccount} onChange={(event) => setDraft({ ...draft, maxRedemptionsPerAccount: event.target.value })} /></label>
              </div>
              <div className="admin-coupons-two">
                <label>Starts <small>(blank = now)</small><input type="datetime-local" value={draft.startsAt} onChange={(event) => setDraft({ ...draft, startsAt: event.target.value })} /></label>
                <label>Ends <small>(blank = no expiry)</small><input type="datetime-local" value={draft.endsAt} onChange={(event) => setDraft({ ...draft, endsAt: event.target.value })} /></label>
              </div>
              <label className="admin-coupons-check"><input type="checkbox" checked={draft.stackable} onChange={(event) => setDraft({ ...draft, stackable: event.target.checked })} /><span><strong>Allow stacking</strong><small>Coupon can combine with another eligible promotion or private account price adjustment.</small></span></label>
              <div className="admin-coupons-warning">Coupons cannot reduce a paid checkout to $0. For free Beta access, grant the paid plan as a comped entitlement from Commercial Accounts.</div>
              <button className="admin-coupons-primary" disabled={busy === 'create' || state !== 'ready'}>{busy === 'create' ? 'Creating…' : 'Create coupon'}</button>
            </form>
          </section>

          <section className="admin-coupons-card admin-coupons-list-card">
            <div className="admin-coupons-section-head"><div><span>LIVE CODES</span><h2>Manage coupons</h2></div><button type="button" className="admin-coupons-refresh" onClick={() => void load()} disabled={state === 'loading'}>{state === 'loading' ? 'Loading…' : 'Refresh'}</button></div>
            {state === 'error' && <div className="admin-coupons-empty">Coupon data could not be loaded.</div>}
            {state === 'ready' && !coupons.length && <div className="admin-coupons-empty">No coupons yet. Create the first controlled discount code.</div>}
            <div className="admin-coupons-list">{coupons.map((coupon) => <article key={coupon.id} className={coupon.active ? '' : 'inactive'}>
              <div className="admin-coupons-code"><strong>{coupon.code}</strong><span className={coupon.active ? 'active' : 'inactive'}>{coupon.active ? 'Active' : 'Inactive'}</span></div>
              <h3>{coupon.label}</h3>
              <div className="admin-coupons-discount">{discountLabel(coupon)}</div>
              <div className="admin-coupons-meta"><span><b>{coupon.redeemedCount}</b> redeemed</span><span><b>{coupon.reservedCount}</b> reserved</span><span><b>{coupon.maxRedemptions ?? '∞'}</b> total limit</span><span><b>{coupon.maxRedemptionsPerAccount}</b> per account</span></div>
              <div className="admin-coupons-plan-tags">{coupon.eligiblePlanCodes.map((code) => <span key={code}>{plans.find((plan) => plan.code === code)?.name || code}</span>)}</div>
              <small>Starts {localDate(coupon.startsAt)} · Ends {localDate(coupon.endsAt)} · {coupon.stackable ? 'Stackable' : 'Not stackable'}</small>
              <button type="button" disabled={busy === coupon.id} onClick={() => void setCouponActive(coupon, !coupon.active)}>{busy === coupon.id ? 'Saving…' : coupon.active ? 'Deactivate' : 'Activate'}</button>
            </article>)}</div>
          </section>
        </div>
      </div>
    </main>
  );
}
