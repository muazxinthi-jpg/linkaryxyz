import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import AppV2 from './AppV2';
import TrackingExperience from './TrackingExperience';
import NetworkExperience from './NetworkExperience';
import InviteExperience from './InviteExperience';
import WalletExperience from './WalletExperience';
import DashboardExperience from './DashboardExperience';
import GrowthExperience from './GrowthExperience';
import PartnerDiscoveryExperience from './PartnerDiscoveryExperience';
import ProfileExperienceIdentityV1 from './ProfileExperienceIdentityV1';
import ProjectExperienceBeta from './ProjectExperienceBeta';
import InboxExperience from './InboxExperience';
import AdminReadinessExperience from './AdminReadinessExperience';
import AdminCommunityVerificationExperience from './AdminCommunityVerificationExperience';
import CreatorOpportunitiesExperience from './CreatorOpportunitiesExperience';
import CommunityManagerExperience from './CommunityManagerExperience';
import ProjectTeamInvitesExperience, { TeamInviteAcceptExperience } from './ProjectTeamInvitesExperience';
import type { ProductMe, ProductStatus } from './ProductWorkspace';

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin' });
  if (!response.ok) throw new Error('Request failed');
  return response.json() as Promise<T>;
}

type Experience =
  | 'dashboard'
  | 'inbox'
  | 'opportunities'
  | 'communities'
  | 'growth'
  | 'operations'
  | 'network'
  | 'partners'
  | 'profile'
  | 'invites'
  | 'wallets'
  | 'projects'
  | 'team-invites'
  | 'admin-readiness'
  | 'admin-community-verifications';

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
    if (experience === 'opportunities') return <CreatorOpportunitiesExperience me={me} status={status} />;
    if (experience === 'communities') return <CommunityManagerExperience me={me} status={status} />;
    if (experience === 'growth') return <GrowthExperience me={me} status={status} />;
    if (experience === 'network') return <NetworkExperience me={me} status={status} />;
    if (experience === 'partners') return <PartnerDiscoveryExperience me={me} status={status} />;
    if (experience === 'profile') return <ProfileExperienceIdentityV1 me={me} status={status} />;
    if (experience === 'invites') return <InviteExperience me={me} status={status} />;
    if (experience === 'wallets') return <WalletExperience me={me} status={status} />;
    if (experience === 'projects') return <ProjectExperienceBeta me={me} status={status} />;
    if (experience === 'team-invites') return <ProjectTeamInvitesExperience me={me} status={status} />;
    if (experience === 'admin-readiness' || experience === 'admin-community-verifications') {
      if (!me.user?.superadmin) return <AppV2 />;
      if (experience === 'admin-community-verifications') return <AdminCommunityVerificationExperience me={me} status={status} />;
      return <AdminReadinessExperience me={me} status={status} />;
    }
    return <TrackingExperience me={me} status={status} />;
  }
  return (
    <main className="loading-screen">
      <div className="spinner" />
      <p>Opening Linkary</p>
    </main>
  );
}

function TeamInviteGate() {
  const [state, setState] = useState<'loading' | 'legacy' | 'ready'>('loading');

  useEffect(() => {
    let cancelled = false;
    void getJson<ProductMe>('/api/auth/me')
      .then((result) => { if (!cancelled) setState(result.authenticated ? 'ready' : 'legacy'); })
      .catch(() => { if (!cancelled) setState('legacy'); });
    return () => { cancelled = true; };
  }, []);

  if (state === 'legacy') return <AppV2 />;
  if (state === 'ready') return <TeamInviteAcceptExperience />;
  return <main className="loading-screen"><div className="spinner" /><p>Opening team invitation</p></main>;
}

export default function AppV3() {
  const location = useLocation();
  if (location.pathname === '/team-invite') return <TeamInviteGate />;
  if (location.pathname === '/dashboard' || location.pathname === '/') return <ProductGate experience="dashboard" />;
  if (location.pathname === '/dashboard/inbox') return <ProductGate experience="inbox" />;
  if (location.pathname === '/opportunities') return <ProductGate experience="opportunities" />;
  if (location.pathname === '/communities') return <ProductGate experience="communities" />;
  if (location.pathname === '/campaigns') return <ProductGate experience="growth" />;
  if (location.pathname === '/tracking') return <ProductGate experience="operations" />;
  if (location.pathname === '/partners') return <ProductGate experience="partners" />;
  if (location.pathname === '/creators') return <ProductGate experience="network" />;
  if (location.pathname === '/profile') return <ProductGate experience="profile" />;
  if (location.pathname === '/invites') return <ProductGate experience="invites" />;
  if (location.pathname === '/wallets') return <ProductGate experience="wallets" />;
  if (location.pathname === '/settings/team-invites') return <ProductGate experience="team-invites" />;
  if (location.pathname === '/settings') return <ProductGate experience="projects" />;
  if (location.pathname === '/admin/readiness') return <ProductGate experience="admin-readiness" />;
  if (location.pathname === '/admin/community-verifications') return <ProductGate experience="admin-community-verifications" />;
  return <AppV2 />;
}
