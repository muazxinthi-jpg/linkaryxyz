import { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { ProductWorkspace, type ProductMe, type ProductProfile, type ProductStatus } from './ProductWorkspace';
import './inbox.css';

type Role = 'owner' | 'admin' | 'marketing_manager' | 'analyst' | 'viewer';
type Project = { id: string; name: string; role: Role; verification_status: string };
type AccessRequest = { id: string; requested_role: string; note: string; created_at: string; display_name: string; email: string | null };
type MyAccessRequest = { id: string; organization_id: string; name: string; username: string; requested_role: string; status: string; note: string; created_at: string };
type Opportunity = { id: string; organization_id: string; title: string; campaign_name: string; applications: number; status: string };
type Application = { id: string; status: string; note: string; created_at: string; profile_id: string; display_name: string; username: string; manager_name: string | null };

type Action =
  | { id: string; kind: 'project_access'; project: Project; request: AccessRequest; occurredAt: string; ownerRequired: boolean }
  | { id: string; kind: 'opportunity_application'; project: Project; opportunity: Opportunity; application: Application; occurredAt: string; ownerRequired: false };

class ApiError extends Error { constructor(readonly code: string, message: string) { super(message); } }
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string } & T;
  if (!response.ok) throw new ApiError(payload.error || 'request_failed', payload.message || 'Request failed');
  return payload;
}
function csrf(): string | null { const hit = document.cookie.split('; ').find((part) => part.startsWith('__Host-linkary_csrf=')); return hit ? decodeURIComponent(hit.split('=').slice(1).join('=')) : null; }
function human(value: string): string { if (value === 'marketing_manager') return 'Campaign Manager'; return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()); }
function date(value: string): string { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? 'Recently' : new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed); }

export default function InboxExperience({ me, status }: { me: ProductMe; status: ProductStatus }) {
  const first = status.profiles.find((item) => item.profile_type === 'creator') || status.profiles[0];
  const saved = window.localStorage.getItem('linkary.active.profile');
  const [profileId, setProfileId] = useState(saved && status.profiles.some((item) => item.id === saved) ? saved : first?.id || '');
  const profile = status.profiles.find((item) => item.id === profileId) || first;
  const [actions, setActions] = useState<Action[]>([]);
  const [updates, setUpdates] = useState<MyAccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  function changeProfile(id: string) { setProfileId(id); window.localStorage.setItem('linkary.active.profile', id); }

  async function load() {
    setLoading(true); setMessage('');
    try {
      const [projectResult, myRequestResult] = await Promise.all([
        api<{ organizations: Project[] }>('/api/organizations'),
        api<{ requests: MyAccessRequest[] }>('/api/projects/access-requests/mine').catch(() => ({ requests: [] })),
      ]);
      const projects = projectResult.organizations;
      const actionItems: Action[] = [];

      await Promise.all(projects.map(async (project) => {
        if (['owner', 'admin'].includes(project.role)) {
          const access = await api<{ requests: AccessRequest[] }>(`/api/projects/${encodeURIComponent(project.id)}/access-requests`).catch(() => ({ requests: [] }));
          for (const request of access.requests) actionItems.push({ id: `access:${request.id}`, kind: 'project_access', project, request, occurredAt: request.created_at, ownerRequired: project.role === 'admin' && request.requested_role === 'admin' });
        }
        if (['owner', 'admin', 'marketing_manager'].includes(project.role)) {
          const opportunityResult = await api<{ opportunities: Opportunity[] }>(`/api/campaign-opportunities?organizationId=${encodeURIComponent(project.id)}`).catch(() => ({ opportunities: [] }));
          const withApplications = opportunityResult.opportunities.filter((item) => Number(item.applications || 0) > 0).slice(0, 25);
          await Promise.all(withApplications.map(async (opportunity) => {
            const applicationResult = await api<{ applications: Application[] }>(`/api/campaign-opportunity-applications?opportunityId=${encodeURIComponent(opportunity.id)}`).catch(() => ({ applications: [] }));
            for (const application of applicationResult.applications.filter((item) => item.status === 'pending')) actionItems.push({ id: `application:${application.id}`, kind: 'opportunity_application', project, opportunity, application, occurredAt: application.created_at, ownerRequired: false });
          }));
        }
      }));

      actionItems.sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
      setActions(actionItems);
      setUpdates(myRequestResult.requests.filter((item) => ['approved', 'rejected'].includes(item.status)).slice(0, 30));
    } catch { setMessage('Inbox is temporarily unavailable. Please try again shortly.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function reviewAccess(action: Extract<Action, { kind: 'project_access' }>, decision: 'approve' | 'reject') {
    if (decision === 'reject' && !window.confirm(`Reject ${action.request.display_name}'s request to ${action.project.name}?`)) return;
    const token = csrf(); if (!token) return;
    setBusy(action.id); setMessage('');
    try {
      await api(`/api/projects/access-requests/${encodeURIComponent(action.request.id)}/${decision}`, { method: 'POST', headers: { 'x-csrf-token': token } });
      setMessage(decision === 'approve' ? `${action.request.display_name} now has ${human(action.request.requested_role)} access.` : 'Access request rejected.');
      await load();
    } catch (error) { setMessage(error instanceof ApiError ? error.message : 'The access request could not be reviewed.'); }
    finally { setBusy(''); }
  }

  async function reviewApplication(action: Extract<Action, { kind: 'opportunity_application' }>, decision: 'accepted' | 'rejected') {
    if (decision === 'rejected' && !window.confirm(`Reject ${action.application.display_name}'s application to ${action.opportunity.title}?`)) return;
    const token = csrf(); if (!token) return;
    setBusy(action.id); setMessage('');
    try {
      await api(`/api/campaign-opportunity-applications/${encodeURIComponent(action.application.id)}`, { method: 'PATCH', headers: { 'x-csrf-token': token }, body: JSON.stringify({ status: decision }) });
      setMessage(decision === 'accepted' ? `${action.application.display_name}'s application was accepted.` : 'Application rejected.');
      await load();
    } catch (error) { setMessage(error instanceof ApiError ? error.message : 'The application could not be reviewed.'); }
    finally { setBusy(''); }
  }

  const actionable = useMemo(() => actions.filter((item) => !item.ownerRequired), [actions]);
  const ownerRequired = useMemo(() => actions.filter((item) => item.ownerRequired), [actions]);

  if (!profile) return null;
  return <ProductWorkspace me={me} status={status} profile={profile as ProductProfile} onProfileChange={changeProfile}>
    <div className="ops-stack inbox-workspace">
      <div className="ops-heading-row"><div><span className="ops-kicker">INBOX</span><h1>What needs your attention</h1><p>Project access and campaign decisions that affect your next action. Linkary keeps this focused instead of turning it into another noisy feed.</p></div><button className="ops-button secondary" onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing...' : 'Refresh'}</button></div>
      {message && <div className="ops-message">{message}</div>}
      <section className="inbox-summary"><article><span>ACTION REQUIRED</span><strong>{actionable.length}</strong><small>Decisions you can make now</small></article><article><span>OWNER REQUIRED</span><strong>{ownerRequired.length}</strong><small>Restricted Project Admin requests</small></article><article><span>YOUR UPDATES</span><strong>{updates.length}</strong><small>Recent Project access decisions</small></article></section>

      <section className="ops-section"><div className="ops-section-title"><div><h2>Needs attention</h2><p>Oldest pending decisions appear first.</p></div></div>{loading ? <div className="ops-loading">Checking Project and campaign activity...</div> : !actions.length ? <div className="ops-empty"><div className="ops-empty-icon">✓</div><h3>Nothing waiting on you</h3><p>New Project access requests and campaign applications will appear here when they need a decision.</p></div> : <div className="inbox-list">{actions.map((action) => action.kind === 'project_access' ? <article key={action.id} className={action.ownerRequired ? 'restricted' : ''}><div className="inbox-icon">P</div><div className="inbox-copy"><div><span>PROJECT ACCESS</span><time>{date(action.occurredAt)}</time></div><strong>{action.request.display_name || action.request.email || 'Linkary member'} requested {human(action.request.requested_role)}</strong><small>{action.project.name}</small>{action.request.note && <p>{action.request.note}</p>}{action.ownerRequired && <p className="inbox-warning">Only the Project Owner can approve Project Admin access.</p>}</div><div className="inbox-actions"><NavLink to="/settings">Open Project</NavLink><button disabled={busy === action.id} onClick={() => void reviewAccess(action, 'reject')}>Reject</button><button className="primary" disabled={busy === action.id || action.ownerRequired} onClick={() => void reviewAccess(action, 'approve')}>Approve</button></div></article> : <article key={action.id}><div className="inbox-icon">C</div><div className="inbox-copy"><div><span>CAMPAIGN APPLICATION</span><time>{date(action.occurredAt)}</time></div><strong>{action.application.display_name} applied to {action.opportunity.title}</strong><small>{action.opportunity.campaign_name} · {action.project.name}</small>{action.application.note && <p>{action.application.note}</p>}</div><div className="inbox-actions"><NavLink to="/campaigns">Open Growth</NavLink><button disabled={busy === action.id} onClick={() => void reviewApplication(action, 'rejected')}>Reject</button><button className="primary" disabled={busy === action.id} onClick={() => void reviewApplication(action, 'accepted')}>Accept</button></div></article>)}</div>}</section>

      <section className="ops-section"><div className="ops-section-title"><div><h2>Your Project access updates</h2><p>Recent decisions on Project roles you requested.</p></div></div>{!updates.length ? <div className="ops-empty compact"><p>No recent Project access decisions.</p></div> : <div className="inbox-updates">{updates.map((item) => <article key={item.id}><span className={`inbox-update-state ${item.status}`}>{human(item.status)}</span><div><strong>{item.name}</strong><small>{human(item.requested_role)} access · @{item.username}</small></div>{item.status === 'approved' ? <button onClick={() => window.location.reload()}>Refresh workspaces</button> : <NavLink to="/settings">View Projects</NavLink>}</article>)}</div>}</section>
    </div>
  </ProductWorkspace>;
}
