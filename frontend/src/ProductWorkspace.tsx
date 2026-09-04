import { NavLink, useNavigate } from 'react-router-dom';
import { useSignOut } from '@coinbase/cdp-hooks';
import './workspace-mobile.css';

export type AccountType = 'creator' | 'project';
export type ProductMe = { authenticated: boolean; user: { id: string; displayName: string; superadmin: boolean } | null };
export type ProductProfile = { id: string; profile_type: AccountType; username: string; display_name: string; visibility: string; organization_id: string | null };
export type ProductStatus = { user: { id: string; displayName: string; email: string | null }; profiles: ProductProfile[] };

function readCookie(name: string): string | null {
  const match = document.cookie.split('; ').find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

export function ProductWorkspace({
  me,
  status,
  profile,
  onProfileChange,
  children,
}: {
  me: ProductMe;
  status: ProductStatus;
  profile: ProductProfile;
  onProfileChange: (id: string) => void;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const { signOut } = useSignOut();

  async function logout() {
    try {
      const csrf = readCookie('__Host-linkary_csrf');
      if (csrf) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'x-csrf-token': csrf },
          credentials: 'same-origin',
        });
      }
    } catch {}
    try {
      await signOut();
    } catch {}
    navigate('/login', { replace: true });
    window.location.reload();
  }

  const creatorNav = [
    ['/dashboard', 'Overview'],
    ['/dashboard/inbox', 'Inbox'],
    ['/opportunities', 'Opportunities'],
    ['/communities', 'Communities'],
    ['/partners', 'Partners'],
    ['/profile', 'Profile'],
    ['/wallets', 'Wallets'],
    ['/invites', 'Invites'],
    ['/settings', 'Projects'],
  ];
  const projectNav = [
    ['/dashboard', 'Overview'],
    ['/dashboard/inbox', 'Inbox'],
    ['/campaigns', 'Growth'],
    ['/tracking', 'Evidence'],
    ['/partners', 'Partners'],
    ['/profile', 'Profile'],
    ['/wallets', 'Wallets'],
    ['/invites', 'Invites'],
    ['/settings', 'Projects'],
    ['/settings/team-invites', 'Team'],
  ];
  const nav = profile.profile_type === 'creator' ? creatorNav : projectNav;
  const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';

  return (
    <main className={`ops-shell workspace-${profile.profile_type}`} data-workspace-type={profile.profile_type}>
      <aside className="ops-sidebar">
        <a className="ops-brand" href="https://linkary.xyz" aria-label="Linkary home">
          <img src="/assets/brand/linkary-icon-black.png" alt="" />
          <span>Linkary</span>
        </a>
        <div className="ops-view-as">
          <label htmlFor="product-profile">VIEW AS</label>
          <select id="product-profile" value={profile.id} onChange={(event) => onProfileChange(event.target.value)}>
            {status.profiles.map((item) => (
              <option key={item.id} value={item.id}>{item.display_name}</option>
            ))}
          </select>
          <div className="ops-workspace-meta" aria-live="polite">
            <span>{profile.profile_type === 'creator' ? 'Creator workspace' : 'Project workspace'}</span>
            <small>{profile.profile_type === 'creator' ? 'Personal identity' : 'Workspace member'}</small>
          </div>
        </div>
        <nav className="ops-nav">
          {nav.map(([path, label]) => (
            <NavLink key={path} to={path} className={() => currentPath === path ? 'active' : ''}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="ops-sidebar-footer">
          {me.user?.superadmin && (
            <section className="ops-admin-nav" aria-label="Superadmin tools">
              <span>SUPERADMIN</span>
              <NavLink to="/admin/readiness" className={() => currentPath === '/admin/readiness' ? 'active' : ''}>Beta readiness</NavLink>
              <NavLink to="/admin/community-verifications" className={() => currentPath === '/admin/community-verifications' ? 'active' : ''}>Community reviews</NavLink>
              <NavLink to="/admin" className={() => currentPath === '/admin' ? 'active' : ''}>Admin review</NavLink>
            </section>
          )}
          <button type="button" onClick={() => void logout()}>Log out</button>
        </div>
      </aside>
      <section className="ops-main">
        <header className="ops-topbar">
          <div><strong>{profile.display_name}</strong><span>/{profile.username}</span></div>
          <a className="ops-public-profile-link" href={`https://linkary.xyz/${profile.username}`} target="_blank" rel="noreferrer">Public profile ↗</a>
          <details className="ops-mobile-account-menu">
            <summary aria-label="Open workspace menu">More</summary>
            <div className="ops-mobile-menu-panel">
              <span className="ops-mobile-menu-label">WORKSPACE</span>
              {nav.map(([path, label]) => (
                <NavLink key={`mobile-${path}`} to={path} className={() => currentPath === path ? 'active' : ''}>
                  {label}
                </NavLink>
              ))}
              {me.user?.superadmin && (
                <>
                  <span className="ops-mobile-menu-label">SUPERADMIN</span>
                  <NavLink to="/admin/readiness" className={() => currentPath === '/admin/readiness' ? 'active' : ''}>Beta readiness</NavLink>
                  <NavLink to="/admin/community-verifications" className={() => currentPath === '/admin/community-verifications' ? 'active' : ''}>Community reviews</NavLink>
                  <NavLink to="/admin" className={() => currentPath === '/admin' ? 'active' : ''}>Admin review</NavLink>
                </>
              )}
              <button type="button" onClick={() => void logout()}>Log out</button>
            </div>
          </details>
        </header>
        <div className="ops-page">{children}</div>
      </section>
    </main>
  );
}

export function useActiveProductProfile(status: ProductStatus) {
  const saved = typeof window !== 'undefined' ? window.localStorage.getItem('linkary.active.profile') : null;
  const creatorFirst = status.profiles.find((profile) => profile.profile_type === 'creator') || status.profiles[0];
  return { saved, creatorFirst };
}
