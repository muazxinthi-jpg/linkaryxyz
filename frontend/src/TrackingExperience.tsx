import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ProductWorkspace, type ProductMe, type ProductProfile, type ProductStatus } from './ProductWorkspace';
import ActivityLifecycleActions from './ActivityLifecycleActions';

type Role = 'owner' | 'admin' | 'marketing_manager' | 'analyst' | 'viewer';
type TrackingStatus = 'active' | 'paused' | 'archived';
type Confidence = 'manual' | 'tracked' | 'correlated' | 'verified';
type PartnerMode = 'none' | 'creator' | 'community';

type Project = { id: string; name: string; status: string; verification_status: string; role: Role };
type Campaign = { id: string; name: string; objective: string; budget_usd: number | null; status: string; created_at: string };
type Activity = {
  id: string;
  title: string;
  activity_type: string;
  destination_url: string | null;
  planned_cost_usd: number | null;
  status: string;
  created_at: string;
  partner_kind: 'creator' | 'community' | null;
  partner_entity_id: string | null;
  partner_profile_id: string | null;
  partner_manager_id: string | null;
  partner_asset_id: string | null;
  partner_display_name: string | null;
  partner_handle: string | null;
  partner_verification_status: string | null;
  partner_username: string | null;
  partner_manager_name: string | null;
  partner_asset_url: string | null;
};
type CampaignMember = {
  key: string;
  kind: 'creator' | 'community';
  name: string;
  handle: string | null;
  activities: number;
};
type CreatorPartner = {
  kind: 'creator'; id: string; profile_id: string; username: string; display_name: string; bio: string; avatar_url: string | null;
  x_handle: string | null; verified: boolean; open_to_collaborations: boolean; accepted_campaigns: number; public_url: string;
};
type CommunityManagerPartner = {
  kind: 'community_manager'; id: string; manager_id: string; profile_id: string; username: string; avatar_url: string | null;
  display_name: string; headline: string; bio: string; telegram_verified: boolean; open_to_campaigns: boolean;
  community_count: number; verified_communities: number; combined_audience: number; public_url: string;
};
type CommunityAsset = {
  id: string; asset_type: string; name: string; platform: string; handle: string | null; url: string | null;
  audience_size: number; verification_status: string; notes: string; updated_at: string;
};
type TrackedLink = {
  id: string; code: string; url: string; activity_id: string | null; activity_title: string | null; activity_type: string | null;
  destination_url: string; status: TrackingStatus; clicks: number; last_click_at: string | null; created_at: string;
};
type Outcome = {
  id: string; tracked_link_id: string | null; tracking_code: string | null; destination_url: string | null;
  activity_id: string | null; activity_title: string | null; activity_type: string | null; external_event_key: string;
  event_type: string; value_usd: number | null; source: string; attribution_confidence: Confidence; occurred_at: string;
  partner_kind: 'creator' | 'community' | null; partner_display_name: string | null; partner_handle: string | null;
  partner_manager_name: string | null; partner_verification_status: string | null;
  partner_snapshot_source: 'link_creation' | 'legacy_backfill' | null; partner_snapshot_captured_at: string | null;
};
type OutcomeTypeOption = { value: string; label: string };
type OutcomeSummary = { conversions: number; value_usd: number; tracked_clicks: number; tracking_links: number; conversion_rate: number };

const DEFAULT_OUTCOME_TYPES: OutcomeTypeOption[] = [
  { value: 'signup', label: 'Signup' },
  { value: 'telegram_join', label: 'Telegram Join' },
  { value: 'retained_user', label: 'Retained User' },
  { value: 'wallet_connect', label: 'Wallet Connect' },
  { value: 'lead', label: 'Lead' },
  { value: 'purchase', label: 'Purchase' },
  { value: 'deposit', label: 'Deposit' },
  { value: 'subscription', label: 'Subscription' },
  { value: 'token_purchase', label: 'Token Purchase' },
  { value: 'custom', label: 'Custom Outcome' },
];

class ApiError extends Error { constructor(readonly status: number, readonly code: string, message: string) { super(message); } }
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (!response.ok) throw new ApiError(response.status, payload.error || 'request_failed', payload.message || 'Request failed');
  return payload;
}
function cookie() { const hit = document.cookie.split('; ').find((part) => part.startsWith('__Host-linkary_csrf=')); return hit ? decodeURIComponent(hit.split('=').slice(1).join('=')) : null; }
function human(value: string | null | undefined) { return value ? value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Not set'; }
function money(value: number | null | undefined) { return value === null || value === undefined ? 'Not set' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value); }
function date(value: string | null | undefined) { if (!value) return 'Never'; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? 'Unknown' : new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed); }
function writable(project?: Project) { return Boolean(project && project.status === 'active' && project.verification_status === 'verified_x' && ['owner', 'admin', 'marketing_manager'].includes(project.role)); }
function verified(project?: Project) { return Boolean(project && project.status === 'active' && project.verification_status === 'verified_x'); }
function friendly(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return fallback;
  const messages: Record<string, string> = {
    project_verification_required: 'Verify this Project with its official X account before running campaign evidence.',
    forbidden: 'Your current Project role does not allow this action.',
    campaign_not_found: 'This campaign is no longer available.',
    activity_not_found: 'This activity is no longer available.',
    invalid_partner_assignment: 'Choose a valid Linkary Creator or exact Telegram Community.',
    partner_not_found: 'That Linkary partner is no longer available.',
    community_manager_telegram_required: 'The Community Manager must verify their personal Telegram identity before this Community can be assigned.',
    destination_required: 'Add a destination URL before creating a tracking link.',
    tracking_not_found: 'This tracking link is no longer available.',
    invalid_url: 'Enter a valid destination URL.',
    invalid_outcome_type: 'Choose a valid outcome type.',
    invalid_outcome_value: 'Attributed value must be zero or greater.',
    invalid_outcome_time: 'Choose a valid outcome time that is not in the future.',
  };
  return messages[error.code] || fallback;
}

function VerificationChip({ status, kind }: { status: string | null; kind: 'creator' | 'community' }) {
  const isVerified = status === 'verified';
  const label = isVerified ? (kind === 'creator' ? 'Verified Creator' : 'Verified Community') : status === 'submitted' ? 'Verification submitted' : status === 'rejected' ? 'Verification not approved' : 'Not verified';
  return <span className={`tracking-verification ${isVerified ? 'verified' : 'unverified'}`}>{label}</span>;
}

function PartnerIdentity({ activity }: { activity: Activity }) {
  if (!activity.partner_kind || !activity.partner_display_name) return <span className="activity-partner-empty">No Linkary partner assigned</span>;
  return (
    <div className="activity-partner-line">
      <div>
        <span className="activity-partner-kind">{activity.partner_kind === 'creator' ? 'CREATOR' : 'TELEGRAM COMMUNITY'}</span>
        <strong>{activity.partner_display_name}</strong>
        {activity.partner_handle && <small>@{activity.partner_handle.replace(/^@/, '')}</small>}
        {activity.partner_kind === 'community' && activity.partner_manager_name && <small>Managed by {activity.partner_manager_name}</small>}
      </div>
      <VerificationChip status={activity.partner_verification_status} kind={activity.partner_kind} />
    </div>
  );
}

export default function TrackingExperience({ me, status }: { me: ProductMe; status: ProductStatus }) {
  const location = useLocation();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const creatorFirst = status.profiles.find((p) => p.profile_type === 'creator') || status.profiles[0];
  const projectFirst = status.profiles.find((p) => p.profile_type === 'project') || creatorFirst;
  const stored = window.localStorage.getItem('linkary.active.profile');
  const [profileId, setProfileId] = useState(stored && status.profiles.some((p) => p.id === stored) ? stored : projectFirst?.id || '');
  const profile = status.profiles.find((p) => p.id === profileId) || projectFirst;
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState(params.get('project') || '');
  const project = projects.find((p) => p.id === projectId);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState(params.get('campaign') || '');
  const [activities, setActivities] = useState<Activity[]>([]);
  const [links, setLinks] = useState<TrackedLink[]>([]);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [outcomeTypes, setOutcomeTypes] = useState<OutcomeTypeOption[]>(DEFAULT_OUTCOME_TYPES);
  const [summary, setSummary] = useState<OutcomeSummary | null>(null);
  const [tab, setTab] = useState<'activities' | 'links' | 'outcomes'>('activities');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState('');

  const [creators, setCreators] = useState<CreatorPartner[]>([]);
  const [communityManagers, setCommunityManagers] = useState<CommunityManagerPartner[]>([]);
  const [communityAssets, setCommunityAssets] = useState<Record<string, CommunityAsset[]>>({});
  const [partnersLoading, setPartnersLoading] = useState(false);

  const [showActivity, setShowActivity] = useState(false);
  const [activityForm, setActivityForm] = useState({ title: '', type: 'creator_content', destinationUrl: '', plannedCostUsd: '', partnerMode: 'none' as PartnerMode, creatorProfileId: '', managerId: '', assetId: '' });
  const [assigning, setAssigning] = useState<Activity | null>(null);
  const [assignForm, setAssignForm] = useState({ partnerMode: 'creator' as Exclude<PartnerMode, 'none'>, creatorProfileId: '', managerId: '', assetId: '' });
  const [showOutcome, setShowOutcome] = useState(false);
  const [outcomeForm, setOutcomeForm] = useState({ trackedLinkId: '', eventType: 'signup', customEventType: '', eventKey: '', valueUsd: '', occurredAt: '' });
  const [filters, setFilters] = useState({ search: '', eventType: '', source: '', confidence: '' });

  function changeProfile(id: string) { setProfileId(id); window.localStorage.setItem('linkary.active.profile', id); const selected = status.profiles.find((p) => p.id === id); if (selected?.organization_id && projects.some((p) => p.id === selected.organization_id)) setProjectId(selected.organization_id); }

  useEffect(() => {
    api<{ organizations: Project[] }>('/api/organizations').then((result) => {
      setProjects(result.organizations);
      const requested = params.get('project');
      const fromProfile = profile?.organization_id;
      const next = requested && result.organizations.some((p) => p.id === requested) ? requested : fromProfile && result.organizations.some((p) => p.id === fromProfile) ? fromProfile : result.organizations[0]?.id || '';
      setProjectId(next);
    }).catch(() => setMessage('Project access is temporarily unavailable.'));
  }, []);

  useEffect(() => {
    if (profile?.organization_id && projects.some((p) => p.id === profile.organization_id)) setProjectId(profile.organization_id);
  }, [profileId, projects.length]);

  useEffect(() => {
    if (!projectId) { setCampaigns([]); setCampaignId(''); return; }
    setMessage('');
    api<{ campaigns: Campaign[] }>(`/api/campaigns?organizationId=${encodeURIComponent(projectId)}`).then((result) => {
      setCampaigns(result.campaigns);
      const requested = params.get('campaign');
      setCampaignId((current) => requested && result.campaigns.some((c) => c.id === requested) ? requested : current && result.campaigns.some((c) => c.id === current) ? current : result.campaigns[0]?.id || '');
    }).catch((error) => setMessage(friendly(error, 'Campaign data is temporarily unavailable.')));
  }, [projectId]);

  async function loadPartnerOptions() {
    if (!projectId || !verified(project)) { setCreators([]); setCommunityManagers([]); return; }
    setPartnersLoading(true);
    try {
      const [creatorResult, managerResult] = await Promise.all([
        api<{ partners: CreatorPartner[] }>(`/api/network-entities?organizationId=${encodeURIComponent(projectId)}&discovery=1&type=creator&open=1`),
        api<{ partners: CommunityManagerPartner[] }>(`/api/network-entities?organizationId=${encodeURIComponent(projectId)}&discovery=1&type=community_manager&open=1`),
      ]);
      setCreators(creatorResult.partners);
      setCommunityManagers(managerResult.partners.filter((manager) => manager.telegram_verified));
    } catch {
      setMessage('Linkary partner choices are temporarily unavailable. You can still record the activity without assigning a partner.');
    } finally { setPartnersLoading(false); }
  }

  useEffect(() => { void loadPartnerOptions(); }, [projectId, project?.verification_status]);

  async function loadCommunityAssets(managerId: string) {
    if (!managerId || communityAssets[managerId]) return;
    try {
      const result = await api<{ assets: CommunityAsset[] }>(`/api/partner-manager-assets?managerId=${encodeURIComponent(managerId)}`);
      setCommunityAssets((current) => ({ ...current, [managerId]: result.assets.filter((asset) => asset.asset_type === 'telegram_community') }));
    } catch { setMessage('The selected Community portfolio could not be loaded.'); }
  }

  async function loadCampaignData() {
    if (!campaignId) { setActivities([]); setLinks([]); setOutcomes([]); setSummary(null); return; }
    setLoading(true); setMessage('');
    try {
      const outcomeQuery = new URLSearchParams({ campaignId });
      if (filters.search) outcomeQuery.set('search', filters.search);
      if (filters.eventType) outcomeQuery.set('eventType', filters.eventType);
      if (filters.source) outcomeQuery.set('source', filters.source);
      if (filters.confidence) outcomeQuery.set('confidence', filters.confidence);
      const [activityResult, linkResult, summaryResult, outcomeResult] = await Promise.all([
        api<{ activities: Activity[] }>(`/api/campaign-activities?campaignId=${encodeURIComponent(campaignId)}`),
        api<{ links: TrackedLink[] }>(`/api/tracked-links?campaignId=${encodeURIComponent(campaignId)}`),
        api<{ summary: OutcomeSummary }>(`/api/campaign-outcomes?campaignId=${encodeURIComponent(campaignId)}`),
        api<{ conversions: Outcome[]; outcomeTypes?: OutcomeTypeOption[] }>(`/api/conversions?${outcomeQuery.toString()}`),
      ]);
      setActivities(activityResult.activities);
      setLinks(linkResult.links);
      setSummary(summaryResult.summary);
      setOutcomes(outcomeResult.conversions);
      if (outcomeResult.outcomeTypes?.length) setOutcomeTypes(outcomeResult.outcomeTypes);
      setOutcomeForm((current) => ({ ...current, trackedLinkId: linkResult.links.some((link) => link.id === current.trackedLinkId) ? current.trackedLinkId : linkResult.links.find((link) => link.status !== 'archived')?.id || '' }));
    } catch (error) { setMessage(friendly(error, 'Campaign evidence is temporarily unavailable.')); }
    finally { setLoading(false); }
  }

  useEffect(() => { void loadCampaignData(); }, [campaignId]);

  function partnerPayload(form: { partnerMode: PartnerMode; creatorProfileId: string; managerId: string; assetId: string }) {
    if (form.partnerMode === 'creator' && form.creatorProfileId) return { kind: 'creator', creatorProfileId: form.creatorProfileId };
    if (form.partnerMode === 'community' && form.managerId && form.assetId) return { kind: 'community', partnerManagerId: form.managerId, partnerAssetId: form.assetId };
    return undefined;
  }

  async function createActivity(event: React.FormEvent) {
    event.preventDefault(); const token = cookie(); if (!token || !campaignId) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const addAnother = submitter?.dataset.addAnother === 'true';
    const partner = partnerPayload(activityForm);
    if (activityForm.partnerMode !== 'none' && !partner) { setMessage(activityForm.partnerMode === 'community' ? 'Choose both the Community Manager and exact Telegram Community.' : 'Choose a Creator.'); return; }
    try {
      await api('/api/campaign-activities', { method: 'POST', headers: { 'x-csrf-token': token }, body: JSON.stringify({ campaignId, title: activityForm.title.trim(), activityType: activityForm.type, destinationUrl: activityForm.destinationUrl.trim(), plannedCostUsd: activityForm.plannedCostUsd ? Number(activityForm.plannedCostUsd) : undefined, partner }) });
      setActivityForm({ title: '', type: addAnother ? activityForm.type : 'creator_content', destinationUrl: addAnother ? activityForm.destinationUrl : '', plannedCostUsd: '', partnerMode: 'none', creatorProfileId: '', managerId: '', assetId: '' });
      setShowActivity(addAnother);
      setMessage(addAnother ? 'Contribution added to this campaign. Add the next Creator or Community.' : partner ? 'Contribution added and linked to the exact Linkary partner.' : 'Contribution added. You can assign a Linkary partner at any time.');
      await loadCampaignData();
    } catch (error) { setMessage(friendly(error, 'The activity could not be created.')); }
  }

  function openAssignment(activity: Activity) {
    const mode = activity.partner_kind || (activity.activity_type === 'community_placement' ? 'community' : 'creator');
    setAssigning(activity);
    setAssignForm({ partnerMode: mode, creatorProfileId: activity.partner_profile_id || '', managerId: activity.partner_manager_id || '', assetId: activity.partner_asset_id || '' });
    if (activity.partner_manager_id) void loadCommunityAssets(activity.partner_manager_id);
  }

  async function saveAssignment(event: React.FormEvent) {
    event.preventDefault(); const token = cookie(); if (!token || !assigning) return;
    const partner = partnerPayload(assignForm);
    if (!partner) { setMessage(assignForm.partnerMode === 'community' ? 'Choose both the Community Manager and exact Telegram Community.' : 'Choose a Creator.'); return; }
    try {
      await api('/api/campaign-activities', { method: 'POST', headers: { 'x-csrf-token': token }, body: JSON.stringify({ activityId: assigning.id, partner }) });
      setAssigning(null); setMessage('Exact Linkary partner assignment updated.'); await loadCampaignData();
    } catch (error) { setMessage(friendly(error, 'The partner assignment could not be updated.')); }
  }

  async function clearAssignment(activity: Activity) {
    const token = cookie(); if (!token) return;
    if (!window.confirm(`Remove ${activity.partner_display_name || 'this partner'} from this activity? Tracking history stays attached to the activity.`)) return;
    try {
      await api('/api/campaign-activities', { method: 'POST', headers: { 'x-csrf-token': token }, body: JSON.stringify({ activityId: activity.id, clearPartner: true }) });
      setMessage('Linkary partner assignment removed. Existing activity tracking remains intact.'); await loadCampaignData();
    } catch (error) { setMessage(friendly(error, 'The partner assignment could not be removed.')); }
  }

  async function createTrackingLink(activityId: string) {
    const token = cookie(); if (!token) return;
    try { const result = await api<{ url: string }>('/api/tracked-links', { method: 'POST', headers: { 'x-csrf-token': token }, body: JSON.stringify({ activityId }) }); await navigator.clipboard.writeText(result.url).catch(() => undefined); setCopied(result.url); setTab('links'); await loadCampaignData(); window.setTimeout(() => setCopied(''), 2200); }
    catch (error) { setMessage(friendly(error, 'The tracking link could not be created.')); }
  }

  async function copyLink(link: TrackedLink) { try { await navigator.clipboard.writeText(link.url); setCopied(link.id); window.setTimeout(() => setCopied(''), 1600); } catch { setMessage('Select the tracking URL and copy it manually.'); } }
  async function setLinkStatus(link: TrackedLink, next: TrackingStatus) { const token = cookie(); if (!token) return; if (next === 'archived' && !window.confirm('Archive this tracking link? Existing reports will keep its history.')) return; try { await api(`/api/tracked-links/${encodeURIComponent(link.id)}/status`, { method: 'PATCH', headers: { 'x-csrf-token': token }, body: JSON.stringify({ status: next }) }); await loadCampaignData(); } catch (error) { setMessage(friendly(error, 'The tracking link could not be updated.')); } }

  async function recordOutcome(event: React.FormEvent) {
    event.preventDefault();
    const token = cookie();
    if (!token || !outcomeForm.trackedLinkId) return;
    const eventType = outcomeForm.eventType === 'custom' ? outcomeForm.customEventType.trim() : outcomeForm.eventType;
    if (!eventType) { setMessage('Enter a name for the custom outcome.'); return; }
    try {
      const result = await api<{ duplicate?: boolean }>('/api/conversions', {
        method: 'POST',
        headers: { 'x-csrf-token': token },
        body: JSON.stringify({
          trackedLinkId: outcomeForm.trackedLinkId,
          eventType,
          eventKey: outcomeForm.eventKey.trim(),
          valueUsd: outcomeForm.valueUsd ? Number(outcomeForm.valueUsd) : undefined,
          occurredAt: outcomeForm.occurredAt ? new Date(outcomeForm.occurredAt).toISOString() : undefined,
        }),
      });
      setOutcomeForm({ trackedLinkId: outcomeForm.trackedLinkId, eventType: 'signup', customEventType: '', eventKey: '', valueUsd: '', occurredAt: '' });
      setShowOutcome(false);
      setMessage(result.duplicate ? 'That external outcome ID already exists. The original outcome was kept.' : 'Outcome recorded as Manual evidence.');
      await loadCampaignData();
    } catch (error) { setMessage(friendly(error, 'The outcome could not be recorded.')); }
  }

  const selectedCampaign = campaigns.find((c) => c.id === campaignId);
  const campaignTeam = useMemo(() => {
    const members = new Map<string, CampaignMember>();
    let unassigned = 0;
    for (const activity of activities) {
      if (!activity.partner_kind || !activity.partner_display_name) { unassigned += 1; continue; }
      const identity = activity.partner_kind === 'creator'
        ? activity.partner_profile_id || activity.partner_entity_id || activity.partner_display_name
        : activity.partner_asset_id || activity.partner_entity_id || activity.partner_display_name;
      const key = `${activity.partner_kind}:${identity}`;
      const current = members.get(key);
      if (current) current.activities += 1;
      else members.set(key, { key, kind: activity.partner_kind, name: activity.partner_display_name, handle: activity.partner_handle, activities: 1 });
    }
    const list = Array.from(members.values());
    return {
      members: list,
      creators: list.filter((member) => member.kind === 'creator').length,
      communities: list.filter((member) => member.kind === 'community').length,
      unassigned,
    };
  }, [activities]);
  const selectedCreateAssets = activityForm.managerId ? communityAssets[activityForm.managerId] || [] : [];
  const selectedAssignAssets = assignForm.managerId ? communityAssets[assignForm.managerId] || [] : [];
  const csvParams = new URLSearchParams({ campaignId, format: 'csv' });
  if (filters.search) csvParams.set('search', filters.search); if (filters.eventType) csvParams.set('eventType', filters.eventType); if (filters.source) csvParams.set('source', filters.source); if (filters.confidence) csvParams.set('confidence', filters.confidence);
  if (!profile) return null;

  return <ProductWorkspace me={me} status={status} profile={profile as ProductProfile} onProfileChange={changeProfile}>
    <div className="ops-stack tracking-v2">
      <div className="ops-heading-row"><div><span className="ops-kicker">EVIDENCE</span><h1>Campaign contributions</h1><p>One campaign can include many Creators and Communities. Record each contribution under the same campaign, then connect its evidence and outcomes.</p></div>{campaignId && writable(project) && <div className="ops-heading-actions"><button className="ops-button secondary" onClick={() => setShowActivity(true)}>+ Add contributor work</button><button className="ops-button primary" onClick={() => setShowOutcome(true)} disabled={!links.length}>+ Outcome</button></div>}</div>
      <section className="tracking-evidence-principle"><strong>Exact partner, exact activity, real evidence.</strong><span>A Community Manager can represent many Communities. Linkary records the specific Community used for each placement, not only the manager.</span></section>

      <div className="ops-project-toolbar"><div><span className="ops-kicker">PROJECT</span>{projects.length > 1 ? <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select> : <strong>{project?.name || 'No Project selected'}</strong>}</div>{project && <div className={`ops-project-state ${verified(project) ? 'verified' : 'pending'}`}>{verified(project) ? 'Verified on X' : 'X verification required'}</div>}</div>

      {!project ? <section className="ops-empty prominent"><h2>Connect a Project first</h2><p>Evidence belongs to a verified Project.</p><NavLink className="ops-button primary" to="/settings">Manage Projects</NavLink></section> : !verified(project) ? <section className="ops-callout verification"><div><span className="ops-kicker">ACTION REQUIRED</span><h3>Verify {project.name} with its official X account</h3><p>Campaign evidence becomes available after Project verification.</p></div><NavLink className="ops-button secondary" to="/settings">Open Projects</NavLink></section> : <>
        <div className="ops-campaign-context"><label>Campaign<select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}><option value="">Select a campaign</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>{selectedCampaign && <div><span className={`ops-status status-${selectedCampaign.status}`}>{human(selectedCampaign.status)}</span><strong>{selectedCampaign.name}</strong></div>}</div>
        {!campaigns.length && <section className="ops-empty prominent"><h2>Create a campaign first</h2><p>Every evidence record starts with a campaign.</p><NavLink className="ops-button primary" to="/campaigns">Go to Growth</NavLink></section>}
      </>}

      {campaignId && summary && <section className="ops-metrics"><article><span>CLICKS</span><strong>{summary.tracked_clicks.toLocaleString()}</strong><small>Tracked by Linkary</small></article><article><span>OUTCOMES</span><strong>{summary.conversions.toLocaleString()}</strong><small>Recorded evidence</small></article><article><span>CONVERSION</span><strong>{(summary.conversion_rate * 100).toFixed(summary.conversion_rate > 0 ? 1 : 0)}%</strong><small>Outcomes / clicks</small></article><article><span>VALUE</span><strong>{money(summary.value_usd)}</strong><small>Attributed value</small></article></section>}
      {campaignId && <section className="campaign-team" aria-label="Campaign team summary">
        <div className="campaign-team-head"><div><span className="ops-kicker">CAMPAIGN TEAM</span><h2>{selectedCampaign?.name || 'Selected campaign'}</h2><p>All contributors below belong to this single campaign.</p></div>{writable(project) && <button className="ops-button secondary" onClick={() => setShowActivity(true)}>+ Add Creator or Community</button>}</div>
        <div className="campaign-team-stats"><article><strong>{campaignTeam.creators}</strong><span>Creators</span></article><article><strong>{campaignTeam.communities}</strong><span>Communities</span></article><article><strong>{activities.length}</strong><span>Contributions</span></article><article className={campaignTeam.unassigned ? 'needs-attention' : ''}><strong>{campaignTeam.unassigned}</strong><span>Unassigned</span></article></div>
        {campaignTeam.members.length ? <div className="campaign-member-list">{campaignTeam.members.map((member) => <div className={`campaign-member ${member.kind}`} key={member.key}><span>{member.kind === 'creator' ? 'Creator' : 'Community'}</span><strong>{member.name}</strong>{member.handle && <small>@{member.handle.replace(/^@/, '')}</small>}<em>{member.activities} {member.activities === 1 ? 'contribution' : 'contributions'}</em></div>)}</div> : <div className="campaign-team-empty"><strong>No contributors attached yet</strong><span>Add Creator or Community work without creating another campaign.</span></div>}
        {campaignTeam.unassigned > 0 && <p className="campaign-team-warning">{campaignTeam.unassigned} {campaignTeam.unassigned === 1 ? 'contribution has' : 'contributions have'} no exact partner. Assign them before relying on partner-level results.</p>}
      </section>}
      {message && <div className="ops-message">{message}</div>}{copied && <div className="ops-toast">Tracking URL copied</div>}

      {campaignId && <>
        <nav className="ops-tabs"><button className={tab === 'activities' ? 'active' : ''} onClick={() => setTab('activities')}>Contributions <span>{activities.length}</span></button><button className={tab === 'links' ? 'active' : ''} onClick={() => setTab('links')}>Tracking links <span>{links.length}</span></button><button className={tab === 'outcomes' ? 'active' : ''} onClick={() => setTab('outcomes')}>Outcomes <span>{outcomes.length}</span></button></nav>
        {loading ? <div className="ops-loading">Loading campaign evidence...</div> : tab === 'activities' ? <section className="ops-section"><div className="ops-section-title"><div><h2>Contributor work</h2><p>Each row is one piece of work inside this campaign—not a separate campaign.</p></div>{writable(project) && <button className="ops-button secondary" onClick={() => setShowActivity(true)}>+ Add contributor work</button>}</div>{!activities.length ? <div className="ops-empty"><h3>No contributions yet</h3><p>Add work from every Creator or Community participating in this campaign.</p>{writable(project) && <button className="ops-button secondary" onClick={() => setShowActivity(true)}>Add first contributor</button>}</div> : <div className="tracking-activity-list">{activities.map((activity) => <article className="tracking-activity-card" key={activity.id}><div className="tracking-activity-main"><div className="tracking-activity-head"><span className="ops-type-chip">{human(activity.activity_type)}</span><ActivityLifecycleActions activityId={activity.id} initialStatus={activity.status} writable={writable(project)} /></div><h3>{activity.title}</h3><a className="tracking-destination" href={activity.destination_url || undefined} target="_blank" rel="noreferrer">{activity.destination_url || 'No destination URL'}</a><PartnerIdentity activity={activity} /></div><div className="tracking-activity-side"><div><span>PLANNED COST</span><strong>{money(activity.planned_cost_usd)}</strong></div>{writable(project) && <div className="tracking-activity-actions"><button className="ops-button small" onClick={() => openAssignment(activity)}>{activity.partner_kind ? 'Change partner' : 'Assign partner'}</button>{activity.partner_kind && <button className="ops-button small ghost" onClick={() => void clearAssignment(activity)}>Remove partner</button>}<button className="ops-button small primary" onClick={() => void createTrackingLink(activity.id)} disabled={!activity.destination_url}>Create tracking link</button></div>}</div></article>)}</div>}</section> : tab === 'links' ? <section className="ops-section"><div className="ops-section-title"><div><h2>Tracking links</h2><p>Share these URLs instead of raw destination links.</p></div></div>{!links.length ? <div className="ops-empty"><h3>No tracking links yet</h3><p>Create one from a contribution to start measuring attributable traffic.</p><button className="ops-button secondary" onClick={() => setTab('activities')}>View contributions</button></div> : <div className="ops-link-grid">{links.map((link) => <article className={`ops-link-card ${link.status}`} key={link.id}><div className="ops-link-head"><div><span className={`ops-status status-${link.status}`}>{human(link.status)}</span><strong>{link.activity_title || 'Campaign link'}</strong></div><span>{link.clicks.toLocaleString()} clicks</span></div><div className="ops-link-url"><input readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} /><button onClick={() => void copyLink(link)}>{copied === link.id ? 'Copied' : 'Copy'}</button></div><div className="ops-link-destination"><span>DESTINATION</span><a href={link.destination_url} target="_blank" rel="noreferrer">{link.destination_url} ↗</a></div><div className="ops-link-footer"><span>Last click: {date(link.last_click_at)}</span>{writable(project) && <div>{link.status === 'active' ? <button onClick={() => void setLinkStatus(link, 'paused')}>Pause</button> : link.status === 'paused' ? <button onClick={() => void setLinkStatus(link, 'active')}>Reactivate</button> : null}{link.status !== 'archived' && <button onClick={() => void setLinkStatus(link, 'archived')}>Archive</button>}</div>}</div></article>)}</div>}</section> : <section className="ops-section"><div className="ops-section-title"><div><h2>Outcome Ledger</h2><p>Every outcome keeps its evidence source and confidence level.</p></div><a className="ops-button secondary" href={`/api/conversions?${csvParams.toString()}`}>Export CSV</a></div><div className="ops-filters"><input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="Search outcome ID or type" /><select value={filters.eventType} onChange={(e) => setFilters({ ...filters, eventType: e.target.value })}><option value="">All outcome types</option>{outcomeTypes.filter((option) => option.value !== 'custom').map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><select value={filters.source} onChange={(e) => setFilters({ ...filters, source: e.target.value })}><option value="">All sources</option><option value="manual">Manual</option><option value="linkary_tracked">Linkary tracked</option><option value="telegram_verified">Telegram verified</option><option value="provider_verified">Provider verified</option></select><select value={filters.confidence} onChange={(e) => setFilters({ ...filters, confidence: e.target.value })}><option value="">All confidence</option><option value="manual">Manual</option><option value="tracked">Tracked</option><option value="correlated">Correlated</option><option value="verified">Verified</option></select><button className="ops-button small" onClick={() => void loadCampaignData()}>Apply</button></div>{!outcomes.length ? <div className="ops-empty"><h3>No outcomes recorded yet</h3><p>Outcomes appear here when they are recorded or received through Linkary attribution.</p>{writable(project) && links.length > 0 && <button className="ops-button secondary" onClick={() => setShowOutcome(true)}>Record first outcome</button>}</div> : <div className="ops-outcome-table"><div className="ops-outcome-header"><span>Outcome</span><span>Activity</span><span>Evidence</span><span>Value</span><span>Date</span></div>{outcomes.map((outcome) => <article key={outcome.id}><div><strong>{human(outcome.event_type)}</strong><small>{outcome.external_event_key}</small></div><div><strong>{outcome.activity_title || 'Campaign'}</strong><small>{human(outcome.activity_type)}</small>{outcome.partner_display_name && <small>{outcome.partner_snapshot_source === 'link_creation' ? 'Attributed partner at tracking-link creation' : outcome.partner_snapshot_source === 'legacy_backfill' ? 'Legacy partner snapshot' : 'Partner context'}: {outcome.partner_display_name}{outcome.partner_handle ? ` (@${outcome.partner_handle.replace(/^@/, '')})` : ''}{outcome.partner_kind === 'community' && outcome.partner_manager_name ? ` · Managed by ${outcome.partner_manager_name}` : ''}</small>}</div><div><span className={`ops-confidence confidence-${outcome.attribution_confidence}`}>{human(outcome.attribution_confidence)}</span><small>{human(outcome.source)}</small>{outcome.partner_snapshot_source === 'legacy_backfill' && <small>Legacy snapshot, not proven link-creation history</small>}</div><strong>{money(outcome.value_usd)}</strong><span>{date(outcome.occurred_at)}</span></article>)}</div>}</section>}
      </>}

      {showActivity && writable(project) && <div className="ops-modal-backdrop" onMouseDown={(e) => { if (e.currentTarget === e.target) setShowActivity(false); }}><form className="ops-modal tracking-assignment-modal" onSubmit={createActivity}><div className="ops-modal-head"><div><span className="ops-kicker">ADD TO {selectedCampaign?.name || 'CAMPAIGN'}</span><h2>Add contributor work</h2><p>This creates a contribution inside the selected campaign, not a new campaign.</p></div><button type="button" onClick={() => setShowActivity(false)}>×</button></div><label>Contribution name<input value={activityForm.title} onChange={(e) => setActivityForm({ ...activityForm, title: e.target.value })} placeholder="Example: Creator launch thread" required /></label><div className="ops-field-grid two"><label>Type<select value={activityForm.type} onChange={(e) => setActivityForm({ ...activityForm, type: e.target.value })}><option value="creator_content">Creator content</option><option value="community_placement">Community placement</option><option value="website">Website</option><option value="video">Video</option><option value="other">Other</option></select></label><label>Planned cost, optional<input type="number" min="0" step="0.01" value={activityForm.plannedCostUsd} onChange={(e) => setActivityForm({ ...activityForm, plannedCostUsd: e.target.value })} placeholder="500" /></label></div><label>Destination URL<input type="url" value={activityForm.destinationUrl} onChange={(e) => setActivityForm({ ...activityForm, destinationUrl: e.target.value })} placeholder="https://project.xyz/signup" required /></label><div className="tracking-partner-picker"><div><span className="ops-kicker">CONTRIBUTOR, OPTIONAL</span><h3>Who is doing this work?</h3><p>Choose the exact Creator or Community. Add each participant's work under this same campaign.</p></div><label>Contributor type<select value={activityForm.partnerMode} onChange={(e) => { const mode = e.target.value as PartnerMode; setActivityForm({ ...activityForm, partnerMode: mode, creatorProfileId: '', managerId: '', assetId: '' }); }}><option value="none">No Linkary partner yet</option><option value="creator">Creator</option><option value="community">Community</option></select></label>{partnersLoading ? <small>Loading Linkary partners...</small> : activityForm.partnerMode === 'creator' ? <label>Creator<select value={activityForm.creatorProfileId} onChange={(e) => setActivityForm({ ...activityForm, creatorProfileId: e.target.value })}><option value="">Select Creator</option>{creators.map((creator) => <option key={creator.profile_id} value={creator.profile_id}>{creator.display_name}{creator.x_handle ? ` (@${creator.x_handle.replace(/^@/, '')})` : ''}{creator.verified ? ' · Verified' : ''}</option>)}</select></label> : activityForm.partnerMode === 'community' ? <><label>Community Manager<select value={activityForm.managerId} onChange={(e) => { const managerId = e.target.value; setActivityForm({ ...activityForm, managerId, assetId: '' }); void loadCommunityAssets(managerId); }}><option value="">Select Community Manager</option>{communityManagers.map((manager) => <option key={manager.manager_id} value={manager.manager_id}>{manager.display_name} · {manager.community_count} Communities</option>)}</select></label>{activityForm.managerId && <label>Exact Community<select value={activityForm.assetId} onChange={(e) => setActivityForm({ ...activityForm, assetId: e.target.value })}><option value="">Select exact Community</option>{selectedCreateAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}{asset.handle ? ` (@${asset.handle.replace(/^@/, '')})` : ''} · {Number(asset.audience_size || 0).toLocaleString()} audience · {human(asset.verification_status)}</option>)}</select><small>This exact Community, not only its manager, will own the campaign evidence.</small></label>}</> : null}</div><div className="ops-form-actions campaign-contribution-actions"><button type="button" className="ops-button ghost" onClick={() => setShowActivity(false)}>Cancel</button><button className="ops-button secondary" data-add-another="true" disabled={!activityForm.title.trim() || !activityForm.destinationUrl.trim()}>Save + add another</button><button className="ops-button primary" disabled={!activityForm.title.trim() || !activityForm.destinationUrl.trim()}>Save contribution</button></div></form></div>}

      {assigning && writable(project) && <div className="ops-modal-backdrop" onMouseDown={(e) => { if (e.currentTarget === e.target) setAssigning(null); }}><form className="ops-modal tracking-assignment-modal" onSubmit={saveAssignment}><div className="ops-modal-head"><div><span className="ops-kicker">EXACT PARTNER</span><h2>{assigning.partner_kind ? 'Change partner' : 'Assign partner'}</h2><p>{assigning.title}</p></div><button type="button" onClick={() => setAssigning(null)}>×</button></div><div className="tracking-partner-picker"><label>Partner type<select value={assignForm.partnerMode} onChange={(e) => { const mode = e.target.value as Exclude<PartnerMode, 'none'>; setAssignForm({ partnerMode: mode, creatorProfileId: '', managerId: '', assetId: '' }); }}><option value="creator">Creator</option><option value="community">Telegram Community</option></select></label>{assignForm.partnerMode === 'creator' ? <label>Creator<select value={assignForm.creatorProfileId} onChange={(e) => setAssignForm({ ...assignForm, creatorProfileId: e.target.value })} required><option value="">Select Creator</option>{creators.map((creator) => <option key={creator.profile_id} value={creator.profile_id}>{creator.display_name}{creator.x_handle ? ` (@${creator.x_handle.replace(/^@/, '')})` : ''}{creator.verified ? ' · Verified' : ''}</option>)}</select></label> : <><label>Community Manager<select value={assignForm.managerId} onChange={(e) => { const managerId = e.target.value; setAssignForm({ ...assignForm, managerId, assetId: '' }); void loadCommunityAssets(managerId); }} required><option value="">Select Community Manager</option>{communityManagers.map((manager) => <option key={manager.manager_id} value={manager.manager_id}>{manager.display_name} · {manager.community_count} Communities</option>)}</select></label>{assignForm.managerId && <label>Exact Telegram Community<select value={assignForm.assetId} onChange={(e) => setAssignForm({ ...assignForm, assetId: e.target.value })} required><option value="">Select exact Community</option>{selectedAssignAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}{asset.handle ? ` (@${asset.handle.replace(/^@/, '')})` : ''} · {Number(asset.audience_size || 0).toLocaleString()} audience · {human(asset.verification_status)}</option>)}</select><small>Evidence will be attributed to this Community itself.</small></label>}</>}</div><div className="ops-form-actions"><button type="button" className="ops-button ghost" onClick={() => setAssigning(null)}>Cancel</button><button className="ops-button primary">Save exact partner</button></div></form></div>}

      {showOutcome && writable(project) && <div className="ops-modal-backdrop" onMouseDown={(e) => { if (e.currentTarget === e.target) setShowOutcome(false); }}><form className="ops-modal" onSubmit={recordOutcome}><div className="ops-modal-head"><div><span className="ops-kicker">OUTCOME LEDGER</span><h2>Record an outcome</h2><p>Founder-entered outcomes are stored as Manual evidence. Linkary does not upgrade them to tracked or verified.</p></div><button type="button" onClick={() => setShowOutcome(false)}>×</button></div><label>Tracking link<select value={outcomeForm.trackedLinkId} onChange={(e) => setOutcomeForm({ ...outcomeForm, trackedLinkId: e.target.value })} required><option value="">Select tracking link</option>{links.filter((link) => link.status !== 'archived').map((link) => <option key={link.id} value={link.id}>{link.activity_title || link.code} · {link.code}</option>)}</select></label><div className="ops-field-grid two"><label>Outcome type<select value={outcomeForm.eventType} onChange={(e) => setOutcomeForm({ ...outcomeForm, eventType: e.target.value, customEventType: e.target.value === 'custom' ? outcomeForm.customEventType : '' })} required>{outcomeTypes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label>Attributed value, optional<input type="number" min="0" step="0.01" value={outcomeForm.valueUsd} onChange={(e) => setOutcomeForm({ ...outcomeForm, valueUsd: e.target.value })} placeholder="250" /></label></div>{outcomeForm.eventType === 'custom' && <label>Custom outcome name<input value={outcomeForm.customEventType} onChange={(e) => setOutcomeForm({ ...outcomeForm, customEventType: e.target.value })} placeholder="Example: booked_demo" required /><small>Use a short reusable name. Linkary normalizes it into a stable outcome identifier.</small></label>}<div className="ops-field-grid two"><label>External outcome ID<input value={outcomeForm.eventKey} onChange={(e) => setOutcomeForm({ ...outcomeForm, eventKey: e.target.value })} placeholder="CRM, order or signup ID" required /><small>Use a unique ID from your own system. Linkary prevents duplicates.</small></label><label>Outcome time, optional<input type="datetime-local" value={outcomeForm.occurredAt} onChange={(e) => setOutcomeForm({ ...outcomeForm, occurredAt: e.target.value })} /><small>Leave blank to use the time you record it.</small></label></div><div className="ops-form-actions"><button type="button" className="ops-button ghost" onClick={() => setShowOutcome(false)}>Cancel</button><button className="ops-button primary" disabled={!outcomeForm.trackedLinkId || !outcomeForm.eventKey.trim() || (outcomeForm.eventType === 'custom' && !outcomeForm.customEventType.trim())}>Record Manual outcome</button></div></form></div>}
    </div>
  </ProductWorkspace>;
}
