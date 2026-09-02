import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ProductWorkspace, type ProductMe, type ProductProfile, type ProductStatus } from './ProductWorkspace';

type Role = 'owner' | 'admin' | 'marketing_manager' | 'analyst' | 'viewer';
type Project = { id: string; name: string; status: string; verification_status: string; role: Role; username?: string | null };
type EntityType = 'creator' | 'community';
type Entity = {
  id: string;
  entity_type: EntityType;
  display_name: string;
  primary_handle: string | null;
  primary_url: string | null;
  verification_status: 'unverified' | 'submitted' | 'verified' | 'rejected';
  notes: string;
  created_at: string;
  activity_count: number;
  tracked_clicks: number;
  outcomes: number;
  attributed_value: number;
};
type Campaign = { id: string; name: string };
type Activity = { id: string; title: string; activity_type: string };

class ApiError extends Error { constructor(readonly status: number, readonly code: string, message: string) { super(message); } }
async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string } & T;
  if (!response.ok) throw new ApiError(response.status, payload.error || 'request_failed', payload.message || 'Request failed');
  return payload;
}
function cookie(name: string): string | null { const match = document.cookie.split('; ').find((part) => part.startsWith(`${name}=`)); return match ? decodeURIComponent(match.slice(name.length + 1)) : null; }
function human(value: string | null | undefined) { return value ? value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Unknown'; }
function money(value: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value || 0); }
function writable(project?: Project) { return Boolean(project && project.status === 'active' && project.verification_status === 'verified_x' && ['owner', 'admin', 'marketing_manager'].includes(project.role)); }
function friendly(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return fallback;
  if (error.code === 'forbidden') return 'Your current Project role does not allow this action.';
  if (error.code === 'invalid_url') return 'Enter a valid profile URL.';
  return fallback;
}

export default function NetworkExperience({ me, status }: { me: ProductMe; status: ProductStatus }) {
  const location = useLocation();
  const navigate = useNavigate();
  const creatorFirst = status.profiles.find((p) => p.profile_type === 'creator') || status.profiles[0];
  const stored = window.localStorage.getItem('linkary.active.profile');
  const [profileId, setProfileId] = useState(stored && status.profiles.some((p) => p.id === stored) ? stored : creatorFirst?.id || '');
  const profile = status.profiles.find((p) => p.id === profileId) || creatorFirst;
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [tab, setTab] = useState<EntityType>(location.pathname === '/communities' ? 'community' : 'creator');
  const [entities, setEntities] = useState<Entity[]>([]);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [edit, setEdit] = useState<Entity | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [form, setForm] = useState({ displayName: '', handle: '', url: '', notes: '' });
  const [attachEntity, setAttachEntity] = useState<Entity | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState('');
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activityId, setActivityId] = useState('');
  const [participantRole, setParticipantRole] = useState('contributor');

  useEffect(() => {
    apiJson<{ organizations: Project[] }>('/api/organizations').then((r) => {
      setProjects(r.organizations);
      const matching = profile?.organization_id ? r.organizations.find((p) => p.id === profile.organization_id) : undefined;
      setProjectId(matching?.id || r.organizations[0]?.id || '');
    }).catch(() => setMessage('Project access is temporarily unavailable. Please try again shortly.'));
  }, []);
  useEffect(() => {
    if (!profile?.organization_id) return;
    if (projects.some((p) => p.id === profile.organization_id)) setProjectId(profile.organization_id);
  }, [profileId, projects.length]);

  const project = projects.find((p) => p.id === projectId);
  async function load() {
    if (!projectId) { setEntities([]); return; }
    setLoading(true); setMessage('');
    const query = new URLSearchParams({ organizationId: projectId, type: tab });
    if (search.trim()) query.set('search', search.trim());
    try { const result = await apiJson<{ entities: Entity[] }>(`/api/network-entities?${query.toString()}`); setEntities(result.entities); }
    catch (error) { setMessage(friendly(error, 'Network records are temporarily unavailable. Please try again shortly.')); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [projectId, tab]);

  function switchTab(next: EntityType) { setTab(next); navigate(next === 'creator' ? '/creators' : '/communities', { replace: true }); }
  function changeProfile(id: string) { setProfileId(id); window.localStorage.setItem('linkary.active.profile', id); }
  function openCreate() { setEdit(null); setForm({ displayName: '', handle: '', url: '', notes: '' }); setShowEditor(true); }
  function openEdit(entity: Entity) { setEdit(entity); setForm({ displayName: entity.display_name, handle: entity.primary_handle || '', url: entity.primary_url || '', notes: entity.notes || '' }); setShowEditor(true); }

  async function save(event: React.FormEvent) {
    event.preventDefault(); const csrf = cookie('__Host-linkary_csrf'); if (!csrf || !projectId) return;
    setMessage('');
    try {
      await apiJson('/api/network-entities', { method: 'POST', headers: { 'x-csrf-token': csrf }, body: JSON.stringify(edit ? { entityId: edit.id, ...form } : { organizationId: projectId, entityType: tab, ...form }) });
      setShowEditor(false); await load();
    } catch (error) { setMessage(friendly(error, 'This network record could not be saved.')); }
  }
  async function requestVerification(entity: Entity) {
    const csrf = cookie('__Host-linkary_csrf'); if (!csrf) return;
    try { await apiJson('/api/network-entities', { method: 'POST', headers: { 'x-csrf-token': csrf }, body: JSON.stringify({ entityId: entity.id, requestVerification: true }) }); setMessage('Verification request submitted.'); await load(); }
    catch (error) { setMessage(friendly(error, 'Verification could not be requested.')); }
  }
  async function openAttach(entity: Entity) {
    setAttachEntity(entity); setCampaignId(''); setActivityId(''); setActivities([]); setParticipantRole(entity.entity_type === 'creator' ? 'creator' : 'community_host');
    try { const result = await apiJson<{ campaigns: Campaign[] }>(`/api/campaigns?organizationId=${encodeURIComponent(projectId)}`); setCampaigns(result.campaigns); const first = result.campaigns[0]?.id || ''; setCampaignId(first); if (first) await loadActivities(first); }
    catch { setMessage('Campaigns are temporarily unavailable.'); }
  }
  async function loadActivities(id: string) { if (!id) { setActivities([]); return; } try { const result = await apiJson<{ activities: Activity[] }>(`/api/campaign-activities?campaignId=${encodeURIComponent(id)}`); setActivities(result.activities); setActivityId(result.activities[0]?.id || ''); } catch { setActivities([]); } }
  async function attach(event: React.FormEvent) {
    event.preventDefault(); const csrf = cookie('__Host-linkary_csrf'); if (!csrf || !attachEntity || !activityId) return;
    try { await apiJson('/api/campaign-activity-participants', { method: 'POST', headers: { 'x-csrf-token': csrf }, body: JSON.stringify({ entityId: attachEntity.id, activityId, role: participantRole }) }); setAttachEntity(null); setMessage(`${attachEntity.display_name} attached to the campaign activity.`); await load(); }
    catch (error) { setMessage(friendly(error, 'The network record could not be attached to this activity.')); }
  }

  if (!profile) return null;
  return <ProductWorkspace me={me} status={status} profile={profile as ProductProfile} onProfileChange={changeProfile}>
    <div className="ops-stack network-workspace">
      <div className="ops-heading-row"><div><span className="ops-kicker">PROJECT NETWORK</span><h1>Network</h1><p>Keep creators and communities in one place, then connect their work to campaign evidence and results.</p></div>{writable(project) && <button className="ops-button primary" onClick={openCreate}>+ Add {tab === 'creator' ? 'creator' : 'community'}</button>}</div>
      <div className="ops-project-toolbar"><div><span className="ops-kicker">PROJECT</span>{projects.length > 1 ? <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select> : <strong>{project?.name || 'No Project selected'}</strong>}</div>{project && <div className={`ops-project-state ${project.verification_status === 'verified_x' ? 'verified' : 'pending'}`}>{project.verification_status === 'verified_x' ? 'Verified on X' : 'X verification required'}</div>}</div>
      {!project ? <section className="ops-empty prominent"><div className="ops-empty-icon">◎</div><h2>Connect a Project first</h2><p>Project network records belong to a registered Project.</p><a className="ops-button primary" href="/settings">Manage Projects</a></section> : project.verification_status !== 'verified_x' ? <section className="ops-callout verification"><div><span className="ops-kicker">ACTION REQUIRED</span><h3>Verify {project.name} with its official X account</h3><p>You can view existing network records, but verification is required before creating or attaching campaign partners.</p></div><a className="ops-button secondary" href="/settings">Open Projects</a></section> : null}
      {message && <div className="ops-message">{message}</div>}
      <section className="ops-section">
        <div className="network-toolbar"><nav className="ops-tabs"><button className={tab === 'creator' ? 'active' : ''} onClick={() => switchTab('creator')}>Creators</button><button className={tab === 'community' ? 'active' : ''} onClick={() => switchTab('community')}>Communities</button></nav><form onSubmit={(e) => { e.preventDefault(); void load(); }}><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${tab === 'creator' ? 'creators' : 'communities'}`} /><button className="ops-button small">Search</button></form></div>
        {loading ? <div className="ops-loading">Loading network...</div> : !entities.length ? <div className="ops-empty"><div className="ops-empty-icon">◇</div><h3>No {tab === 'creator' ? 'creators' : 'communities'} yet</h3><p>Add the people and distribution partners your Project actually works with.</p>{writable(project) && <button className="ops-button secondary" onClick={openCreate}>Add first {tab === 'creator' ? 'creator' : 'community'}</button>}</div> : <div className="network-grid">{entities.map((entity) => <article className="network-card" key={entity.id}><div className="network-card-head"><div className="network-avatar">{entity.display_name.slice(0,1).toUpperCase()}</div><div><strong>{entity.display_name}</strong><small>{entity.primary_handle ? `@${entity.primary_handle}` : human(entity.entity_type)}</small></div><span className={`network-verify ${entity.verification_status}`}>{human(entity.verification_status)}</span></div>{entity.primary_url && <a className="network-url" href={entity.primary_url} target="_blank" rel="noreferrer">Open profile ↗</a>}<div className="network-metrics"><div><span>ACTIVITIES</span><strong>{entity.activity_count || 0}</strong></div><div><span>CLICKS</span><strong>{entity.tracked_clicks || 0}</strong></div><div><span>OUTCOMES</span><strong>{entity.outcomes || 0}</strong></div><div><span>VALUE</span><strong>{money(entity.attributed_value || 0)}</strong></div></div>{entity.notes && <p>{entity.notes}</p>}<div className="network-actions">{writable(project) && <><button onClick={() => openEdit(entity)}>Edit</button><button onClick={() => void openAttach(entity)}>Attach to activity</button>{entity.verification_status !== 'verified' && entity.verification_status !== 'submitted' && <button onClick={() => void requestVerification(entity)}>Request verification</button>}</>}</div></article>)}</div>}
      </section>
    </div>
    {showEditor && <div className="ops-modal-backdrop" onMouseDown={(e) => { if (e.currentTarget === e.target) setShowEditor(false); }}><form className="ops-modal" onSubmit={save}><div className="ops-modal-head"><div><span className="ops-kicker">{edit ? 'EDIT RECORD' : 'NEW NETWORK RECORD'}</span><h2>{edit ? edit.display_name : `Add ${tab === 'creator' ? 'creator' : 'community'}`}</h2></div><button type="button" onClick={() => setShowEditor(false)}>×</button></div><label>Name<input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required /></label><label>Handle, optional<input value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value.replace(/^@/,'') })} placeholder="username" /></label><label>Profile URL, optional<input type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://x.com/..." /></label><label>Notes<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Relationship, audience, contact context, or campaign notes" /></label><div className="ops-form-actions"><button type="button" className="ops-button ghost" onClick={() => setShowEditor(false)}>Cancel</button><button className="ops-button primary">Save</button></div></form></div>}
    {attachEntity && <div className="ops-modal-backdrop" onMouseDown={(e) => { if (e.currentTarget === e.target) setAttachEntity(null); }}><form className="ops-modal" onSubmit={attach}><div className="ops-modal-head"><div><span className="ops-kicker">CAMPAIGN EVIDENCE</span><h2>Attach {attachEntity.display_name}</h2></div><button type="button" onClick={() => setAttachEntity(null)}>×</button></div><label>Campaign<select value={campaignId} onChange={(e) => { setCampaignId(e.target.value); void loadActivities(e.target.value); }}><option value="">Select campaign</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Activity<select value={activityId} onChange={(e) => setActivityId(e.target.value)}><option value="">Select activity</option>{activities.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}</select></label><label>Contribution role<select value={participantRole} onChange={(e) => setParticipantRole(e.target.value)}><option value="creator">Creator</option><option value="community_host">Community host</option><option value="contributor">Contributor</option><option value="distribution_partner">Distribution partner</option></select></label><div className="ops-form-actions"><button type="button" className="ops-button ghost" onClick={() => setAttachEntity(null)}>Cancel</button><button className="ops-button primary" disabled={!activityId}>Attach</button></div></form></div>}
  </ProductWorkspace>;
}
