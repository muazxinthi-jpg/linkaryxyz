import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useSignOut } from '@coinbase/cdp-hooks';

type AccountType = 'creator' | 'project';
type ProjectRole = 'owner' | 'admin' | 'marketing_manager' | 'analyst' | 'viewer';
type TrackingStatus = 'active' | 'paused' | 'archived';
type Confidence = 'manual' | 'tracked' | 'correlated' | 'verified';

type MeResponse = {
  authenticated: boolean;
  user: { id: string; displayName: string; superadmin: boolean } | null;
};

type ProfileSummary = {
  id: string;
  profile_type: AccountType;
  username: string;
  display_name: string;
  visibility: string;
  organization_id: string | null;
};

type OnboardingStatus = {
  user: { id: string; displayName: string; email: string | null };
  profiles: ProfileSummary[];
};

type OperationalProject = {
  id: string;
  name: string;
  status: string;
  verification_status: string;
  role: ProjectRole;
  username?: string | null;
};

type Campaign = {
  id: string;
  name: string;
  objective: string;
  budget_usd: number | null;
  status: string;
  starts_at?: string | null;
  ends_at?: string | null;
  created_at: string;
};

type Activity = {
  id: string;
  title: string;
  activity_type: string;
  destination_url: string | null;
  planned_cost_usd?: number | null;
  status: string;
  created_at?: string;
};

type TrackedLink = {
  id: string;
  code: string;
  url: string;
  activity_id: string | null;
  activity_title: string | null;
  activity_type: string | null;
  destination_url: string;
  status: TrackingStatus;
  clicks: number;
  last_click_at: string | null;
  created_at: string;
};

type Outcome = {
  id: string;
  tracked_link_id: string | null;
  tracking_code: string | null;
  destination_url: string | null;
  activity_id: string | null;
  activity_title: string | null;
  activity_type: string | null;
  external_event_key: string;
  event_type: string;
  value_usd: number | null;
  source: string;
  attribution_confidence: Confidence;
  occurred_at: string;
};

type OutcomeSummary = {
  conversions: number;
  value_usd: number;
  tracked_clicks: number;
  tracking_links: number;
  conversion_rate: number;
};

class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string } & T;
  if (!response.ok) throw new ApiError(response.status, payload.error || 'request_failed', payload.message || 'Request failed');
  return payload;
}

function readCookie(name: string): string | null {
  const match = document.cookie.split('; ').find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function friendlyError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  const messages: Record<string, string> = {
    project_verification_required: 'Verify this Project with its official X account before running campaigns.',
    forbidden: 'Your current Project role does not allow this action.',
    campaign_not_found: 'This campaign is no longer available.',
    destination_required: 'Add a destination URL to this activity before creating a tracking link.',
    tracking_not_found: 'This tracking link is no longer available.',
    invalid_url: 'Enter a valid destination URL.',
    invalid_tracking_status: 'That tracking status is not available.',
  };
  return messages[error.code] || fallback;
}

function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'Not set';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function humanize(value: string | null | undefined): string {
  if (!value) return 'Unknown';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function canWrite(project?: OperationalProject): boolean {
  return Boolean(project && project.status === 'active' && project.verification_status === 'verified_x' && ['owner', 'admin', 'marketing_manager'].includes(project.role));
}

function isVerified(project?: OperationalProject): boolean {
  return Boolean(project && project.status === 'active' && project.verification_status === 'verified_x');
}

function Brand() {
  return (
    <a className="ops-brand" href="https://linkary.xyz" aria-label="Linkary home">
      <img src="/assets/brand/linkary-icon-black.png" alt="" />
      <span>Linkary</span>
    </a>
  );
}

function WorkspaceShell({
  me,
  status,
  activeProfile,
  onProfileChange,
  children,
}: {
  me: MeResponse;
  status: OnboardingStatus;
  activeProfile: ProfileSummary;
  onProfileChange: (id: string) => void;
  children: React.ReactNode;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useSignOut();

  async function logout() {
    try {
      const csrf = readCookie('__Host-linkary_csrf');
      if (csrf) await apiJson('/api/auth/logout', { method: 'POST', headers: { 'x-csrf-token': csrf } });
    } catch {}
    try { await signOut(); } catch {}
    navigate('/login', { replace: true });
    window.location.reload();
  }

  const nav = [
    ['/dashboard', 'Overview'],
    ['/campaigns', 'Campaigns'],
    ['/tracking', 'Tracking'],
    ['/profile', 'Profile'],
    ['/invites', 'Invites'],
    ['/settings', 'Projects'],
  ];

  return (
    <main className="ops-shell">
      <aside className="ops-sidebar">
        <Brand />
        <div className="ops-view-as">
          <label htmlFor="ops-profile">VIEW AS</label>
          <select id="ops-profile" value={activeProfile.id} onChange={(event) => onProfileChange(event.target.value)}>
            {status.profiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.display_name}</option>)}
          </select>
        </div>
        <nav className="ops-nav">
          {nav.map(([path, label]) => <NavLink key={path} to={path} className={location.pathname === path ? 'active' : ''}>{label}</NavLink>)}
        </nav>
        <div className="ops-sidebar-footer">
          {me.user?.superadmin && <NavLink to="/admin">Admin</NavLink>}
          <button type="button" onClick={() => void logout()}>Log out</button>
        </div>
      </aside>
      <section className="ops-main">
        <header className="ops-topbar">
          <div><strong>{activeProfile.display_name}</strong><span>/{activeProfile.username}</span></div>
          <a href={`https://linkary.xyz/${activeProfile.username}`} target="_blank" rel="noreferrer">Public profile ↗</a>
        </header>
        <div className="ops-page">{children}</div>
      </section>
    </main>
  );
}

function ProjectToolbar({
  projects,
  projectId,
  onChange,
}: {
  projects: OperationalProject[];
  projectId: string;
  onChange: (id: string) => void;
}) {
  const project = projects.find((item) => item.id === projectId);
  return (
    <div className="ops-project-toolbar">
      <div>
        <span className="ops-kicker">PROJECT</span>
        {projects.length > 1 ? (
          <select value={projectId} onChange={(event) => onChange(event.target.value)}>
            {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        ) : <strong>{project?.name || 'No Project selected'}</strong>}
      </div>
      {project && <div className={`ops-project-state ${isVerified(project) ? 'verified' : 'pending'}`}>{isVerified(project) ? 'Verified on X' : 'X verification required'}</div>}
    </div>
  );
}

function ProjectGate({ project }: { project?: OperationalProject }) {
  if (!project) {
    return (
      <section className="ops-empty prominent">
        <div className="ops-empty-icon">◎</div>
        <h2>Connect a Project first</h2>
        <p>Campaigns belong to Projects. Request access to an existing Project, or register it using the Project's official X account.</p>
        <NavLink className="ops-button primary" to="/settings">Manage Projects</NavLink>
      </section>
    );
  }
  if (!isVerified(project)) {
    return (
      <section className="ops-callout verification">
        <div><span className="ops-kicker">ACTION REQUIRED</span><h3>Verify {project.name} with its official X account</h3><p>Once the Project identity is verified, campaigns, tracking links and attribution will become available.</p></div>
        <NavLink className="ops-button secondary" to="/settings">Open Projects</NavLink>
      </section>
    );
  }
  if (!canWrite(project)) {
    return <section className="ops-callout neutral"><div><span className="ops-kicker">READ ONLY</span><h3>You have {humanize(project.role)} access</h3><p>You can review campaign evidence and results. An Owner, Admin or Campaign Manager can make operational changes.</p></div></section>;
  }
  return null;
}

function CampaignsView({ projects, initialProjectId }: { projects: OperationalProject[]; initialProjectId: string }) {
  const navigate = useNavigate();
  const [projectId, setProjectId] = useState(initialProjectId);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', objective: '', budgetUsd: '' });
  const project = projects.find((item) => item.id === projectId);

  useEffect(() => {
    if (!projects.some((item) => item.id === projectId)) setProjectId(projects[0]?.id || '');
  }, [projects, projectId]);

  async function loadCampaigns() {
    if (!projectId) { setCampaigns([]); return; }
    setLoading(true); setError('');
    try {
      const result = await apiJson<{ campaigns: Campaign[] }>(`/api/campaigns?organizationId=${encodeURIComponent(projectId)}`);
      setCampaigns(result.campaigns);
    } catch (err) {
      setError(friendlyError(err, 'Campaigns are temporarily unavailable. Please try again shortly.'));
    } finally { setLoading(false); }
  }

  useEffect(() => { void loadCampaigns(); }, [projectId]);

  async function createCampaign(event: React.FormEvent) {
    event.preventDefault();
    const csrf = readCookie('__Host-linkary_csrf');
    if (!csrf || !projectId) return;
    setBusy(true); setError('');
    try {
      await apiJson('/api/campaigns', {
        method: 'POST',
        headers: { 'x-csrf-token': csrf },
        body: JSON.stringify({
          organizationId: projectId,
          name: form.name.trim(),
          objective: form.objective.trim(),
          budgetUsd: form.budgetUsd ? Number(form.budgetUsd) : undefined,
        }),
      });
      setForm({ name: '', objective: '', budgetUsd: '' });
      setShowCreate(false);
      await loadCampaigns();
    } catch (err) {
      setError(friendlyError(err, 'The campaign could not be created. Please try again.'));
    } finally { setBusy(false); }
  }

  return (
    <div className="ops-stack">
      <div className="ops-heading-row">
        <div><span className="ops-kicker">CAMPAIGNS</span><h1>Campaigns</h1><p>Create a campaign, record the work, then connect every click and outcome back to it.</p></div>
        {canWrite(project) && <button type="button" className="ops-button primary" onClick={() => setShowCreate((value) => !value)}>{showCreate ? 'Cancel' : '+ New campaign'}</button>}
      </div>

      <ProjectToolbar projects={projects} projectId={projectId} onChange={setProjectId} />
      <ProjectGate project={project} />

      {showCreate && canWrite(project) && (
        <form className="ops-create-card" onSubmit={createCampaign}>
          <div className="ops-form-heading"><div><span className="ops-kicker">NEW CAMPAIGN</span><h2>What are you trying to grow?</h2></div></div>
          <div className="ops-field-grid two">
            <label>Campaign name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Example: TGE creator launch" maxLength={120} required /></label>
            <label>Budget, optional<input type="number" min="0" step="0.01" value={form.budgetUsd} onChange={(event) => setForm({ ...form, budgetUsd: event.target.value })} placeholder="25000" /></label>
          </div>
          <label>Objective<textarea value={form.objective} onChange={(event) => setForm({ ...form, objective: event.target.value })} placeholder="Example: Drive qualified registrations from creator and community distribution." maxLength={500} /></label>
          <div className="ops-form-actions"><button type="button" className="ops-button ghost" onClick={() => setShowCreate(false)}>Cancel</button><button className="ops-button primary" disabled={busy || !form.name.trim()}>{busy ? 'Creating...' : 'Create campaign'}</button></div>
        </form>
      )}

      {error && <div className="ops-message error">{error}</div>}

      <section className="ops-section">
        <div className="ops-section-title"><div><h2>Campaigns</h2><p>{campaigns.length ? `${campaigns.length} campaign${campaigns.length === 1 ? '' : 's'} in ${project?.name || 'this Project'}` : 'Your Project campaigns will appear here.'}</p></div></div>
        {loading ? <div className="ops-loading">Loading campaigns...</div> : !campaigns.length ? (
          <div className="ops-empty">
            <div className="ops-empty-icon">◇</div>
            <h3>No campaigns yet</h3>
            <p>{canWrite(project) ? 'Create the first campaign, then add activities and attribution.' : 'Campaigns will appear here when the Project team creates them.'}</p>
            {canWrite(project) && <button type="button" className="ops-button secondary" onClick={() => setShowCreate(true)}>Create first campaign</button>}
          </div>
        ) : (
          <div className="ops-campaign-grid">
            {campaigns.map((campaign) => (
              <article className="ops-campaign-card" key={campaign.id}>
                <div className="ops-card-top"><span className={`ops-status status-${campaign.status}`}>{humanize(campaign.status)}</span><span>{formatDate(campaign.created_at)}</span></div>
                <h3>{campaign.name}</h3>
                <p>{campaign.objective || 'No objective added yet.'}</p>
                <div className="ops-card-meta"><div><span>BUDGET</span><strong>{formatMoney(campaign.budget_usd)}</strong></div></div>
                <button type="button" className="ops-card-action" onClick={() => navigate(`/tracking?campaign=${encodeURIComponent(campaign.id)}&project=${encodeURIComponent(projectId)}`)}>Open campaign →</button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return <span className={`ops-confidence confidence-${confidence}`}>{humanize(confidence)}</span>;
}

function TrackingView({ projects, initialProjectId }: { projects: OperationalProject[]; initialProjectId: string }) {
  const location = useLocation();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const [projectId, setProjectId] = useState(params.get('project') || initialProjectId);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState(params.get('campaign') || '');
  const [activities, setActivities] = useState<Activity[]>([]);
  const [links, setLinks] = useState<TrackedLink[]>([]);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [summary, setSummary] = useState<OutcomeSummary | null>(null);
  const [tab, setTab] = useState<'activities' | 'links' | 'outcomes'>('activities');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [showOutcome, setShowOutcome] = useState(false);
  const [copied, setCopied] = useState('');
  const [activityForm, setActivityForm] = useState({ title: '', type: 'creator_content', destinationUrl: '', plannedCostUsd: '' });
  const [outcomeForm, setOutcomeForm] = useState({ trackedLinkId: '', eventType: 'registration', eventKey: '', valueUsd: '' });
  const [filters, setFilters] = useState({ search: '', source: '', confidence: '' });
  const project = projects.find((item) => item.id === projectId);

  useEffect(() => {
    if (!projects.some((item) => item.id === projectId)) setProjectId(projects[0]?.id || '');
  }, [projects, projectId]);

  useEffect(() => {
    if (!projectId) { setCampaigns([]); setCampaignId(''); return; }
    setMessage('');
    apiJson<{ campaigns: Campaign[] }>(`/api/campaigns?organizationId=${encodeURIComponent(projectId)}`)
      .then((result) => {
        setCampaigns(result.campaigns);
        const requested = params.get('campaign');
        setCampaignId((current) => requested && result.campaigns.some((item) => item.id === requested) ? requested : current && result.campaigns.some((item) => item.id === current) ? current : result.campaigns[0]?.id || '');
      })
      .catch((err) => setMessage(friendlyError(err, 'Campaign data is temporarily unavailable. Please try again shortly.')));
  }, [projectId]);

  async function loadCampaignData() {
    if (!campaignId) { setActivities([]); setLinks([]); setOutcomes([]); setSummary(null); return; }
    setLoading(true); setMessage('');
    try {
      const outcomeQuery = new URLSearchParams({ campaignId });
      if (filters.search) outcomeQuery.set('search', filters.search);
      if (filters.source) outcomeQuery.set('source', filters.source);
      if (filters.confidence) outcomeQuery.set('confidence', filters.confidence);
      const [activityResult, linkResult, summaryResult, outcomeResult] = await Promise.all([
        apiJson<{ activities: Activity[] }>(`/api/campaign-activities?campaignId=${encodeURIComponent(campaignId)}`),
        apiJson<{ links: TrackedLink[] }>(`/api/tracked-links?campaignId=${encodeURIComponent(campaignId)}`),
        apiJson<{ summary: OutcomeSummary }>(`/api/campaign-outcomes?campaignId=${encodeURIComponent(campaignId)}`),
        apiJson<{ conversions: Outcome[] }>(`/api/conversions?${outcomeQuery.toString()}`),
      ]);
      setActivities(activityResult.activities);
      setLinks(linkResult.links);
      setSummary(summaryResult.summary);
      setOutcomes(outcomeResult.conversions);
      setOutcomeForm((current) => ({ ...current, trackedLinkId: links.some((item) => item.id === current.trackedLinkId) ? current.trackedLinkId : linkResult.links[0]?.id || '' }));
    } catch (err) {
      setMessage(friendlyError(err, 'Attribution data is temporarily unavailable. Please try again shortly.'));
    } finally { setLoading(false); }
  }

  useEffect(() => { void loadCampaignData(); }, [campaignId]);

  async function createActivity(event: React.FormEvent) {
    event.preventDefault();
    const csrf = readCookie('__Host-linkary_csrf');
    if (!csrf || !campaignId) return;
    setMessage('');
    try {
      await apiJson('/api/campaign-activities', {
        method: 'POST', headers: { 'x-csrf-token': csrf },
        body: JSON.stringify({ campaignId, title: activityForm.title.trim(), activityType: activityForm.type, destinationUrl: activityForm.destinationUrl.trim(), plannedCostUsd: activityForm.plannedCostUsd ? Number(activityForm.plannedCostUsd) : undefined }),
      });
      setActivityForm({ title: '', type: 'creator_content', destinationUrl: '', plannedCostUsd: '' });
      setShowActivity(false);
      await loadCampaignData();
    } catch (err) { setMessage(friendlyError(err, 'This activity could not be created. Please check the details and try again.')); }
  }

  async function createTrackingLink(activityId: string) {
    const csrf = readCookie('__Host-linkary_csrf');
    if (!csrf) return;
    setMessage('');
    try {
      const result = await apiJson<{ url: string }>('/api/tracked-links', { method: 'POST', headers: { 'x-csrf-token': csrf }, body: JSON.stringify({ activityId }) });
      await navigator.clipboard.writeText(result.url).catch(() => undefined);
      setCopied(result.url);
      setTab('links');
      await loadCampaignData();
      window.setTimeout(() => setCopied(''), 2200);
    } catch (err) { setMessage(friendlyError(err, 'The tracking link could not be created.')); }
  }

  async function setLinkStatus(link: TrackedLink, status: TrackingStatus) {
    const csrf = readCookie('__Host-linkary_csrf');
    if (!csrf) return;
    if (status === 'archived' && !window.confirm('Archive this tracking link? Existing reports will keep its history.')) return;
    try {
      await apiJson(`/api/tracked-links/${encodeURIComponent(link.id)}/status`, { method: 'PATCH', headers: { 'x-csrf-token': csrf }, body: JSON.stringify({ status }) });
      await loadCampaignData();
    } catch (err) { setMessage(friendlyError(err, 'The tracking link could not be updated.')); }
  }

  async function copyLink(link: TrackedLink) {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(link.id);
      window.setTimeout(() => setCopied(''), 1600);
    } catch { setMessage('Select the tracking URL and copy it manually.'); }
  }

  async function recordOutcome(event: React.FormEvent) {
    event.preventDefault();
    const csrf = readCookie('__Host-linkary_csrf');
    if (!csrf || !outcomeForm.trackedLinkId) return;
    setMessage('');
    try {
      const result = await apiJson<{ duplicate?: boolean }>('/api/conversions', {
        method: 'POST', headers: { 'x-csrf-token': csrf },
        body: JSON.stringify({ trackedLinkId: outcomeForm.trackedLinkId, eventType: outcomeForm.eventType.trim(), eventKey: outcomeForm.eventKey.trim(), valueUsd: outcomeForm.valueUsd ? Number(outcomeForm.valueUsd) : undefined }),
      });
      setOutcomeForm({ trackedLinkId: outcomeForm.trackedLinkId, eventType: 'registration', eventKey: '', valueUsd: '' });
      setShowOutcome(false);
      setMessage(result.duplicate ? 'That external outcome ID already exists. The original outcome was kept.' : 'Outcome recorded.');
      await loadCampaignData();
    } catch (err) { setMessage(friendlyError(err, 'The outcome could not be recorded.')); }
  }

  const selectedCampaign = campaigns.find((item) => item.id === campaignId);
  const csvParams = new URLSearchParams({ campaignId, format: 'csv' });
  if (filters.search) csvParams.set('search', filters.search);
  if (filters.source) csvParams.set('source', filters.source);
  if (filters.confidence) csvParams.set('confidence', filters.confidence);

  return (
    <div className="ops-stack">
      <div className="ops-heading-row">
        <div><span className="ops-kicker">ATTRIBUTION</span><h1>Tracking</h1><p>Connect campaign activities to measurable traffic, outcomes and evidence.</p></div>
        {campaignId && canWrite(project) && <div className="ops-heading-actions"><button className="ops-button secondary" type="button" onClick={() => setShowActivity(true)}>+ Activity</button><button className="ops-button primary" type="button" onClick={() => setShowOutcome(true)} disabled={!links.length}>+ Outcome</button></div>}
      </div>

      <ProjectToolbar projects={projects} projectId={projectId} onChange={setProjectId} />
      <ProjectGate project={project} />

      {isVerified(project) && (
        <div className="ops-campaign-context">
          <label>Campaign<select value={campaignId} onChange={(event) => setCampaignId(event.target.value)}><option value="">Select a campaign</option>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></label>
          {selectedCampaign && <div><span className={`ops-status status-${selectedCampaign.status}`}>{humanize(selectedCampaign.status)}</span><strong>{selectedCampaign.name}</strong></div>}
        </div>
      )}

      {isVerified(project) && !campaigns.length && (
        <section className="ops-empty prominent"><div className="ops-empty-icon">◇</div><h2>Create a campaign first</h2><p>Tracking starts inside a campaign so every activity and outcome has a clear owner.</p><NavLink className="ops-button primary" to="/campaigns">Go to Campaigns</NavLink></section>
      )}

      {campaignId && summary && (
        <section className="ops-metrics">
          <article><span>CLICKS</span><strong>{summary.tracked_clicks.toLocaleString()}</strong><small>Tracked by Linkary</small></article>
          <article><span>OUTCOMES</span><strong>{summary.conversions.toLocaleString()}</strong><small>Recorded evidence</small></article>
          <article><span>CONVERSION</span><strong>{(summary.conversion_rate * 100).toFixed(summary.conversion_rate > 0 ? 1 : 0)}%</strong><small>Outcomes / clicks</small></article>
          <article><span>VALUE</span><strong>{formatMoney(summary.value_usd)}</strong><small>Attributed value</small></article>
        </section>
      )}

      {message && <div className={`ops-message ${message.includes('recorded') || message.includes('kept') ? 'success' : ''}`}>{message}</div>}
      {copied && <div className="ops-toast">Tracking URL copied</div>}

      {campaignId && (
        <>
          <nav className="ops-tabs">
            <button className={tab === 'activities' ? 'active' : ''} onClick={() => setTab('activities')}>Activities <span>{activities.length}</span></button>
            <button className={tab === 'links' ? 'active' : ''} onClick={() => setTab('links')}>Tracking links <span>{links.length}</span></button>
            <button className={tab === 'outcomes' ? 'active' : ''} onClick={() => setTab('outcomes')}>Outcomes <span>{outcomes.length}</span></button>
          </nav>

          {loading ? <div className="ops-loading">Loading campaign evidence...</div> : tab === 'activities' ? (
            <section className="ops-section">
              <div className="ops-section-title"><div><h2>Activities</h2><p>Record the actual distribution work inside this campaign.</p></div>{canWrite(project) && <button className="ops-button secondary" type="button" onClick={() => setShowActivity(true)}>+ Add activity</button>}</div>
              {!activities.length ? <div className="ops-empty"><div className="ops-empty-icon">＋</div><h3>No activities yet</h3><p>Add a creator post, community placement, video or website activity.</p>{canWrite(project) && <button className="ops-button secondary" onClick={() => setShowActivity(true)}>Add first activity</button>}</div> : <div className="ops-table-list">{activities.map((activity) => <article className="ops-activity-row" key={activity.id}><div className="ops-activity-main"><span className="ops-type-chip">{humanize(activity.activity_type)}</span><strong>{activity.title}</strong><small>{activity.destination_url || 'No destination URL'}</small></div><div className="ops-row-side"><span>{humanize(activity.status)}</span>{canWrite(project) && <button className="ops-button small" onClick={() => void createTrackingLink(activity.id)} disabled={!activity.destination_url}>Create tracking link</button>}</div></article>)}</div>}
            </section>
          ) : tab === 'links' ? (
            <section className="ops-section">
              <div className="ops-section-title"><div><h2>Tracking links</h2><p>Share these URLs instead of raw destination links.</p></div></div>
              {!links.length ? <div className="ops-empty"><div className="ops-empty-icon">↗</div><h3>No tracking links yet</h3><p>Create one from an activity to start measuring attributable traffic.</p><button className="ops-button secondary" onClick={() => setTab('activities')}>View activities</button></div> : <div className="ops-link-grid">{links.map((link) => <article className={`ops-link-card ${link.status}`} key={link.id}><div className="ops-link-head"><div><span className={`ops-status status-${link.status}`}>{humanize(link.status)}</span><strong>{link.activity_title || 'Campaign link'}</strong></div><span>{link.clicks.toLocaleString()} clicks</span></div><div className="ops-link-url"><input readOnly value={link.url} onFocus={(event) => event.currentTarget.select()} /><button type="button" onClick={() => void copyLink(link)}>{copied === link.id ? 'Copied' : 'Copy'}</button></div><div className="ops-link-destination"><span>DESTINATION</span><a href={link.destination_url} target="_blank" rel="noreferrer">{link.destination_url} ↗</a></div><div className="ops-link-footer"><span>Last click: {formatDate(link.last_click_at)}</span>{canWrite(project) && <div>{link.status === 'active' ? <button onClick={() => void setLinkStatus(link, 'paused')}>Pause</button> : link.status === 'paused' ? <button onClick={() => void setLinkStatus(link, 'active')}>Reactivate</button> : null}{link.status !== 'archived' && <button onClick={() => void setLinkStatus(link, 'archived')}>Archive</button>}</div>}</div></article>)}</div>}
            </section>
          ) : (
            <section className="ops-section">
              <div className="ops-section-title"><div><h2>Outcome Ledger</h2><p>Every recorded conversion keeps its source and attribution confidence.</p></div><a className="ops-button secondary" href={`/api/conversions?${csvParams.toString()}`}>Export CSV</a></div>
              <div className="ops-filters"><input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Search outcome ID or type" /><select value={filters.source} onChange={(event) => setFilters({ ...filters, source: event.target.value })}><option value="">All sources</option><option value="manual">Manual</option><option value="linkary_tracked">Linkary tracked</option><option value="telegram_verified">Telegram verified</option><option value="provider_verified">Provider verified</option></select><select value={filters.confidence} onChange={(event) => setFilters({ ...filters, confidence: event.target.value })}><option value="">All confidence</option><option value="manual">Manual</option><option value="tracked">Tracked</option><option value="correlated">Correlated</option><option value="verified">Verified</option></select><button className="ops-button small" onClick={() => void loadCampaignData()}>Apply</button></div>
              {!outcomes.length ? <div className="ops-empty"><div className="ops-empty-icon">✓</div><h3>No outcomes recorded yet</h3><p>Outcomes will appear here when they are recorded manually or received through Linkary attribution integrations.</p>{canWrite(project) && links.length > 0 && <button className="ops-button secondary" onClick={() => setShowOutcome(true)}>Record first outcome</button>}</div> : <div className="ops-outcome-table"><div className="ops-outcome-header"><span>Outcome</span><span>Activity</span><span>Evidence</span><span>Value</span><span>Date</span></div>{outcomes.map((outcome) => <article key={outcome.id}><div><strong>{humanize(outcome.event_type)}</strong><small>{outcome.external_event_key}</small></div><div><strong>{outcome.activity_title || 'Campaign'}</strong><small>{humanize(outcome.activity_type)}</small></div><div><ConfidenceBadge confidence={outcome.attribution_confidence} /><small>{humanize(outcome.source)}</small></div><strong>{formatMoney(outcome.value_usd)}</strong><span>{formatDate(outcome.occurred_at)}</span></article>)}</div>}
            </section>
          )}
        </>
      )}

      {showActivity && canWrite(project) && (
        <div className="ops-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setShowActivity(false); }}>
          <form className="ops-modal" onSubmit={createActivity}><div className="ops-modal-head"><div><span className="ops-kicker">NEW ACTIVITY</span><h2>Add campaign activity</h2></div><button type="button" onClick={() => setShowActivity(false)}>×</button></div><label>Activity name<input value={activityForm.title} onChange={(event) => setActivityForm({ ...activityForm, title: event.target.value })} placeholder="Example: Creator launch thread" required /></label><div className="ops-field-grid two"><label>Type<select value={activityForm.type} onChange={(event) => setActivityForm({ ...activityForm, type: event.target.value })}><option value="creator_content">Creator content</option><option value="community_placement">Community placement</option><option value="website">Website</option><option value="video">Video</option><option value="other">Other</option></select></label><label>Planned cost, optional<input type="number" min="0" step="0.01" value={activityForm.plannedCostUsd} onChange={(event) => setActivityForm({ ...activityForm, plannedCostUsd: event.target.value })} placeholder="500" /></label></div><label>Destination URL<input type="url" value={activityForm.destinationUrl} onChange={(event) => setActivityForm({ ...activityForm, destinationUrl: event.target.value })} placeholder="https://project.xyz/signup" required /></label><div className="ops-form-actions"><button type="button" className="ops-button ghost" onClick={() => setShowActivity(false)}>Cancel</button><button className="ops-button primary" disabled={!activityForm.title.trim() || !activityForm.destinationUrl.trim()}>Add activity</button></div></form>
        </div>
      )}

      {showOutcome && canWrite(project) && (
        <div className="ops-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setShowOutcome(false); }}>
          <form className="ops-modal" onSubmit={recordOutcome}><div className="ops-modal-head"><div><span className="ops-kicker">OUTCOME LEDGER</span><h2>Record an outcome</h2></div><button type="button" onClick={() => setShowOutcome(false)}>×</button></div><label>Tracking link<select value={outcomeForm.trackedLinkId} onChange={(event) => setOutcomeForm({ ...outcomeForm, trackedLinkId: event.target.value })} required><option value="">Select tracking link</option>{links.filter((link) => link.status !== 'archived').map((link) => <option key={link.id} value={link.id}>{link.activity_title || link.code} · {link.code}</option>)}</select></label><div className="ops-field-grid two"><label>Outcome type<input value={outcomeForm.eventType} onChange={(event) => setOutcomeForm({ ...outcomeForm, eventType: event.target.value })} placeholder="registration, sale, activation" required /></label><label>Attributed value, optional<input type="number" min="0" step="0.01" value={outcomeForm.valueUsd} onChange={(event) => setOutcomeForm({ ...outcomeForm, valueUsd: event.target.value })} placeholder="250" /></label></div><label>External outcome ID<input value={outcomeForm.eventKey} onChange={(event) => setOutcomeForm({ ...outcomeForm, eventKey: event.target.value })} placeholder="CRM, order or signup ID" required /><small>Use a unique ID from your own system. Linkary prevents duplicates.</small></label><div className="ops-form-actions"><button type="button" className="ops-button ghost" onClick={() => setShowOutcome(false)}>Cancel</button><button className="ops-button primary" disabled={!outcomeForm.trackedLinkId || !outcomeForm.eventKey.trim()}>Record outcome</button></div></form>
        </div>
      )}
    </div>
  );
}

export function OperationsExperience({ me, status }: { me: MeResponse; status: OnboardingStatus }) {
  const location = useLocation();
  const storedProfile = typeof window !== 'undefined' ? window.localStorage.getItem('linkary.active.profile') : null;
  const creatorFirst = status.profiles.find((profile) => profile.profile_type === 'creator') || status.profiles[0];
  const [profileId, setProfileId] = useState(storedProfile && status.profiles.some((profile) => profile.id === storedProfile) ? storedProfile : creatorFirst?.id || '');
  const [projects, setProjects] = useState<OperationalProject[]>([]);
  const [projectError, setProjectError] = useState('');
  const activeProfile = status.profiles.find((profile) => profile.id === profileId) || creatorFirst;

  useEffect(() => {
    apiJson<{ organizations: OperationalProject[] }>('/api/organizations')
      .then((result) => { setProjects(result.organizations); setProjectError(''); })
      .catch(() => setProjectError('Project access is temporarily unavailable. Please try again shortly.'));
  }, []);

  if (!activeProfile) return null;
  const matchingProject = activeProfile.organization_id ? projects.find((project) => project.id === activeProfile.organization_id) : undefined;
  const initialProjectId = matchingProject?.id || projects[0]?.id || '';

  function changeProfile(id: string) {
    setProfileId(id);
    window.localStorage.setItem('linkary.active.profile', id);
  }

  return (
    <WorkspaceShell me={me} status={status} activeProfile={activeProfile} onProfileChange={changeProfile}>
      {projectError && <div className="ops-message error">{projectError}</div>}
      {location.pathname === '/tracking' ? <TrackingView projects={projects} initialProjectId={initialProjectId} /> : <CampaignsView projects={projects} initialProjectId={initialProjectId} />}
    </WorkspaceShell>
  );
}

export type { MeResponse, OnboardingStatus };
