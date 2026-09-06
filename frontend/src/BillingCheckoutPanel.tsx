import { useEffect, useMemo, useState } from 'react';
import { useSendUsdc } from '@coinbase/cdp-hooks';
import type { ProductProfile } from './ProductWorkspace';

export type CheckoutPlan = {
  code: string;
  name: string;
  effectivePriceCents: number | null;
  currency: string;
  monthlyUsageCredits: number;
};

type PaymentConfig = {
  configured: boolean;
  treasuryAddress: string | null;
  payerWalletAddress: string | null;
  network: 'base';
  asset: 'USDC';
  balanceAtomic: string | null;
  balance: string | null;
};

type CheckoutQuote = {
  intentId: string;
  plan: { code: string; name: string; monthlyUsageCredits: number };
  basePriceCents: number;
  discountCents: number;
  finalPriceCents: number;
  currency: string;
  payment: {
    network: 'base';
    asset: 'USDC';
    amount: string;
    amountAtomic: number;
    payerWalletAddress: string;
    treasuryAddress: string;
  };
  couponApplied: boolean;
  expiresAt: string;
};

type FreeCouponResult = {
  ok: boolean;
  status: 'redeemed';
  couponCode: string;
  finalPriceCents: 0;
  plan: { code: string; name: string };
  periodStart: string;
  periodEnd: string;
  monthlyUsageCredits: number;
};

type VerifyResult = {
  ok: boolean;
  status: 'pending' | 'paid';
  paymentId?: string;
  txHash?: string;
  verifiedAt?: string;
  periodStart?: string;
  periodEnd?: string;
  monthlyUsageCredits?: number;
  message?: string;
};

class ApiError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

function cookie(name: string): string | null {
  const match = document.cookie.split('; ').find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  const payload = await response.json().catch(() => ({})) as { error?: string; message?: string } & T;
  if (!response.ok) throw new ApiError(payload.error || 'request_failed', payload.message || 'Request failed');
  return payload;
}

function cents(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(value / 100);
}

function safeMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return error instanceof Error ? error.message : 'Checkout could not be completed.';
  if (error.code === 'coupon_invalid') return 'That coupon is invalid or has expired.';
  if (error.code === 'coupon_exhausted' || error.code === 'coupon_account_exhausted') return 'That coupon is no longer available for this account.';
  if (error.code === 'coupon_active_entitlement') return 'This account already has active paid access. Use the coupon after the current access period ends.';
  if (error.code === 'billing_checkout_expired') return 'The quote expired before payment was submitted. Create a new quote.';
  if (error.code === 'billing_transfer_mismatch') return 'The Base transaction does not match this Linkary checkout.';
  if (error.code === 'billing_wallet_mismatch') return 'Use the Linkary wallet connected to this account.';
  return error.message || 'Checkout could not be completed.';
}

export default function BillingCheckoutPanel({
  profile,
  plan,
  onClose,
  onPaid,
}: {
  profile: ProductProfile;
  plan: CheckoutPlan;
  onClose: () => void;
  onPaid: () => void;
}) {
  const { sendUsdc, status: sendStatus } = useSendUsdc();
  const [config, setConfig] = useState<PaymentConfig | null>(null);
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [coupon, setCoupon] = useState('');
  const [busy, setBusy] = useState<'config' | 'quote' | 'pay' | 'verify' | ''>('config');
  const [message, setMessage] = useState('');
  const [txHash, setTxHash] = useState('');

  async function loadConfig() {
    setBusy('config');
    setMessage('');
    try {
      setConfig(await apiJson<PaymentConfig>('/api/billing/payment-config'));
    } catch (error) {
      setMessage(safeMessage(error));
    } finally {
      setBusy('');
    }
  }

  useEffect(() => { void loadConfig(); }, [profile.id, plan.code]);

  const expectedAtomic = useMemo(() => quote?.payment.amountAtomic ?? ((plan.effectivePriceCents || 0) * 10000), [quote, plan.effectivePriceCents]);
  const balanceAtomic = config?.balanceAtomic ? BigInt(config.balanceAtomic) : null;
  const needsFunding = balanceAtomic !== null && BigInt(expectedAtomic) > balanceAtomic;

  async function tryFreeCoupon(csrf: string): Promise<boolean> {
    const code = coupon.trim();
    if (!code) return false;
    try {
      const result = await apiJson<FreeCouponResult>('/api/billing/coupon/redeem-free', {
        method: 'POST',
        headers: { 'x-csrf-token': csrf },
        body: JSON.stringify({ profileId: profile.id, planCode: plan.code, couponCode: code }),
      });
      setQuote(null);
      setMessage(`${result.couponCode} applied. ${result.plan.name} is active through ${new Date(result.periodEnd).toLocaleDateString()} with ${result.monthlyUsageCredits.toLocaleString()} Usage Credits.`);
      onPaid();
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.code === 'coupon_not_free') return false;
      throw error;
    }
  }

  async function createQuote() {
    const csrf = cookie('__Host-linkary_csrf');
    if (!csrf) {
      setMessage('Your secure session needs to be refreshed before checkout.');
      return;
    }
    setBusy('quote');
    setMessage('');
    try {
      if (await tryFreeCoupon(csrf)) return;
      if (!config?.payerWalletAddress) {
        setMessage('Your Linkary wallet is not ready for paid checkout yet.');
        return;
      }
      const next = await apiJson<CheckoutQuote>('/api/billing/checkout', {
        method: 'POST',
        headers: { 'x-csrf-token': csrf },
        body: JSON.stringify({
          profileId: profile.id,
          planCode: plan.code,
          payerWalletAddress: config.payerWalletAddress,
          couponCode: coupon.trim() || undefined,
        }),
      });
      setQuote(next);
      setMessage(next.discountCents > 0 ? `Secure quote created. You save ${cents(next.discountCents, next.currency)}.` : 'Secure quote created.');
    } catch (error) {
      setQuote(null);
      setMessage(safeMessage(error));
    } finally {
      setBusy('');
    }
  }

  async function verifyPayment(intentId: string, hash: string) {
    const csrf = cookie('__Host-linkary_csrf');
    if (!csrf) throw new Error('Your secure session needs to be refreshed.');
    setBusy('verify');
    try {
      const result = await apiJson<VerifyResult>('/api/billing/checkout/verify', {
        method: 'POST',
        headers: { 'x-csrf-token': csrf },
        body: JSON.stringify({ intentId, txHash: hash }),
      });
      if (result.status === 'paid') {
        setMessage(`Payment verified. ${result.monthlyUsageCredits?.toLocaleString() || plan.monthlyUsageCredits.toLocaleString()} monthly credits are active.`);
        onPaid();
        return;
      }
      setMessage(result.message || 'Payment is waiting for Base confirmation.');
    } finally {
      setBusy('');
    }
  }

  async function pay() {
    if (!quote || !config?.payerWalletAddress) return;
    if (new Date(quote.expiresAt).getTime() <= Date.now()) {
      setQuote(null);
      setMessage('This quote expired. Create a fresh quote before paying.');
      return;
    }
    setBusy('pay');
    setMessage('Approve the USDC payment in your Linkary wallet.');
    try {
      const result = await sendUsdc({
        from: config.payerWalletAddress as `0x${string}`,
        to: quote.payment.treasuryAddress as `0x${string}`,
        amount: quote.payment.amount,
        network: 'base',
      });
      if (result.type !== 'evm-eoa') throw new Error('This checkout currently requires your Linkary EOA wallet.');
      setTxHash(result.transactionHash);
      setBusy('');
      await verifyPayment(quote.intentId, result.transactionHash);
    } catch (error) {
      setBusy('');
      setMessage(safeMessage(error));
    }
  }

  return (
    <section className="billing-checkout" aria-label={`Checkout for ${plan.name}`}>
      <div className="billing-checkout-head">
        <div><span>SECURE PLAN CHECKOUT</span><h2>{plan.name}</h2><p>Pay with USDC on Base from your Linkary wallet, or redeem an eligible 100% Superadmin coupon without an onchain payment.</p></div>
        <button type="button" className="ops-button ghost" onClick={onClose}>Close</button>
      </div>

      <div className="billing-checkout-summary">
        <article><small>Plan price</small><strong>{quote ? cents(quote.finalPriceCents, quote.currency) : cents(plan.effectivePriceCents || 0, plan.currency)}</strong><span>USDC / month</span></article>
        <article><small>Your Linkary wallet</small><strong className="billing-wallet-address">{config?.payerWalletAddress || 'Loading wallet…'}</strong><span>Base</span></article>
        <article><small>USDC balance</small><strong>{config?.balance ?? 'Checking…'}</strong><span>{needsFunding ? 'Funding required' : 'Available balance'}</span></article>
      </div>

      {!config?.configured && busy !== 'config' && (
        <div className="ops-message">Wallet checkout is not enabled yet. A valid 100% coupon can still activate one billing period without an onchain payment.</div>
      )}

      {busy !== 'config' && (
        <div className="billing-checkout-actions">
          {!quote && (
            <>
              <label className="billing-coupon">Coupon code <input value={coupon} onChange={(event) => setCoupon(event.target.value.toUpperCase())} placeholder="Optional" maxLength={40} /></label>
              <button type="button" className="ops-button primary" disabled={busy !== '' || (!coupon.trim() && (!config?.configured || !config.payerWalletAddress))} onClick={() => void createQuote()}>{busy === 'quote' ? 'Checking coupon…' : coupon.trim() ? 'Apply coupon / continue' : 'Create secure quote'}</button>
            </>
          )}
          {quote && (
            <>
              <div className="billing-quote-line"><span>Locked total</span><strong>{quote.payment.amount} USDC</strong><small>Quote expires {new Date(quote.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></div>
              {needsFunding ? (
                <a className="ops-button primary" href="/wallets">Fund Linkary wallet</a>
              ) : (
                <button type="button" className="ops-button primary" disabled={busy !== '' || sendStatus === 'pending'} onClick={() => void pay()}>{busy === 'pay' || sendStatus === 'pending' ? 'Waiting for approval…' : `Pay ${quote.payment.amount} USDC`}</button>
              )}
              <button type="button" className="ops-button ghost" disabled={busy !== ''} onClick={() => { setQuote(null); setTxHash(''); setMessage(''); }}>New quote</button>
            </>
          )}
          {quote && txHash && (
            <button type="button" className="ops-button ghost" disabled={busy !== ''} onClick={() => void verifyPayment(quote.intentId, txHash)}>{busy === 'verify' ? 'Checking Base…' : 'Check payment again'}</button>
          )}
        </div>
      )}

      {message && <div className="ops-message" role="status" aria-live="polite">{message}</div>}
      <div className="billing-checkout-foot"><strong>No fake $0 payments.</strong><span>Every renewal requires your approval during Controlled Beta. A 100% coupon is recorded as a coupon redemption and activates one billing period directly, while paid checkouts still require a verified Base USDC transfer.</span></div>
    </section>
  );
}
