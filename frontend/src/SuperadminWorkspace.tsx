import { NavLink, useNavigate } from 'react-router-dom';
import { useSignOut } from '@coinbase/cdp-hooks';
import type { ProductMe } from './ProductWorkspace';

function readCookie(name: string): string | null {
  const match = document.cookie.split('; ').find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

const adminSections = [
  ['OPERATIONS', [
    ['/admin/readiness', 'Beta readiness'],
    ['/admin/community-verifications', 'Community reviews'],
  ]],
  ['COMMERCIAL', [
    ['/admin/commercial', 'Commercial accounts'],
    ['/admin/coupons', 'Coupons'],
  ]],
] as const;

export default function SuperadminWorkspace({ me, children }: { me: ProductMe; children: React.ReactNode }) {
  const navigate = useNavigate();
  const { signOut } = useSignOut();
  const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';

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
    try { await signOut(); } catch {}
    navigate('/login', { replace: true });
    window.location.reload();
  }

  return (
    <main className="ops-shell sadmin-workspace" data-workspace-type="superadmin">
      <aside className="ops-sidebar">
        <a className="ops-brand" href="https://linkary.xyz" aria-label="Linkary home">
          <img src="/assets/brand/linkary-icon-black.png" alt="" />
          <span>Linkary</span>
        </a>

        <div className="sadmin-workspace-identity">
          <span>SUPERADMIN</span>
          <strong>Control console</strong>
          <small>Restricted Linkary operations</small>
        </div>

        <nav className="ops-nav" aria-label="Superadmin navigation">
          {adminSections.map(([section, items]) => (
            <div className="ops-nav-section" key={section}>
              <span className="ops-nav-section-label">{section}</span>
              {items.map(([path, label]) => (
                <NavLink key={path} to={path} className={() => currentPath === path ? 'active' : ''}>{label}</NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="ops-sidebar-footer">
          <a href="https://app.linkary.xyz">Open Linkary app ↗</a>
          <button type="button" onClick={() => void logout()}>Log out</button>
        </div>
      </aside>

      <section className="ops-main">
        <header className="ops-topbar sadmin-topbar">
          <div><strong>Superadmin Console</strong><span>{me.user?.displayName || 'Authorized operator'}</span></div>
          <span className="sadmin-topbar-badge">RESTRICTED</span>
          <details className="ops-mobile-account-menu">
            <summary aria-label="Open Superadmin menu">Menu</summary>
            <div className="ops-mobile-menu-panel">
              <span className="ops-mobile-menu-label">SUPERADMIN</span>
              {adminSections.flatMap(([, items]) => items).map(([path, label]) => (
                <NavLink key={`mobile-${path}`} to={path} className={() => currentPath === path ? 'active' : ''}>{label}</NavLink>
              ))}
              <a href="https://app.linkary.xyz">Open Linkary app ↗</a>
              <button type="button" onClick={() => void logout()}>Log out</button>
            </div>
          </details>
        </header>
        <div className="ops-page">{children}</div>
      </section>
    </main>
  );
}
