import { NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { useSignOut } from '@coinbase/cdp-hooks';
import FounderGrowthIntelligencePanel from './FounderGrowthIntelligencePanel';
import SuperadminWorkspace from './SuperadminWorkspace';
import './workspace-mobile.css';

export type AccountType = 'creator' | 'project';
export type ProductMe = { authenticated: boolean; user: { id: string; displayName: string; superadmin: boolean } | null };
export type ProductProfile = { id: string; profile_type: AccountType; username: string; display_name: string; avatar_url?: string | null; visibility: string; organization_id: string | null };
export type ProductStatus = { user: { id: string; displayName: string; email: string | null }; profiles: ProductProfile[] };

function readCookie(name: string): string | null {
  const match = document.cookie.split('; ').find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

const workspaceIconPaths: Record<string, string> = {
  Overview: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  Analytics: 'M4 19V5 M4 19h16 M8 16v-4 M12 16V8 M16 16V5 M20 16v-7',
  Inbox: 'M3 5h18v14H3z M3 7l9 6 9-6 M8 13h3l1 2h2l1-2h2',
  Bids: 'M8 7 13 2l7 7-5 5-7-7z M10 9 3 16 M3 16l4 4 M2 22h18',
  Opportunities: 'M12 3l2.5 5.2L20 10.5l-5.5 2.4L12 19l-2.5-6.1L4 10.5l5.5-2.3L12 3z',
  Communities: 'M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M20 8v6 M17 11h6',
  Partners: 'M8 7l4-4 4 4 M5 12l7 7 7-7 M8 7H5a2 2 0 0 0-2 2v3 M16 7h3a2 2 0 0 1 2 2v3',
  Profile: 'M20 21a8 8 0 0 0-16 0 M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10',
  Wallets: 'M4 6h15a2 2 0 0 1 2 2v11H5a2 2 0 0 1-2-2V6a3 3 0 0 1 3-3h12 M16 12h5 M17 12v.01',
  Invites: 'M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M19 8v6 M16 11h6',
  Projects: 'M3 7h18v13H3z M8 7V4h8v3 M3 12h18 M10 12v2h4v-2',
  Account: 'M12 8v4l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  Growth: 'M3 17l6-6 4 4 8-9 M15 6h6v6',
  Evidence: 'M7 3h7l5 5v13H7z M14 3v6h5 M10 15l2 2 4-4',
  Network: 'M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M5 20a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M19 20a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M10 11l-3 4 M14 11l3 4 M8 18h8',
  Team: 'M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M20 8v6 M17 11h6',
  'Plan & billing': 'M3 6h18v13H3z M3 10h18 M7 15h4',
  'Log out': 'M10 17l5-5-5-5 M15 12H3 M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7',
};

function WorkspaceIcon({ name }: { name: string }) {
  return <svg className="ops-nav-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={workspaceIconPaths[name] || workspaceIconPaths.Overview} /></svg>;
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
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const mobileMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileDrawerCloseRef = useRef<HTMLButtonElement>(null);
  const mobileDrawerWasOpenRef = useRef(false);
  const isSuperadminHost = typeof window !== 'undefined' && window.location.hostname.toLowerCase() === 'sadmin.linkary.xyz';
  const showSuperadmin = isSuperadminHost && Boolean(me.user?.superadmin);

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

  if (showSuperadmin) return <SuperadminWorkspace me={me}>{children}</SuperadminWorkspace>;

  const creatorNav = [
    ['/dashboard', 'Overview'],
    ['/analytics', 'Analytics'],
    ['/dashboard/inbox', 'Inbox'],
    ['/bids', 'Bids'],
    ['/opportunities', 'Opportunities'],
    ['/communities', 'Communities'],
    ['/partners', 'Partners'],
    ['/profile', 'Profile'],
    ['/wallets', 'Wallets'],
    ['/invites', 'Invites'],
    ['/settings', 'Projects'],
    ['/account', 'Account'],
  ];
  const projectNav = [
    ['/dashboard', 'Overview'],
    ['/analytics', 'Analytics'],
    ['/dashboard/inbox', 'Inbox'],
    ['/bids', 'Bids'],
    ['/campaigns', 'Growth'],
    ['/tracking', 'Evidence'],
    ['/partners', 'Partners'],
    ['/creators', 'Network'],
    ['/profile', 'Profile'],
    ['/wallets', 'Wallets'],
    ['/invites', 'Invites'],
    ['/settings', 'Projects'],
    ['/settings/team-invites', 'Team'],
    ['/account', 'Account'],
  ];
  const nav = profile.profile_type === 'creator' ? creatorNav : projectNav;
  const mobilePrimaryNav = profile.profile_type === 'creator'
    ? [['/dashboard', 'Overview'], ['/analytics', 'Analytics'], ['/communities', 'Communities'], ['/dashboard/inbox', 'Inbox'], ['/profile', 'Profile']]
    : [['/dashboard', 'Overview'], ['/analytics', 'Analytics'], ['/campaigns', 'Growth'], ['/dashboard/inbox', 'Inbox'], ['/profile', 'Profile']];
  const navSections = profile.profile_type === 'creator'
    ? [
      ['WORKSPACE', creatorNav.slice(0, 3)],
      ['NETWORK', creatorNav.slice(3, 6)],
      ['IDENTITY', creatorNav.slice(6, 9)],
      ['MANAGE', creatorNav.slice(9)],
    ] as const
    : [
      ['WORKSPACE', projectNav.slice(0, 3)],
      ['GROWTH', projectNav.slice(3, 5)],
      ['NETWORK', projectNav.slice(5, 7)],
      ['IDENTITY', projectNav.slice(7, 10)],
      ['MANAGE', projectNav.slice(10)],
    ] as const;
  const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
  useEffect(() => {
    if (!mobileDrawerOpen) {
      if (mobileDrawerWasOpenRef.current) mobileMenuTriggerRef.current?.focus();
      mobileDrawerWasOpenRef.current = false;
      return undefined;
    }
    mobileDrawerWasOpenRef.current = true;
    mobileDrawerCloseRef.current?.focus();
    const manageDrawerKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileDrawerOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = document.querySelectorAll<HTMLElement>('#ops-mobile-drawer a[href], #ops-mobile-drawer button:not([disabled]), #ops-mobile-drawer select:not([disabled])');
      const first = focusable.item(0);
      const last = focusable.item(focusable.length - 1);
      if (!first || !last) {
        event.preventDefault();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', manageDrawerKeys);
    return () => window.removeEventListener('keydown', manageDrawerKeys);
  }, [mobileDrawerOpen]);
  const showGrowthIntelligence = profile.profile_type === 'project' && currentPath === '/campaigns' && Boolean(profile.organization_id);
  const topNav = [
    { path: '/dashboard', label: 'Dashboard', active: currentPath === '/' || currentPath === '/dashboard' },
    { path: '/analytics', label: 'Analytics', active: currentPath === '/analytics' },
    { path: profile.profile_type === 'creator' ? '/invites' : '/creators', label: 'Network', active: currentPath === '/invites' || currentPath === '/creators' },
    { path: '/account', label: 'Settings', active: currentPath === '/account' || currentPath === '/settings' || currentPath.startsWith('/settings/') },
  ];
  const breadcrumb = currentPath === '/' || currentPath === '/dashboard'
    ? 'Dashboard'
    : currentPath === '/dashboard/inbox'
      ? 'Inbox'
      : [...nav, ['/settings/plan', 'Plan & billing'], ['/settings/team-invites', 'Team']].find(([path]) => path === currentPath)?.[1] || 'Workspace';

  return (
    <main className={`ops-shell workspace-${profile.profile_type}`} data-workspace-type={profile.profile_type}>
      <aside className="ops-sidebar">
        <a className="ops-brand" href="https://linkary.xyz" aria-label="Linkary home">
          <span className="ops-brand-mark" aria-hidden="true"><i /><i /><i /></span>
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
          {navSections.map(([section, items]) => <div className="ops-nav-section" key={section}>
            <span className="ops-nav-section-label">{section}</span>
            {items.map(([path, label]) => (
              <NavLink key={path} to={path} className={() => currentPath === path ? 'active' : ''}>
                <WorkspaceIcon name={label} />
                {label}
              </NavLink>
            ))}
          </div>)}
        </nav>
        <div className="ops-sidebar-footer">
          <NavLink to="/settings/plan" className={() => currentPath === '/settings/plan' ? 'active ops-plan-nav ops-plan-link' : 'ops-plan-nav ops-plan-link'}><WorkspaceIcon name="Plan & billing" />Plan & billing</NavLink>
          <button type="button" onClick={() => void logout()}><WorkspaceIcon name="Log out" />Log out</button>
        </div>
      </aside>
      <section className="ops-main">
        <div className="ops-mobile-header">
          <button ref={mobileMenuTriggerRef} className="ops-mobile-menu-trigger" type="button" aria-label="Open workspace menu" aria-expanded={mobileDrawerOpen} aria-controls="ops-mobile-drawer" onClick={() => setMobileDrawerOpen(true)}>
            <span aria-hidden="true"><i /><i /><i /></span>
          </button>
          <a className="ops-mobile-brand" href="https://linkary.xyz" aria-label="Linkary home">
            <span className="ops-brand-mark" aria-hidden="true"><i /><i /><i /></span><span>Linkary</span>
          </a>
          <div className="ops-mobile-header-actions">
            <NavLink className="ops-mobile-inbox-link" to="/dashboard/inbox" aria-label="Open inbox"><WorkspaceIcon name="Inbox" /></NavLink>
            <a className="ops-mobile-profile-link" href={`https://linkary.xyz/${profile.username}`} target="_blank" rel="noreferrer" aria-label="Open public profile">↗</a>
          </div>
        </div>
        {mobileDrawerOpen && <>
          <button className="ops-mobile-drawer-backdrop" type="button" aria-label="Close workspace menu" onClick={() => setMobileDrawerOpen(false)} />
          <div className="ops-mobile-drawer" id="ops-mobile-drawer" role="dialog" aria-modal="true" aria-labelledby="ops-mobile-drawer-title">
            <div className="ops-mobile-drawer-head">
              <a className="ops-mobile-brand" href="https://linkary.xyz" aria-label="Linkary home" onClick={() => setMobileDrawerOpen(false)}>
                <span className="ops-brand-mark" aria-hidden="true"><i /><i /><i /></span><span>Linkary</span>
              </a>
              <button ref={mobileDrawerCloseRef} className="ops-mobile-drawer-close" type="button" aria-label="Close workspace menu" onClick={() => setMobileDrawerOpen(false)}>×</button>
            </div>
            <h2 id="ops-mobile-drawer-title" className="ops-mobile-drawer-context">{profile.profile_type === 'creator' ? 'Creator workspace' : 'Project workspace'}</h2>
            {status.profiles.length > 1 && <div className="ops-view-as ops-mobile-view-as">
              <label htmlFor="product-profile-mobile">VIEW AS</label>
              <select id="product-profile-mobile" value={profile.id} onChange={(event) => onProfileChange(event.target.value)}>
                {status.profiles.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}
              </select>
              <div className="ops-workspace-meta"><span>{profile.profile_type === 'creator' ? 'Creator workspace' : 'Project workspace'}</span><small>{profile.profile_type === 'creator' ? 'Personal identity' : 'Workspace member'}</small></div>
            </div>}
            <nav className="ops-mobile-drawer-nav" aria-label="All workspace pages">
              {navSections.map(([section, items]) => <div className="ops-mobile-drawer-section" key={`mobile-${section}`}>
                <span className="ops-mobile-drawer-label">{section}</span>
                {items.map(([path, label]) => <NavLink key={`drawer-${path}`} to={path} className={() => currentPath === path ? 'active' : ''} onClick={() => setMobileDrawerOpen(false)}>
                  <WorkspaceIcon name={label} />{label}
                </NavLink>)}
              </div>)}
            </nav>
            <div className="ops-mobile-drawer-footer">
              <NavLink to="/settings/plan" className={() => currentPath === '/settings/plan' ? 'active' : ''} onClick={() => setMobileDrawerOpen(false)}><WorkspaceIcon name="Plan & billing" />Plan &amp; billing</NavLink>
              <button type="button" onClick={() => void logout()}><WorkspaceIcon name="Log out" />Log out</button>
            </div>
          </div>
        </>}
        <header className="ops-topbar">
          <div className="ops-topbar-context"><span>Workspace</span><i aria-hidden="true">/</i><strong>{breadcrumb}</strong></div>
          <nav className="ops-topbar-nav" aria-label="Workspace shortcuts">
            {topNav.map((item) => <NavLink key={item.label} to={item.path} className={item.active ? 'active' : ''} aria-current={item.active ? 'page' : undefined}>{item.label}</NavLink>)}
          </nav>
          <div className="ops-topbar-actions">
            <a className="ops-public-profile-link" href={`https://linkary.xyz/${profile.username}`} target="_blank" rel="noreferrer">Public Profile ↗</a>
            <NavLink className="ops-notification-link" to="/dashboard/inbox" aria-label="Open inbox"><WorkspaceIcon name="Inbox" /></NavLink>
            <div className="ops-topbar-identity"><span className="ops-topbar-avatar" aria-hidden="true">{profile.display_name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span><span><strong>{profile.username}</strong><small>{profile.profile_type === 'creator' ? 'Pro Creator' : 'Project workspace'}</small></span></div>
          </div>
          <details className="ops-mobile-account-menu">
            <summary aria-label="Open workspace menu">More</summary>
            <div className="ops-mobile-menu-panel">
              <span className="ops-mobile-menu-label">WORKSPACE</span>
              {nav.map(([path, label]) => (
                <NavLink key={`mobile-${path}`} to={path} className={() => currentPath === path ? 'active' : ''}>
                  {label}
                </NavLink>
              ))}
              <NavLink to="/settings/plan" className={() => currentPath === '/settings/plan' ? 'active' : ''}>Plan & billing</NavLink>
              <button type="button" onClick={() => void logout()}>Log out</button>
            </div>
          </details>
        </header>
        <div className={`ops-page${currentPath === '/analytics' ? ' analytics-workspace-page' : ''}${currentPath === '/' || currentPath === '/dashboard' ? ' dashboard-workspace-page' : ''}${currentPath === '/dashboard/inbox' ? ' inbox-workspace-page' : ''}${currentPath === '/bids' ? ' bids-workspace-page' : ''}${currentPath === '/opportunities' ? ' creator-opportunities-workspace-page' : ''}${currentPath === '/communities' ? ' community-workspace-page' : ''}${currentPath === '/partners' ? ' partners-workspace-page' : ''}`}>
          {children}
          {showGrowthIntelligence && profile.organization_id && <FounderGrowthIntelligencePanel organizationId={profile.organization_id} />}
        </div>
        <nav className="ops-mobile-bottom-nav" aria-label="Primary mobile navigation">
          {mobilePrimaryNav.map(([path, label]) => <NavLink key={`bottom-${path}`} to={path} className={() => currentPath === path ? 'active' : ''} aria-current={currentPath === path ? 'page' : undefined}>
            <WorkspaceIcon name={label} /><span>{label}</span>
          </NavLink>)}
        </nav>
      </section>
    </main>
  );
}

export function useActiveProductProfile(status: ProductStatus) {
  const saved = typeof window !== 'undefined' ? window.localStorage.getItem('linkary.active.profile') : null;
  const creatorFirst = status.profiles.find((profile) => profile.profile_type === 'creator') || status.profiles[0];
  return { saved, creatorFirst };
}
