import { useEffect, useState } from 'react';

type Asset = { id: string; name: string; verification_status: string };
type Status = { assetId: string; status: string; proofCode: string; submittedAt: string | null; evidenceUrl: string | null; note: string };

type ApiError = { error?: string; message?: string };

function csrf(): string | null {
  const hit = document.cookie.split('; ').find((part) => part.startsWith('__Host-linkary_csrf='));
  return hit ? decodeURIComponent(hit.split('=').slice(1).join('=')) : null;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  const payload = (await response.json().catch(() => ({}))) as T & ApiError;
  if (!response.ok) throw new Error(payload.message || 'Request failed');
  return payload;
}

export default function CommunityVerificationPanel({ asset, onChanged }: { asset: Asset; onChanged: () => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function load() {
    try {
      const next = await api<Status>(`/api/community-verifications?assetId=${encodeURIComponent(asset.id)}`);
      setStatus(next);
      setEvidenceUrl(next.evidenceUrl || '');
      setNote(next.note || '');
    } catch {
      setMessage('Verification details are temporarily unavailable.');
    }
  }

  useEffect(() => {
    if (open) void load();
  }, [open, asset.id, asset.verification_status]);

  async function copyCode() {
    if (!status?.proofCode) return;
    await navigator.clipboard.writeText(status.proofCode).catch(() => undefined);
    setMessage('Proof code copied.');
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const token = csrf();
    if (!token) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await api<Status>('/api/community-verifications', {
        method: 'POST',
        headers: { 'x-csrf-token': token },
        body: JSON.stringify({ assetId: asset.id, evidenceUrl, note }),
      });
      setStatus((current) => current ? { ...current, status: result.status, evidenceUrl: result.evidenceUrl } : current);
      setMessage('Verification submitted for Linkary review.');
      await onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Verification could not be submitted.');
    } finally {
      setBusy(false);
    }
  }

  if (asset.verification_status === 'verified') {
    return <div className="community-proof-verified"><strong>✓ Management verified</strong><span>Linkary reviewed public Telegram ownership evidence for this community.</span></div>;
  }

  return (
    <div className="community-proof-panel">
      <button type="button" className="community-proof-toggle" onClick={() => setOpen((value) => !value)}>
        {asset.verification_status === 'submitted' ? 'View verification' : 'Verify management'}
      </button>
      {open && (
        <div className="community-proof-body">
          <div className="community-proof-heading"><strong>Prove you manage {asset.name}</strong><button type="button" onClick={() => setOpen(false)}>Close</button></div>
          <ol>
            <li>Copy the unique Linkary proof code below.</li>
            <li>Place it temporarily in the Telegram community description, or publish it in a public community post.</li>
            <li>Paste the public Telegram URL showing that proof and submit it for review.</li>
          </ol>
          {!status ? <p>Loading proof code…</p> : (
            <>
              <div className="community-proof-code"><code>{status.proofCode}</code><button type="button" onClick={() => void copyCode()}>Copy</button></div>
              <form onSubmit={submit}>
                <label>Public Telegram proof URL<input required value={evidenceUrl} onChange={(event) => setEvidenceUrl(event.target.value)} placeholder="https://t.me/yourchannel/123" /></label>
                <label>Review note (optional)<textarea rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Where the code appears, or anything the reviewer should know." /></label>
                <button className="ops-primary" disabled={busy}>{busy ? 'Submitting…' : asset.verification_status === 'submitted' ? 'Update verification evidence' : 'Submit for verification'}</button>
              </form>
            </>
          )}
          {message && <p className="community-proof-message">{message}</p>}
          {asset.verification_status === 'submitted' && <p className="community-proof-pending"><strong>Under review.</strong> Linkary will not show this community as Verified until a Superadmin approves the evidence.</p>}
        </div>
      )}
    </div>
  );
}
