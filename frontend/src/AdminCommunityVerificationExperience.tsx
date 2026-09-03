import { useEffect, useState } from 'react';
import { ProductWorkspace, type ProductMe, type ProductProfile, type ProductStatus } from './ProductWorkspace';
import './community-verification-admin.css';

type Review = {
  id: string;
  manager_id: string;
  name: string;
  handle: string | null;
  url: string | null;
  audience_size: number;
  verification_status: string;
  manager_name: string;
  profile_username: string;
  owner_email: string | null;
  proof_code: string;
  evidence_url: string | null;
  note: string;
  submitted_at: string | null;
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

function shortDate(value: string | null): string {
  if (!value) return 'Unknown';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Unknown' : new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(parsed);
}

export default function AdminCommunityVerificationExperience({ me, status }: { me: ProductMe; status: ProductStatus }) {
  const [profileId, setProfileId] = useState(status.profiles[0]?.id || '');
  const profile = status.profiles.find((item) => item.id === profileId) || status.profiles[0];
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [reasons, setReasons] = useState<Record<string, string>>({});

  function changeProfile(id: string) {
    setProfileId(id);
    window.localStorage.setItem('linkary.active.profile', id);
  }

  async function load() {
    setLoading(true);
    setMessage('');
    try {
      const result = await api<{ reviews: Review[] }>('/api/admin/community-verifications');
      setReviews(result.reviews || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Verification queue could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function decide(item: Review, decision: 'approve' | 'reject') {
    const token = csrf();
    if (!token) return;
    if (decision === 'approve' && !window.confirm(`Approve management verification for ${item.name}?`)) return;
    setBusy(`${decision}:${item.id}`);
    setMessage('');
    try {
      await api(`/api/admin/community-verifications/${encodeURIComponent(item.id)}/${decision}`, {
        method: 'POST',
        headers: { 'x-csrf-token': token },
        body: JSON.stringify({ reason: reasons[item.id] || '' }),
      });
      setMessage(decision === 'approve' ? `${item.name} is now Verified.` : `${item.name} was returned for review.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Review could not be completed.');
    } finally {
      setBusy('');
    }
  }

  if (!profile) return null;

  return (
    <ProductWorkspace me={me} status={status} profile={profile} onProfileChange={changeProfile}>
      <section className="community-review-page">
        <header className="ops-page-header">
          <div><span className="ops-kicker">SUPERADMIN</span><h1>Community verification</h1><p>Review public Telegram evidence before Linkary marks a manager or community as verified.</p></div>
          <button className="ops-secondary" type="button" onClick={() => void load()}>Refresh</button>
        </header>
        {message && <div className="ops-banner">{message}</div>}
        {loading ? <div className="ops-empty">Loading verification queue…</div> : !reviews.length ? (
          <div className="ops-empty"><strong>Verification queue is clear</strong><p>New Community Manager proof submissions will appear here.</p></div>
        ) : (
          <div className="community-review-list">
            {reviews.map((item) => (
              <article className="ops-card community-review-card" key={item.id}>
                <div className="community-review-head"><div><span>TELEGRAM COMMUNITY</span><h2>{item.name}</h2><small>{item.handle ? `@${item.handle.replace(/^@/, '')}` : item.url || 'No handle'} · {Number(item.audience_size || 0).toLocaleString()} listed audience</small></div><span className="community-status status-submitted">Submitted</span></div>
                <div className="community-review-meta"><span><b>Manager</b>{item.manager_name}</span><span><b>Linkary</b>/{item.profile_username}</span><span><b>Email</b>{item.owner_email || 'Not available'}</span><span><b>Submitted</b>{shortDate(item.submitted_at)}</span></div>
                <div className="community-review-proof"><span>Expected proof code</span><code>{item.proof_code}</code>{item.evidence_url ? <a href={item.evidence_url} target="_blank" rel="noreferrer">Open Telegram evidence ↗</a> : <strong>No evidence URL</strong>}</div>
                {item.note && <p className="community-review-note">{item.note}</p>}
                <label className="community-review-reason">Reviewer note<textarea rows={2} value={reasons[item.id] || ''} onChange={(event) => setReasons((value) => ({ ...value, [item.id]: event.target.value }))} placeholder="Optional reason or review note" /></label>
                <div className="community-review-actions"><button className="ops-primary" type="button" disabled={Boolean(busy)} onClick={() => void decide(item, 'approve')}>{busy === `approve:${item.id}` ? 'Approving…' : 'Approve verification'}</button><button className="ops-secondary" type="button" disabled={Boolean(busy)} onClick={() => void decide(item, 'reject')}>{busy === `reject:${item.id}` ? 'Rejecting…' : 'Needs more proof'}</button></div>
              </article>
            ))}
          </div>
        )}
      </section>
    </ProductWorkspace>
  );
}
