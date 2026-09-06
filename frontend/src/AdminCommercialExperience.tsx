import { useEffect, useMemo, useState } from 'react';
import { ProductWorkspace, type ProductMe, type ProductProfile, type ProductStatus } from './ProductWorkspace';
import './admin-commercial.css';

type OwnerType = 'user' | 'organization';
type DiscountType = 'percent' | 'fixed_cents' | 'fixed_price_cents';

type Plan = {
  id: string;
  code: string;
  name: string;
  billingPeriod: 'free' | 'monthly' | 'custom';
  basePriceCents: number | null;
  monthlyUsageCredits: number;
  projectSeatLimit: number | null;
  active: boolean;
};

type Grant = {
  id: string;
  plan_code: string;
  plan_name: string;
  starts_at: string;
  ends_at: string | null;
  monthly_credit_override: number | null;
  reason: string;
};

type PriceOverride = {
  id: string;
  plan_code: string;
  plan_name: string;
  discount_type: DiscountType;
  discount_value: number;
  starts_at: string;
  ends_at: string | null;
  reason: string;
};

type CommercialAccount = {
  profileId: string;
  profileType: 'creator' | 'project';
  username: string;
  displayName: string;
  ownerType: OwnerType;
  ownerId: string;
  ownerLabel: string;
  email: string | null;
  creditBalance: number;
  activeGrant: Grant | null;
  priceOverrides: PriceOverride[];
  updatedAt: string;
};

type Audit = {
  id: string;
  actor_user_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  organization_id: string | null;
  metadata: unknown;
  created_at: string;
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

function money(cents: number | null): string {
  if (cents === null) return 'Custom';
  return `$${(cents / 100).toFixed(2)}`;
}

function shortDate(value: string | null): string {
  if (!value) return 'No expiry';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', day: 'numeric' }).format(parsed);
}

function eligiblePlans(account: CommercialAccount | null, plans: Plan[]): Plan[] {
  if (!account) return [];
  return plans.filter((plan) => plan.active && (
    account.ownerType === 'user'
      ? ['free', 'personal_pro'].includes(plan.code)
      : ['free', 'project_manual', 'project_automate', 'project_growth', 'scale'].includes(plan.code)
  ));
}

function overrideLabel(item: PriceOverride): string {
  if (item.discount_type === 'percent') return `${item.discount_value}% off`;
  if (item.discount_type === 'fixed_cents') return `$${(item.discount_value / 100).toFixed(2)} off`;
  return `$${(item.discount_value / 100).toFixed(2)} private price`;
}

export default function AdminCommercialExperience({ me, status }: { me: ProductMe; status: ProductStatus }) {
  const first = status.profiles[0];
  const saved = window.localStorage.getItem('linkary.active.profile');
  const [profileId, setProfileId] = useState(saved && status.profiles.some((item) => item.id === saved) ? saved : first?.id || '');
  const profile = status.profiles.find((item) => item.id === profileId) || first;

  const [accounts, setAccounts] = useState<CommercialAccount[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [selectedOwner, setSelectedOwner] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  const [grantPlan, setGrantPlan] = useState('');
  const [grantEnds, setGrantEnds] = useState('');
  const [grantCredits, setGrantCredits] = useState('');
  const [grantCreditsNow, setGrantCreditsNow] = useState(true);
  const [grantReason, setGrantReason] = useState('Controlled Beta comped access');

  const [discountPlan, setDiscountPlan] = useState('');
  const [discountType, setDiscountType] = useState<DiscountType>('percent');
  const [discountValue, setDiscountValue] = useState('');
  const [discountEnds, setDiscountEnds] = useState('');
  const [discountReason, setDiscountReason] = useState('Founder-approved Beta pricing');

  const [creditAmount, setCreditAmount] = useState('');
  const [creditReason, setCreditReason] = useState('Controlled Beta credit adjustment');

  function changeProfile(id: string) {
    setProfileId(id);
    window.localStorage.setItem('linkary.active.profile', id);
  }

  async function load() {
    setLoading(true);
    setMessage('');
    try {
      const [accountResult, planResult, auditResult] = await Promise.all([
        api<{ accounts: CommercialAccount[] }>('/api/admin/commercial/accounts'),
        api<{ plans: Plan[] }>('/api/admin/billing/plans'),
        api<{ audit: Audit[] }>('/api/admin/commercial/audit'),
      ]);
      setAccounts(accountResult.accounts || []);
      setPlans(planResult.plans || []);
      setAudit(auditResult.audit || []);
      setSelectedOwner((current) => {
        if (current && accountResult.accounts.some((item) => `${item.ownerType}:${item.ownerId}` === current)) return current;
        const firstAccount = accountResult.accounts[0];
        return firstAccount ? `${firstAccount.ownerType}:${firstAccount.ownerId}` : '';
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Commercial controls could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const filteredAccounts = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return accounts;
    return accounts.filter((item) => [item.displayName, item.username, item.ownerLabel, item.email || '', item.profileType]
      .some((value) => value.toLowerCase().includes(needle)));
  }, [accounts, search]);

  const selected = accounts.find((item) => `${item.ownerType}:${item.ownerId}` === selectedOwner) || filteredAccounts[0] || accounts[0] || null;
  const availablePlans = eligiblePlans(selected, plans);
  const paidPlans = availablePlans.filter((plan) => plan.billingPeriod === 'monthly' && (plan.basePriceCents || 0) > 0);

  useEffect(() => {
    if (!selected) return;
    if (!availablePlans.some((plan) => plan.code === grantPlan)) {
      setGrantPlan((selected.ownerType === 'user' ? availablePlans.find((plan) => plan.code === 'personal_pro') : availablePlans.find((plan) => plan.code === 'project_manual'))?.code || availablePlans[0]?.code || '');
    }
    if (!paidPlans.some((plan) => plan.code === discountPlan)) setDiscountPlan(paidPlans[0]?.code || '');
  }, [selectedOwner, plans.length]);

  async function mutate(path: string, body: unknown, key: string) {
    const token = csrf();
    if (!token) {
      setMessage('Security token is unavailable. Refresh Linkary and try again.');
      return false;
    }
    setBusy(key);
    setMessage('');
    try {
      await api(path, { method: 'POST', headers: { 'x-csrf-token': token }, body: JSON.stringify(body) });
      await load();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Commercial change could not be saved.');
      return false;
    } finally {
      setBusy('');
    }
  }

  async function grantPlanAccess(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !grantPlan) return;
    const creditOverride = grantCredits.trim() === '' ? null : Number(grantCredits);
    const ok = await mutate('/api/admin/commercial/grants', {
      ownerType: selected.ownerType,
      ownerId: selected.ownerId,
      planCode: grantPlan,
      endsAt: grantEnds ? new Date(`${grantEnds}T23:59:59`).toISOString() : null,
      monthlyCreditOverride: creditOverride,
      grantCreditsNow,
      reason: grantReason,
    }, 'grant');
    if (ok) setMessage(`${selected.displayName} now has comped ${plans.find((plan) => plan.code === grantPlan)?.name || grantPlan} access.`);
  }

  async function saveDiscount(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !discountPlan || !discountValue.trim()) return;
    const raw = Number(discountValue);
    const normalized = discountType === 'percent' ? raw : Math.round(raw * 100);
    const ok = await mutate('/api/admin/commercial/price-overrides', {
      ownerType: selected.ownerType,
      ownerId: selected.ownerId,
      planCode: discountPlan,
      discountType,
      discountValue: normalized,
      endsAt: discountEnds ? new Date(`${discountEnds}T23:59:59`).toISOString() : null,
      reason: discountReason,
    }, 'discount');
    if (ok) setMessage(`Private pricing saved for ${selected.displayName}.`);
  }

  async function adjustCredits(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !creditAmount.trim()) return;
    const ok = await mutate('/api/admin/usage-credits/adjust', {
      ownerType: selected.ownerType,
      ownerId: selected.ownerId,
      amount: Number(creditAmount),
      reason: creditReason,
    }, 'credits');
    if (ok) {
      setCreditAmount('');
      setMessage(`Usage Credits updated for ${selected.displayName}.`);
    }
  }

  async function revokeGrant(item: Grant) {
    if (!selected || !window.confirm(`Revoke ${item.plan_name} comped access for ${selected.displayName}? Credits already granted will remain in the ledger.`)) return;
    const reason = window.prompt('Reason for revoking this entitlement:', 'Beta entitlement changed') || '';
    if (!reason.trim()) return;
    if (await mutate(`/api/admin/commercial/grants/${encodeURIComponent(item.id)}/revoke`, { reason }, `revoke-grant:${item.id}`)) {
      setMessage(`${item.plan_name} entitlement revoked.`);
    }
  }

  async function revokeOverride(item: PriceOverride) {
    if (!selected || !window.confirm(`Remove ${overrideLabel(item)} for ${selected.displayName}?`)) return;
    const reason = window.prompt('Reason for removing this private price:', 'Private pricing changed') || '';
    if (!reason.trim()) return;
    if (await mutate(`/api/admin/commercial/price-overrides/${encodeURIComponent(item.id)}/revoke`, { reason }, `revoke-price:${item.id}`)) {
      setMessage('Private price override revoked.');
    }
  }

  if (!profile) return null;

  return (
    <ProductWorkspace me={me} status={status} profile={profile as ProductProfile} onProfileChange={changeProfile}>
      <main className="commercial-admin-page">
        <header className="ops-page-header commercial-admin-header">
          <div>
            <span className="ops-kicker">SUPERADMIN</span>
            <h1>Commercial controls</h1>
            <p>Grant comped Beta access, set private future pricing, and manage Usage Credits without creating fake payments or invoices.</p>
          </div>
          <div className="commercial-header-actions">
            <a className="ops-secondary" href="/admin/readiness">Beta readiness</a>
            <button className="ops-primary" type="button" onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
          </div>
        </header>

        <div className="commercial-beta-callout">
          <strong>Controlled Beta mode</strong>
          <span>Use <b>Grant plan</b> for free access. Use <b>Private pricing</b> only when you later want that account to pay a discounted amount.</span>
        </div>
        {message && <div className="ops-banner">{message}</div>}

        <div className="commercial-layout">
          <aside className="commercial-accounts ops-card">
            <label className="commercial-search">Find account<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Username, Project, email…" /></label>
            <div className="commercial-account-list">
              {filteredAccounts.map((item) => {
                const key = `${item.ownerType}:${item.ownerId}`;
                return (
                  <button type="button" key={`${item.profileId}:${key}`} className={key === `${selected?.ownerType}:${selected?.ownerId}` ? 'active' : ''} onClick={() => setSelectedOwner(key)}>
                    <span>{item.profileType === 'project' ? 'PROJECT' : 'PERSONAL'}</span>
                    <strong>{item.displayName}</strong>
                    <small>@{item.username}{item.email ? ` · ${item.email}` : ''}</small>
                  </button>
                );
              })}
              {!filteredAccounts.length && <div className="ops-empty">No matching accounts.</div>}
            </div>
          </aside>

          <section className="commercial-detail">
            {!selected ? <div className="ops-empty">No Linkary accounts are available yet.</div> : (
              <>
                <section className="ops-card commercial-account-summary">
                  <div>
                    <span className="ops-kicker">{selected.profileType === 'project' ? 'PROJECT ACCOUNT' : 'PERSONAL ACCOUNT'}</span>
                    <h2>{selected.displayName}</h2>
                    <p>@{selected.username} · {selected.ownerLabel}{selected.email ? ` · ${selected.email}` : ''}</p>
                  </div>
                  <div className="commercial-summary-metrics">
                    <span><small>USAGE CREDITS</small><b>{selected.creditBalance.toLocaleString()}</b></span>
                    <span><small>CURRENT ACCESS</small><b>{selected.activeGrant?.plan_name || 'Free / default'}</b></span>
                  </div>
                </section>

                {selected.activeGrant && (
                  <section className="ops-card commercial-active-strip">
                    <div><span>COMPED ENTITLEMENT</span><strong>{selected.activeGrant.plan_name}</strong><small>Ends: {shortDate(selected.activeGrant.ends_at)} · {selected.activeGrant.monthly_credit_override ?? plans.find((plan) => plan.code === selected.activeGrant?.plan_code)?.monthlyUsageCredits ?? 0} monthly allowance</small><p>{selected.activeGrant.reason}</p></div>
                    <button className="ops-secondary danger-outline" type="button" disabled={Boolean(busy)} onClick={() => void revokeGrant(selected.activeGrant!)}>Revoke access</button>
                  </section>
                )}

                <div className="commercial-action-grid">
                  <form className="ops-card commercial-form" onSubmit={grantPlanAccess}>
                    <div><span className="ops-kicker">NO PAYMENT</span><h3>Grant plan</h3><p>Give this account paid-plan capabilities as a comped entitlement.</p></div>
                    <label>Plan<select value={grantPlan} onChange={(event) => setGrantPlan(event.target.value)} required>{availablePlans.filter((plan) => plan.code !== 'free').map((plan) => <option key={plan.code} value={plan.code}>{plan.name} · {plan.monthlyUsageCredits.toLocaleString()} credits</option>)}</select></label>
                    <div className="commercial-field-row"><label>Ends on<input type="date" value={grantEnds} onChange={(event) => setGrantEnds(event.target.value)} /></label><label>Monthly credit override<input type="number" min="0" step="1" value={grantCredits} onChange={(event) => setGrantCredits(event.target.value)} placeholder="Use plan default" /></label></div>
                    <label>Reason<input value={grantReason} onChange={(event) => setGrantReason(event.target.value)} required minLength={3} /></label>
                    <label className="commercial-checkbox"><input type="checkbox" checked={grantCreditsNow} onChange={(event) => setGrantCreditsNow(event.target.checked)} /><span>Grant one current monthly allowance now</span></label>
                    <button className="ops-primary" disabled={Boolean(busy) || !grantPlan}>{busy === 'grant' ? 'Granting…' : 'Grant comped access'}</button>
                  </form>

                  <form className="ops-card commercial-form" onSubmit={saveDiscount}>
                    <div><span className="ops-kicker">FUTURE PAYMENT</span><h3>Private pricing</h3><p>Set the amount this account would pay later. This does not grant access by itself.</p></div>
                    <label>Plan<select value={discountPlan} onChange={(event) => setDiscountPlan(event.target.value)} required>{paidPlans.map((plan) => <option key={plan.code} value={plan.code}>{plan.name} · {money(plan.basePriceCents)}</option>)}</select></label>
                    <div className="commercial-field-row"><label>Discount type<select value={discountType} onChange={(event) => setDiscountType(event.target.value as DiscountType)}><option value="percent">Percent off</option><option value="fixed_price_cents">Private final price</option><option value="fixed_cents">Fixed amount off</option></select></label><label>{discountType === 'percent' ? 'Percent' : 'USD'}<input type="number" min={discountType === 'percent' ? '1' : '0.01'} max={discountType === 'percent' ? '99' : undefined} step={discountType === 'percent' ? '1' : '0.01'} value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} required /></label></div>
                    <label>Ends on<input type="date" value={discountEnds} onChange={(event) => setDiscountEnds(event.target.value)} /></label>
                    <label>Reason<input value={discountReason} onChange={(event) => setDiscountReason(event.target.value)} required minLength={3} /></label>
                    <button className="ops-primary" disabled={Boolean(busy) || !discountPlan}>{busy === 'discount' ? 'Saving…' : 'Save private pricing'}</button>
                  </form>

                  <form className="ops-card commercial-form compact" onSubmit={adjustCredits}>
                    <div><span className="ops-kicker">USAGE ALLOWANCE</span><h3>Adjust credits</h3><p>Positive values add credits. Negative values deduct credits without allowing the balance to go below zero.</p></div>
                    <label>Credit adjustment<input type="number" step="1" value={creditAmount} onChange={(event) => setCreditAmount(event.target.value)} placeholder="e.g. 500 or -100" required /></label>
                    <label>Reason<input value={creditReason} onChange={(event) => setCreditReason(event.target.value)} required minLength={3} /></label>
                    <button className="ops-primary" disabled={Boolean(busy)}>{busy === 'credits' ? 'Updating…' : 'Adjust Usage Credits'}</button>
                  </form>
                </div>

                <section className="ops-card commercial-overrides">
                  <div className="commercial-section-title"><div><span className="ops-kicker">PRIVATE TERMS</span><h3>Active price overrides</h3></div></div>
                  {!selected.priceOverrides.length ? <div className="ops-empty">No private pricing is active for this account.</div> : selected.priceOverrides.map((item) => (
                    <div className="commercial-override-row" key={item.id}><div><strong>{item.plan_name}</strong><span>{overrideLabel(item)} · ends {shortDate(item.ends_at)}</span><small>{item.reason}</small></div><button className="ops-secondary danger-outline" type="button" disabled={Boolean(busy)} onClick={() => void revokeOverride(item)}>Remove</button></div>
                  ))}
                </section>
              </>
            )}
          </section>
        </div>

        <section className="ops-card commercial-audit">
          <div className="commercial-section-title"><div><span className="ops-kicker">IMMUTABLE HISTORY</span><h2>Recent commercial changes</h2><p>Comped grants, private prices, plan edits, and Usage Credit adjustments are recorded in the audit log.</p></div></div>
          <div className="commercial-audit-list">
            {audit.slice(0, 30).map((item) => <div key={item.id}><strong>{item.action.replaceAll('_', ' ').replaceAll('.', ' ')}</strong><span>{shortDate(item.created_at)} · {item.resource_type}</span><small>{item.resource_id}</small></div>)}
            {!audit.length && <div className="ops-empty">No commercial audit entries yet.</div>}
          </div>
        </section>
      </main>
    </ProductWorkspace>
  );
}
