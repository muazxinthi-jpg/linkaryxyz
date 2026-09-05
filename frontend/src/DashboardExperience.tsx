import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import FounderGrowthIntelligencePanel from './FounderGrowthIntelligencePanel';
import { ProductWorkspace, type ProductMe, type ProductProfile, type ProductStatus } from './ProductWorkspace';

type InviteBalance = {
  owner_type: 'profile' | 'organization';
  owner_id: string;
  available_credits: number;
  lifetime_used: number;
};
type Project = { id: string; name: string; status: string; verification_status: string; role: string };

async function apiJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin' });
  if (!response.ok) throw new Error('Request failed');
  return response.json() as Promise<T>;
}

export default function DashboardExperience({ me, status }: { me: ProductMe; status: ProductStatus }) {
  const creatorFirst = status.profiles.find((item) => item.profile_type === 'creator') || status.profiles[0];
  const stored = window.localStorage.getItem('linkary.active.profile');
  const [profileId, setProfileId] = useState(
    stored && status.profiles.some((item) => item.id === stored) ? stored : creatorFirst?.id || '',
  );
  const profile = status.profiles.find((item) => item.id === profileId) || creatorFirst;
  const [balance, setBalance] = useState<InviteBalance | null>(null);
  const [linkClicks, setLinkClicks] = useState<number | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [projectCount, setProjectCount] = useState(0);
  const [walletCount, setWalletCount] = useState(0);

  function changeProfile(id: string) {
    setProfileId(id);
    window.localStorage.setItem('linkary.active.profile', id);
  }

  useEffect(() => {
    if (!profile) return;
    setProject(null);
    setProjectCount(0);

    void apiJson<{ balances: InviteBalance[] }>('/api/invites/balances')
      .then((result) => {
        const ownerType = profile.profile_type === 'creator' ? 'profile' : 'organization';
        const ownerId = profile.profile_type === 'creator' ? profile.id : profile.organization_id;
        setBalance(result.balances.find((item) => item.owner_type === ownerType && item.owner_id === ownerId) || null);
      })
      .catch(() => setBalance(null));

    void apiJson<{ linkClicks: number }>(`/api/profiles/${encodeURIComponent(profile.id)}/analytics`)
      .then((result) => setLinkClicks(result.linkClicks))
      .catch(() => setLinkClicks(null));

    void apiJson<{ destinations: Array<unknown> }>(`/api/profile-wallets?profileId=${encodeURIComponent(profile.id)}`)
      .then((result) => setWalletCount(result.destinations.length))
      .catch(() => setWalletCount(0));

    void apiJson<{ organizations: Project[] }>('/api/organizations')
      .then((result) => {
        setProjectCount(result.organizations.length);
        const selected = profile.organization_id
          ? result.organizations.find((item) => item.id === profile.organization_id)
          : null;
        if (selected) setProject(selected);
      })
      .catch(() => undefined);
  }, [profileId]);

  if (!profile) return null;
  const projectMode = profile.profile_type === 'project';

  return (
    <ProductWorkspace me={me} status={status} profile={profile as ProductProfile} onProfileChange={changeProfile}>
      <div className="ops-stack dashboard-next">
        <div className="dashboard-next-hero">
          <div>
            <span className="ops-kicker">OVERVIEW</span>
            <h1>{projectMode ? profile.display_name : `Welcome, ${status.user.displayName || profile.display_name}.`}</h1>
            <p>{projectMode ? 'See tracked growth, distribution partners and attributable outcomes across this Project.' : 'Build your identity, find campaign opportunities and turn accepted work into evidence that compounds.'}</p>
          </div>
          <a className="ops-button secondary" href={`https://linkary.xyz/${profile.username}`} target="_blank" rel="noreferrer">Public profile ↗</a>
        </div>

        {projectMode && project && project.verification_status !== 'verified_x' && (
          <section className="ops-callout verification">
            <div>
              <span className="ops-kicker">ACTION REQUIRED</span>
              <h3>Verify {project.name} with its official X account</h3>
              <p>Project growth tracking stays locked until the Project identity is verified.</p>
            </div>
            <NavLink className="ops-button secondary" to="/settings">Open Projects</NavLink>
          </section>
        )}

        {projectMode && profile.organization_id ? (
          <FounderGrowthIntelligencePanel organizationId={profile.organization_id} variant="overview" />
        ) : (
          <section className="dashboard-next-metrics">
            <>
              <article><span>PROFILE</span><strong>{profile.visibility === 'published' ? 'Published' : 'Draft'}</strong><small>{linkClicks === null ? 'Public identity' : `${linkClicks} link click${linkClicks === 1 ? '' : 's'}`}</small></article>
              <article><span>INVITES</span><strong>{balance?.available_credits ?? 'N/A'}</strong><small>{balance ? `${balance.lifetime_used} used` : 'Network access'}</small></article>
              <article><span>WALLETS</span><strong>{walletCount}</strong><small>Additional destinations</small></article>
              <article><span>PROJECTS</span><strong>{projectCount}</strong><small>{projectCount ? 'Workspaces you can access' : 'Connect to a Project'}</small></article>
            </>
          </section>
        )}

        {projectMode ? (
          <section className="dashboard-next-actions">
            <NavLink to="/campaigns"><span>01</span><div><strong>Growth</strong><small>Track campaigns wherever they are already running.</small></div><b>→</b></NavLink>
            <NavLink to="/partners"><span>02</span><div><strong>Partners</strong><small>Find Community Managers, KOL Managers and the audiences they represent.</small></div><b>→</b></NavLink>
            <NavLink to="/tracking"><span>03</span><div><strong>Evidence</strong><small>Inspect tracking links, outcomes and attributable value.</small></div><b>→</b></NavLink>
            <NavLink to="/wallets"><span>04</span><div><strong>Wallets</strong><small>Set EVM and Solana reward destinations.</small></div><b>→</b></NavLink>
          </section>
        ) : (
          <section className="dashboard-next-actions">
            <NavLink to="/profile"><span>01</span><div><strong>Complete your profile</strong><small>Show your identity, featured work, Media Kit and Work With Me links.</small></div><b>→</b></NavLink>
            <NavLink to="/opportunities"><span>02</span><div><strong>Find opportunities</strong><small>Apply to campaigns opened by verified Linkary Projects.</small></div><b>→</b></NavLink>
            <NavLink to="/settings"><span>03</span><div><strong>Join a Project</strong><small>Request a role in a verified Project and switch workspaces when approved.</small></div><b>→</b></NavLink>
            <NavLink to="/invites"><span>04</span><div><strong>Invite your network</strong><small>Use your Creator invites and keep every referral attributable.</small></div><b>→</b></NavLink>
          </section>
        )}
      </div>
    </ProductWorkspace>
  );
}
