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
type ProfileAnalytics = { profileViews: number; linkClicks: number; platformClicks: Array<{ platform: string; count: number }> };

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
  const [profileAnalytics, setProfileAnalytics] = useState<ProfileAnalytics | null>(null);
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

    setProfileAnalytics(null);
    void apiJson<ProfileAnalytics>(`/api/profiles/${encodeURIComponent(profile.id)}/analytics`)
      .then(setProfileAnalytics)
      .catch(() => setProfileAnalytics(null));

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
          <>
            <section className="overview-next-kpis" aria-label="Creator overview metrics">
              <article><i className="overview-next-icon profile" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg></i><div><span>PROFILE VIEWS</span><strong>{profileAnalytics?.profileViews.toLocaleString() ?? '—'}</strong><small>Public profile · all time</small></div></article>
              <article><i className="overview-next-icon clicks" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 3v14l4-4 3.5 7 2.2-1.1-3.4-6.8H18L6 3Z"/><path d="M19 4v3m-1.5-1.5h3"/></svg></i><div><span>LINK CLICKS</span><strong>{profileAnalytics?.linkClicks.toLocaleString() ?? '—'}</strong><small>Tracked by Linkary · all time</small></div></article>
              <article><i className="overview-next-icon invites" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20v-1.5a6.5 6.5 0 0 1 13 0V20M17 8h5M19.5 5.5v5"/></svg></i><div><span>INVITES AVAILABLE</span><strong>{balance?.available_credits.toLocaleString() ?? '—'}</strong><small>{balance ? `${balance.lifetime_used.toLocaleString()} used to date` : 'Invite balance unavailable'}</small></div></article>
              <article><i className="overview-next-icon projects" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V4h8v3M3 12h18M10 12v2h4v-2"/></svg></i><div><span>PROJECT WORKSPACES</span><strong>{projectCount.toLocaleString()}</strong><small>{projectCount ? 'Projects you can access' : 'No project access yet'}</small></div></article>
            </section>
            <section className="overview-next-grid">
              <article className="overview-next-panel overview-next-activity">
                <header><div><h2>Recent activity &amp; opportunities</h2><p>Your Linkary activity and available next steps.</p></div><NavLink to="/opportunities">Browse opportunities <b>→</b></NavLink></header>
                <div className="overview-next-empty"><span className="overview-next-empty-icon">↗</span><div><strong>Your workspace starts here</strong><p>Find open opportunities, update your public profile, or join a Project. New activity will appear here when it is recorded.</p></div></div>
                <div className="overview-next-shortcuts"><NavLink to="/profile"><span>01</span><div><strong>Complete your profile</strong><small>Update your identity, featured work, Media Kit and Work With Me links.</small></div><b>→</b></NavLink><NavLink to="/opportunities"><span>02</span><div><strong>Find opportunities</strong><small>Explore campaigns opened by verified Linkary Projects.</small></div><b>→</b></NavLink><NavLink to="/settings"><span>03</span><div><strong>Join a Project</strong><small>Request access to a Project workspace.</small></div><b>→</b></NavLink></div>
              </article>
              <div className="overview-next-side">
                <article className="overview-next-panel overview-next-identity">
                  <header><div><h2>Your Linkary identity</h2><p>This is the profile visitors can discover.</p></div><NavLink to="/profile">Edit profile</NavLink></header>
                  <div className="overview-next-person">{profile.avatar_url ? <img className="overview-next-avatar" src={profile.avatar_url} alt="" /> : <div className="overview-next-avatar" aria-hidden="true">{(profile.display_name || profile.username).trim().slice(0, 1).toUpperCase()}</div>}<div><strong>{profile.display_name}</strong><span>@{profile.username}</span></div><i className={profile.visibility === 'published' ? 'is-published' : ''}>{profile.visibility === 'published' ? 'Published' : 'Draft'}</i></div>
                  <a className="overview-next-public-link" href={`https://linkary.xyz/${profile.username}`} target="_blank" rel="noreferrer">Open public profile <b>↗</b></a>
                </article>
                <article className="overview-next-panel overview-next-invites">
                  <header><div><h2>Invites &amp; network</h2><p>Grow your private Linkary network.</p></div><NavLink to="/invites">Manage invites</NavLink></header>
                  <div className="overview-next-invite-balance"><span>AVAILABLE INVITES</span><strong>{balance?.available_credits.toLocaleString() ?? '—'}</strong><small>{balance ? `${balance.lifetime_used.toLocaleString()} used to date` : 'Invite balance unavailable'}</small></div>
                  <NavLink className="overview-next-map-link" to="/invites"><span className="overview-next-network-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="18" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="m10.8 7.2-4.5 8.5m6.9-8.5 4.5 8.5M7.5 18h9"/></svg></span><span><strong>Open your network map</strong><small>View your invite tree and connections</small></span><b>→</b></NavLink>
                </article>
              </div>
            </section>
            <section className="overview-next-bottom">
              <article className="overview-next-panel overview-next-links"><header><div><h2>Top-performing profile links</h2><p>Most-clicked destinations from recorded Linkary events.</p></div><NavLink to="/profile">Edit links →</NavLink></header>{profileAnalytics?.platformClicks.length ? <div className="overview-next-link-list">{profileAnalytics.platformClicks.slice(0, 5).map((item, index) => <div key={item.platform}><span>{index + 1}</span><strong>{item.platform}</strong><i><em style={{ width: `${Math.max(6, item.count / Math.max(...profileAnalytics.platformClicks.slice(0, 5).map((entry) => entry.count), 1) * 100)}%` }} /></i><b>{item.count.toLocaleString()}</b></div>)}</div> : <p className="overview-next-no-links">{profileAnalytics ? 'No tracked profile-link clicks yet.' : 'Profile-link analytics are unavailable right now.'}</p>}</article>
              <article className="overview-next-panel overview-next-setup"><header><div><h2>Make the most of Linkary</h2><p>Useful next steps for your creator workspace.</p></div></header><NavLink to="/invites"><span className="overview-next-setup-icon">＋</span><span><strong>Invite your network</strong><small>Share your invite link and grow your network.</small></span><b>→</b></NavLink><NavLink to="/wallets"><span className="overview-next-setup-icon">◇</span><span><strong>Manage wallet destinations</strong><small>{walletCount} saved destination{walletCount === 1 ? '' : 's'} on your profile.</small></span><b>→</b></NavLink><NavLink to="/settings"><span className="overview-next-setup-icon">▣</span><span><strong>Explore Project workspaces</strong><small>{projectCount} Project workspace{projectCount === 1 ? '' : 's'} available to you.</small></span><b>→</b></NavLink></article>
            </section>
          </>
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
