import { useEffect, useState } from 'react';
import type { ProductMe } from './ProductWorkspace';
import SuperadminWorkspace from './SuperadminWorkspace';

type Claim = {
  id: string;
  claimCode: string;
  status: string;
  submittedPostUrl: string | null;
  rejectionReason: string | null;
  expiresAt: string;
  createdAt?: string;
};

function csrf(): string | null {
  const hit = document.cookie.split('; ').find((part) => part.startsWith('__Host-linkary_csrf='));
  return hit ? decodeURIComponent(hit.split('=').slice(1).join('=')) : null;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  const body = await response.json().catch(() => ({})) as T & { message?: string };
  if (!response.ok) throw new Error(body.message || 'Request failed');
  return body;
}

export default function AdminCreatorAccessExperience({ me }: { me: ProductMe }) {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [reasons, setReasons] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    setMessage('');
    try {
      const result = await api<{ claims: Claim[] }>('/api/admin/creator-access?status=submitted');
      setClaims(result.claims || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Creator access queue could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function decide(claim: Claim, decision: 'approve' | 'reject') {
    const token = csrf();
    if (!token) {
      setMessage('Security token unavailable. Refresh the console and try again.');
      return;
    }
    if (decision === 'approve' && !window.confirm(`Approve ${claim.claimCode}?`)) return;
    const reason = reasons[claim.id]?.trim() || '';
    if (decision === 'reject' && !reason) {
      setMessage('Add a rejection reason before rejecting a claim.');
      return;
    }
    setBusy(`${decision}:${claim.id}`);
    setMessage('');
    try {
      await api(`/api/admin/creator-access/${encodeURIComponent(claim.id)}/${decision}`, {
        method: 'POST',
        headers: { 'x-csrf-token': token },
        body: decision === 'reject' ? JSON.stringify({ reason }) : undefined,
      });
      setMessage(decision === 'approve' ? `${claim.claimCode} approved.` : `${claim.claimCode} rejected.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Review could not be completed.');
    } finally {
      setBusy('');
    }
  }

  return (
    <SuperadminWorkspace me={me}>
      <div className="ops-stack">
        <div className="ops-heading-row">
          <div>
            <span className="ops-kicker">SUPERADMIN</span>
            <h1>Creator access review</h1>
            <p>Review Creator Earn Access X-post evidence before granting access to Linkary.</p>
          </div>
          <button className="ops-button primary" type="button" onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh queue'}</button>
        </div>
        {message && <div className="ops-message">{message}</div>}
        {loading ? <div className="ops-empty">Loading creator access queue…</div> : !claims.length ? (
          <div className="ops-empty"><strong>Review queue is clear</strong><p>Submitted Creator Earn Access claims will appear here.</p></div>
        ) : (
          <div className="ops-table-list">
            {claims.map((claim) => (
              <article className="ops-card" key={claim.id}>
                <div className="ops-heading-row">
                  <div><span className="ops-kicker">{claim.claimCode}</span><h3>Creator Earn Access</h3><p>{claim.submittedPostUrl || 'No X post URL submitted'}</p></div>
                  {claim.submittedPostUrl && <a className="ops-button secondary" href={claim.submittedPostUrl} target="_blank" rel="noreferrer">Open X post ↗</a>}
                </div>
                <label>Reviewer note<textarea rows={2} value={reasons[claim.id] || ''} onChange={(event) => setReasons((value) => ({ ...value, [claim.id]: event.target.value }))} placeholder="Required when rejecting" /></label>
                <div className="ops-heading-actions">
                  <button className="ops-button primary" type="button" disabled={Boolean(busy)} onClick={() => void decide(claim, 'approve')}>{busy === `approve:${claim.id}` ? 'Approving…' : 'Approve'}</button>
                  <button className="ops-button secondary" type="button" disabled={Boolean(busy)} onClick={() => void decide(claim, 'reject')}>{busy === `reject:${claim.id}` ? 'Rejecting…' : 'Reject'}</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </SuperadminWorkspace>
  );
}
