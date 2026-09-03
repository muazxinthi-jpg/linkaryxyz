import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import AppV2 from './AppV2';
import { OperationsExperience } from './OperationsExperience';
import NetworkExperience from './NetworkExperience';
import InviteExperience from './InviteExperience';
import WalletExperience from './WalletExperience';
import DashboardExperience from './DashboardExperience';
import GrowthExperience from './GrowthExperience';
import PartnerDirectoryExperience from './PartnerDirectoryExperience';
import ProfileExperienceBeta from './ProfileExperienceBeta';
import ProjectExperienceBeta from './ProjectExperienceBeta';
import InboxExperience from './InboxExperience';
import AdminReadinessExperience from './AdminReadinessExperience';
import type { ProductMe, ProductStatus } from './ProductWorkspace';

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin' });
  if (!response.ok) throw new Error('Request failed');
  return response.json() as Promise<T>;
}

type Experience =
  | 'dashboard'
  | 'inbox'
  | 'growth'
  | 'operations'
  | 'network'
  | 'partners'
  | 'profile'
  | 'invites'
  | 'wallets'
  | 'projects'
  | 'admin-readiness';

function ProductGate({ experience }: { experience: Experience }) {
  const [state, setState] = useState<'loading' | 'legacy' | 'ready'>('loading');
  const [me, setMe] = useState<ProductMe | null>(null);
  const [status, setStatus] = useState<ProductStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const nextMe = await getJson<ProductMe>('/api/auth/me');
        if (cancelled) return;
        if (!nextMe.authenticated) {
          setState('legacy');
          return;
        }
        const nextStatus = await getJson<ProductStatus>('/api/onboarding/status');
        if (cancelled) return;
        if (!nextStatus.profiles?.length) {
          setState('legacy');
          return;
        }
        setMe(nextMe);
        setStatus(nextStatus);
        setState('ready');
      } catch {
        if (!cancelled) setState('legacy');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === 'legacy') return <AppV2 />;
  if (state === 'ready' && me && status) {
    if (experience === 'dashboard') return <DashboardExperience me={me} status={status} />;
    if (experience === 'inbox') return <InboxExperience me={me} status={status} />;
    if (experience === 'growth') return <GrowthExperience me={me} status={status} />;
    if (experience === 'network') return <NetworkExperience me={me} status={status} />;
    if (experience === 'partners') return <PartnerDirectoryExperience me={me} status={status} />;
    if (experience === 'profile') return <ProfileExperienceBeta me={me} status={status} />;
    if (experience === 'invites') return <InviteExperience me={me} status={status} />;
    if (experience === 'wallets') return <WalletExperience me={me} status={status} />;
    if (experience === 'projects') return <ProjectExperienceBeta me={me} status={status} />;
    if (experience === 'admin-readiness') {
      if (!me.user?.superadmin) return <AppV2 />;
      return <AdminReadinessExperience me={me} status={status} />;
    }
    return <OperationsExperience me={me} status={status} />;
  }
  return (
    <main className="loading-screen">
      <div className="spinner" />
      <p>Opening Linkary</p>
    </main>
  );
}

export default function AppV3() {
  const location = useLocation();
  if (location.pathname === '/dashboard' || location.pathname === '/') return <ProductGate experience="dashboard" />;
  if (location.pathname === '/dashboard/inbox') return <ProductGate experience="inbox" />;
  if (location.pathname === '/campaigns') return <ProductGate experience="growth" />;
  if (location.pathname === '/tracking') return <ProductGate experience="operations" />;
  if (location.pathname === '/partners') return <ProductGate experience="partners" />;
  if (location.pathname === '/creators' || location.pathname === '/communities') return <ProductGate experience="network" />;
  if (location.pathname === '/profile') return <ProductGate experience="profile" />;
  if (location.pathname === '/invites') return <ProductGate experience="invites" />;
  if (location.pathname === '/wallets') return <ProductGate experience="wallets" />;
  if (location.pathname === '/settings') return <ProductGate experience="projects" />;
  if (location.pathname === '/admin/readiness') return <ProductGate experience="admin-readiness" />;
  return <AppV2 />;
}
