import { useCallback, useEffect, useState } from 'react';

export type LinkaryBaseBalance = {
  configured: boolean;
  address: string;
  ethAtomic: string;
  usdcAtomic: string;
  eth: string;
  usdc: string;
  updatedAt: string;
  message: string;
};

type WalletBalanceResponse = { baseBalances?: LinkaryBaseBalance | null; message?: string };

export function useLinkaryBaseBalances(profileId: string) {
  const [balances, setBalances] = useState<LinkaryBaseBalance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async (force = false) => {
    if (!profileId) return;
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ profileId, includeBaseBalances: '1' });
      if (force) query.set('refreshBaseBalances', '1');
      const response = await fetch(`/api/profile-wallets?${query.toString()}`, { credentials: 'same-origin', cache: 'no-store' });
      const payload = await response.json().catch(() => ({})) as WalletBalanceResponse;
      if (!response.ok) throw new Error(payload.message || 'Could not load Base balances.');
      setBalances(payload.baseBalances || null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load Base balances.');
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => { void refresh(false); }, [refresh]);
  return { balances, loading, error, refresh };
}

function amount(value: string | undefined, decimals = 6): string {
  const numeric = Number(value || '0');
  if (!Number.isFinite(numeric)) return '0';
  if (numeric === 0) return '0';
  if (numeric >= 1) return numeric.toLocaleString(undefined, { maximumFractionDigits: decimals });
  return numeric.toLocaleString(undefined, { maximumFractionDigits: 8 });
}

export default function LinkaryBaseBalances({ profileId }: { profileId: string }) {
  const { balances, loading, error, refresh } = useLinkaryBaseBalances(profileId);
  return <div className="wallet-base-balances" data-linkary-base-balances>
    <div className="wallet-base-balances-head"><span>BASE BALANCES</span><button type="button" onClick={() => void refresh(true)} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button></div>
    <div className="wallet-base-balance-grid">
      <div><span>ETH</span><strong>{balances ? amount(balances.eth, 8) : loading ? '…' : '0'} ETH</strong><small>Network gas</small></div>
      <div><span>USDC</span><strong>{balances ? amount(balances.usdc, 6) : loading ? '…' : '0'} USDC</strong><small>Payments</small></div>
    </div>
    {error ? <p className="wallet-base-balance-note error">{error}</p> : <p className="wallet-base-balance-note">{balances?.message || 'ETH covers Base network fees. USDC is available for Linkary payments.'}</p>}
  </div>;
}
