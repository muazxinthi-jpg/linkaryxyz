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
  activated_activity_id: string | null;
  activated_activity_title: string | null;
  activated_campaign_id: string | null;
  activated_campaign_name: string | null;
  activated_at: string | null;
};
type RelationshipState = 'new' | 'inquiry_pending' | 'in_discussion' | 'active' | 'worked_before';
type RelationshipSummary = {
  kind: DiscoveryType;
  target_id: string;
  state: RelationshipState;
  inquiries_sent: number;
  accepted_inquiries: number;
  activated_inquiries: number;
  campaigns: number;
  activities: number;
  active_activities: number;
  completed_activities: number;
  communities_used: number;
  tracked_clicks: number;
  verified_outcomes: number;
  attributed_value_usd: number;
  manual_outcomes: number;
  manual_value_usd: number;
  planned_cost_usd: number;
  last_activity_at: string | null;
};
type RelationshipActivity = {
  activity_id: string;
  activity_title: string;
  activity_type: string;
  activity_status: string;
  campaign_id: string;
  campaign_name: string;
  partner_asset_id: string | null;
  community_name: string | null;
  community_verification_status: string | null;
  planned_cost_usd: number | null;
  tracked_clicks: number;
  verified_outcomes: number;
  attributed_value_usd: number;
  manual_outcomes: number;
  manual_value_usd: number;
  updated_at: string;
};
type RelationshipInquiry = {
  inquiry_id: string;
  inquiry_type: string;
  status: string;
  campaign_id: string | null;
  campaign_name: string | null;
  partner_asset_id: string | null;
  community_name: string | null;
  community_verification_status: string | null;
  budget_usd: number | null;
  created_at: string;
  responded_at: string | null;
  activated_activity_id: string | null;
  activated_activity_title: string | null;
  activated_campaign_name: string | null;
  activated_at: string | null;
};
type RelationshipCommunity = {
  asset_id: string;
  community_name: string;
  verification_status: string;
  campaigns: number;
  activities: number;
  tracked_clicks: number;
  verified_outcomes: number;
  attributed_value_usd: number;
  last_activity_at: string | null;
};
type RelationshipDetail = {
  summary: Omit<RelationshipSummary, 'kind' | 'target_id'>;
  activities: RelationshipActivity[];
  inquiries: RelationshipInquiry[];
  communities: RelationshipCommunity[];
  evidence_note: string;
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

function money(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);
}

function human(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function date(value: string | null) {
  if (!value) return 'Not recorded';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Recently' : new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
}

function relationshipLabel(value: RelationshipState) {
  if (value === 'inquiry_pending') return 'Inquiry pending';
  if (value === 'in_discussion') return 'In discussion';
  if (value === 'worked_before') return 'Worked before';
  return human(value);
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
  const [relationships, setRelationships] = useState<Map<string, RelationshipSummary>>(new Map());
  const [relationshipTarget, setRelationshipTarget] = useState<Partner | null>(null);
  const [relationshipDetail, setRelationshipDetail] = useState<RelationshipDetail | null>(null);
  const [relationshipLoading, setRelationshipLoading] = useState(false);
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

  async function loadRelationships() {
    if (!organizationId) { setRelationships(new Map()); return; }
    try {
      const result = await api<{ relationships: RelationshipSummary[] }>(`/api/partner-relationships?organizationId=${encodeURIComponent(organizationId)}&kind=${encodeURIComponent(type)}`);
      setRelationships(new Map(result.relationships.map((item) => [item.target_id, item])));
    } catch {
      setRelationships(new Map());
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
    setRelationshipTarget(null);
    setRelationshipDetail(null);
    void Promise.all([loadPartners(), loadOutgoingInquiries(), loadRelationships()]);
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

  function relationshipFor(partner: Partner): RelationshipSummary | undefined {
    return relationships.get(partner.kind === 'creator' ? partner.profile_id : partner.manager_id);
  }

  async function openRelationship(partner: Partner) {
    if (!organizationId) return;
    setRelationshipTarget(partner);
    setRelationshipDetail(null);
    setRelationshipLoading(true);
    const targetId = partner.kind === 'creator' ? partner.profile_id : partner.manager_id;
    try {
      const result = await api<{ relationship: RelationshipDetail }>(`/api/partner-relationships?organizationId=${encodeURIComponent(organizationId)}&kind=${encodeURIComponent(partner.kind)}&targetId=${encodeURIComponent(targetId)}`);
      setRelationshipDetail(result.relationship);
    } catch {
      setMessage('Relationship history is temporarily unavailable.');
      setRelationshipTarget(null);
    } finally {
      setRelationshipLoading(false);
    }
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
      await Promise.all([loadOutgoingInquiries(), loadRelationships()]);
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
      <div className="ops-heading-row"><div><span className="ops-kicker">PARTNER DISCOVERY</span><h1>Find creators and Community Managers</h1><p>Discover Linkary partners, remember what your Project has already done with them, and start the next collaboration from real evidence.</p></div></div>

      {!firstProject ? <section className="ops-empty prominent"><div className="ops-empty-icon">◎</div><h2>Connect a Project first</h2><p>Partner discovery is a Project workspace. Create or join a verified Project before building a shortlist.</p><a className="ops-button primary" href="/settings">Manage Projects</a></section> : profile.profile_type !== 'project' ? <section className="ops-callout verification"><div><span className="ops-kicker">PROJECT WORKSPACE REQUIRED</span><h3>Switch “View as” to a Project</h3><p>Discovery, private relationship memory and collaboration inquiries belong to Projects.</p></div></section> : <>
        <div className="ops-project-toolbar"><div><span className="ops-kicker">PROJECT</span><strong>{project?.name || profile.display_name}</strong></div>{project && <div className={`ops-project-state ${project.verification_status === 'verified_x' ? 'verified' : 'pending'}`}>{project.verification_status === 'verified_x' ? 'Verified on X' : 'X verification required'}</div>}</div>

        {project && project.verification_status !== 'verified_x' && <section className="ops-callout verification"><div><span className="ops-kicker">BROWSE ONLY</span><h3>Verify {project.name} before contacting partners</h3><p>You can discover profiles and inspect existing relationship memory now. Project verification is required before changing the shortlist or sending collaboration inquiries.</p></div><a className="ops-button secondary" href="/settings">Open Projects</a></section>}

        <section className="partner-summary-strip"><div><strong>Discover</strong><span>Find published Creators and Community Managers with canonical Linkary identities.</span></div><div><strong>Remember</strong><span>See your Project's prior campaigns, tracked clicks, verified outcomes and exact Communities used.</span></div><div><strong>Work again</strong><span>Previously activated relationships can start a fresh inquiry without rewriting historical proof.</span></div></section>

        <section className="ops-section">
          <div className="partner-toolbar"><nav className="ops-tabs"><button className={type === 'creator' ? 'active' : ''} onClick={() => setType('creator')}>Creators</button><button className={type === 'community_manager' ? 'active' : ''} onClick={() => setType('community_manager')}>Community Managers</button></nav><form onSubmit={(event) => { event.preventDefault(); void loadPartners(); }}><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={type === 'creator' ? 'Search creator, @handle or bio' : 'Search manager, Community or @handle'} /><button className="ops-button small">Search</button></form></div>

          <div className="ops-field-grid two partner-discovery-filters"><label className="partner-check"><input type="checkbox" checked={verifiedOnly} onChange={(event) => setVerifiedOnly(event.target.checked)} /><span>{type === 'creator' ? 'Verified creators only' : 'At least one verified Community'}</span></label><label className="partner-check"><input type="checkbox" checked={openOnly} onChange={(event) => setOpenOnly(event.target.checked)} /><span>{type === 'creator' ? 'Open to collaboration' : 'Open to campaigns'}</span></label>{type === 'community_manager' && <><label>Minimum combined audience<input type="number" min="0" value={minAudience} onChange={(event) => setMinAudience(event.target.value)} placeholder="0" /></label><label>Minimum Communities<input type="number" min="0" value={minCommunities} onChange={(event) => setMinCommunities(event.target.value)} placeholder="0" /></label></>}</div>
          <div className="ops-form-actions"><button className="ops-button secondary" onClick={() => void loadPartners()}>Apply filters</button><button className="ops-button ghost" onClick={resetFilters}>Reset</button></div>

          {loading ? <div className="ops-loading">Loading partners...</div> : !partners.length ? <div className="ops-empty"><div className="ops-empty-icon">◇</div><h3>No matching partners yet</h3><p>Try widening the filters. Discovery only shows real published Creator profiles and public Community Manager portfolios.</p></div> : <div className="partner-grid">{partners.map((partner) => {
            const inquiry = latestInquiry(partner);
            const relationship = relationshipFor(partner);
            const inquiryLocked = inquiry?.status === 'pending' || (inquiry?.status === 'accepted' && !inquiry.activated_activity_id);
            const workedBefore = Boolean(relationship && ['active', 'worked_before'].includes(relationship.state)) || Boolean(inquiry?.activated_activity_id);
            const rehireCommunity = partner.kind === 'community_manager' && inquiry?.activated_activity_id ? inquiry.partner_asset_id || '' : '';
            return <article className="partner-card" key={`${partner.kind}:${partner.id}`}>
              <div className="partner-card-head"><Avatar src={partner.avatar_url} name={partner.display_name} /><div><strong>{partner.display_name}</strong><span>{partner.kind === 'creator' ? `@${partner.username}` : partner.headline || 'Community Manager'}</span></div><span className={`partner-verify ${partner.kind === 'creator' ? (partner.verified ? 'verified' : 'unverified') : (partner.verified_communities > 0 ? 'verified' : 'unverified')}`}>{partner.kind === 'creator' ? (partner.verified ? 'Verified' : 'Listed') : `${partner.verified_communities} verified`}</span></div>
              {partner.kind === 'creator' ? <><p>{partner.bio || 'Published Linkary Creator profile.'}</p><div className="partner-metrics"><div><span>COLLABORATION</span><strong>{partner.open_to_collaborations ? 'Open' : 'Profile only'}</strong></div><div><span>ACCEPTED CAMPAIGNS</span><strong>{partner.accepted_campaigns}</strong></div><div><span>X IDENTITY</span><strong>{partner.x_handle ? `@${partner.x_handle}` : 'Linked'}</strong></div></div></> : <><p>{partner.bio || partner.headline || 'Public Community Manager portfolio.'}</p><div className="partner-metrics"><div><span>COMMUNITIES</span><strong>{partner.community_count}</strong></div><div><span>VERIFIED</span><strong>{partner.verified_communities}</strong></div><div><span>COMBINED AUDIENCE</span><strong>{compact(partner.combined_audience)}</strong></div><div><span>PERSONAL TELEGRAM</span><strong>{partner.telegram_verified ? 'Verified' : 'Not verified'}</strong></div></div></>}
              {relationship && relationship.state !== 'new' && <div className="partner-relationship-snapshot"><span className={`partner-relationship-state ${relationship.state}`}>{relationshipLabel(relationship.state)}</span><div>{relationship.campaigns > 0 && <span><b>{relationship.campaigns}</b> campaign{relationship.campaigns === 1 ? '' : 's'}</span>}<span><b>{compact(relationship.tracked_clicks)}</b> tracked clicks</span><span><b>{compact(relationship.verified_outcomes)}</b> verified outcomes</span>{relationship.attributed_value_usd > 0 && <span><b>{money(relationship.attributed_value_usd)}</b> value</span>}</div></div>}
              <div className="partner-card-foot"><span>{inquiry?.status === 'pending' ? <span className="collab-inquiry-status pending">Inquiry pending</span> : inquiry?.status === 'accepted' && !inquiry.activated_activity_id ? <span className="collab-inquiry-status accepted">Accepted · activate in Inbox</span> : relationship && relationship.state !== 'new' ? <span className={`partner-relationship-state compact ${relationship.state}`}>{relationshipLabel(relationship.state)}</span> : partner.kind === 'creator' ? (partner.open_to_collaborations ? 'Open to collaboration' : 'Published Creator') : (partner.open_to_campaigns ? 'Open to campaigns' : 'Directory listing')}</span><div className="network-actions"><a className="ops-button ghost small" href={partner.public_url} target="_blank" rel="noreferrer">View profile ↗</a>{partner.kind === 'community_manager' && <button type="button" onClick={() => void openPartner(partner)}>View Communities</button>}{relationship && relationship.state !== 'new' && <button type="button" onClick={() => void openRelationship(partner)}>View relationship</button>}<button type="button" disabled={!canManage(project) || savingId === partner.id} onClick={() => void shortlist(partner)}>{savingId === partner.id ? 'Saving...' : 'Shortlist'}</button><button className="collab-inquiry-open" type="button" disabled={!canManage(project) || inquiryLocked} onClick={() => void openInquiry(partner, rehireCommunity)}>{inquiry?.status === 'pending' ? 'Inquiry pending' : inquiry?.status === 'accepted' && !inquiry.activated_activity_id ? 'Accepted' : workedBefore ? 'Work again' : inquiry?.status === 'declined' || inquiry?.status === 'withdrawn' ? 'New inquiry' : 'Start inquiry'}</button></div></div>
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
        <div className="ops-form-actions"><a className="ops-button ghost" href={selected.public_url} target="_blank" rel="noreferrer">View public portfolio ↗</a><button className="ops-button secondary" disabled={!canManage(project) || savingId === selected.id} onClick={() => void shortlist(selected)}>{savingId === selected.id ? 'Saving...' : 'Save to Project shortlist'}</button>{relationshipFor(selected) && relationshipFor(selected)?.state !== 'new' && <button className="ops-button secondary" onClick={() => { setSelected(null); void openRelationship(selected); }}>View relationship</button>}<button className="ops-button primary" disabled={!canManage(project) || latestInquiry(selected)?.status === 'pending' || (latestInquiry(selected)?.status === 'accepted' && !latestInquiry(selected)?.activated_activity_id)} onClick={() => { const latest = latestInquiry(selected); setSelected(null); void openInquiry(selected, latest?.activated_activity_id ? latest.partner_asset_id || '' : ''); }}>{latestInquiry(selected)?.activated_activity_id ? 'Work again' : 'Start inquiry'}</button></div>
      </section></div>}

      {relationshipTarget && <div className="ops-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setRelationshipTarget(null); }}><section className="ops-modal partner-relationship-modal">
        <div className="ops-modal-head"><div><span className="ops-kicker">PROJECT RELATIONSHIP MEMORY</span><h2>{relationshipTarget.display_name}</h2></div><button onClick={() => setRelationshipTarget(null)}>×</button></div>
        {relationshipLoading || !relationshipDetail ? <div className="ops-loading">Loading relationship history...</div> : <>
          <div className="partner-relationship-hero"><span className={`partner-relationship-state ${relationshipDetail.summary.state}`}>{relationshipLabel(relationshipDetail.summary.state)}</span><div><strong>{relationshipDetail.summary.campaigns} campaign{relationshipDetail.summary.campaigns === 1 ? '' : 's'} · {relationshipDetail.summary.activities} exact activit{relationshipDetail.summary.activities === 1 ? 'y' : 'ies'}</strong><small>Last activity: {date(relationshipDetail.summary.last_activity_at)}</small></div></div>
          <div className="partner-relationship-metrics"><div><span>TRACKED CLICKS</span><strong>{compact(relationshipDetail.summary.tracked_clicks)}</strong></div><div><span>VERIFIED OUTCOMES</span><strong>{compact(relationshipDetail.summary.verified_outcomes)}</strong></div><div><span>ATTRIBUTED VALUE</span><strong>{money(relationshipDetail.summary.attributed_value_usd)}</strong></div><div><span>ACTIVATED INQUIRIES</span><strong>{relationshipDetail.summary.activated_inquiries}</strong></div>{relationshipTarget.kind === 'community_manager' && <div><span>COMMUNITIES USED</span><strong>{relationshipDetail.summary.communities_used}</strong></div>}{relationshipDetail.summary.planned_cost_usd > 0 && <div><span>PLANNED COST</span><strong>{money(relationshipDetail.summary.planned_cost_usd)}</strong></div>}</div>
          {relationshipDetail.summary.manual_outcomes > 0 && <div className="partner-relationship-manual"><strong>Manual evidence</strong><span>{relationshipDetail.summary.manual_outcomes} manually recorded outcome{relationshipDetail.summary.manual_outcomes === 1 ? '' : 's'} · {money(relationshipDetail.summary.manual_value_usd)} recorded value. This is not included in Verified outcomes or attributed value above.</span></div>}
          {relationshipDetail.communities.length > 0 && <section className="partner-relationship-section"><div className="partner-relationship-title"><span>EXACT COMMUNITIES USED</span><h3>Community history</h3></div><div className="partner-relationship-community-list">{relationshipDetail.communities.map((community) => <article key={community.asset_id}><div><strong>{community.community_name}</strong><small>{human(community.verification_status)} · Last activity {date(community.last_activity_at)}</small></div><div><span>{community.campaigns} campaigns</span><span>{compact(community.tracked_clicks)} clicks</span><span>{compact(community.verified_outcomes)} verified outcomes</span>{community.attributed_value_usd > 0 && <span>{money(community.attributed_value_usd)} value</span>}</div></article>)}</div></section>}
          <section className="partner-relationship-section"><div className="partner-relationship-title"><span>CAMPAIGN HISTORY</span><h3>Recent exact activities</h3></div>{!relationshipDetail.activities.length ? <div className="ops-empty compact"><p>No exact campaign activity has been recorded yet.</p></div> : <div className="partner-relationship-history">{relationshipDetail.activities.slice(0, 12).map((activity) => <article key={activity.activity_id}><div><strong>{activity.campaign_name}</strong><span>{activity.activity_title}{activity.community_name ? ` · ${activity.community_name}` : ''}</span><small>{human(activity.activity_status)} · {date(activity.updated_at)}{activity.planned_cost_usd !== null ? ` · ${money(activity.planned_cost_usd)} planned` : ''}</small></div><div className="partner-relationship-evidence"><span className={activity.tracked_clicks > 0 ? 'tracked' : ''}>{compact(activity.tracked_clicks)} clicks</span><span className={activity.verified_outcomes > 0 ? 'verified' : ''}>{compact(activity.verified_outcomes)} verified outcomes</span>{activity.attributed_value_usd > 0 && <span className="verified">{money(activity.attributed_value_usd)} value</span>}{activity.manual_outcomes > 0 && <span className="manual">Manual: {activity.manual_outcomes} outcomes · {money(activity.manual_value_usd)}</span>}</div></article>)}</div>}</section>
          <section className="partner-relationship-section"><div className="partner-relationship-title"><span>COLLABORATION HISTORY</span><h3>Recent inquiries</h3></div>{!relationshipDetail.inquiries.length ? <div className="ops-empty compact"><p>No Linkary collaboration inquiries recorded for this relationship.</p></div> : <div className="partner-relationship-inquiries">{relationshipDetail.inquiries.slice(0, 10).map((item) => <article key={item.inquiry_id}><span className={`collab-inquiry-status ${item.status}`}>{human(item.status)}</span><div><strong>{human(item.inquiry_type)}{item.community_name ? ` · ${item.community_name}` : ''}</strong><small>{item.campaign_name || 'No campaign selected'} · {date(item.created_at)}{item.budget_usd !== null ? ` · ${money(item.budget_usd)}` : ''}</small>{item.activated_activity_id && <span>Activated: {item.activated_campaign_name} · {item.activated_activity_title}</span>}</div></article>)}</div>}</section>
          <div className="partner-evidence-note">{relationshipDetail.evidence_note}</div>
          <div className="ops-form-actions"><button className="ops-button secondary" onClick={() => setRelationshipTarget(null)}>Close</button>{canManage(project) && !latestInquiry(relationshipTarget)?.status.includes('pending') && !(latestInquiry(relationshipTarget)?.status === 'accepted' && !latestInquiry(relationshipTarget)?.activated_activity_id) && <button className="ops-button primary" onClick={() => { const target = relationshipTarget; const latest = latestInquiry(target); setRelationshipTarget(null); void openInquiry(target, target.kind === 'community_manager' && latest?.activated_activity_id ? latest.partner_asset_id || '' : ''); }}>Work again</button>}</div>
        </>}
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