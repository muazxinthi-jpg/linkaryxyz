import { useEffect, useMemo, useState } from 'react';
import { ProductWorkspace, type ProductMe, type ProductProfile, type ProductStatus } from './ProductWorkspace';
import './project-beta.css';

type Role = 'owner' | 'admin' | 'marketing_manager' | 'analyst' | 'viewer';
type RequestableRole = Exclude<Role, 'owner'>;
type Project = { id: string; name: string; status?: string; verification_status: string; role: Role; username?: string | null };
type Member = { user_id: string; role: Role; billing_manager: number; display_name: string; email: string | null };
type Candidate = { id: string; display_name: string; email: string | null };
type SearchProject = { organization_id: string; name: string; username: string };
type MyRequest = { id: string; organization_id: string; name: string; username: string; requested_role: RequestableRole; status: string; note: string; created_at: string };
type IncomingRequest = { id: string; requested_role: RequestableRole; note: string; created_at: string; display_name: string; email: string | null };
type Partner = { id: string; display_name: string; primary_handle: string | null; partner_kind: string; status: string; notes: string | null };

type Tab = 'access' | 'team' | 'partners';

class ApiError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  const body = (await response.json().catch(() => ({}))) as { error?: string; message?: string } & T;
  if (!response.ok) throw new ApiError(body.error || 'request_failed', body.message || 'Request failed');
  return body;
}

function csrf(): string | null {
  const value = document.cookie.split('; ').find((part) => part.startsWith('__Host-linkary_csrf='));
  return value ? decodeURIComponent(value.split('=').slice(1).join('=')) : null;
}

function title(value: string): string {
  if (value === 'marketing_manager') return 'Campaign Manager';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function date(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Recently' : new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
}

function roleDescription(role: RequestableRole): string {
  const descriptions: Record<RequestableRole, string> = {
    admin: 'Manage the Project, team access and campaigns.',
    marketing_manager: 'Create and manage campaigns, partners and growth activity.',
    analyst: 'Review campaign evidence, tracking and outcomes.',
    viewer: 'Read-only access to the Project workspace.',
  };
  return descriptions[role];
}

function requestStatus(status: string): string {
  if (status === 'submitted') return 'Pending review';
  return title(status);
}

function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  const messages: Record<string, string> = {
    already_member: 'You already have access to this Project.',
    owner_required: 'Only the Project Owner can complete this action.',
    forbidden: 'Your current Project role does not allow this action.',
    access_request_not_found: 'This access request is no longer pending.',
    project_not_found: 'This verified Project is no longer available.',
    self_change_forbidden: 'You cannot change your own Project role.',
    self_remove_forbidden: 'You cannot remove yourself from this Project.',
    owner_protected: 'Project ownership must be transferred instead of removed.',
  };
  return messages[error.code] || error.message || fallback;
}

export default function ProjectExperienceBeta({ me, status }: { me: ProductMe; status: ProductStatus }) {
  const creatorFirst = status.profiles.find((item) => item.profile_type === 'creator') || status.profiles[0];
  const saved = window.localStorage.getItem('linkary.active.profile');
  const [profileId, setProfileId] = useState(saved && status.profiles.some((item) => item.id === saved) ? saved : creatorFirst?.id || '');
  const profile = status.profiles.find((item) => item.id === profileId) || creatorFirst;

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const project = projects.find((item) => item.id === projectId);
  const [tab, setTab] = useState<Tab>('access');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');

  const [projectQuery, setProjectQuery] = useState('');
  const [projectResults, setProjectResults] = useState<SearchProject[]>([]);
  const [myRequests, setMyRequests] = useState<MyRequest[]>([]);
  const [requestTarget, setRequestTarget] = useState<SearchProject | null>(null);
  const [requestRole, setRequestRole] = useState<RequestableRole>('marketing_manager');
  const [requestNote, setRequestNote] = useState('');

  const [incoming, setIncoming] = useState<IncomingRequest[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [memberQuery, setMemberQuery] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [addRole, setAddRole] = useState<RequestableRole>('marketing_manager');
  const [transferUserId, setTransferUserId] = useState('');
  const [partners, setPartners] = useState<Partner[]>([]);

  const linkedProjectProfiles = useMemo(() => new Map(status.profiles.filter((item) => item.profile_type === 'project' && item.organization_id).map((item) => [item.organization_id!, item])), [status.profiles]);
  const canAdmin = Boolean(project && ['owner', 'admin'].includes(project.role));
  const canManagePartners = Boolean(project && ['owner', 'admin', 'marketing_manager'].includes(project.role));

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
      const selectedId = profile?.organization_id && result.organizations.some((item) => item.id === profile.organization_id)
        ? profile.organization_id
        : result.organizations[0]?.id || '';
      setProjectId((current) => current && result.organizations.some((item) => item.id === current) ? current : selectedId);
    } catch {
      setMessage('Project access is temporarily unavailable.');
    }
  }

  async function loadMyRequests() {
    try { setMyRequests((await api<{ requests: MyRequest[] }>('/api/projects/access-requests/mine')).requests); }
    catch { setMyRequests([]); }
  }

  async function loadProjectData(id = projectId) {
    if (!id) { setIncoming([]); setMembers([]); setPartners([]); return; }
    const activeProject = projects.find((item) => item.id === id);
    const jobs: Promise<unknown>[] = [
      api<{ members: Member[] }>(`/api/projects/${encodeURIComponent(id)}/members`).then((result) => setMembers(result.members)).catch(() => setMembers([])),
      api<{ partners: Partner[] }>(`/api/project-partner-shortlists?organizationId=${encodeURIComponent(id)}`).then((result) => setPartners(result.partners)).catch(() => setPartners([])),
    ];
    if (activeProject && ['owner', 'admin'].includes(activeProject.role)) {
      jobs.push(api<{ requests: IncomingRequest[] }>(`/api/projects/${encodeURIComponent(id)}/access-requests`).then((result) => setIncoming(result.requests)).catch(() => setIncoming([])));
    } else setIncoming([]);
    await Promise.all(jobs);
  }

  useEffect(() => { void Promise.all([loadProjects(), loadMyRequests()]); }, []);
  useEffect(() => { void loadProjectData(); }, [projectId, projects.length]);
  useEffect(() => {
    if (profile?.organization_id && projects.some((item) => item.id === profile.organization_id)) setProjectId(profile.organization_id);
  }, [profileId, projects.length]);

  async function searchProjects(event: React.FormEvent) {
    event.preventDefault();
    if (projectQuery.trim().length < 2) return;
    setBusy('project-search'); setMessage('');
    try {
      const result = await api<{ projects: SearchProject[] }>(`/api/projects/search?query=${encodeURIComponent(projectQuery.trim())}`);
      const managed = new Set(projects.map((item) => item.id));
      setProjectResults(result.projects.filter((item) => !managed.has(item.organization_id)));
      if (!result.projects.length) setMessage('No verified Linkary Projects matched that search.');
    } catch { setMessage('Project search is temporarily unavailable.'); }
    finally { setBusy(''); }
  }

  function openRequest(target: SearchProject) {
    setRequestTarget(target); setRequestRole('marketing_manager'); setRequestNote(''); setMessage('');
  }

  async function submitRequest(event: React.FormEvent) {
    event.preventDefault();
    if (!requestTarget) return;
    const token = csrf(); if (!token) return;
    setBusy('request'); setMessage('');
    try {
      await api(`/api/projects/${encodeURIComponent(requestTarget.organization_id)}/access-requests`, {
        method: 'POST', headers: { 'x-csrf-token': token }, body: JSON.stringify({ role: requestRole, note: requestNote }),
      });
      setMessage(`Access request sent to ${requestTarget.name}.`);
      setRequestTarget(null); setProjectResults([]); setProjectQuery('');
      await loadMyRequests();
    } catch (error) { setMessage(errorMessage(error, 'The access request could not be sent.')); }
    finally { setBusy(''); }
  }

  async function cancelRequest(request: MyRequest) {
    if (!window.confirm(`Cancel your access request to ${request.name}?`)) return;
    const token = csrf(); if (!token) return;
    setBusy(request.id); setMessage('');
    try {
      await api(`/api/projects/access-requests/${encodeURIComponent(request.id)}/cancel`, { method: 'POST', headers: { 'x-csrf-token': token } });
      setMessage('Access request cancelled.'); await loadMyRequests();
    } catch (error) { setMessage(errorMessage(error, 'The request could not be cancelled.')); }
    finally { setBusy(''); }
  }

  async function reviewAccess(request: IncomingRequest, decision: 'approve' | 'reject') {
    if (!projectId) return;
    if (decision === 'reject' && !window.confirm(`Reject ${request.display_name}'s access request?`)) return;
    const token = csrf(); if (!token) return;
    setBusy(request.id); setMessage('');
    try {
      await api(`/api/projects/access-requests/${encodeURIComponent(request.id)}/${decision}`, { method: 'POST', headers: { 'x-csrf-token': token } });
      setMessage(decision === 'approve' ? `${request.display_name} now has ${title(request.requested_role)} access.` : 'Access request rejected.');
      await loadProjectData();
    } catch (error) { setMessage(errorMessage(error, 'The access request could not be reviewed.')); }
    finally { setBusy(''); }
  }

  async function searchMembers(event: React.FormEvent) {
    event.preventDefault();
    if (!projectId || memberQuery.trim().length < 2) return;
    setBusy('member-search'); setMessage('');
    try { setCandidates((await api<{ users: Candidate[] }>(`/api/projects/${encodeURIComponent(projectId)}/eligible-members?query=${encodeURIComponent(memberQuery.trim())}`)).users); }
    catch { setMessage('Unable to find Linkary members.'); }
    finally { setBusy(''); }
  }

  async function addMember(userId: string) {
    if (!projectId) return;
    const token = csrf(); if (!token) return;
    setBusy(userId); setMessage('');
    try {
      await api(`/api/projects/${encodeURIComponent(projectId)}/members`, { method: 'POST', headers: { 'x-csrf-token': token }, body: JSON.stringify({ userId, role: addRole }) });
      setMessage('Project member added.'); setCandidates([]); setMemberQuery(''); await loadProjectData();
    } catch (error) { setMessage(errorMessage(error, 'Unable to add this member.')); }
    finally { setBusy(''); }
  }

  async function updateMember(userId: string, role: RequestableRole) {
    if (!projectId) return;
    const token = csrf(); if (!token) return;
    setBusy(userId); setMessage('');
    try {
      await api(`/api/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`, { method: 'PATCH', headers: { 'x-csrf-token': token }, body: JSON.stringify({ role }) });
      setMessage('Project role updated.'); await loadProjectData();
    } catch (error) { setMessage(errorMessage(error, 'Unable to update this role.')); }
    finally { setBusy(''); }
  }

  async function removeMember(member: Member) {
    if (!projectId || !window.confirm(`Remove ${member.display_name || member.email || 'this member'} from ${project?.name}? They will lose Project access immediately.`)) return;
    const token = csrf(); if (!token) return;
    setBusy(member.user_id); setMessage('');
    try {
      await api(`/api/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(member.user_id)}`, { method: 'DELETE', headers: { 'x-csrf-token': token } });
      setMessage('Project access removed.'); await loadProjectData();
    } catch (error) { setMessage(errorMessage(error, 'Unable to remove this member.')); }
    finally { setBusy(''); }
  }

  async function transferOwnership() {
    if (!projectId || !project || project.role !== 'owner' || !transferUserId) return;
    const target = members.find((member) => member.user_id === transferUserId);
    if (!target) return;
    const name = target.display_name || target.email || 'this member';
    if (!window.confirm(`Transfer ownership of ${project.name} to ${name}? You will become a Project Admin and ${name} will become the new Owner. This changes the highest level of control.`)) return;
    const token = csrf(); if (!token) return;
    setBusy('transfer'); setMessage('');
    try {
      await api(`/api/projects/${encodeURIComponent(projectId)}/transfer-ownership`, { method: 'POST', headers: { 'x-csrf-token': token }, body: JSON.stringify({ userId: transferUserId }) });
      setMessage('Project ownership transferred. Refreshing your workspace access...');
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) { setMessage(errorMessage(error, 'Ownership could not be transferred.')); setBusy(''); }
  }

  async function updatePartner(partner: Partner, statusValue: string) {
    const token = csrf(); if (!token) return;
    setBusy(partner.id); setMessage('');
    try {
      await api('/api/project-partner-shortlists', { method: 'POST', headers: { 'x-csrf-token': token }, body: JSON.stringify({ shortlistId: partner.id, status: statusValue, notes: partner.notes || '' }) });
      setMessage('Partner shortlist updated.'); await loadProjectData();
    } catch (error) { setMessage(errorMessage(error, 'Unable to update this partner.')); }
    finally { setBusy(''); }
  }

  async function promotePartner(partner: Partner) {
    const token = csrf(); if (!token) return;
    setBusy(partner.id); setMessage('');
    try {
      const result = await api<{ existing: boolean }>(`/api/project-partner-shortlists/${encodeURIComponent(partner.id)}/promote`, { method: 'POST', headers: { 'x-csrf-token': token } });
      setMessage(result.existing ? `${partner.display_name} is already in this Project network.` : `${partner.display_name} can now be attached to campaign evidence.`);
    } catch (error) { setMessage(errorMessage(error, 'Unable to add this partner to the Project network.')); }
    finally { setBusy(''); }
  }

  if (!profile) return null;

  if (profile.profile_type === 'creator') {
    const pending = myRequests.filter((item) => item.status === 'submitted');
    const decided = myRequests.filter((item) => item.status !== 'submitted');
    return <ProductWorkspace me={me} status={status} profile={profile as ProductProfile} onProfileChange={changeProfile}>
      <div className="ops-stack project-beta creator-project-access">
        <div className="ops-heading-row"><div><span className="ops-kicker">PROJECT RELATIONSHIPS</span><h1>Join the Projects you work with</h1><p>Your Creator identity stays personal. Request the right Project role, then switch into that Project workspace when access is approved.</p></div><button className="ops-button secondary" onClick={() => window.location.reload()}>Refresh access</button></div>
        {message && <div className="ops-message">{message}</div>}

        <section className="project-beta-principle"><strong>One Linkary identity. Multiple Project relationships.</strong><span>You should never create duplicate personal accounts just to join another Project.</span></section>

        <section className="ops-section">
          <div className="ops-section-title"><div><h2>Projects you can access</h2><p>Approved Project relationships appear as separate workspaces without changing your Creator profile.</p></div></div>
          {!projects.length ? <div className="ops-empty compact"><p>You do not have Project access yet. Find a registered Project below.</p></div> : <div className="project-beta-list">{projects.map((item) => { const linked = linkedProjectProfiles.get(item.id); return <article key={item.id}><div><span className={`project-beta-state ${item.verification_status === 'verified_x' ? 'verified' : ''}`}>{item.verification_status === 'verified_x' ? 'Verified on X' : 'Verification required'}</span><strong>{item.name}</strong><small>{title(item.role)} access</small></div>{linked ? <button className="ops-button secondary" onClick={() => changeProfile(linked.id)}>Open workspace</button> : <button className="ops-button secondary" onClick={() => window.location.reload()}>Refresh</button>}</article>; })}</div>}
        </section>

        <section className="ops-section project-beta-discovery">
          <div className="ops-section-title"><div><h2>Find a registered Project</h2><p>Search verified Linkary Projects by name or X-linked username.</p></div></div>
          <form className="project-beta-search" onSubmit={searchProjects}><input value={projectQuery} onChange={(event) => setProjectQuery(event.target.value)} placeholder="Project name or username" minLength={2} required /><button className="ops-button primary" disabled={busy === 'project-search'}>{busy === 'project-search' ? 'Searching...' : 'Search Projects'}</button></form>
          <div className="project-beta-results">{projectResults.map((item) => <article key={item.organization_id}><div><span className="project-beta-state verified">Verified on X</span><strong>{item.name}</strong><small>@{item.username}</small></div><button className="ops-button secondary" onClick={() => openRequest(item)}>Request access</button></article>)}</div>
          <div className="project-beta-register-note"><div><strong>Project not on Linkary yet?</strong><span>The Project should register using its official X identity first. Once verified, team members can request or receive access.</span></div><span>Project ownership stays tied to the verified Project identity.</span></div>
        </section>

        {(pending.length > 0 || decided.length > 0) && <section className="ops-section"><div className="ops-section-title"><div><h2>Your access requests</h2><p>Track pending and past Project access requests.</p></div></div><div className="project-beta-request-list">{[...pending, ...decided].map((request) => <article key={request.id}><div><span className={`project-beta-request-status ${request.status}`}>{requestStatus(request.status)}</span><strong>{request.name}</strong><small>@{request.username} · {title(request.requested_role)} · {date(request.created_at)}</small>{request.note && <p>{request.note}</p>}</div>{request.status === 'submitted' ? <button className="ops-button small" disabled={busy === request.id} onClick={() => void cancelRequest(request)}>Cancel request</button> : request.status === 'approved' ? <button className="ops-button secondary" onClick={() => window.location.reload()}>Refresh workspace</button> : null}</article>)}</div></section>}
      </div>
      {requestTarget && <div className="ops-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setRequestTarget(null); }}><form className="ops-modal project-beta-modal" onSubmit={submitRequest}><div className="ops-modal-head"><div><span className="ops-kicker">PROJECT ACCESS</span><h2>Request access to {requestTarget.name}</h2></div><button type="button" onClick={() => setRequestTarget(null)}>×</button></div><label>Role<select value={requestRole} onChange={(event) => setRequestRole(event.target.value as RequestableRole)}><option value="marketing_manager">Campaign Manager</option><option value="analyst">Analyst</option><option value="viewer">Viewer</option><option value="admin">Project Admin</option></select><small>{roleDescription(requestRole)}</small></label><label>Note, optional<textarea value={requestNote} maxLength={500} placeholder="Tell the Project team why you need access or what you are responsible for." onChange={(event) => setRequestNote(event.target.value)} /></label><div className="project-beta-role-warning">Project Admin gives broad control. Request it only when you are actually responsible for Project administration.</div><div className="ops-form-actions"><button type="button" className="ops-button ghost" onClick={() => setRequestTarget(null)}>Cancel</button><button className="ops-button primary" disabled={busy === 'request'}>{busy === 'request' ? 'Sending...' : 'Send access request'}</button></div></form></div>}
    </ProductWorkspace>;
  }

  return <ProductWorkspace me={me} status={status} profile={profile as ProductProfile} onProfileChange={changeProfile}>
    <div className="ops-stack project-beta">
      <div className="ops-heading-row"><div><span className="ops-kicker">PROJECT CONTROL</span><h1>Project access & team</h1><p>Control who can act for the Project, review incoming access requests and keep partner relationships separate from personal Creator identity.</p></div></div>
      <div className="ops-project-toolbar"><div><span className="ops-kicker">PROJECT</span>{projects.length > 1 ? <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select> : <strong>{project?.name || profile.display_name}</strong>}</div>{project && <div className={`ops-project-state ${project.verification_status === 'verified_x' ? 'verified' : 'pending'}`}>{project.verification_status === 'verified_x' ? 'Verified on X' : 'Verification required'}</div>}</div>
      {message && <div className="ops-message">{message}</div>}
      {project && <>
        <nav className="ops-tabs project-beta-tabs"><button className={tab === 'access' ? 'active' : ''} onClick={() => setTab('access')}>Access {incoming.length ? `(${incoming.length})` : ''}</button><button className={tab === 'team' ? 'active' : ''} onClick={() => setTab('team')}>Team ({members.length})</button><button className={tab === 'partners' ? 'active' : ''} onClick={() => setTab('partners')}>Partner shortlist ({partners.length})</button></nav>

        {tab === 'access' && <div className="ops-stack">
          <section className="project-beta-role-card"><div><span className="ops-kicker">YOUR ACCESS</span><h2>{title(project.role)}</h2><p>{project.role === 'owner' ? 'You hold the highest Project permission and control ownership.' : project.role === 'admin' ? 'You can manage most Project access, except ownership and granting Project Admin to another user.' : project.role === 'marketing_manager' ? 'You can manage campaigns and partners, but not Project membership.' : 'Your Project access is read-only.'}</p></div><span className="project-beta-state verified">Active</span></section>
          <section className="ops-section"><div className="ops-section-title"><div><h2>Incoming access requests</h2><p>Owner and Project Admin review requests before anyone receives workspace access.</p></div></div>{!canAdmin ? <div className="ops-empty compact"><p>Your {title(project.role)} role cannot approve Project access.</p></div> : !incoming.length ? <div className="ops-empty compact"><p>No pending access requests.</p></div> : <div className="project-beta-request-list">{incoming.map((request) => { const adminBlocked = project.role === 'admin' && request.requested_role === 'admin'; return <article key={request.id}><div><span className="project-beta-request-status submitted">{title(request.requested_role)}</span><strong>{request.display_name || request.email || 'Linkary member'}</strong><small>{request.email || 'Linkary member'} · requested {date(request.created_at)}</small>{request.note && <p>{request.note}</p>}{adminBlocked && <p className="project-beta-inline-warning">Owner approval required for Project Admin access.</p>}</div><div className="project-beta-review-actions"><button className="ops-button small" disabled={busy === request.id} onClick={() => void reviewAccess(request, 'reject')}>Reject</button><button className="ops-button primary" disabled={busy === request.id || adminBlocked} onClick={() => void reviewAccess(request, 'approve')}>Approve</button></div></article>; })}</div>}</section>
          {project.role === 'owner' && <section className="ops-section project-beta-transfer"><div className="ops-section-title"><div><h2>Transfer Project ownership</h2><p>Ownership is the highest permission. Transfer it only to a trusted active Project member.</p></div></div><div className="project-beta-transfer-controls"><select value={transferUserId} onChange={(event) => setTransferUserId(event.target.value)}><option value="">Choose new Owner</option>{members.filter((member) => member.role !== 'owner').map((member) => <option key={member.user_id} value={member.user_id}>{member.display_name || member.email || 'Linkary member'} · {title(member.role)}</option>)}</select><button className="ops-button danger" disabled={!transferUserId || busy === 'transfer'} onClick={() => void transferOwnership()}>{busy === 'transfer' ? 'Transferring...' : 'Transfer ownership'}</button></div><div className="project-beta-danger-note">After transfer, the new Owner becomes billing manager and you become Project Admin.</div></section>}
        </div>}

        {tab === 'team' && <div className="ops-stack">
          <section className="ops-section"><div className="ops-section-title"><div><h2>Add an existing Linkary member</h2><p>Search people who already have Linkary access. New people should join Linkary first.</p></div></div>{canAdmin ? <><form className="project-beta-member-search" onSubmit={searchMembers}><input value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} minLength={2} placeholder="Name or email" required /><select value={addRole} onChange={(event) => setAddRole(event.target.value as RequestableRole)}><option value="marketing_manager">Campaign Manager</option><option value="analyst">Analyst</option><option value="viewer">Viewer</option>{project.role === 'owner' && <option value="admin">Project Admin</option>}</select><button className="ops-button primary" disabled={busy === 'member-search'}>Find member</button></form><div className="project-beta-results">{candidates.map((candidate) => <article key={candidate.id}><div><strong>{candidate.display_name || candidate.email || 'Linkary member'}</strong><small>{candidate.email || 'Linkary member'}</small></div><button className="ops-button secondary" disabled={busy === candidate.id} onClick={() => void addMember(candidate.id)}>Add as {title(addRole)}</button></article>)}</div></> : <div className="ops-empty compact"><p>Your {title(project.role)} role can view the team but cannot change membership.</p></div>}</section>
          <section className="ops-section"><div className="ops-section-title"><div><h2>Project team</h2><p>{members.length} active member{members.length === 1 ? '' : 's'} with access to {project.name}.</p></div></div><div className="project-beta-team-list">{members.map((member) => <article key={member.user_id}><div className="project-beta-member-avatar">{(member.display_name || member.email || '?').slice(0, 1).toUpperCase()}</div><div className="project-beta-member-copy"><strong>{member.display_name || member.email || 'Linkary member'}</strong><small>{member.email || 'Linkary member'}{member.billing_manager ? ' · billing manager' : ''}</small></div>{member.role === 'owner' ? <span className="project-beta-owner">Owner</span> : canAdmin ? <div className="project-beta-member-actions"><select value={member.role} disabled={busy === member.user_id || (project.role === 'admin' && member.role === 'admin')} onChange={(event) => void updateMember(member.user_id, event.target.value as RequestableRole)}><option value="marketing_manager">Campaign Manager</option><option value="analyst">Analyst</option><option value="viewer">Viewer</option>{project.role === 'owner' && <option value="admin">Project Admin</option>}</select><button disabled={busy === member.user_id || (project.role === 'admin' && member.role === 'admin')} onClick={() => void removeMember(member)}>Remove</button></div> : <b>{title(member.role)}</b>}</article>)}</div></section>
        </div>}

        {tab === 'partners' && <section className="ops-section"><div className="ops-section-title"><div><h2>Partner shortlist</h2><p>Private collaboration pipeline for {project.name}. Keep discovery separate from campaign evidence until a partner is actually selected.</p></div></div>{!partners.length ? <div className="ops-empty"><div className="ops-empty-icon">◇</div><h3>No saved partners yet</h3><p>Use the Partner directory to shortlist Community Managers, KOL Managers and their represented audiences.</p><a className="ops-button secondary" href="/partners">Explore Partners</a></div> : <div className="project-beta-partners">{partners.map((partner) => <article key={partner.id}><div><strong>{partner.display_name}</strong><small>{title(partner.partner_kind)}{partner.primary_handle ? ` · @${partner.primary_handle}` : ''}</small></div>{canManagePartners ? <div><select value={partner.status} disabled={busy === partner.id} onChange={(event) => void updatePartner(partner, event.target.value)}><option value="saved">Saved</option><option value="contacted">Contacted</option><option value="in_discussion">In discussion</option><option value="approved">Approved</option><option value="not_now">Not now</option></select><button className="ops-button small" disabled={busy === partner.id} onClick={() => void promotePartner(partner)}>Add to network</button></div> : <b>{title(partner.status)}</b>}</article>)}</div>}</section>}
      </>}
    </div>
  </ProductWorkspace>;
}
