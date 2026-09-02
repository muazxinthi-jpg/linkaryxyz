import { useEffect, useMemo, useState } from 'react';
import { ProductWorkspace, type ProductMe, type ProductProfile, type ProductStatus } from './ProductWorkspace';

type ManagerType = 'community_manager' | 'kol_manager';
type Role = 'owner' | 'admin' | 'marketing_manager' | 'analyst' | 'viewer';
type Project = { id: string; name: string; status: string; verification_status: string; role: Role };
type Campaign = { id: string; name: string };
type Manager = {
  id: string;
  profile_id: string;
  manager_type: ManagerType;
  display_name: string;
  headline: string;
  bio: string;
  x_handle: string | null;
  telegram_contact: string | null;
  email: string | null;
  website_url: string | null;
  verification_status: string;
  open_to_campaigns: boolean;
  asset_count: number;
  combined_audience: number;
  estimated_unique_audience: number | null;
  overlap_rate: number | null;
  audience_confidence: string | null;
  audience_methodology: string | null;
};
type Asset = {
  id: string;
  asset_type: 'telegram_community' | 'kol_creator';
  name: string;
  platform: string;
  handle: string | null;
  url: string | null;
  audience_size: number;
  verification_status: string;
  notes: string;
};
type ReputationSummary = {
  collaborations: number;
  projects: number;
  spend_usd: number;
  tracked_clicks: number;
  outcomes: number;
  attributed_value_usd: number;
  roi_multiple: number | null;
  conversion_rate: number | null;
  evidence_level: 'none' | 'manual' | 'tracked' | 'verified';
};
type ReputationRecord = {
  id: string;
  organization_id: string;
  campaign_id: string | null;
  evidence_source: 'manual' | 'tracked' | 'verified';
  spend_usd: number | null;
  tracked_clicks: number;
  outcomes: number;
  attributed_value_usd: number;
  notes: string;
  occurred_at: string;
  project_name: string;
  campaign_name: string | null;
};
type ReputationResponse = { summary: ReputationSummary; records: ReputationRecord[] };

const emptyReputation: ReputationResponse = { summary: { collaborations: 0, projects: 0, spend_usd: 0, tracked_clicks: 0, outcomes: 0, attributed_value_usd: 0, roi_multiple: null, conversion_rate: null, evidence_level: 'none' }, records: [] };

class ApiError extends Error { constructor(readonly code: string, message: string) { super(message); } }
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string } & T;
  if (!response.ok) throw new ApiError(payload.error || 'request_failed', payload.message || 'Request failed');
  return payload;
}
function csrf() { const hit = document.cookie.split('; ').find((part) => part.startsWith('__Host-linkary_csrf=')); return hit ? decodeURIComponent(hit.split('=').slice(1).join('=')) : null; }
function human(value: string) { return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()); }
function compact(value: number) { return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0); }
function percent(value: number | null) { return value === null ? 'Not measured' : `${Math.round(value * 100)}%`; }
function money(value: number | null | undefined) { return value === null || value === undefined ? 'Not set' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value); }
function readableDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Unknown date' : new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(date); }
function writable(project: Project) { return project.status === 'active' && project.verification_status === 'verified_x' && ['owner', 'admin', 'marketing_manager'].includes(project.role); }

export default function PartnerDirectoryExperience({ me, status }: { me: ProductMe; status: ProductStatus }) {
  const creatorFirst = status.profiles.find((item) => item.profile_type === 'creator') || status.profiles[0];
  const stored = window.localStorage.getItem('linkary.active.profile');
  const [profileId, setProfileId] = useState(stored && status.profiles.some((item) => item.id === stored) ? stored : creatorFirst?.id || '');
  const profile = status.profiles.find((item) => item.id === profileId) || creatorFirst;
  const personalProfile = status.profiles.find((item) => item.profile_type === 'creator');
  const [type, setType] = useState<ManagerType>('community_manager');
  const [search, setSearch] = useState('');
  const [managers, setManagers] = useState<Manager[]>([]);
  const [selected, setSelected] = useState<Manager | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [reputation, setReputation] = useState<ReputationResponse>(emptyReputation);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [showListing, setShowListing] = useState(false);
  const [showAsset, setShowAsset] = useState(false);
  const [showPerformance, setShowPerformance] = useState(false);
  const [listingForm, setListingForm] = useState({ displayName: '', headline: '', bio: '', xHandle: '', telegramContact: '', email: '', websiteUrl: '', estimatedUniqueAudience: '', audienceMethodology: '', openToCampaigns: true });
  const [assetForm, setAssetForm] = useState({ name: '', platform: 'X', handle: '', url: '', audienceSize: '', notes: '' });
  const [performanceForm, setPerformanceForm] = useState({ organizationId: '', campaignId: '', spendUsd: '', clicks: '', outcomes: '', valueUsd: '', occurredAt: new Date().toISOString().slice(0, 10), notes: '' });

  const myListing = useMemo(() => personalProfile ? managers.find((manager) => manager.profile_id === personalProfile.id && manager.manager_type === type) : undefined, [managers, personalProfile?.id, type]);
  const writableProjects = useMemo(() => projects.filter(writable), [projects]);

  function changeProfile(id: string) { setProfileId(id); window.localStorage.setItem('linkary.active.profile', id); }

  async function loadManagers() {
    setLoading(true); setMessage('');
    const query = new URLSearchParams({ type });
    if (search.trim()) query.set('search', search.trim());
    try {
      const result = await api<{ managers: Manager[] }>(`/api/partner-managers?${query.toString()}`);
      setManagers(result.managers);
      if (selected) setSelected(result.managers.find((item) => item.id === selected.id) || null);
    } catch { setMessage('Partner directory is temporarily unavailable. Please try again shortly.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void loadManagers(); }, [type]);
  useEffect(() => { api<{ organizations: Project[] }>('/api/organizations').then((result) => setProjects(result.organizations)).catch(() => setProjects([])); }, []);

  async function loadReputation(managerId: string) {
    try { const result = await api<ReputationResponse>(`/api/partner-manager-reputation?managerId=${encodeURIComponent(managerId)}`); setReputation(result); }
    catch { setReputation(emptyReputation); }
  }

  async function openManager(manager: Manager) {
    setSelected(manager); setAssets([]); setReputation(emptyReputation);
    try {
      const [assetResult] = await Promise.all([
        api<{ assets: Asset[] }>(`/api/partner-manager-assets?managerId=${encodeURIComponent(manager.id)}`),
        loadReputation(manager.id),
      ]);
      setAssets(assetResult.assets);
    } catch { setMessage('Portfolio details are temporarily unavailable.'); }
  }

  function openListingEditor() {
    const manager = myListing;
    setListingForm({
      displayName: manager?.display_name || personalProfile?.display_name || '',
      headline: manager?.headline || '',
      bio: manager?.bio || '',
      xHandle: manager?.x_handle || '',
      telegramContact: manager?.telegram_contact || '',
      email: manager?.email || status.user.email || '',
      websiteUrl: manager?.website_url || '',
      estimatedUniqueAudience: manager?.estimated_unique_audience?.toString() || '',
      audienceMethodology: manager?.audience_methodology || '',
      openToCampaigns: manager?.open_to_campaigns ?? true,
    });
    setShowListing(true);
  }

  async function saveListing(event: React.FormEvent) {
    event.preventDefault();
    const token = csrf(); if (!token || !personalProfile) return;
    try {
      const payload = {
        ...(myListing ? { managerId: myListing.id } : { profileId: personalProfile.id, managerType: type }),
        displayName: listingForm.displayName,
        headline: listingForm.headline,
        bio: listingForm.bio,
        xHandle: listingForm.xHandle,
        telegramContact: listingForm.telegramContact,
        email: listingForm.email,
        websiteUrl: listingForm.websiteUrl,
        openToCampaigns: listingForm.openToCampaigns,
        estimatedUniqueAudience: listingForm.estimatedUniqueAudience ? Number(listingForm.estimatedUniqueAudience) : null,
        audienceMethodology: listingForm.audienceMethodology,
      };
      await api('/api/partner-managers', { method: 'POST', headers: { 'x-csrf-token': token }, body: JSON.stringify(payload) });
      setShowListing(false); setMessage('Manager listing saved.'); await loadManagers();
    } catch (error) {
      setMessage(error instanceof ApiError && error.code === 'invalid_audience' ? error.message : 'The manager listing could not be saved.');
    }
  }

  async function addAsset(event: React.FormEvent) {
    event.preventDefault(); const token = csrf(); if (!token || !myListing) return;
    try {
      await api('/api/partner-manager-assets', { method: 'POST', headers: { 'x-csrf-token': token }, body: JSON.stringify({ managerId: myListing.id, name: assetForm.name, platform: type === 'community_manager' ? 'Telegram' : assetForm.platform, handle: assetForm.handle, url: assetForm.url, audienceSize: Number(assetForm.audienceSize || 0), notes: assetForm.notes }) });
      setAssetForm({ name: '', platform: 'X', handle: '', url: '', audienceSize: '', notes: '' }); setShowAsset(false); setMessage(type === 'community_manager' ? 'Telegram community added.' : 'Creator added to your portfolio.'); await loadManagers();
      if (selected?.id === myListing.id) await openManager({ ...myListing });
    } catch { setMessage('The portfolio item could not be saved.'); }
  }

  async function loadCampaigns(organizationId: string) {
    setPerformanceForm((current) => ({ ...current, organizationId, campaignId: '' }));
    if (!organizationId) { setCampaigns([]); return; }
    try { const result = await api<{ campaigns: Campaign[] }>(`/api/campaigns?organizationId=${encodeURIComponent(organizationId)}`); setCampaigns(result.campaigns); }
    catch { setCampaigns([]); }
  }

  async function openPerformanceEditor() {
    const first = writableProjects[0];
    setPerformanceForm({ organizationId: first?.id || '', campaignId: '', spendUsd: '', clicks: '', outcomes: '', valueUsd: '', occurredAt: new Date().toISOString().slice(0, 10), notes: '' });
    if (first) await loadCampaigns(first.id); else setCampaigns([]);
    setShowPerformance(true);
  }

  async function savePerformance(event: React.FormEvent) {
    event.preventDefault(); const token = csrf(); if (!token || !selected || !performanceForm.organizationId) return;
    try {
      await api('/api/partner-manager-reputation', { method: 'POST', headers: { 'x-csrf-token': token }, body: JSON.stringify({ managerId: selected.id, organizationId: performanceForm.organizationId, campaignId: performanceForm.campaignId || null, spendUsd: performanceForm.spendUsd ? Number(performanceForm.spendUsd) : null, trackedClicks: Number(performanceForm.clicks || 0), outcomes: Number(performanceForm.outcomes || 0), attributedValueUsd: Number(performanceForm.valueUsd || 0), notes: performanceForm.notes, occurredAt: performanceForm.occurredAt ? `${performanceForm.occurredAt}T12:00:00.000Z` : undefined }) });
      setShowPerformance(false); setMessage('Collaboration result added as manual evidence.'); await loadReputation(selected.id);
    } catch (error) { setMessage(error instanceof ApiError && error.code === 'invalid_performance_value' ? error.message : 'The collaboration result could not be saved.'); }
  }

  if (!profile) return null;
  return <ProductWorkspace me={me} status={status} profile={profile as ProductProfile} onProfileChange={changeProfile}>
    <div className="ops-stack partner-directory">
      <div className="ops-heading-row">
        <div><span className="ops-kicker">PARTNERS</span><h1>Find the people behind distribution</h1><p>Discover Community Managers and KOL Managers, see the audiences they represent, review real performance history, and contact the right person before you spend.</p></div>
        {personalProfile && <button className="ops-button primary" onClick={openListingEditor}>{myListing ? 'Edit my listing' : `List as ${type === 'community_manager' ? 'Community Manager' : 'KOL Manager'}`}</button>}
      </div>

      <section className="partner-summary-strip">
        <div><strong>Community Managers</strong><span>Telegram portfolios and combined community reach</span></div>
        <div><strong>KOL Managers</strong><span>Creator portfolios, combined reach and audience overlap</span></div>
        <div><strong>Performance history</strong><span>Recorded collaborations stay labeled by evidence quality. Manual data is never shown as verified.</span></div>
      </section>

      <section className="ops-section">
        <div className="partner-toolbar">
          <nav className="ops-tabs"><button className={type === 'community_manager' ? 'active' : ''} onClick={() => { setType('community_manager'); setSelected(null); }}>Community Managers</button><button className={type === 'kol_manager' ? 'active' : ''} onClick={() => { setType('kol_manager'); setSelected(null); }}>KOL Managers</button></nav>
          <form onSubmit={(event) => { event.preventDefault(); void loadManagers(); }}><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search manager, handle or portfolio"/><button className="ops-button small">Search</button></form>
        </div>
        {loading ? <div className="ops-loading">Loading partners...</div> : !managers.length ? <div className="ops-empty"><div className="ops-empty-icon">◎</div><h3>No listings yet</h3><p>Early Linkary users can be the first verified points of contact in this directory.</p>{personalProfile && <button className="ops-button secondary" onClick={openListingEditor}>Create my listing</button>}</div> : <div className="partner-grid">{managers.map((manager) => <article className="partner-card" key={manager.id} onClick={() => void openManager(manager)}>
          <div className="partner-card-head"><div className="partner-avatar">{manager.display_name.slice(0,1).toUpperCase()}</div><div><strong>{manager.display_name}</strong><span>{manager.headline || human(manager.manager_type)}</span></div><span className={`partner-verify ${manager.verification_status}`}>{human(manager.verification_status)}</span></div>
          <div className="partner-metrics"><div><span>{manager.manager_type === 'community_manager' ? 'COMMUNITIES' : 'CREATORS'}</span><strong>{manager.asset_count}</strong></div><div><span>COMBINED REACH</span><strong>{compact(manager.combined_audience)}</strong></div><div><span>UNIQUE EST.</span><strong>{manager.estimated_unique_audience === null ? 'N/A' : compact(manager.estimated_unique_audience)}</strong></div><div><span>OVERLAP</span><strong>{percent(manager.overlap_rate)}</strong></div></div>
          <div className="partner-card-foot"><span>{manager.open_to_campaigns ? 'Open to opportunities' : 'Directory listing'}</span><button type="button">View details →</button></div>
        </article>)}</div>}
      </section>
      {message && <div className="ops-message">{message}</div>}

      {selected && <div className="ops-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setSelected(null); }}><section className="ops-modal partner-detail">
        <div className="ops-modal-head"><div><span className="ops-kicker">{human(selected.manager_type)}</span><h2>{selected.display_name}</h2></div><button onClick={() => setSelected(null)}>×</button></div>
        {selected.headline && <h3 className="partner-headline">{selected.headline}</h3>}{selected.bio && <p className="partner-bio">{selected.bio}</p>}
        <div className="partner-detail-metrics"><div><span>Portfolio</span><strong>{selected.asset_count}</strong></div><div><span>Combined audience</span><strong>{compact(selected.combined_audience)}</strong></div><div><span>Estimated unique</span><strong>{selected.estimated_unique_audience === null ? 'Not measured' : compact(selected.estimated_unique_audience)}</strong></div><div><span>Estimated overlap</span><strong>{percent(selected.overlap_rate)}</strong></div></div>
        {selected.overlap_rate === null && <div className="partner-evidence-note">Audience overlap has not been measured for this portfolio yet. Combined audience is a raw sum, not unique reach.</div>}
        {selected.overlap_rate !== null && <div className="partner-evidence-note">Unique audience estimate: {human(selected.audience_confidence || 'manual')}. {selected.audience_methodology || 'Methodology not supplied.'}</div>}
        <div className="partner-contact-row">{selected.x_handle && <a href={`https://x.com/${selected.x_handle}`} target="_blank" rel="noreferrer">X @{selected.x_handle}</a>}{selected.telegram_contact && <a href={selected.telegram_contact.startsWith('http') ? selected.telegram_contact : `https://t.me/${selected.telegram_contact.replace(/^@/,'')}`} target="_blank" rel="noreferrer">Telegram</a>}{selected.email && <a href={`mailto:${selected.email}`}>Email</a>}{selected.website_url && <a href={selected.website_url} target="_blank" rel="noreferrer">Website</a>}</div>

        <section className="partner-performance">
          <div className="partner-performance-title"><div><h3>Performance history</h3><span className={`partner-evidence-level ${reputation.summary.evidence_level}`}>{reputation.summary.evidence_level === 'none' ? 'No evidence yet' : `${human(reputation.summary.evidence_level)} evidence`}</span></div>{writableProjects.length > 0 && <button className="ops-button small" onClick={() => void openPerformanceEditor()}>+ Add result</button>}</div>
          <div className="partner-performance-metrics"><div><span>COLLABORATIONS</span><strong>{reputation.summary.collaborations}</strong></div><div><span>PROJECTS</span><strong>{reputation.summary.projects}</strong></div><div><span>CLICKS</span><strong>{reputation.summary.tracked_clicks.toLocaleString()}</strong></div><div><span>OUTCOMES</span><strong>{reputation.summary.outcomes.toLocaleString()}</strong></div><div><span>ATTRIBUTED VALUE</span><strong>{money(reputation.summary.attributed_value_usd)}</strong></div></div>
          <div className="partner-performance-note"><span>{reputation.summary.roi_multiple === null ? 'Return on spend is not available yet.' : `${reputation.summary.roi_multiple.toFixed(2)}x recorded return on spend.`}</span><span>Manual collaboration entries are clearly labeled and never treated as verified evidence.</span></div>
          {!reputation.records.length ? <div className="ops-empty compact"><p>No collaboration results have been recorded for this manager yet.</p></div> : <div className="partner-performance-list">{reputation.records.slice(0, 6).map((record) => <article key={record.id}><div><strong>{record.campaign_name || record.project_name}</strong><small>{record.campaign_name ? record.project_name : readableDate(record.occurred_at)}</small></div><span className={`partner-evidence-level ${record.evidence_source}`}>{human(record.evidence_source)}</span><div><span>{record.tracked_clicks.toLocaleString()} clicks</span><span>{record.outcomes.toLocaleString()} outcomes</span><strong>{money(record.attributed_value_usd)}</strong></div></article>)}</div>}
        </section>

        <div className="partner-portfolio-title"><div><h3>{selected.manager_type === 'community_manager' ? 'Telegram communities' : 'Creator portfolio'}</h3><span>{assets.length} listed</span></div>{myListing?.id === selected.id && <button className="ops-button small" onClick={() => setShowAsset(true)}>+ Add</button>}</div>
        {!assets.length ? <div className="ops-empty compact"><p>No portfolio items added yet.</p></div> : <div className="partner-asset-list">{assets.map((asset) => <article key={asset.id}><div><strong>{asset.name}</strong><span>{asset.handle ? `@${asset.handle}` : asset.platform}</span></div><div><strong>{compact(asset.audience_size)}</strong><span>audience</span></div>{asset.url && <a href={asset.url} target="_blank" rel="noreferrer">Open ↗</a>}</article>)}</div>}
      </section></div>}

      {showListing && <div className="ops-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setShowListing(false); }}><form className="ops-modal" onSubmit={saveListing}>
        <div className="ops-modal-head"><div><span className="ops-kicker">YOUR DIRECTORY LISTING</span><h2>{type === 'community_manager' ? 'Community Manager' : 'KOL Manager'}</h2></div><button type="button" onClick={() => setShowListing(false)}>×</button></div>
        <label>Display name<input value={listingForm.displayName} onChange={(e) => setListingForm({ ...listingForm, displayName: e.target.value })} required /></label>
        <label>Headline<input value={listingForm.headline} onChange={(e) => setListingForm({ ...listingForm, headline: e.target.value })} placeholder={type === 'community_manager' ? 'Managing Web3 Telegram communities across MENA' : 'Managing crypto creators across X and TikTok'} /></label>
        <label>About<textarea value={listingForm.bio} onChange={(e) => setListingForm({ ...listingForm, bio: e.target.value })} placeholder="What you manage, regions, verticals and the best way to work with you." /></label>
        <div className="ops-field-grid two"><label>X handle<input value={listingForm.xHandle} onChange={(e) => setListingForm({ ...listingForm, xHandle: e.target.value.replace(/^@/,'') })} /></label><label>Telegram contact<input value={listingForm.telegramContact} onChange={(e) => setListingForm({ ...listingForm, telegramContact: e.target.value })} placeholder="@username or https://t.me/..." /></label></div>
        <div className="ops-field-grid two"><label>Email<input type="email" value={listingForm.email} onChange={(e) => setListingForm({ ...listingForm, email: e.target.value })} /></label><label>Website<input type="url" value={listingForm.websiteUrl} onChange={(e) => setListingForm({ ...listingForm, websiteUrl: e.target.value })} /></label></div>
        <label>Estimated unique audience, optional<input type="number" min="0" value={listingForm.estimatedUniqueAudience} onChange={(e) => setListingForm({ ...listingForm, estimatedUniqueAudience: e.target.value })} placeholder="Only if you have a defensible estimate" /><small>Linkary calculates combined audience from your portfolio. Enter unique audience only when you have evidence or a reasonable methodology.</small></label>
        <label>Audience methodology, optional<textarea value={listingForm.audienceMethodology} onChange={(e) => setListingForm({ ...listingForm, audienceMethodology: e.target.value })} placeholder="How did you estimate overlap or unique reach?" /></label>
        <label className="partner-check"><input type="checkbox" checked={listingForm.openToCampaigns} onChange={(e) => setListingForm({ ...listingForm, openToCampaigns: e.target.checked })}/><span>Open to campaign opportunities on Linkary</span></label>
        <div className="ops-form-actions"><button type="button" className="ops-button ghost" onClick={() => setShowListing(false)}>Cancel</button><button className="ops-button primary">Save listing</button></div>
      </form></div>}

      {showAsset && myListing && <div className="ops-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setShowAsset(false); }}><form className="ops-modal" onSubmit={addAsset}>
        <div className="ops-modal-head"><div><span className="ops-kicker">PORTFOLIO</span><h2>{type === 'community_manager' ? 'Add Telegram community' : 'Add creator / KOL'}</h2></div><button type="button" onClick={() => setShowAsset(false)}>×</button></div>
        <label>Name<input value={assetForm.name} onChange={(e) => setAssetForm({ ...assetForm, name: e.target.value })} required /></label>
        {type === 'kol_manager' && <label>Platform<select value={assetForm.platform} onChange={(e) => setAssetForm({ ...assetForm, platform: e.target.value })}><option>X</option><option>TikTok</option><option>YouTube</option><option>Instagram</option><option>Farcaster</option><option>Other</option></select></label>}
        <div className="ops-field-grid two"><label>Handle<input value={assetForm.handle} onChange={(e) => setAssetForm({ ...assetForm, handle: e.target.value.replace(/^@/,'') })} /></label><label>Audience size<input type="number" min="0" value={assetForm.audienceSize} onChange={(e) => setAssetForm({ ...assetForm, audienceSize: e.target.value })} required /></label></div>
        <label>URL<input type="url" value={assetForm.url} onChange={(e) => setAssetForm({ ...assetForm, url: e.target.value })} /></label>
        <label>Notes<textarea value={assetForm.notes} onChange={(e) => setAssetForm({ ...assetForm, notes: e.target.value })} /></label>
        <div className="ops-form-actions"><button type="button" className="ops-button ghost" onClick={() => setShowAsset(false)}>Cancel</button><button className="ops-button primary">Add to portfolio</button></div>
      </form></div>}

      {showPerformance && selected && <div className="ops-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setShowPerformance(false); }}><form className="ops-modal" onSubmit={savePerformance}>
        <div className="ops-modal-head"><div><span className="ops-kicker">COLLABORATION RESULT</span><h2>Add performance history</h2></div><button type="button" onClick={() => setShowPerformance(false)}>×</button></div>
        <div className="partner-evidence-note">This entry will be labeled <strong>Manual</strong>. Linkary will only upgrade evidence when stronger tracking or verification exists.</div>
        <label>Project<select value={performanceForm.organizationId} onChange={(event) => void loadCampaigns(event.target.value)} required><option value="">Select Project</option>{writableProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        <label>Campaign, optional<select value={performanceForm.campaignId} onChange={(event) => setPerformanceForm({ ...performanceForm, campaignId: event.target.value })}><option value="">Project-level collaboration</option>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></label>
        <div className="ops-field-grid two"><label>Spend, optional<input type="number" min="0" step="0.01" value={performanceForm.spendUsd} onChange={(event) => setPerformanceForm({ ...performanceForm, spendUsd: event.target.value })} placeholder="500" /></label><label>Date<input type="date" value={performanceForm.occurredAt} onChange={(event) => setPerformanceForm({ ...performanceForm, occurredAt: event.target.value })} /></label></div>
        <div className="ops-field-grid two"><label>Clicks<input type="number" min="0" value={performanceForm.clicks} onChange={(event) => setPerformanceForm({ ...performanceForm, clicks: event.target.value })} placeholder="0" /></label><label>Outcomes<input type="number" min="0" value={performanceForm.outcomes} onChange={(event) => setPerformanceForm({ ...performanceForm, outcomes: event.target.value })} placeholder="0" /></label></div>
        <label>Attributed value, optional<input type="number" min="0" step="0.01" value={performanceForm.valueUsd} onChange={(event) => setPerformanceForm({ ...performanceForm, valueUsd: event.target.value })} placeholder="0" /></label>
        <label>Notes<textarea value={performanceForm.notes} onChange={(event) => setPerformanceForm({ ...performanceForm, notes: event.target.value })} placeholder="What was delivered, what worked, and any context a future Project should know." /></label>
        <div className="ops-form-actions"><button type="button" className="ops-button ghost" onClick={() => setShowPerformance(false)}>Cancel</button><button className="ops-button primary">Add result</button></div>
      </form></div>}
    </div>
  </ProductWorkspace>;
}
