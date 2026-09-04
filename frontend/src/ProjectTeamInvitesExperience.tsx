import { useEffect, useMemo, useState } from 'react';
import { ProductWorkspace, type ProductMe, type ProductProfile, type ProductStatus } from './ProductWorkspace';
import './team-invites.css';

type Role = 'owner' | 'admin' | 'marketing_manager' | 'analyst' | 'viewer';
type TeamRole = Exclude<Role, 'owner'>;
type Project = { id: string; name: string; status: string; verification_status: string; role: Role; username?: string | null };
type Member = { user_id: string; role: Role; display_name: string; username: string | null };
type TeamInvite = {
  id: string;
  invite_type: string;
  inviter_organization_id: string | null;
  intended_email: string | null;
  intended_project_role: TeamRole | null;
  invite_url: string | null;
  status: string;
  uses: number;
  max_uses: number;
  expires_at: string | null;
  created_at: string;
  recipient_name: string | null;
  recipient_email: string | null;
};

type AcceptResult = { ok: boolean; organizationId: string; projectName?: string; role: TeamRole; alreadyAccepted?: boolean };

class ApiError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string } & T;
  if (!response.ok) throw new ApiError(payload.error || 'request_failed', payload.message || 'Request failed');
  return payload;
}

function csrf(): string | null {
  const hit = document.cookie.split('; ').find((part) => part.startsWith('__Host-linkary_csrf='));
  return hit ? decodeURIComponent(hit.split('=').slice(1).join('=')) : null;
}

function roleTitle(value: string | null | undefined): string {
  if (value === 'marketing_manager') return 'Campaign Manager';
  if (!value) return 'Team member';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function shortDate(value: string | null): string {
  if (!value) return 'No expiry';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Unknown' : new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
}

function inviteStatus(invite: TeamInvite): string {
  if (invite.uses > 0 || invite.status === 'exhausted') return 'Accepted';
  if (invite.status === 'active') return 'Pending';
  if (invite.status === 'revoked') return 'Revoked';
  if (invite.status === 'expired') return 'Expired';
  return roleTitle(invite.status);
}

function friendlyError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  const messages: Record<string, string> = {
    owner_required: 'Only the Project Owner can invite or manage another Project Admin.',
    forbidden: 'Your current Project role cannot manage team invitations.',
    project_verification_required: 'Verify this Project with its official X identity before inviting teammates.',
    invalid_email: 'Enter a valid teammate email address.',
    invite_not_active: 'This team invitation is no longer active.',
    team_invite_email_mismatch: 'This invitation was prepared for a different email address.',
  };
  return messages[error.code] || error.message || fallback;
}

export default function ProjectTeamInvitesExperience({ me, status }: { me: ProductMe; status: ProductStatus }) {
  const projectProfiles = status.profiles.filter((item) => item.profile_type === 'project' && item.organization_id);
  const saved = window.localStorage.getItem('linkary.active.profile');
  const initialProfile = projectProfiles.find((item) => item.id === saved) || projectProfiles[0] || status.profiles[0];
  const [profileId, setProfileId] = useState(initialProfile?.id || '');
  const profile = status.profiles.find((item) => item.id === profileId) || initialProfile;
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState(profile?.organization_id || '');
  const project = projects.find((item) => item.id === projectId);
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TeamRole>('marketing_manager');
  const [expiryDays, setExpiryDays] = useState('14');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [createdUrl, setCreatedUrl] = useState('');

  const teamInvites = useMemo(() => invites.filter((invite) => invite.invite_type === 'team_invite' && invite.inviter_organization_id === projectId), [invites, projectId]);
  const canAdmin = Boolean(project && ['owner', 'admin'].includes(project.role));

  function changeProfile(id: string) {
    setProfileId(id);
    window.localStorage.setItem('linkary.active.profile', id);
    const selected = status.profiles.find((item) => item.id === id);
    if (selected?.organization_id) setProjectId(selected.organization_id);
  }

  async function loadProjects() {
    try {
      const result = await api<{ organizations: Project[] }>('/api/organizations');
      setProjects(result.organizations);
      const desired = profile?.organization_id && result.organizations.some((item) => item.id === profile.organization_id)
        ? profile.organization_id
        : result.organizations[0]?.id || '';
      setProjectId((current) => current && result.organizations.some((item) => item.id === current) ? current : desired);
    } catch { setMessage('Project access is temporarily unavailable.'); }
  }

  async function loadTeamData(id = projectId) {
    if (!id) { setInvites([]); setMembers([]); return; }
    try {
      const [inviteResult, memberResult] = await Promise.all([
        api<{ invites: TeamInvite[] }>('/api/invites/list'),
        api<{ members: Member[] }>(`/api/projects/${encodeURIComponent(id)}/members`).catch(() => ({ members: [] })),
      ]);
      setInvites(inviteResult.invites);
      setMembers(memberResult.members);
    } catch { setMessage('Team invitations are temporarily unavailable.'); }
  }

  useEffect(() => { void loadProjects(); }, []);
  useEffect(() => { void loadTeamData(); }, [projectId, projects.length]);
  useEffect(() => {
    if (profile?.organization_id && projects.some((item) => item.id === profile.organization_id)) setProjectId(profile.organization_id);
  }, [profileId, projects.length]);

  async function createInvite(event: React.FormEvent) {
    event.preventDefault();
    if (!projectId) return;
    const token = csrf(); if (!token) return;
    setBusy('create'); setMessage(''); setCreatedUrl('');
    try {
      const result = await api<{ inviteUrl: string; duplicate: boolean; consumesNetworkCredit: boolean }>('/api/invites', {
        method: 'POST',
        headers: { 'x-csrf-token': token },
        body: JSON.stringify({
          action: 'create_team',
          organizationId: projectId,
          role,
          email: email.trim() || null,
          expiresInDays: Number(expiryDays),
        }),
      });
      setCreatedUrl(result.inviteUrl);
      setMessage(result.duplicate ? 'An active invitation for this teammate already existed.' : 'Team invitation created. No network invite credit was used.');
      await navigator.clipboard.writeText(result.inviteUrl).catch(() => undefined);
      await loadTeamData();
    } catch (error) { setMessage(friendlyError(error, 'The team invitation could not be created.')); }
    finally { setBusy(''); }
  }

  async function copyInvite(invite: TeamInvite) {
    if (!invite.invite_url) return;
    try { await navigator.clipboard.writeText(invite.invite_url); setMessage('Team invitation copied.'); }
    catch { setMessage('Copy is unavailable in this browser. Select the invitation URL manually.'); }
  }

  async function shareInvite(invite: TeamInvite) {
    if (!invite.invite_url) return;
    try {
      if (navigator.share) await navigator.share({ title: `Join ${project?.name || 'this Project'} on Linkary`, text: `You are invited as ${roleTitle(invite.intended_project_role)}.`, url: invite.invite_url });
      else await copyInvite(invite);
    } catch {}
  }

  async function revokeInvite(invite: TeamInvite) {
    if (!window.confirm('Revoke this unused team invitation?')) return;
    const token = csrf(); if (!token) return;
    setBusy(invite.id); setMessage('');
    try {
      await api('/api/invites', { method: 'POST', headers: { 'x-csrf-token': token }, body: JSON.stringify({ action: 'revoke_team', inviteId: invite.id }) });
      setMessage('Team invitation revoked. Network invite credits were unchanged.');
      await loadTeamData();
    } catch (error) { setMessage(friendlyError(error, 'The team invitation could not be revoked.')); }
    finally { setBusy(''); }
  }

  if (!profile) return null;
  if (profile.profile_type !== 'project') {
    return <ProductWorkspace me={me} status={status} profile={profile as ProductProfile} onProfileChange={changeProfile}>
      <div className="ops-stack"><div className="ops-heading-row"><div><span className="ops-kicker">PROJECT TEAM</span><h1>Team invitations belong to a Project</h1><p>Switch into a Project workspace to invite teammates without spending network invite credits.</p></div><a className="ops-button primary" href="/settings">Open Projects</a></div></div>
    </ProductWorkspace>;
  }

  return <ProductWorkspace me={me} status={status} profile={profile as ProductProfile} onProfileChange={changeProfile}>
    <div className="ops-stack team-invite-workspace">
      <div className="ops-heading-row"><div><span className="ops-kicker">PROJECT TEAM</span><h1>Invite teammates</h1><p>Give trusted operators access to this Project. Team invitations are separate from Linkary network referrals and never consume your Project's network invite credits.</p></div><a className="ops-button secondary" href="/settings">Manage active team</a></div>

      <div className="ops-project-toolbar"><div><span className="ops-kicker">PROJECT</span>{projects.length > 1 ? <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select> : <strong>{project?.name || profile.display_name}</strong>}</div>{project && <div className={`ops-project-state ${project.verification_status === 'verified_x' ? 'verified' : 'pending'}`}>{project.verification_status === 'verified_x' ? 'Verified on X' : 'Verification required'}</div>}</div>

      <section className="team-invite-principle"><div><strong>0 network credits</strong><span>Project team access is operational access, not a referral.</span></div><div><strong>Single use</strong><span>Each invitation can be accepted once and revoked before use.</span></div><div><strong>Role locked</strong><span>The invitation carries the Project role selected below.</span></div></section>

      {message && <div className="ops-message">{message}</div>}
      {createdUrl && <div className="team-invite-created"><div><strong>Invitation ready</strong><span>Copied when your browser allows it.</span></div><input readOnly value={createdUrl} onFocus={(event) => event.currentTarget.select()} /></div>}

      <section className="ops-section">
        <div className="ops-section-title"><div><h2>Create team invitation</h2><p>Owner and Project Admin can invite teammates. Only Owner can grant Project Admin access.</p></div></div>
        {!canAdmin ? <div className="ops-empty compact"><p>Your {roleTitle(project?.role)} role can view Project work but cannot invite teammates.</p></div> : <form className="team-invite-form" onSubmit={createInvite}>
          <label>Teammate email, optional<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" /><small>Adding an email helps identify who the invite was prepared for. The invite remains single-use.</small></label>
          <label>Project role<select value={role} onChange={(event) => setRole(event.target.value as TeamRole)}><option value="marketing_manager">Campaign Manager</option><option value="analyst">Analyst</option><option value="viewer">Viewer</option>{project?.role === 'owner' && <option value="admin">Project Admin</option>}</select><small>{role === 'marketing_manager' ? 'Can run campaigns, partners and growth activity.' : role === 'analyst' ? 'Can inspect evidence and reporting.' : role === 'viewer' ? 'Read-only Project access.' : 'Broad Project administration access.'}</small></label>
          <label>Expires in<select value={expiryDays} onChange={(event) => setExpiryDays(event.target.value)}><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option><option value="60">60 days</option><option value="90">90 days</option></select></label>
          <button className="ops-button primary" disabled={busy === 'create' || !project || project.verification_status !== 'verified_x'}>{busy === 'create' ? 'Creating...' : 'Create team invitation'}</button>
        </form>}
      </section>

      <section className="ops-section">
        <div className="ops-section-title"><div><h2>Team invitation activity</h2><p>{teamInvites.length} invitation{teamInvites.length === 1 ? '' : 's'} for {project?.name || 'this Project'}.</p></div></div>
        {!teamInvites.length ? <div className="ops-empty"><div className="ops-empty-icon">＋</div><h3>No team invitations yet</h3><p>Create a role-specific invitation when a teammate is not already on Linkary.</p></div> : <div className="team-invite-list">{teamInvites.map((invite) => <article key={invite.id}><div className="team-invite-copy"><div><span className={`team-invite-status status-${inviteStatus(invite).toLowerCase().replace(/\s+/g, '-')}`}>{inviteStatus(invite)}</span><strong>{invite.intended_email || invite.recipient_email || invite.recipient_name || 'Unassigned teammate'}</strong></div><small>{roleTitle(invite.intended_project_role)} · created {shortDate(invite.created_at)} · expires {shortDate(invite.expires_at)}</small>{invite.invite_url && invite.status === 'active' && invite.uses === 0 && <input readOnly value={invite.invite_url} onFocus={(event) => event.currentTarget.select()} />}</div><div className="team-invite-actions">{invite.invite_url && invite.status === 'active' && invite.uses === 0 && <><button onClick={() => void copyInvite(invite)}>Copy</button><button onClick={() => void shareInvite(invite)}>Share</button><button className="danger" disabled={busy === invite.id} onClick={() => void revokeInvite(invite)}>Revoke</button></>}</div></article>)}</div>}
      </section>

      <section className="ops-section">
        <div className="ops-section-title"><div><h2>Active Project team</h2><p>{members.length} active member{members.length === 1 ? '' : 's'}. Role changes and removals remain in Project settings.</p></div><a className="ops-button small" href="/settings">Manage team</a></div>
        {!members.length ? <div className="ops-empty compact"><p>No active team members were returned.</p></div> : <div className="team-invite-members">{members.map((member) => <article key={member.user_id}><div className="team-member-avatar">{(member.display_name || member.username || '?').slice(0, 1).toUpperCase()}</div><div><strong>{member.display_name || member.username || 'Linkary member'}</strong><small>{member.username ? `@${member.username.replace(/^@/, '')}` : 'Linkary member'}</small></div><span>{roleTitle(member.role)}</span></article>)}</div>}
      </section>
    </div>
  </ProductWorkspace>;
}

export function TeamInviteAcceptExperience() {
  const code = new URLSearchParams(window.location.search).get('invite')?.trim() || '';
  const [state, setState] = useState<'idle' | 'accepting' | 'accepted' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function accept() {
    if (!code) { setState('error'); setMessage('This team invitation is missing its invitation code.'); return; }
    const token = csrf();
    if (!token) { setState('error'); setMessage('Your Linkary session needs to be refreshed before accepting this invitation.'); return; }
    setState('accepting'); setMessage('');
    try {
      const result = await api<AcceptResult>('/api/invites', { method: 'POST', headers: { 'x-csrf-token': token }, body: JSON.stringify({ action: 'accept_team', inviteCode: code }) });
      setState('accepted');
      setMessage(result.alreadyAccepted ? 'You already have access from this team invitation.' : `You now have ${roleTitle(result.role)} access${result.projectName ? ` to ${result.projectName}` : ''}.`);
      window.setTimeout(() => window.location.replace('/settings'), 900);
    } catch (error) { setState('error'); setMessage(friendlyError(error, 'This team invitation could not be accepted.')); }
  }

  useEffect(() => { void accept(); }, []);

  return <main className="team-invite-accept-shell"><section className="team-invite-accept-card"><a className="team-invite-brand" href="https://linkary.xyz"><img src="/assets/brand/linkary-icon-black.png" alt="" /><strong>Linkary</strong></a><span className="ops-kicker">PROJECT TEAM INVITATION</span><h1>{state === 'accepted' ? 'Project access added' : state === 'error' ? 'Invitation needs attention' : 'Adding Project access'}</h1><p>{message || 'Linkary is verifying this single-use team invitation and attaching the Project workspace to your account.'}</p>{state === 'accepting' || state === 'idle' ? <div className="spinner" /> : state === 'accepted' ? <a className="ops-button primary" href="/settings">Open Project</a> : <button className="ops-button primary" onClick={() => void accept()}>Try again</button>}<small>Team invitations do not use network referral credits.</small></section></main>;
}
