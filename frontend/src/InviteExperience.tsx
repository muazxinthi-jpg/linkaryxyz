import { useEffect, useMemo, useState } from 'react';
import { ProductWorkspace, type ProductMe, type ProductProfile, type ProductStatus } from './ProductWorkspace';

type InviteBalance = { owner_type: 'profile' | 'organization'; owner_id: string; available_credits: number; lifetime_granted: number; lifetime_used: number; quality_score: number; privileges_status: string };
type Invite = {
  id: string;
  display_code: string | null;
  invite_url: string | null;
  status: string;
  uses: number;
  max_uses: number;
  expires_at: string | null;
  created_at: string;
  clicks: number;
  registrations: number;
  chosen_account_type: string | null;
  quality_state: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  owner_type: 'profile' | 'organization' | null;
  owner_id: string | null;
};

class ApiError extends Error { constructor(readonly code: string, message: string) { super(message); } }
async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers); if (init?.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string } & T;
  if (!response.ok) throw new ApiError(payload.error || 'request_failed', payload.message || 'Request failed'); return payload;
}
function cookie(name: string) { const match = document.cookie.split('; ').find((part) => part.startsWith(`${name}=`)); return match ? decodeURIComponent(match.slice(name.length + 1)) : null; }
function date(value: string | null) { if (!value) return 'No expiry'; const d = new Date(value); return Number.isNaN(d.getTime()) ? 'Unknown' : new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(d); }
function human(value: string | null | undefined) { return value ? value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Pending'; }
function safeMessage(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return fallback;
  if (error.code === 'no_invite_credits') return 'You have no invite credits remaining.';
  if (error.code === 'invites_paused') return 'Invitations are currently paused for this profile.';
  if (error.code === 'forbidden') return 'Your current role does not allow you to manage invitations.';
  if (error.code === 'invite_already_used') return 'This invitation has already been used and cannot be revoked.';
  return fallback;
}

export default function InviteExperience({ me, status }: { me: ProductMe; status: ProductStatus }) {
  const creatorFirst = status.profiles.find((p) => p.profile_type === 'creator') || status.profiles[0];
  const stored = window.localStorage.getItem('linkary.active.profile');
  const [profileId, setProfileId] = useState(stored && status.profiles.some((p) => p.id === stored) ? stored : creatorFirst?.id || '');
  const profile = status.profiles.find((p) => p.id === profileId) || creatorFirst;
  const [balances, setBalances] = useState<InviteBalance[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [expiryDays, setExpiryDays] = useState('30');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState('');

  const owner = useMemo(() => profile ? { type: profile.profile_type === 'creator' ? 'profile' as const : 'organization' as const, id: profile.profile_type === 'creator' ? profile.id : profile.organization_id || '' } : null, [profile?.id, profile?.organization_id, profile?.profile_type]);
  const balance = owner ? balances.find((b) => b.owner_type === owner.type && b.owner_id === owner.id) : undefined;
  const visibleInvites = owner ? invites.filter((invite) => invite.owner_type === owner.type && invite.owner_id === owner.id) : [];

  function changeProfile(id: string) { setProfileId(id); window.localStorage.setItem('linkary.active.profile', id); }
  async function load() {
    try {
      const [balanceResult, inviteResult] = await Promise.all([apiJson<{ balances: InviteBalance[] }>('/api/invites/balances'), apiJson<{ invites: Invite[] }>('/api/invites/list')]);
      setBalances(balanceResult.balances); setInvites(inviteResult.invites); setMessage('');
    } catch { setMessage('Invitations are temporarily unavailable. Please try again shortly.'); }
  }
  useEffect(() => { void load(); }, []);

  async function createInvite() {
    if (!owner?.id) return; const csrf = cookie('__Host-linkary_csrf'); if (!csrf) return;
    setBusy('create'); setMessage('');
    try {
      const result = await apiJson<{ inviteUrl: string }>('/api/invites', { method: 'POST', headers: { 'x-csrf-token': csrf }, body: JSON.stringify({ ownerType: owner.type, ownerId: owner.id, expiresInDays: Number(expiryDays) }) });
      await navigator.clipboard.writeText(result.inviteUrl).catch(() => undefined); setCopied(result.inviteUrl); setMessage('Invitation created and copied.'); await load(); window.setTimeout(() => setCopied(''), 1800);
    } catch (error) { setMessage(safeMessage(error, 'The invitation could not be created. Please try again.')); }
    finally { setBusy(''); }
  }
  async function copyInvite(invite: Invite) { if (!invite.invite_url) return; try { await navigator.clipboard.writeText(invite.invite_url); setCopied(invite.id); window.setTimeout(() => setCopied(''), 1500); } catch { setMessage('Select the invitation URL and copy it manually.'); } }
  async function shareInvite(invite: Invite) {
    if (!invite.invite_url) return;
    try { if (navigator.share) await navigator.share({ title: 'Join me on Linkary', text: 'You are invited to Linkary.', url: invite.invite_url }); else await copyInvite(invite); } catch {}
  }
  async function revoke(invite: Invite) {
    if (!window.confirm('Revoke this unused invitation? The invite credit will be returned.')) return;
    const csrf = cookie('__Host-linkary_csrf'); if (!csrf) return; setBusy(invite.id); setMessage('');
    try { await apiJson('/api/invites', { method: 'POST', headers: { 'x-csrf-token': csrf }, body: JSON.stringify({ action: 'revoke', inviteId: invite.id }) }); setMessage('Invitation revoked and the credit was returned.'); await load(); }
    catch (error) { setMessage(safeMessage(error, 'This invitation could not be revoked.')); }
    finally { setBusy(''); }
  }

  if (!profile) return null;
  return <ProductWorkspace me={me} status={status} profile={profile as ProductProfile} onProfileChange={changeProfile}>
    <div className="ops-stack invite-workspace">
      <div className="ops-heading-row"><div><span className="ops-kicker">PRIVATE NETWORK</span><h1>Invites</h1><p>Bring the right people into Linkary and keep every invitation attributable.</p></div></div>
      <section className="invite-summary-card"><div><span>AVAILABLE</span><strong>{balance?.available_credits ?? '—'}</strong><small>{balance ? `${balance.lifetime_used} used of ${balance.lifetime_granted} granted` : 'Invite balance'}</small></div><div><span>REFERRAL QUALITY</span><strong>{balance ? Math.round(balance.quality_score || 0) : '—'}</strong><small>{balance?.privileges_status === 'active' ? 'Invites active' : human(balance?.privileges_status)}</small></div><div className="invite-create-controls"><label>Expires in<select value={expiryDays} onChange={(e) => setExpiryDays(e.target.value)}><option value="7">7 days</option><option value="30">30 days</option><option value="60">60 days</option><option value="90">90 days</option></select></label><button className="ops-button primary" onClick={() => void createInvite()} disabled={!balance || balance.available_credits < 1 || busy === 'create'}>{busy === 'create' ? 'Creating...' : '+ Create invite'}</button></div></section>
      {message && <div className="ops-message">{message}</div>}
      <section className="ops-section"><div className="ops-section-title"><div><h2>Invitation activity</h2><p>Clicks, registrations and recipient status from Linkary's own invite infrastructure.</p></div></div>{!visibleInvites.length ? <div className="ops-empty"><div className="ops-empty-icon">＋</div><h3>No invitations yet</h3><p>Create your first invitation to bring a creator, operator or Project team member into Linkary.</p>{balance && balance.available_credits > 0 && <button className="ops-button secondary" onClick={() => void createInvite()}>Create first invite</button>}</div> : <div className="invite-list">{visibleInvites.map((invite) => { const joined = invite.registrations > 0; const status = joined ? 'joined' : invite.status; return <article className="invite-row" key={invite.id}><div className="invite-row-main"><div className="invite-row-head"><span className={`invite-status ${status}`}>{human(status)}</span><strong>{joined ? (invite.recipient_name || invite.recipient_email || 'Linkary member') : 'Private invitation'}</strong></div><div className="invite-meta"><span>{invite.clicks} click{invite.clicks === 1 ? '' : 's'}</span><span>{invite.registrations} registration{invite.registrations === 1 ? '' : 's'}</span><span>Expires {date(invite.expires_at)}</span>{joined && <span>Quality: {human(invite.quality_state)}</span>}</div>{invite.invite_url && !joined && <div className="invite-url"><input readOnly value={invite.invite_url} onFocus={(e) => e.currentTarget.select()} /><button onClick={() => void copyInvite(invite)}>{copied === invite.id ? 'Copied' : 'Copy'}</button></div>}</div><div className="invite-row-actions">{invite.invite_url && invite.status === 'active' && !joined && <button onClick={() => void shareInvite(invite)}>Share</button>}{invite.status === 'active' && !joined && <button className="danger" disabled={busy === invite.id} onClick={() => void revoke(invite)}>Revoke</button>}</div></article>; })}</div>}</section>
      {copied && copied.startsWith('http') && <div className="ops-toast">Invitation copied</div>}
    </div>
  </ProductWorkspace>;
}
