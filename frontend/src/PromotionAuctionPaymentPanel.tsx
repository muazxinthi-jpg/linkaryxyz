import { useMemo, useState } from 'react';
import { useEvmAddress, useSendUsdc } from '@coinbase/cdp-hooks';
import { useLinkaryBaseBalances } from './LinkaryBaseBalances';

type Payment = {
  recipient_wallet_address: string;
  required_amount_atomic: number;
  tx_hash: string | null;
  status: string;
  payment_due_at: string | null;
  auction_status: string | null;
};

type Props = {
  auctionId: string;
  profileId: string;
  payment: Payment;
  onRefresh: () => Promise<void>;
  onMessage: (message: string) => void;
};

function csrfToken(): string {
  const pair = document.cookie.split('; ').find((item) => item.startsWith('__Host-linkary_csrf='));
  return pair ? decodeURIComponent(pair.slice(pair.indexOf('=') + 1)) : '';
}

function transferReference(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const value = result as Record<string, unknown>;
  for (const key of ['transactionHash', 'userOpHash', 'transactionSignature']) {
    if (typeof value[key] === 'string' && value[key]) return value[key] as string;
  }
  return null;
}

function atomic(value: string | undefined): bigint {
  try { return BigInt(value || '0'); } catch { return BigInt(0); }
}

function shortAddress(address: string): string {
  return address.length > 18 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;
}

function formatAmount(value: string | undefined, maxFraction: number): string {
  const numeric = Number(value || '0');
  if (!Number.isFinite(numeric)) return '0';
  return numeric.toLocaleString(undefined, { maximumFractionDigits: maxFraction });
}

export default function PromotionAuctionPaymentPanel({ auctionId, profileId, payment, onRefresh, onMessage }: Props) {
  const { evmAddress } = useEvmAddress();
  const { sendUsdc } = useSendUsdc();
  const { balances, loading, error, refresh: refreshBalances } = useLinkaryBaseBalances(profileId);
  const [busy, setBusy] = useState(false);
  const [localHash, setLocalHash] = useState<string | null>(null);

  const requiredAtomic = BigInt(payment.required_amount_atomic);
  const usdcEnough = atomic(balances?.usdcAtomic) >= requiredAtomic;
  const hasEth = atomic(balances?.ethAtomic) > BigInt(0);
  const walletMatches = Boolean(evmAddress && balances?.address && evmAddress.toLowerCase() === balances.address.toLowerCase());
  const reference = payment.tx_hash || localHash;
  const requiredUsdc = (payment.required_amount_atomic / 1_000_000).toFixed(2);
  const canPay = Boolean(profileId && balances && usdcEnough && hasEth && walletMatches && !busy && payment.status === 'pending');

  const statusText = useMemo(() => {
    if (payment.status === 'verified') return 'Payment verified on Base.';
    if (payment.status === 'expired') return 'The payment window has expired.';
    if (reference) return 'Payment submitted. Confirm it on Base to finish settlement.';
    return 'Pay directly from your Linkary Wallet.';
  }, [payment.status, reference]);

  async function verify(hash: string) {
    const response = await fetch(`/api/promotion-auctions/${encodeURIComponent(auctionId)}/payment/verify`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken() },
      body: JSON.stringify({ txHash: hash }),
    });
    const payload = await response.json().catch(() => ({})) as { status?: string; message?: string };
    if (!response.ok) throw new Error(payload.message || 'Payment verification failed.');
    return payload;
  }

  async function pay() {
    if (!canPay || !evmAddress) return;
    setBusy(true);
    onMessage('');
    try {
      const result = await sendUsdc({
        from: evmAddress,
        to: payment.recipient_wallet_address as `0x${string}`,
        amount: requiredAtomic.toString(),
        network: 'base',
      });
      const hash = transferReference(result);
      if (!hash || !/^0x[a-fA-F0-9]{64}$/.test(hash)) throw new Error('The Base transaction was submitted but Linkary could not read its transaction hash.');
      setLocalHash(hash);
      const verified = await verify(hash);
      onMessage(verified.status === 'verified' ? 'Payment verified. You can now submit the banner.' : 'Payment submitted. Base confirmation is still pending.');
      await Promise.all([onRefresh(), refreshBalances(true)]);
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : 'Payment failed.';
      onMessage(text.includes('insufficient') ? 'Payment failed. Check that your Linkary Wallet has enough USDC and Base ETH for gas.' : text);
      await refreshBalances(true).catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  async function checkConfirmation() {
    if (!reference || busy) return;
    setBusy(true);
    onMessage('');
    try {
      const verified = await verify(reference);
      onMessage(verified.status === 'verified' ? 'Payment verified. You can now submit the banner.' : 'Payment is still waiting for Base confirmation.');
      await Promise.all([onRefresh(), refreshBalances(true)]);
    } catch (cause) {
      onMessage(cause instanceof Error ? cause.message : 'Payment verification failed.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="promotion-wallet-checkout" data-linkary-wallet-checkout>
    <div className="promotion-wallet-checkout-head"><div><span>LINKARY WALLET</span><strong>{balances?.address ? shortAddress(balances.address) : loading ? 'Loading wallet…' : 'Wallet unavailable'}</strong></div><a href="/wallets">Manage wallet</a></div>
    <div className="promotion-wallet-balance-grid">
      <div><span>Winning bid</span><strong>{requiredUsdc} USDC</strong></div>
      <div><span>USDC available</span><strong>{loading ? '…' : `${formatAmount(balances?.usdc, 6)} USDC`}</strong></div>
      <div><span>ETH for gas</span><strong>{loading ? '…' : `${formatAmount(balances?.eth, 8)} ETH`}</strong></div>
      <div><span>Network</span><strong>Base</strong></div>
    </div>
    <div className="promotion-wallet-recipient"><span>Seller payout wallet</span><code>{payment.recipient_wallet_address}</code></div>
    {error && <div className="promotion-wallet-warning">{error}</div>}
    {!loading && balances && !usdcEnough && payment.status !== 'verified' && <div className="promotion-wallet-warning">You need at least {requiredUsdc} USDC in your Linkary Wallet. <a href="/wallets">Add USDC</a></div>}
    {!loading && balances && !hasEth && payment.status !== 'verified' && <div className="promotion-wallet-warning">Add a small amount of ETH on Base to your Linkary Wallet for network gas. <a href="/wallets">Add ETH</a></div>}
    {!loading && balances && !walletMatches && <div className="promotion-wallet-warning">Your active Coinbase wallet does not match this Linkary Wallet. Sign in again before paying.</div>}
    <p className="promotion-wallet-status">{statusText}</p>
    {payment.status === 'pending' && !reference && <button type="button" className="ops-button primary promotion-pay-button" disabled={!canPay} onClick={() => void pay()}>{busy ? 'Paying…' : `Pay ${requiredUsdc} USDC`}</button>}
    {payment.status !== 'verified' && reference && <><code className="promotion-payment-reference">{reference}</code><button type="button" className="ops-button primary promotion-pay-button" disabled={busy} onClick={() => void checkConfirmation()}>{busy ? 'Checking…' : 'Check confirmation'}</button></>}
  </div>;
}
