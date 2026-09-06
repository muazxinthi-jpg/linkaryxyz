import { useEffect, useMemo, useState } from 'react';
import BillingCheckoutPanel from './BillingCheckoutPanel';
import { ProductWorkspace, type ProductMe, type ProductProfile, type ProductStatus } from './ProductWorkspace';
import './billing.css';

type PublicPlan = {
  code: string;
  name: string;
  audience: string;
  description: string;
  billingPeriod: 'free' | 'monthly' | 'custom';
  basePriceCents: number | null;
  effectivePriceCents: number | null;
  currency: string;
  monthlyUsageCredits: number;
  monthlyContactReveals: number;
  projectSeatLimit: number | null;
  features: string[];
  promotion: { id: string; label: string; discountType: string; discountValue: number } | null;
};

type CurrentBilling = {
  profileId: string;
  ownerType: 'user' | 'organization';
  ownerId: string;
  plan: PublicPlan;
  entitlement: {
    source: 'default' | 'grant' | 'subscription';
    grantId: string | null;
    subscriptionPeriodId?: string | null;
    startsAt: string | null;
    endsAt: string | null;
    monthlyUsageCredits: number;
  };
  creditBalance: number;
};

class ApiError extends Error {}

async function apiJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError((payload as { message?: string }).message || 'Request failed');
  return payload as T;
}

function money(cents: number | null, currency = 'USD'): string {
  if (cents === null) return 'Custom';
  if (cents === 0) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(cents / 100);
}

function planGroup(plan: PublicPlan): 'Personal plans' | 'Project plans' {
  return ['free', 'personal_pro'].includes(plan.code) ? 'Personal plans' : 'Project plans';
}

function accessSource(current: CurrentBilling): string {
  if (current.entitlement.source === 'subscription') return 'Paid subscription';
  if (current.entitlement.source === 'grant') return 'Entitlement';
  return 'Default';
}

export default function BillingExperience({ me, status }: { me: ProductMe; status: ProductStatus }) {
  const creatorFirst = status.profiles.find((item) => item.profile_type === 'creator') || status.profiles[0];
  const stored = window.localStorage.getItem('linkary.active.profile');
  const [profileId, setProfileId] = useState(stored && status.profiles.some((item) => item.id === stored) ? stored : creatorFirst?.id || '');
  const profile = status.profiles.find((item) => item.id === profileId) || creatorFirst;
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [current, setCurrent] = useState<CurrentBilling | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PublicPlan | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  function changeProfile(id: string) {
    setProfileId(id);
    setSelectedPlan(null);
    window.localStorage.setItem('linkary.active.profile', id);
  }

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    setState('loading');
    void Promise.all([
      apiJson<{ plans: PublicPlan[] }>('/api/billing/plans'),
      apiJson<CurrentBilling>(`/api/billing/current?profileId=${encodeURIComponent(profile.id)}`),
    ]).then(([catalog, billing]) => {
      if (cancelled) return;
      setPlans(catalog.plans || []);
      setCurrent(billing);
      setState('ready');
    }).catch(() => {
      if (!cancelled) setState('error');
    });
    return () => { cancelled = true; };
  }, [profile?.id, refreshKey]);

  const visiblePlans = useMemo(() => plans, [plans]);
  const planGroups = useMemo(() => ['Personal plans', 'Project plans'] as const, []);

  if (!profile) return null;

  return (
    <ProductWorkspace me={me} status={status} profile={profile as ProductProfile} onProfileChange={changeProfile}>
      <div className="ops-stack billing-workspace">
        <div className="ops-heading-row">
          <div>
            <span className="ops-kicker">PLAN & BILLING</span>
            <h1>Choose the Linkary plan that fits your work</h1>
            <p>Plans use the same live catalog shown on Linkary. Paid access activates only after an eligible Base USDC payment or Superadmin entitlement is verified.</p>
          </div>
        </div>

        {state === 'loading' && <section className="billing-status-card"><strong>Loading your plan…</strong></section>}
        {state === 'error' && <section className="billing-status-card error"><strong>Plan information is temporarily unavailable.</strong><p>Refresh this page before changing access or funding your wallet.</p></section>}
        {state === 'ready' && current && (
          <section className="billing-status-card" aria-label="Current Linkary plan">
            <div>
              <span>CURRENT PLAN</span>
              <h2>{current.plan.name}</h2>
              <p>{current.plan.description}</p>
              {current.entitlement.endsAt && <small className="billing-period-note">Current paid/granted access runs through {new Date(current.entitlement.endsAt).toLocaleDateString()}.</small>}
            </div>
            <div className="billing-current-metrics">
              <article><small>Monthly usage credits</small><strong>{current.entitlement.monthlyUsageCredits.toLocaleString()}</strong></article>
              <article><small>Usage ledger balance</small><strong>{current.creditBalance.toLocaleString()}</strong></article>
              <article><small>Access source</small><strong>{accessSource(current)}</strong></article>
            </div>
          </section>
        )}

        {planGroups.map((group) => <section key={group} className="billing-plan-section" aria-labelledby={`billing-${group.replace(/\s/g, '-').toLowerCase()}`}>
          <div className="billing-section-heading"><div><span className="ops-kicker">{group === 'Personal plans' ? 'FOR INDIVIDUALS' : 'FOR PROJECT TEAMS'}</span><h2 id={`billing-${group.replace(/\s/g, '-').toLowerCase()}`}>{group}</h2></div><p>{group === 'Personal plans' ? 'Identity, creator and collector tools.' : 'Campaign, tracking and team operations.'}</p></div>
          <div className="billing-plan-grid">
          {visiblePlans.filter((plan) => planGroup(plan) === group).map((plan) => {
            const isCurrent = current?.plan.code === plan.code;
            const discounted = plan.basePriceCents !== null && plan.effectivePriceCents !== null && plan.effectivePriceCents < plan.basePriceCents;
            const paid = plan.billingPeriod === 'monthly' && (plan.effectivePriceCents || 0) > 0;
            return (
              <article key={plan.code} className={`billing-plan-card ${isCurrent ? 'current' : ''}`}>
                <div className="billing-plan-top">
                  <div><span>{plan.audience}</span><h2>{plan.name}</h2></div>
                  {isCurrent && <b className="billing-current-badge">Current</b>}
                  {!isCurrent && plan.promotion && <b className="billing-promo-badge">{plan.promotion.label}</b>}
                </div>
                <div className="billing-price">
                  {discounted && <del>{money(plan.basePriceCents, plan.currency)}</del>}
                  <strong>{money(plan.effectivePriceCents, plan.currency)}</strong>
                  {plan.billingPeriod === 'monthly' && <span>/ month</span>}
                </div>
                <p>{plan.description}</p>
                <div className="billing-allowance"><strong>{plan.monthlyUsageCredits.toLocaleString()}</strong><span>monthly usage credits</span></div>
                <div className="billing-allowance"><strong>{plan.monthlyContactReveals ? plan.monthlyContactReveals.toLocaleString() : '—'}</strong><span>monthly contact reveals</span></div>
                <ul>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
                {isCurrent ? (
                  <button type="button" className="ops-button ghost" disabled>Current plan</button>
                ) : paid ? (
                  <button type="button" className="ops-button primary billing-cta" onClick={() => setSelectedPlan(plan)}>Pay with Linkary wallet</button>
                ) : plan.billingPeriod === 'custom' ? (
                  <button type="button" className="ops-button ghost" disabled>Custom access</button>
                ) : (
                  <button type="button" className="ops-button ghost" disabled>Included</button>
                )}
              </article>
            );
          })}
          </div>
        </section>)}

        {selectedPlan && (
          <BillingCheckoutPanel
            profile={profile as ProductProfile}
            plan={selectedPlan}
            onClose={() => setSelectedPlan(null)}
            onPaid={() => {
              setSelectedPlan(null);
              setRefreshKey((value) => value + 1);
            }}
          />
        )}

        <section className="billing-wallet-note">
          <div><strong>Paid plans use your Linkary wallet.</strong><p>Fund your Linkary wallet with USDC on Base before checkout. Every Controlled Beta renewal requires your approval, and selecting a plan never grants paid access by itself.</p></div>
          <a className="ops-button primary" href="/wallets">Open wallet</a>
        </section>
      </div>
    </ProductWorkspace>
  );
}
