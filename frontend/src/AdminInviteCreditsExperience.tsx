import { useEffect, useState } from 'react';

type ProfileOwner = { id: string; display_name: string; username: string };
type OrganizationOwner = { id: string; name: string };
type OwnersResponse = { profiles: ProfileOwner[]; organizations: OrganizationOwner[] };
type Balance = { owner_type: string; owner_id: string; available_credits: number };

function readCookie(name: string): string | null {
  const match = document.cookie.split('; ').find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', ...init });
  const payload = await response.json().catch(() => ({})) as T & { message?: string };
  if (!response.ok) throw new Error(payload.message || 'The request could not be completed.');
  return payload;
}

export default function AdminInviteCreditsExperience() {
  const [owners, setOwners] = useState<OwnersResponse>({ profiles: [], organizations: [] });
  const [balances, setBalances] = useState<Balance[]>([]);
  const [ownerId, setOwnerId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [ownerData, balanceData] = await Promise.all([
          apiJson<OwnersResponse>('/api/admin/invite-credit-owners'),
          apiJson<{ balances: Balance[] }>('/api/invites/balances').catch(() => ({ balances: [] })),
        ]);
        if (cancelled) return;
        setOwners(ownerData);
        setBalances(balanceData.balances);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load invite-credit owners.');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const selectedOwner = owners.profiles.find((profile) => profile.id === ownerId);
  const currentBalance = balances.find((balance) => balance.owner_type === 'profile' && balance.owner_id === ownerId)?.available_credits;

  async function adjust(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setSuccess('');
    const csrf = readCookie('__Host-linkary_csrf');
    const parsedAmount = Number(amount);
    if (!csrf) { setError('Your secure Superadmin session expired. Please sign in again.'); return; }
    if (!Number.isInteger(parsedAmount) || parsedAmount === 0 || Math.abs(parsedAmount) > 10000) {
      setError('Enter a whole-number adjustment between -10,000 and 10,000, excluding zero.');
      return;
    }
    setBusy(true);
    try {
      const result = await apiJson<{ availableCredits: number }>('/api/admin/invite-credits/adjust', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ ownerType: 'profile', ownerId, amount: parsedAmount, reason }),
      });
      setBalances((current) => {
        const existing = current.find((item) => item.owner_type === 'profile' && item.owner_id === ownerId);
        if (existing) return current.map((item) => item === existing ? { ...item, available_credits: result.availableCredits } : item);
        return [...current, { owner_type: 'profile', owner_id: ownerId, available_credits: result.availableCredits }];
      });
      setSuccess(`Invite credits updated for ${selectedOwner?.display_name || 'the selected profile'}. New available balance: ${result.availableCredits}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to adjust invite credits.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-review-page">
      <div className="admin-heading">
        <div><span className="section-label">SUPERADMIN</span><h1>Invite credits</h1><p>Add or deduct invite credits for a Creator profile. Every adjustment is written to the invite ledger and Superadmin audit log.</p></div>
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      {success && <div className="verification-mode" role="status"><div><strong>Adjustment saved</strong><span>{success}</span></div></div>}
      <form className="feature-form" onSubmit={(event) => void adjust(event)}>
        <div><span className="section-label">AUDITED ADJUSTMENT</span><h2>Adjust Creator invite credits</h2></div>
        <label>Creator profile
          <select value={ownerId} onChange={(event) => setOwnerId(event.target.value)} required>
            <option value="">Select a profile</option>
            {owners.profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.display_name} /{profile.username}</option>)}
          </select>
        </label>
        {selectedOwner && <p>Selected profile: <strong>{selectedOwner.display_name} /{selectedOwner.username}</strong>{currentBalance !== undefined ? ` · Current available invites: ${currentBalance}` : ''}</p>}
        <label>Credit adjustment
          <input type="number" min="-10000" max="10000" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} required />
        </label>
        <label>Audit reason
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={240} minLength={3} required />
        </label>
        <button className="button primary" type="submit" disabled={busy || !ownerId || !amount || !reason.trim()}>{busy ? 'Saving audited adjustment…' : 'Save audited adjustment'}</button>
      </form>
    </div>
  );
}
