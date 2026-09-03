import { useEffect, useMemo, useState } from 'react';
import { ProductWorkspace, type ProductMe, type ProductProfile, type ProductStatus } from './ProductWorkspace';

type DiscoveryType = 'creator' | 'community_manager';
type Role = 'owner' | 'admin' | 'marketing_manager' | 'analyst' | 'viewer';
type Project = { id: string; name: string; status: string; verification_status: string; role: Role };
type CreatorPartner = {
  kind: 'creator';
  id: string;
  profile_id: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_url: string | null;
  x_handle: string | null;
  verified: boolean;
  open_to_collaborations: boolean;
  accepted_campaigns: number;
  public_url: string;
};
type CommunityPartner = {
  kind: 'community_manager';
  id: string;
  manager_id: string;
  profile_id: string;
  username: string;
  avatar_url: string | null;
  display_name: string;
  headline: string;
  bio: string;
  telegram_verified: boolean;
  manager_verification_status: string;
  open_to_campaigns: boolean;
  community_count: number;
  verified_communities: number;
  combined_audience: number;
  public_url: string;
};
type Partner = CreatorPartner | CommunityPartner;
type CommunityAsset = {
  id: string;
  asset_type: 'telegram_community';
  name: string;
  platform: string;
  handle: string | null;
  url: string | null;
  audience_size: number;
  verification_status: 'unverified' | 'submitted' | 'verified' | 'rejected';
  notes: string;
};
type DiscoveryFilters = {
  search: string;
  verifiedOnly: boolean;
  openOnly: boolean;
  minAudience: string;
  minCommunities: string;
};
type CampaignOption = { id: string; name: string; status: string };
type CollaborationInquiry = {
  id: string;
  organization_id: string;
  target_kind: 'creator' | 'community_manager';
  target_profile_id: string;
  partner_manager_id: string | null;
  partner_asset_id: string | null;
  community_name: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  inquiry_type: string;
  budget_usd: number | null;
  message: string;
  deliverables: string;
  status: 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'closed';
  updated_at: string;
};

type InquiryForm = {
  inquiryType: string;
  campaignId: string;
  communityId: string;
  budgetUsd: string;
  message: string;
  deliverables: string;
};

const inquiryTypeOptions = [
  ['content_collaboration', 'Content Collaboration'],
  ['telegram_promotion', 'Telegram Promotion'],
  ['community_activation', 'Community Activation'],
  ['x_campaign', 'X Campaign'],
  ['ambassador', 'Ambassador'],
  ['partnership', 'Partnership'],
  ['other', 'Other'],
] as const;

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

function csrf() {
  const hit = document.cookie.split('; ').find((part) => part.startsWith('__Host-linkary_csrf='));
  return hit ? decodeURIComponent(hit.split('=').slice(1).join('=')) : null;
}

function compact(value: number) {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);
}

function human(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function canManage(project?: Project) {
  return Boolean(project && project.status === 'active' && project.verification_status === 'verified_x' && ['owner', 'admin', 'marketing_manager'].includes(project.role));
}

function Avatar({ src, name }: { src: string | null; name: string }) {
  return <div className="partner-avatar">{src ? <img src={src} alt="" /> : name.slice(0, 1).toUpperCase()}</div>;
}

export default function PartnerDiscoveryExperience({ me, status }: { me: ProductMe; status: ProductStatus }) {
  const projectProfiles = useMemo(() => status.profiles.filter((item) => item.profile_type === 'project'), [status.profiles]);
  const stored = window.localStorage.getItem('linkary.active.profile');
  const firstProject = projectProfiles[0];
  const fallback = status.profiles[0];
  const [profileId, setProfileId] = useState(stored && projectProfiles.some((item) => item.id === stored) ? stored : firstProject?.id || fallback?.id || '');
  const profile = status.profiles.find((item) => item.id === profileId) || firstProject || fallback;
  const [projects, setProjects] = useState<Project[]>([]);
  const project = profile?.organization_id ? projects.find((item) => item.id === profile.organization_id) : undefined;
  const organizationId = profile?.profile_type === 'project' ? profile.organization_id : null;

  const [type, setType] = useState<DiscoveryType>('creator');
  const [search, setSearch] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [openOnly, setOpenOnly] = useState(true);
  const [minAudience, setMinAudience] = useState('');
  const [minCommunities, setMinCommunities] = useState('');
  const [partners, setPartners] = useState<Partner[]>([]);
  const [selected, setSelected] = useState<CommunityPartner | null>(null);
  const [communities, setCommunities] = useState<CommunityAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [outgoingInquiries, setOutgoingInquiries] = useState<CollaborationInquiry[]>([]);
  const [inquiryTarget, setInquiryTarget] = useState<Partner | null>(null);
  const [inquiryCommunities, setInquiryCommunities] = useState<CommunityAsset[]>([]);
  const [campaignOptions, setCampaignOptions] = useState<CampaignOption[]>([]);
  const [inquiryOptionsLoading, setInquiryOptionsLoading] = useState(false);
  const [sendingInquiry, setSendingInquiry] = useState(false);
  const [inquiryForm, setInquiryForm] = useState<InquiryForm>({ inquiryType: 'partnership', campaignId: '', communityId: '', budgetUsd: '', message: '', deliverables: '' });

  function changeProfile(id: string) {
    setProfileId(id);
    window.localStorage.setItem('linkary.active.profile', id);
  }

  useEffect(() => {
    api<{ organizations: Project[] }>('/api/organizations').then((result) => setProjects(result.organizations)).catch(() => setProjects([]));
  }, []);

  async function loadPartners(overrides?: Partial<DiscoveryFilters>) {
    if (!organizationId) { setPartners([]); return; }
    const filters: DiscoveryFilters = {
      search: overrides?.search ?? search,
      verifiedOnly: overrides?.verifiedOnly ?? verifiedOnly,
      openOnly: overrides?.openOnly ?? openOnly,
      minAudience: overrides?.minAudience ?? minAudience,
      minCommunities: overrides?.minCommunities ?? minCommunities,
    };
    setLoading(true);
    setMessage('');
    const query = new URLSearchParams({ discovery: '1', organizationId, type });
    if (filters.search.trim()) query.set('search', filters.search.trim());
    if (filters.verifiedOnly) query.set('verified', '1');
    if (filters.openOnly) query.set('open', '1');
    if (type === 'community_manager' && filters.minAudience) query.set('minAudience', filters.minAudience);
    if (type === 'community_manager' && filters.minCommunities) query.set('minCommunities', filters.minCommunities);
    try {
      const result = await api<{ partners: Partner[] }>(`/api/network-entities?${query.toString()}`);
      setPartners(result.partners);
    } catch {
      setMessage('Partner discovery is temporarily unavailable. Please try again shortly.');
    } finally {
      setLoading(false);
    }
  }

  async function loadOutgoingInquiries() {
    if (!organizationId) { setOutgoingInquiries([]); return; }
    try {
      const result = await api<{ inquiries: CollaborationInquiry[] }>('/api/project-partner-shortlists?inquiries=outgoing');
      setOutgoingInquiries(result.inquiries.filter((item) => item.organization_id === organizationId));
    } catch {
      setOutgoingInquiries([]);
    }
  }

  function resetFilters() {
    setSearch('');
    setVerifiedOnly(false);
    setOpenOnly(true);
    setMinAudience('');
    setMinCommunities('');
    void loadPartners({ search: '', verifiedOnly: false, openOnly: true, minAudience: '', minCommunities: '' });
  }

  useEffect(() => {
    setSelected(null);
    setCommunities([]);
    void loadPartners();
    void loadOutgoingInquiries();
  }, [organizationId, type]);

  async function openPartner(partner: CommunityPartner) {
    setSelected(partner);
    setCommunities([]);
    try {
      const result = await api<{ assets: CommunityAsset[] }>(`/api/partner-manager-assets?managerId=${encodeURIComponent(partner.manager_id)}`);
      setCommunities(result.assets.filter((item) => item.asset_type === 'telegram_community'));
    } catch {
      setMessage('Community portfolio details are temporarily unavailable.');
    }
  }

  async function shortlist(partner: Partner) {
    if (!organizationId || !canManage(project)) return;
    const token = csrf();
    if (!token) return;
    setSavingId(partner.id);
    setMessage('');
    try {
      const payload = partner.kind === 'creator'
        ? { organizationId, creatorProfileId: partner.profile_id, partnerKind: 'creator' }
        : { organizationId, partnerManagerId: partner.manager_id, partnerKind: 'community_manager' };
      await api('/api/project-partner-shortlists', { method: 'POST', headers: { 'x-csrf-token': token }, body: JSON.stringify(payload) });
      setMessage(`${partner.display_name} saved to ${project?.name || 'the Project'} shortlist.`);
    } catch (error) {
      setMessage(error instanceof ApiError && error.code === 'partner_already_shortlisted' ? 'This partner is already on the Project shortlist.' : 'This partner could not be saved to the Project shortlist.');
    } finally {
      setSavingId(null);
    }
  }

  function latestInquiry(partner: Partner): CollaborationInquiry | undefined {
    return outgoingInquiries.find((item) => item.target_profile_id === partner.profile_id && (partner.kind === 'creator' ? item.target_kind === 'creator' : item.partner_manager_id === partner.manager_id));
  }

  async function openInquiry(partner: Partner, preselectedCommunityId = '') {
    if (!organizationId || !canManage(project)) return;
    setInquiryTarget(partner);
    setInquiryForm({ inquiryType: partner.kind === 'community_manager' ? 'telegram_promotion' : 'content_collaboration', campaignId: '', communityId: preselectedCommunityId, budgetUsd: '', message: '', deliverables: '' });
    setInquiryCommunities([]);
    setCampaignOptions([]);
    setInquiryOptionsLoading(true);
    try {
      const [campaignResult, communityResult] = await Promise.all([
        api<{ campaigns: CampaignOption[] }>(`/api/campaigns?organizationId=${encodeURIComponent(organizationId)}`).catch(() => ({ campaigns: [] })),
        partner.kind === 'community_manager'
          ? api<{ assets: CommunityAsset[] }>(`/api/partner-manager-assets?managerId=${encodeURIComponent(partner.manager_id)}`).catch(() => ({ assets: [] }))
          : Promise.resolve({ assets: [] as CommunityAsset[] }),
      ]);
      setCampaignOptions(campaignResult.campaigns.filter((item) => !['archived', 'completed'].includes(item.status)));
      setInquiryCommunities(communityResult.assets.filter((item) => item.asset_type === 'telegram_community'));
    } finally {
      setInquiryOptionsLoading(false);
    }
  }

  async function sendInquiry(event: React.FormEvent) {
    event.preventDefault();
    if (!organizationId || !inquiryTarget || !canManage(project)) return;
    const token = csrf();
    if (!token) return;
    setSendingInquiry(true);
    setMessage('');
    try {
      const shortlistPayload = inquiryTarget.kind === 'creator'
        ? { organizationId, creatorProfileId: inquiryTarget.profile_id, partnerKind: 'creator' }
        : { organizationId, partnerManagerId: inquiryTarget.manager_id, partnerKind: 'community_manager' };
      try {
        await api('/api/project-partner-shortlists', { method: 'POST', headers: { 'x-csrf-token': token }, body: JSON.stringify(shortlistPayload) });
      } catch (error) {
        if (!(error instanceof ApiError) || error.code !== 'partner_already_shortlisted') throw error;
      }

      await api('/api/project-partner-shortlists', {
        method: 'POST',
        headers: { 'x-csrf-token': token },
        body: JSON.stringify({
          action: 'send_inquiry',
          organizationId,
          targetKind: inquiryTarget.kind,
          targetProfileId: inquiryTarget.profile_id,
          partnerManagerId: inquiryTarget.kind === 'community_manager' ? inquiryTarget.manager_id : null,
          partnerAssetId: inquiryTarget.kind === 'community_manager' ? inquiryForm.communityId || null : null,
          campaignId: inquiryForm.campaignId || null,
          inquiryType: inquiryForm.inquiryType,
          budgetUsd: inquiryForm.budgetUsd ? Number(inquiryForm.budgetUsd) : null,
          message: inquiryForm.message,
          deliverables: inquiryForm.deliverables,
        }),
      });
      setMessage(`Collaboration inquiry sent to ${inquiryTarget.display_name}. It will appear in their Linkary Inbox.`);
      setInquiryTarget(null);
      await loadOutgoingInquiries();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'inquiry_already_pending') setMessage('A collaboration inquiry is already waiting for this partner.');
      else if (error instanceof ApiError) setMessage(error.message);
      else setMessage('The collaboration inquiry could not be sent.');
    } finally {
      setSendingInquiry(false);
    }
  }

  if (!profile) return null;

  return <ProductWorkspace me={me} status={status} profile={profile as ProductProfile} onProfileChange={changeProfile}>
    <div className="ops-stack partner-directory partner-discovery-v1">
      <div className="ops-heading-row"><div><span className="ops-kicker">PARTNER DISCOVERY</span><h1>Find creators and Community Managers</h1><p>Search Linkary identities, inspect the exact Telegram Communities a manager represents, save the right partner, and send a focused collaboration inquiry before campaign assignment.</p></div></div>

      {!firstProject ? <section className="ops-empty prominent"><div className="ops-empty-icon">◎</div><h2>Connect a Project first</h2><p>Partner discovery is a Project workspace. Create or join a verified Project before building a shortlist.</p><a className="ops-button primary" href="/settings">Manage Projects</a></section> : profile.profile_type !== 'project' ? <section className="ops-callout verification"><div><span className="ops-kicker">PROJECT WORKSPACE REQUIRED</span><h3>Switch “View as” to a Project</h3><p>Discovery, private partner shortlists and collaboration inquiries belong to Projects.</p></div></section> : <>
        <div className="ops-project-toolbar"><div><span className="ops-kicker">PROJECT</span><strong>{project?.name || profile.display_name}</strong></div>{project && <div className={`ops-project-state ${project.verification_status === 'verified_x' ? 'verified' : 'pending'}`}>{project.verification_status === 'verified_x' ? 'Verified on X' : 'X verification required'}</div>}</div>

        {project && project.verification_status !== 'verified_x' && <section className="ops-callout verification"><div><span className="ops-kicker">BROWSE ONLY</span><h3>Verify {project.name} before contacting partners</h3><p>You can discover profiles now. Project verification is required before changing the private shortlist or sending collaboration inquiries.</p></div><a className="ops-button secondary" href="/settings">Open Projects</a></section>}

        <section className="partner-summary-strip"><div><strong>Creators</strong><span>Published Linkary Creator profiles with identity and collaboration signals.</span></div><div><strong>Community Managers</strong><span>See the exact Telegram Communities each manager has listed and their individual verification states.</span></div><div><strong>Evidence first</strong><span>An accepted inquiry means open to discussion. It never becomes verified campaign proof automatically.</span></div></section>

        <section className="ops-section">
          <div className="partner-toolbar"><nav className="ops-tabs"><button className={type === 'creator' ? 'active' : ''} onClick={() => setType('creator')}>Creators</button><button className={type === 'community_manager' ? 'active' : ''} onClick={() => setType('community_manager')}>Community Managers</button></nav><form onSubmit={(event) => { event.preventDefault(); void loadPartners(); }}><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={type === 'creator' ? 'Search creator, @handle or bio' : 'Search manager, Community or @handle'} /><button className="ops-button small">Search</button></form></div>

          <div className="ops-field-grid two partner-discovery-filters"><label className="partner-check"><input type="checkbox" checked={verifiedOnly} onChange={(event) => setVerifiedOnly(event.target.checked)} /><span>{type === 'creator' ? 'Verified creators only' : 'At least one verified Community'}</span></label><label className="partner-check"><input type="checkbox" checked={openOnly} onChange={(event) => setOpenOnly(event.target.checked)} /><span>{type === 'creator' ? 'Open to collaboration' : 'Open to campaigns'}</span></label>{type === 'community_manager' && <><label>Minimum combined audience<input type="number" min="0" value={minAudience} onChange={(event) => setMinAudience(event.target.value)} placeholder="0" /></label><label>Minimum Communities<input type="number" min="0" value={minCommunities} onChange={(event) => setMinCommunities(event.target.value)} placeholder="0" /></label></>}</div>
          <div className="ops-form-actions"><button className="ops-button secondary" onClick={() => void loadPartners()}>Apply filters</button><button className="ops-button ghost" onClick={resetFilters}>Reset</button></div>

          {loading ? <div className="ops-loading">Loading partners...</div> : !partners.length ? <div className="ops-empty"><div className="ops-empty-icon">◇</div><h3>No matching partners yet</h3><p>Try widening the filters. Discovery only shows real published Creator profiles and public Community Manager portfolios.</p></div> : <div className="partner-grid">{partners.map((partner) => {
            const inquiry = latestInquiry(partner);
            const inquiryLocked = inquiry?.status === 'pending' || inquiry?.status === 'accepted';
            return <article className="partner-card" key={`${partner.kind}:${partner.id}`}>
              <div className="partner-card-head"><Avatar src={partner.avatar_url} name={partner.display_name} /><div><strong>{partner.display_name}</strong><span>{partner.kind === 'creator' ? `@${partner.username}` : partner.headline || 'Community Manager'}</span></div><span className={`partner-verify ${partner.kind === 'creator' ? (partner.verified ? 'verified' : 'unverified') : (partner.verified_communities > 0 ? 'verified' : 'unverified')}`}>{partner.kind === 'creator' ? (partner.verified ? 'Verified' : 'Listed') : `${partner.verified_communities} verified`}</span></div>
              {partner.kind === 'creator' ? <><p>{partner.bio || 'Published Linkary Creator profile.'}</p><div className="partner-metrics"><div><span>COLLABORATION</span><strong>{partner.open_to_collaborations ? 'Open' : 'Profile only'}</strong></div><div><span>ACCEPTED CAMPAIGNS</span><strong>{partner.accepted_campaigns}</strong></div><div><span>X IDENTITY</span><strong>{partner.x_handle ? `@${partner.x_handle}` : 'Linked'}</strong></div></div></> : <><p>{partner.bio || partner.headline || 'Public Community Manager portfolio.'}</p><div className="partner-metrics"><div><span>COMMUNITIES</span><strong>{partner.community_count}</strong></div><div><span>VERIFIED</span><strong>{partner.verified_communities}</strong></div><div><span>COMBINED AUDIENCE</span><strong>{compact(partner.combined_audience)}</strong></div><div><span>PERSONAL TELEGRAM</span><strong>{partner.telegram_verified ? 'Verified' : 'Not verified'}</strong></div></div></>}
              <div className="partner-card-foot"><span>{inquiry ? <span className={`collab-inquiry-status ${inquiry.status}`}>{inquiry.status === 'pending' ? 'Inquiry pending' : human(inquiry.status)}</span> : partner.kind === 'creator' ? (partner.open_to_collaborations ? 'Open to collaboration' : 'Published Creator') : (partner.open_to_campaigns ? 'Open to campaigns' : 'Directory listing')}</span><div className="network-actions"><a className="ops-button ghost small" href={partner.public_url} target="_blank" rel="noreferrer">View profile ↗</a>{partner.kind === 'community_manager' && <button type="button" onClick={() => void openPartner(partner)}>View Communities</button>}<button type="button" disabled={!canManage(project) || savingId === partner.id} onClick={() => void shortlist(partner)}>{savingId === partner.id ? 'Saving...' : 'Shortlist'}</button><button className="collab-inquiry-open" type="button" disabled={!canManage(project) || inquiryLocked} onClick={() => void openInquiry(partner)}>{inquiry?.status === 'pending' ? 'Inquiry pending' : inquiry?.status === 'accepted' ? 'Accepted' : inquiry?.status === 'declined' ? 'New inquiry' : 'Start inquiry'}</button></div></div>
            </article>;
          })}</div>}
        </section>
      </>}

      {message && <div className="ops-message">{message}</div>}

      {selected && <div className="ops-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setSelected(null); }}><section className="ops-modal partner-detail">
        <div className="ops-modal-head"><div><span className="ops-kicker">COMMUNITY MANAGER</span><h2>{selected.display_name}</h2></div><button onClick={() => setSelected(null)}>×</button></div>
        {selected.headline && <h3 className="partner-headline">{selected.headline}</h3>}{selected.bio && <p className="partner-bio">{selected.bio}</p>}
        <div className="partner-detail-metrics"><div><span>Communities</span><strong>{selected.community_count}</strong></div><div><span>Verified Communities</span><strong>{selected.verified_communities}</strong></div><div><span>Combined audience</span><strong>{compact(selected.combined_audience)}</strong></div><div><span>Personal Telegram</span><strong>{selected.telegram_verified ? 'Verified' : 'Not verified'}</strong></div></div>
        <div className="partner-evidence-note">Personal Telegram verification proves the manager's human identity/contact. Each Community keeps its own separate verification state.</div>
        <div className="partner-portfolio-title"><div><h3>Telegram Communities</h3><span>{communities.length} listed</span></div></div>
        {!communities.length ? <div className="ops-empty compact"><p>No Communities are publicly listed for this manager yet.</p></div> : <div className="partner-asset-list">{communities.map((community) => <article key={community.id}><div><strong>{community.name}</strong><span>{community.handle ? `@${community.handle}` : 'Telegram'}</span></div><div><strong>{compact(community.audience_size)}</strong><span>estimated audience</span></div><span className={`partner-verify ${community.verification_status}`}>{human(community.verification_status)}</span>{community.url && <a href={community.url} target="_blank" rel="noreferrer">Visit Community ↗</a>}{canManage(project) && <button className="ops-button small" onClick={() => { setSelected(null); void openInquiry(selected, community.id); }}>Inquire about this Community</button>}</article>)}</div>}
        <div className="ops-form-actions"><a className="ops-button ghost" href={selected.public_url} target="_blank" rel="noreferrer">View public portfolio ↗</a><button className="ops-button secondary" disabled={!canManage(project) || savingId === selected.id} onClick={() => void shortlist(selected)}>{savingId === selected.id ? 'Saving...' : 'Save to Project shortlist'}</button><button className="ops-button primary" disabled={!canManage(project) || latestInquiry(selected)?.status === 'pending' || latestInquiry(selected)?.status === 'accepted'} onClick={() => { setSelected(null); void openInquiry(selected); }}>Start inquiry</button></div>
      </section></div>}

      {inquiryTarget && <div className="ops-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !sendingInquiry) setInquiryTarget(null); }}><section className="ops-modal collab-inquiry-modal">
        <div className="ops-modal-head"><div><span className="ops-kicker">COLLABORATION INQUIRY</span><h2>Contact {inquiryTarget.display_name}</h2></div><button disabled={sendingInquiry} onClick={() => setInquiryTarget(null)}>×</button></div>
        <div className="collab-inquiry-target"><Avatar src={inquiryTarget.avatar_url} name={inquiryTarget.display_name} /><div><strong>{inquiryTarget.display_name}</strong><span>{inquiryTarget.kind === 'creator' ? `@${inquiryTarget.username}` : 'Community Manager'}{inquiryForm.communityId && inquiryCommunities.find((item) => item.id === inquiryForm.communityId) ? ` · ${inquiryCommunities.find((item) => item.id === inquiryForm.communityId)?.name}` : ''}</span></div></div>
        {inquiryOptionsLoading ? <div className="ops-loading">Preparing inquiry options...</div> : <form className="collab-inquiry-form" onSubmit={(event) => void sendInquiry(event)}>
          <div className="collab-inquiry-grid"><label>Inquiry type<select value={inquiryForm.inquiryType} onChange={(event) => setInquiryForm((current) => ({ ...current, inquiryType: event.target.value }))}>{inquiryTypeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Related campaign (optional)<select value={inquiryForm.campaignId} onChange={(event) => setInquiryForm((current) => ({ ...current, campaignId: event.target.value }))}><option value="">No campaign selected</option>{campaignOptions.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></label></div>
          {inquiryTarget.kind === 'community_manager' && <label>Exact Telegram Community (optional)<select value={inquiryForm.communityId} onChange={(event) => setInquiryForm((current) => ({ ...current, communityId: event.target.value }))}><option value="">General inquiry to this Community Manager</option>{inquiryCommunities.map((community) => <option key={community.id} value={community.id}>{community.name} · {human(community.verification_status)}</option>)}</select></label>}
          <label>Budget (optional, USD)<input type="number" min="0" step="0.01" value={inquiryForm.budgetUsd} onChange={(event) => setInquiryForm((current) => ({ ...current, budgetUsd: event.target.value }))} placeholder="Not set" /></label>
          <label>Short message<textarea required minLength={5} maxLength={1200} value={inquiryForm.message} onChange={(event) => setInquiryForm((current) => ({ ...current, message: event.target.value }))} placeholder="What would you like to collaborate on?" /></label>
          <label>Deliverables or expectations (optional)<textarea maxLength={1200} value={inquiryForm.deliverables} onChange={(event) => setInquiryForm((current) => ({ ...current, deliverables: event.target.value }))} placeholder="Example: one Telegram post, one AMA, content timing, or partnership scope." /></label>
          <div className="collab-inquiry-note"><strong>Inquiry only.</strong> Accepting this request means the partner is open to discussion. It does not create campaign evidence, verified performance, payment obligations or an active collaboration automatically.</div>
          <div className="ops-form-actions"><button type="button" className="ops-button secondary" disabled={sendingInquiry} onClick={() => setInquiryTarget(null)}>Cancel</button><button type="submit" className="ops-button primary" disabled={sendingInquiry || inquiryForm.message.trim().length < 5}>{sendingInquiry ? 'Sending...' : 'Send inquiry'}</button></div>
        </form>}
      </section></div>}
    </div>
  </ProductWorkspace>;
}
