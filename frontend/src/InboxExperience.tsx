import { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { ProductWorkspace, type ProductMe, type ProductProfile, type ProductStatus } from './ProductWorkspace';
import './inbox.css';

type Role = 'owner' | 'admin' | 'marketing_manager' | 'analyst' | 'viewer';
type Project = { id: string; name: string; role: Role; status: string; verification_status: string };
type AccessRequest = { id: string; requested_role: string; note: string; created_at: string; display_name: string; email: string | null };
type MyAccessRequest = { id: string; organization_id: string; name: string; username: string; requested_role: string; status: string; note: string; created_at: string };
type Opportunity = { id: string; organization_id: string; title: string; campaign_name: string; applications: number; status: string };
type Application = { id: string; status: string; note: string; created_at: string; profile_id: string; display_name: string; username: string; manager_name: string | null };
type Campaign = { id: string; name: string; status: string };
type Activity = {
  id: string;
  title: string;
  activity_type: string;
  partner_kind: 'creator' | 'community' | null;
  partner_profile_id: string | null;
  partner_manager_id: string | null;
  partner_asset_id: string | null;
  partner_display_name: string | null;
};
type CommunityAsset = { id: string; asset_type: 'telegram_community'; name: string; verification_status: string };
type CollaborationInquiry = {
  id: string;
  organization_id: string;
  project_name: string;
  target_kind: 'creator' | 'community_manager';
  target_profile_id: string;
  target_display_name: string;
  target_username: string;
  partner_manager_id: string | null;
  manager_name: string | null;
  partner_asset_id: string | null;
  community_name: string | null;
  community_verification_status: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  inquiry_type: string;
  budget_usd: number | null;
  message: string;
  deliverables: string;
  status: 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'closed';
  responded_at: string | null;
  created_at: string;
  updated_at: string;
  activated_activity_id: string | null;
  activated_activity_title: string | null;
  activated_campaign_id: string | null;
  activated_campaign_name: string | null;
  activated_at: string | null;
};

type Action =
  | { id: string; kind: 'project_access'; project: Project; request: AccessRequest; occurredAt: string; ownerRequired: boolean }
  | { id: string; kind: 'opportunity_application'; project: Project; opportunity: Opportunity; application: Application; occurredAt: string; ownerRequired: false }
  | { id: string; kind: 'collaboration_inquiry'; inquiry: CollaborationInquiry; occurredAt: string; ownerRequired: false };

type ActivationForm = {
  campaignId: string;
  mode: 'new' | 'existing';
  activityId: string;
  title: string;
  activityType: 'creator_content' | 'community_placement' | 'website' | 'video' | 'other';
  destinationUrl: string;
  plannedCostUsd: string;
  communityId: string;
};

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
function money(value: number | null): string { return value === null ? 'Budget not set' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value); }
function canActivate(project?: Project): boolean { return Boolean(project && project.status === 'active' && project.verification_status === 'verified_x' && ['owner', 'admin', 'marketing_manager'].includes(project.role)); }

export default function InboxExperience({ me, status }: { me: ProductMe; status: ProductStatus }) {
  const first = status.profiles.find((item) => item.profile_type === 'creator') || status.profiles[0];
  const saved = window.localStorage.getItem('linkary.active.profile');
  const [profileId, setProfileId] = useState(saved && status.profiles.some((item) => item.id === saved) ? saved : first?.id || '');
  const profile = status.profiles.find((item) => item.id === profileId) || first;
  const [projects, setProjects] = useState<Project[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [updates, setUpdates] = useState<MyAccessRequest[]>([]);
  const [sentInquiries, setSentInquiries] = useState<CollaborationInquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  const [activationTarget, setActivationTarget] = useState<CollaborationInquiry | null>(null);
  const [activationCampaigns, setActivationCampaigns] = useState<Campaign[]>([]);
  const [activationActivities, setActivationActivities] = useState<Activity[]>([]);
  const [activationCommunities, setActivationCommunities] = useState<CommunityAsset[]>([]);
  const [activationLoading, setActivationLoading] = useState(false);
  const [activationCandidateActivityId, setActivationCandidateActivityId] = useState('');
  const [activationForm, setActivationForm] = useState<ActivationForm>({ campaignId: '', mode: 'new', activityId: '', title: '', activityType: 'creator_content', destinationUrl: '', plannedCostUsd: '', communityId: '' });

  function changeProfile(id: string) { setProfileId(id); window.localStorage.setItem('linkary.active.profile', id); }

  async function load() {
    setLoading(true); setMessage('');
    try {
      const [projectResult, myRequestResult, incomingInquiryResult, outgoingInquiryResult] = await Promise.all([
        api<{ organizations: Project[] }>('/api/organizations'),
        api<{ requests: MyAccessRequest[] }>('/api/projects/access-requests/mine').catch(() => ({ requests: [] })),
        api<{ inquiries: CollaborationInquiry[] }>('/api/project-partner-shortlists?inquiries=incoming').catch(() => ({ inquiries: [] })),
        api<{ inquiries: CollaborationInquiry[] }>('/api/project-partner-shortlists?inquiries=outgoing').catch(() => ({ inquiries: [] })),
      ]);
      const projectList = projectResult.organizations;
      setProjects(projectList);
      const actionItems: Action[] = [];

      for (const inquiry of incomingInquiryResult.inquiries.filter((item) => item.status === 'pending')) {
        actionItems.push({ id: `inquiry:${inquiry.id}`, kind: 'collaboration_inquiry', inquiry, occurredAt: inquiry.created_at, ownerRequired: false });
      }

      await Promise.all(projectList.map(async (project) => {
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
      setSentInquiries(outgoingInquiryResult.inquiries.slice(0, 50));
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

  async function reviewInquiry(action: Extract<Action, { kind: 'collaboration_inquiry' }>, decision: 'accepted' | 'declined') {
    if (decision === 'declined' && !window.confirm(`Decline ${action.inquiry.project_name}'s collaboration inquiry?`)) return;
    const token = csrf(); if (!token) return;
    setBusy(action.id); setMessage('');
    try {
      await api('/api/project-partner-shortlists', {
        method: 'POST',
        headers: { 'x-csrf-token': token },
        body: JSON.stringify({ action: 'review_inquiry', inquiryId: action.inquiry.id, decision }),
      });
      setMessage(decision === 'accepted' ? `You accepted ${action.inquiry.project_name}'s inquiry. This opens the collaboration for discussion only.` : 'Collaboration inquiry declined.');
      await load();
    } catch (error) { setMessage(error instanceof ApiError ? error.message : 'The collaboration inquiry could not be reviewed.'); }
    finally { setBusy(''); }
  }

  async function withdrawInquiry(inquiry: CollaborationInquiry) {
    if (!window.confirm(`Withdraw the collaboration inquiry to ${inquiry.target_display_name}?`)) return;
    const token = csrf(); if (!token) return;
    setBusy(`sent:${inquiry.id}`); setMessage('');
    try {
      await api('/api/project-partner-shortlists', {
        method: 'POST',
        headers: { 'x-csrf-token': token },
        body: JSON.stringify({ action: 'withdraw_inquiry', inquiryId: inquiry.id }),
      });
      setMessage('Collaboration inquiry withdrawn.');
      await load();
    } catch (error) { setMessage(error instanceof ApiError ? error.message : 'The collaboration inquiry could not be withdrawn.'); }
    finally { setBusy(''); }
  }

  async function loadActivationActivities(campaignId: string) {
    if (!campaignId) { setActivationActivities([]); return; }
    const result = await api<{ activities: Activity[] }>(`/api/campaign-activities?campaignId=${encodeURIComponent(campaignId)}`).catch(() => ({ activities: [] }));
    setActivationActivities(result.activities);
  }

  async function openActivation(inquiry: CollaborationInquiry) {
    if (inquiry.status !== 'accepted' || inquiry.activated_activity_id) return;
    const project = projects.find((item) => item.id === inquiry.organization_id);
    if (!canActivate(project)) { setMessage('Your Project must be active, verified on X, and your role must allow campaign changes before activation.'); return; }
    setActivationTarget(inquiry);
    setActivationLoading(true);
    setActivationCandidateActivityId('');
    setActivationCampaigns([]);
    setActivationActivities([]);
    setActivationCommunities([]);
    try {
      const [campaignResult, communityResult] = await Promise.all([
        api<{ campaigns: Campaign[] }>(`/api/campaigns?organizationId=${encodeURIComponent(inquiry.organization_id)}`),
        inquiry.target_kind === 'community_manager' && inquiry.partner_manager_id && !inquiry.partner_asset_id
          ? api<{ assets: CommunityAsset[] }>(`/api/partner-manager-assets?managerId=${encodeURIComponent(inquiry.partner_manager_id)}`).catch(() => ({ assets: [] }))
          : Promise.resolve({ assets: [] as CommunityAsset[] }),
      ]);
      const campaignList = campaignResult.campaigns.filter((item) => !['archived', 'completed'].includes(item.status));
      const preferredCampaign = inquiry.campaign_id && campaignList.some((item) => item.id === inquiry.campaign_id) ? inquiry.campaign_id : campaignList[0]?.id || '';
      const title = `${human(inquiry.inquiry_type)} with ${inquiry.target_display_name}`;
      setActivationCampaigns(campaignList);
      setActivationCommunities(communityResult.assets.filter((item) => item.asset_type === 'telegram_community'));
      setActivationForm({
        campaignId: preferredCampaign,
        mode: 'new',
        activityId: '',
        title,
        activityType: inquiry.target_kind === 'creator' ? 'creator_content' : 'community_placement',
        destinationUrl: '',
        plannedCostUsd: inquiry.budget_usd === null ? '' : String(inquiry.budget_usd),
        communityId: inquiry.partner_asset_id || '',
      });
      if (preferredCampaign) await loadActivationActivities(preferredCampaign);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Campaign activation options could not be loaded.');
      setActivationTarget(null);
    } finally { setActivationLoading(false); }
  }

  async function selectActivationCampaign(campaignId: string) {
    setActivationCandidateActivityId('');
    setActivationForm((current) => ({ ...current, campaignId, activityId: '' }));
    await loadActivationActivities(campaignId);
  }

  function activationPartner(inquiry: CollaborationInquiry) {
    if (inquiry.target_kind === 'creator') return { kind: 'creator', creatorProfileId: inquiry.target_profile_id };
    const assetId = inquiry.partner_asset_id || activationForm.communityId;
    if (!inquiry.partner_manager_id || !assetId) return null;
    return { kind: 'community', partnerManagerId: inquiry.partner_manager_id, partnerAssetId: assetId };
  }

  function exactActivityForInquiry(activity: Activity, inquiry: CollaborationInquiry): boolean {
    if (inquiry.target_kind === 'creator') return activity.partner_kind === 'creator' && activity.partner_profile_id === inquiry.target_profile_id;
    const assetId = inquiry.partner_asset_id || activationForm.communityId;
    return activity.partner_kind === 'community' && activity.partner_manager_id === inquiry.partner_manager_id && Boolean(assetId) && activity.partner_asset_id === assetId;
  }

  const eligibleActivationActivities = useMemo(() => {
    if (!activationTarget) return [];
    return activationActivities.filter((activity) => !activity.partner_kind || exactActivityForInquiry(activity, activationTarget));
  }, [activationActivities, activationTarget, activationForm.communityId]);

  async function activateInquiry(event: React.FormEvent) {
    event.preventDefault();
    if (!activationTarget) return;
    const token = csrf(); if (!token) return;
    const partner = activationPartner(activationTarget);
    if (!partner) { setMessage('Choose the exact Telegram Community before activating this collaboration.'); return; }
    if (!activationForm.campaignId) { setMessage('Choose a campaign before activation.'); return; }
    if (activationForm.mode === 'existing' && !activationForm.activityId && !activationCandidateActivityId) { setMessage('Choose an activity before activation.'); return; }
    if (activationForm.mode === 'new' && !activationForm.title.trim() && !activationCandidateActivityId) { setMessage('Add an activity title before activation.'); return; }

    setBusy(`activate:${activationTarget.id}`);
    setMessage('');
    try {
      let activityId = activationCandidateActivityId;
      if (!activityId) {
        if (activationForm.mode === 'existing') {
          activityId = activationForm.activityId;
          await api('/api/campaign-activities', {
            method: 'POST', headers: { 'x-csrf-token': token },
            body: JSON.stringify({ activityId, partner }),
          });
        } else {
          const created = await api<{ id: string }>('/api/campaign-activities', {
            method: 'POST', headers: { 'x-csrf-token': token },
            body: JSON.stringify({
              campaignId: activationForm.campaignId,
              title: activationForm.title.trim(),
              activityType: activationForm.activityType,
              destinationUrl: activationForm.destinationUrl.trim() || undefined,
              plannedCostUsd: activationForm.plannedCostUsd.trim() ? Number(activationForm.plannedCostUsd) : undefined,
              partner,
            }),
          });
          activityId = created.id;
        }
        setActivationCandidateActivityId(activityId);
      }

      const activated = await api<{ campaignName: string }>('/api/project-partner-shortlists', {
        method: 'POST', headers: { 'x-csrf-token': token },
        body: JSON.stringify({ action: 'record_activation', inquiryId: activationTarget.id, activityId }),
      });
      setMessage(`Partner activated in ${activated.campaignName}. Tracking and proof remain evidence-driven.`);
      setActivationTarget(null);
      setActivationCandidateActivityId('');
      await load();
    } catch (error) {
      const retry = activationCandidateActivityId ? ' The activity is already assigned, so you can retry activation without creating another activity.' : '';
      setMessage(`${error instanceof ApiError ? error.message : 'The collaboration could not be activated.'}${retry}`);
    } finally { setBusy(''); }
  }

  const actionable = useMemo(() => actions.filter((item) => !item.ownerRequired), [actions]);
  const ownerRequired = useMemo(() => actions.filter((item) => item.ownerRequired), [actions]);
  const pendingSent = useMemo(() => sentInquiries.filter((item) => item.status === 'pending').length, [sentInquiries]);

  function renderAction(action: Action) {
    if (action.kind === 'project_access') return <article key={action.id} className={action.ownerRequired ? 'restricted' : ''}><div className="inbox-icon">P</div><div className="inbox-copy"><div><span>PROJECT ACCESS</span><time>{date(action.occurredAt)}</time></div><strong>{action.request.display_name || action.request.email || 'Linkary member'} requested {human(action.request.requested_role)}</strong><small>{action.project.name}</small>{action.request.note && <p>{action.request.note}</p>}{action.ownerRequired && <p className="inbox-warning">Only the Project Owner can approve Project Admin access.</p>}</div><div className="inbox-actions"><NavLink to="/settings">Open Project</NavLink><button disabled={busy === action.id} onClick={() => void reviewAccess(action, 'reject')}>Reject</button><button className="primary" disabled={busy === action.id || action.ownerRequired} onClick={() => void reviewAccess(action, 'approve')}>Approve</button></div></article>;
    if (action.kind === 'opportunity_application') return <article key={action.id}><div className="inbox-icon">C</div><div className="inbox-copy"><div><span>CAMPAIGN APPLICATION</span><time>{date(action.occurredAt)}</time></div><strong>{action.application.display_name} applied to {action.opportunity.title}</strong><small>{action.opportunity.campaign_name} · {action.project.name}</small>{action.application.note && <p>{action.application.note}</p>}</div><div className="inbox-actions"><NavLink to="/campaigns">Open Growth</NavLink><button disabled={busy === action.id} onClick={() => void reviewApplication(action, 'rejected')}>Reject</button><button className="primary" disabled={busy === action.id} onClick={() => void reviewApplication(action, 'accepted')}>Accept</button></div></article>;
    const inquiry = action.inquiry;
    return <article key={action.id} className="collaboration-inquiry"><div className="inbox-icon">I</div><div className="inbox-copy"><div><span>COLLABORATION INQUIRY</span><time>{date(action.occurredAt)}</time></div><strong>{inquiry.project_name} wants to discuss {human(inquiry.inquiry_type)}</strong><small>{inquiry.community_name ? `${inquiry.community_name} · ${human(inquiry.community_verification_status || 'unverified')}` : inquiry.target_kind === 'community_manager' ? 'General Community Manager inquiry' : `@${inquiry.target_username}`}</small><div className="inbox-inquiry-meta">{inquiry.campaign_name && <span>Campaign: {inquiry.campaign_name}</span>}<span>{money(inquiry.budget_usd)}</span>{inquiry.community_name && <span>Community proof stays {human(inquiry.community_verification_status || 'unverified')}</span>}</div><p>{inquiry.message}</p>{inquiry.deliverables && <p><strong>Expected scope:</strong> {inquiry.deliverables}</p>}</div><div className="inbox-actions"><button disabled={busy === action.id} onClick={() => void reviewInquiry(action, 'declined')}>Decline</button><button className="primary" disabled={busy === action.id} onClick={() => void reviewInquiry(action, 'accepted')}>Accept</button></div></article>;
  }

  if (!profile) return null;
  return <ProductWorkspace me={me} status={status} profile={profile as ProductProfile} onProfileChange={changeProfile}>
    <div className="ops-stack inbox-workspace">
      <div className="ops-heading-row"><div><span className="ops-kicker">INBOX</span><h1>What needs your attention</h1><p>Project access, campaign decisions and collaboration inquiries that affect your next action. Linkary keeps this focused instead of turning it into another noisy chat feed.</p></div><button className="ops-button secondary" onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing...' : 'Refresh'}</button></div>
      {message && <div className="ops-message">{message}</div>}
      <section className="inbox-summary"><article><span>ACTION REQUIRED</span><strong>{actionable.length}</strong><small>Decisions you can make now</small></article><article><span>OWNER REQUIRED</span><strong>{ownerRequired.length}</strong><small>Restricted Project Admin requests</small></article><article><span>SENT INQUIRIES</span><strong>{pendingSent}</strong><small>Pending partner responses</small></article></section>

      <section className="ops-section"><div className="ops-section-title"><div><h2>Needs attention</h2><p>Oldest pending decisions appear first.</p></div></div>{loading ? <div className="ops-loading">Checking Project, campaign and collaboration activity...</div> : !actions.length ? <div className="ops-empty"><div className="ops-empty-icon">✓</div><h3>Nothing waiting on you</h3><p>New Project access requests, campaign applications and collaboration inquiries will appear here when they need a decision.</p></div> : <div className="inbox-list">{actions.map(renderAction)}</div>}</section>

      <section className="ops-section"><div className="ops-section-title"><div><h2>Collaboration inquiries you sent</h2><p>Accepted means the partner is open to discussion. Campaign activation is a separate explicit Project action, and proof still requires tracked or verified evidence.</p></div></div>{loading ? <div className="ops-loading">Loading sent inquiries...</div> : !sentInquiries.length ? <div className="ops-empty compact"><p>No collaboration inquiries sent yet. Start from Partner Discovery when a Creator or Community Manager looks relevant.</p></div> : <div className="inbox-sent-inquiries">{sentInquiries.map((inquiry) => {
        const project = projects.find((item) => item.id === inquiry.organization_id);
        return <article key={inquiry.id}><span className={`inbox-update-state ${inquiry.status}`}>{human(inquiry.status)}</span><div className="inbox-sent-copy"><strong>{inquiry.target_display_name} · {human(inquiry.inquiry_type)}</strong><small>{inquiry.project_name}{inquiry.community_name ? ` · ${inquiry.community_name} (${human(inquiry.community_verification_status || 'unverified')})` : ''}{inquiry.campaign_name ? ` · ${inquiry.campaign_name}` : ''} · {money(inquiry.budget_usd)}</small><p>{inquiry.message}</p>{inquiry.activated_activity_id && <div className="inbox-activation-state"><strong>Activated in campaign</strong><span>{inquiry.activated_campaign_name} · {inquiry.activated_activity_title}</span></div>}</div><div className="inbox-sent-actions">{inquiry.status === 'pending' && <button disabled={busy === `sent:${inquiry.id}`} onClick={() => void withdrawInquiry(inquiry)}>Withdraw</button>}{inquiry.status === 'accepted' && !inquiry.activated_activity_id && <button className="inbox-activate-button" disabled={!canActivate(project) || busy === `activate:${inquiry.id}`} onClick={() => void openActivation(inquiry)}>Activate in campaign</button>}{inquiry.activated_activity_id && <NavLink to={`/tracking?project=${encodeURIComponent(inquiry.organization_id)}&campaign=${encodeURIComponent(inquiry.activated_campaign_id || '')}`}>Open Evidence</NavLink>}</div></article>;
      })}</div>}</section>

      <section className="ops-section"><div className="ops-section-title"><div><h2>Your Project access updates</h2><p>Recent decisions on Project roles you requested.</p></div></div>{!updates.length ? <div className="ops-empty compact"><p>No recent Project access decisions.</p></div> : <div className="inbox-updates">{updates.map((item) => <article key={item.id}><span className={`inbox-update-state ${item.status}`}>{human(item.status)}</span><div><strong>{item.name}</strong><small>{human(item.requested_role)} access · @{item.username}</small></div>{item.status === 'approved' ? <button onClick={() => window.location.reload()}>Refresh workspaces</button> : <NavLink to="/settings">View Projects</NavLink>}</article>)}</div>}</section>

      {activationTarget && <div className="ops-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy.startsWith('activate:')) setActivationTarget(null); }}><section className="ops-modal inquiry-activation-modal">
        <div className="ops-modal-head"><div><span className="ops-kicker">EXPLICIT CAMPAIGN ACTIVATION</span><h2>Activate {activationTarget.target_display_name}</h2></div><button disabled={busy.startsWith('activate:')} onClick={() => setActivationTarget(null)}>×</button></div>
        <div className="inquiry-activation-target"><div><span>{activationTarget.target_kind === 'creator' ? 'CREATOR' : 'COLLABORATION PARTNER'}</span><strong>{activationTarget.target_display_name}</strong><small>{activationTarget.community_name ? `${activationTarget.community_name} · ${human(activationTarget.community_verification_status || 'unverified')}` : activationTarget.target_kind === 'community_manager' ? 'Choose one exact Telegram Community below' : `@${activationTarget.target_username}`}</small></div><div><span>INQUIRY</span><strong>{human(activationTarget.inquiry_type)}</strong><small>{money(activationTarget.budget_usd)}</small></div></div>
        <div className="inquiry-activation-note"><strong>Separate activation step.</strong><span>This step assigns the accepted partner to campaign activity. Campaign proof still appears only after tracked or verified evidence exists. No tracking links or outcomes are created automatically.</span></div>
        {activationLoading ? <div className="ops-loading">Preparing campaign activation...</div> : !activationCampaigns.length ? <div className="ops-empty compact"><p>No active campaign is available for this Project. Create a campaign in Growth first, then return here.</p><NavLink className="ops-button secondary" to="/campaigns">Open Growth</NavLink></div> : <form className="inquiry-activation-form" onSubmit={(event) => void activateInquiry(event)}>
          <label>Campaign<select value={activationForm.campaignId} onChange={(event) => void selectActivationCampaign(event.target.value)}>{activationCampaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></label>
          {activationTarget.target_kind === 'community_manager' && (activationTarget.partner_asset_id ? <div className="inquiry-community-lock"><span>EXACT TELEGRAM COMMUNITY</span><strong>{activationTarget.community_name}</strong><small>{human(activationTarget.community_verification_status || 'unverified')} · Locked from the accepted inquiry</small></div> : <label>Exact Telegram Community<select required value={activationForm.communityId} onChange={(event) => { setActivationCandidateActivityId(''); setActivationForm((current) => ({ ...current, communityId: event.target.value, activityId: '' })); }}><option value="">Choose Community</option>{activationCommunities.map((community) => <option key={community.id} value={community.id}>{community.name} · {human(community.verification_status)}</option>)}</select><small>The exact Community, not only its manager, will own the campaign evidence.</small></label>)}
          <div className="inquiry-activation-mode" role="group" aria-label="Activity choice"><button type="button" className={activationForm.mode === 'new' ? 'active' : ''} onClick={() => { setActivationCandidateActivityId(''); setActivationForm((current) => ({ ...current, mode: 'new', activityId: '' })); }}>Create new activity</button><button type="button" className={activationForm.mode === 'existing' ? 'active' : ''} onClick={() => { setActivationCandidateActivityId(''); setActivationForm((current) => ({ ...current, mode: 'existing' })); }}>Use existing activity</button></div>
          {activationForm.mode === 'existing' ? <label>Existing activity<select required value={activationForm.activityId} onChange={(event) => { setActivationCandidateActivityId(''); setActivationForm((current) => ({ ...current, activityId: event.target.value })); }}><option value="">Choose unassigned or matching activity</option>{eligibleActivationActivities.map((activity) => <option key={activity.id} value={activity.id}>{activity.title}{activity.partner_kind ? ' · already assigned to this partner' : ' · unassigned'}</option>)}</select><small>Activities assigned to a different partner are hidden to prevent accidental replacement.</small></label> : <>
            <label>Activity title<input required maxLength={140} value={activationForm.title} onChange={(event) => { setActivationCandidateActivityId(''); setActivationForm((current) => ({ ...current, title: event.target.value })); }} /></label>
            <div className="inquiry-activation-grid"><label>Activity type<select value={activationForm.activityType} onChange={(event) => { setActivationCandidateActivityId(''); setActivationForm((current) => ({ ...current, activityType: event.target.value as ActivationForm['activityType'] })); }}><option value="creator_content">Creator Content</option><option value="community_placement">Community Placement</option><option value="website">Website</option><option value="video">Video</option><option value="other">Other</option></select></label><label>Planned cost (USD)<input type="number" min="0" step="0.01" value={activationForm.plannedCostUsd} onChange={(event) => { setActivationCandidateActivityId(''); setActivationForm((current) => ({ ...current, plannedCostUsd: event.target.value })); }} placeholder="Optional" /></label></div>
            <label>Destination URL (optional)<input type="url" value={activationForm.destinationUrl} onChange={(event) => { setActivationCandidateActivityId(''); setActivationForm((current) => ({ ...current, destinationUrl: event.target.value })); }} placeholder="https://..." /></label>
          </>}
          {activationCandidateActivityId && <div className="inquiry-activation-retry"><strong>Activity assignment saved.</strong><span>The final inquiry activation marker can be retried without creating another activity.</span></div>}
          <div className="ops-form-actions"><button type="button" className="ops-button secondary" disabled={busy.startsWith('activate:')} onClick={() => setActivationTarget(null)}>Cancel</button><button type="submit" className="ops-button primary" disabled={busy.startsWith('activate:')}>{busy.startsWith('activate:') ? 'Activating...' : activationCandidateActivityId ? 'Retry activation' : 'Activate in campaign'}</button></div>
        </form>}
      </section></div>}
    </div>
  </ProductWorkspace>;
}
