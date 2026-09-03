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

  if (!profile) return null;

  return <ProductWorkspace me={me} status={status} profile={profile as ProductProfile} onProfileChange={changeProfile}>
    <div className="ops-stack partner-directory partner-discovery-v1">
      <div className="ops-heading-row"><div><span className="ops-kicker">PARTNER DISCOVERY</span><h1>Find creators and Community Managers</h1><p>Search Linkary identities, inspect the exact Telegram Communities a manager represents, and save the right partner into your Project shortlist before campaign assignment.</p></div></div>

      {!firstProject ? <section className="ops-empty prominent"><div className="ops-empty-icon">◎</div><h2>Connect a Project first</h2><p>Partner discovery is a Project workspace. Create or join a verified Project before building a shortlist.</p><a className="ops-button primary" href="/settings">Manage Projects</a></section> : profile.profile_type !== 'project' ? <section className="ops-callout verification"><div><span className="ops-kicker">PROJECT WORKSPACE REQUIRED</span><h3>Switch “View as” to a Project</h3><p>Discovery and private partner shortlists belong to Projects.</p></div></section> : <>
        <div className="ops-project-toolbar"><div><span className="ops-kicker">PROJECT</span><strong>{project?.name || profile.display_name}</strong></div>{project && <div className={`ops-project-state ${project.verification_status === 'verified_x' ? 'verified' : 'pending'}`}>{project.verification_status === 'verified_x' ? 'Verified on X' : 'X verification required'}</div>}</div>

        {project && project.verification_status !== 'verified_x' && <section className="ops-callout verification"><div><span className="ops-kicker">BROWSE ONLY</span><h3>Verify {project.name} before saving partners</h3><p>You can discover profiles now. Project verification is required before changing the private shortlist.</p></div><a className="ops-button secondary" href="/settings">Open Projects</a></section>}

        <section className="partner-summary-strip"><div><strong>Creators</strong><span>Published Linkary Creator profiles with identity and collaboration signals.</span></div><div><strong>Community Managers</strong><span>See the exact Telegram Communities each manager has listed and their individual verification states.</span></div><div><strong>Evidence first</strong><span>Estimated audience and verification remain explicit. Estimates never become verified proof automatically.</span></div></section>

        <section className="ops-section">
          <div className="partner-toolbar"><nav className="ops-tabs"><button className={type === 'creator' ? 'active' : ''} onClick={() => setType('creator')}>Creators</button><button className={type === 'community_manager' ? 'active' : ''} onClick={() => setType('community_manager')}>Community Managers</button></nav><form onSubmit={(event) => { event.preventDefault(); void loadPartners(); }}><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={type === 'creator' ? 'Search creator, @handle or bio' : 'Search manager, Community or @handle'} /><button className="ops-button small">Search</button></form></div>

          <div className="ops-field-grid two partner-discovery-filters"><label className="partner-check"><input type="checkbox" checked={verifiedOnly} onChange={(event) => setVerifiedOnly(event.target.checked)} /><span>{type === 'creator' ? 'Verified creators only' : 'At least one verified Community'}</span></label><label className="partner-check"><input type="checkbox" checked={openOnly} onChange={(event) => setOpenOnly(event.target.checked)} /><span>{type === 'creator' ? 'Open to collaboration' : 'Open to campaigns'}</span></label>{type === 'community_manager' && <><label>Minimum combined audience<input type="number" min="0" value={minAudience} onChange={(event) => setMinAudience(event.target.value)} placeholder="0" /></label><label>Minimum Communities<input type="number" min="0" value={minCommunities} onChange={(event) => setMinCommunities(event.target.value)} placeholder="0" /></label></>}</div>
          <div className="ops-form-actions"><button className="ops-button secondary" onClick={() => void loadPartners()}>Apply filters</button><button className="ops-button ghost" onClick={resetFilters}>Reset</button></div>

          {loading ? <div className="ops-loading">Loading partners...</div> : !partners.length ? <div className="ops-empty"><div className="ops-empty-icon">◇</div><h3>No matching partners yet</h3><p>Try widening the filters. Discovery only shows real published Creator profiles and public Community Manager portfolios.</p></div> : <div className="partner-grid">{partners.map((partner) => <article className="partner-card" key={`${partner.kind}:${partner.id}`}>
            <div className="partner-card-head"><Avatar src={partner.avatar_url} name={partner.display_name} /><div><strong>{partner.display_name}</strong><span>{partner.kind === 'creator' ? `@${partner.username}` : partner.headline || 'Community Manager'}</span></div><span className={`partner-verify ${partner.kind === 'creator' ? (partner.verified ? 'verified' : 'unverified') : (partner.verified_communities > 0 ? 'verified' : 'unverified')}`}>{partner.kind === 'creator' ? (partner.verified ? 'Verified' : 'Listed') : `${partner.verified_communities} verified`}</span></div>
            {partner.kind === 'creator' ? <><p>{partner.bio || 'Published Linkary Creator profile.'}</p><div className="partner-metrics"><div><span>COLLABORATION</span><strong>{partner.open_to_collaborations ? 'Open' : 'Profile only'}</strong></div><div><span>ACCEPTED CAMPAIGNS</span><strong>{partner.accepted_campaigns}</strong></div><div><span>X IDENTITY</span><strong>{partner.x_handle ? `@${partner.x_handle}` : 'Linked'}</strong></div></div></> : <><p>{partner.bio || partner.headline || 'Public Community Manager portfolio.'}</p><div className="partner-metrics"><div><span>COMMUNITIES</span><strong>{partner.community_count}</strong></div><div><span>VERIFIED</span><strong>{partner.verified_communities}</strong></div><div><span>COMBINED AUDIENCE</span><strong>{compact(partner.combined_audience)}</strong></div><div><span>PERSONAL TELEGRAM</span><strong>{partner.telegram_verified ? 'Verified' : 'Not verified'}</strong></div></div></>}
            <div className="partner-card-foot"><span>{partner.kind === 'creator' ? (partner.open_to_collaborations ? 'Open to collaboration' : 'Published Creator') : (partner.open_to_campaigns ? 'Open to campaigns' : 'Directory listing')}</span><div className="network-actions"><a className="ops-button ghost small" href={partner.public_url} target="_blank" rel="noreferrer">View profile ↗</a>{partner.kind === 'community_manager' && <button type="button" onClick={() => void openPartner(partner)}>View Communities</button>}<button type="button" disabled={!canManage(project) || savingId === partner.id} onClick={() => void shortlist(partner)}>{savingId === partner.id ? 'Saving...' : 'Shortlist'}</button></div></div>
          </article>)}</div>}
        </section>
      </>}

      {message && <div className="ops-message">{message}</div>}

      {selected && <div className="ops-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setSelected(null); }}><section className="ops-modal partner-detail">
        <div className="ops-modal-head"><div><span className="ops-kicker">COMMUNITY MANAGER</span><h2>{selected.display_name}</h2></div><button onClick={() => setSelected(null)}>×</button></div>
        {selected.headline && <h3 className="partner-headline">{selected.headline}</h3>}{selected.bio && <p className="partner-bio">{selected.bio}</p>}
        <div className="partner-detail-metrics"><div><span>Communities</span><strong>{selected.community_count}</strong></div><div><span>Verified Communities</span><strong>{selected.verified_communities}</strong></div><div><span>Combined audience</span><strong>{compact(selected.combined_audience)}</strong></div><div><span>Personal Telegram</span><strong>{selected.telegram_verified ? 'Verified' : 'Not verified'}</strong></div></div>
        <div className="partner-evidence-note">Personal Telegram verification proves the manager's human identity/contact. Each Community keeps its own separate verification state.</div>
        <div className="partner-portfolio-title"><div><h3>Telegram Communities</h3><span>{communities.length} listed</span></div></div>
        {!communities.length ? <div className="ops-empty compact"><p>No Communities are publicly listed for this manager yet.</p></div> : <div className="partner-asset-list">{communities.map((community) => <article key={community.id}><div><strong>{community.name}</strong><span>{community.handle ? `@${community.handle}` : 'Telegram'}</span></div><div><strong>{compact(community.audience_size)}</strong><span>estimated audience</span></div><span className={`partner-verify ${community.verification_status}`}>{human(community.verification_status)}</span>{community.url && <a href={community.url} target="_blank" rel="noreferrer">Visit Community ↗</a>}</article>)}</div>}
        <div className="ops-form-actions"><a className="ops-button ghost" href={selected.public_url} target="_blank" rel="noreferrer">View public portfolio ↗</a><button className="ops-button primary" disabled={!canManage(project) || savingId === selected.id} onClick={() => void shortlist(selected)}>{savingId === selected.id ? 'Saving...' : 'Save to Project shortlist'}</button></div>
      </section></div>}
    </div>
  </ProductWorkspace>;
}
