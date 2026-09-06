import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import AppV2 from './AppV2';
import TrackingExperience from './TrackingExperience';
import NetworkExperience from './NetworkExperience';
import InviteExperience from './InviteExperience';
import WalletExperience from './WalletExperience';
import BillingExperience from './BillingExperience';
import DashboardExperience from './DashboardExperience';
import GrowthExperience from './GrowthExperience';
import PartnerDiscoveryExperience from './PartnerDiscoveryExperience';
import ProfileAccessExperience from './ProfileAccessExperience';
import ProjectExperienceBeta from './ProjectExperienceBeta';
import InboxExperience from './InboxExperience';
import AdminReadinessExperience from './AdminReadinessExperience';
import AdminCommunityVerificationExperience from './AdminCommunityVerificationExperience';
import AdminCommercialExperience from './AdminCommercialExperience';
import AdminCouponsExperience from './AdminCouponsExperience';
import CreatorOpportunitiesExperience from './CreatorOpportunitiesExperience';
import CommunityManagerSessionGate from './CommunityManagerSessionGate';
import ProjectTeamInvitesExperience, { TeamInviteAcceptExperience } from './ProjectTeamInvitesExperience';
import type { ProductMe, ProductStatus } from './ProductWorkspace';

class RequestError extends Error {
  constructor(readonly status: number) {
    super(`Request failed with status ${status}`);
  }
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin' });
  if (!response.ok) throw new RequestError(response.status);
  return response.json() as Promise<T>;
}

function requestGateState(error: unknown): GateState {
  if (error instanceof RequestError && error.status === 401) return 'legacy';
  if (error instanceof RequestError && error.status === 403) return 'forbidden';
  return 'unavailable';
}

function UnavailableScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="loading-screen" role="status" aria-live="polite">
      <div>
        <h1>Linkary is temporarily unavailable</h1>
        <p>We could not load this workspace. Your current page has been preserved.</p>
        <button type="button" className="btn primary" onClick={onRetry}>Retry</button>
      </div>
    </main>
  );
}

function ForbiddenScreen() {
  return (
    <main className="loading-screen" role="status" aria-live="polite">
      <div>
        <h1>Access unavailable</h1>
        <p>Your account does not have access to this Linkary workspace or action.</p>
        <a className="btn primary" href="/">Return to Linkary</a>
      </div>
    </main>
  );
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
  | 'billing'
  | 'projects'
  | 'team-invites'
  | 'admin-readiness'
  | 'admin-community-verifications'
  | 'admin-commercial'
  | 'admin-coupons';

type GateState = 'loading' | 'legacy' | 'forbidden' | 'unavailable' | 'ready';

function ProductGate({ experience }: { experience: Experience }) {
  const [state, setState] = useState<GateState>('loading');
  const [me, setMe] = useState<ProductMe | null>(null);
  const [status, setStatus] = useState<ProductStatus | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
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
      } catch (error) {
        if (cancelled) return;
        setState(requestGateState(error));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [retryKey]);

  if (state === 'legacy') return <AppV2 />;
  if (state === 'forbidden') return <ForbiddenScreen />;
  if (state === 'unavailable') return <UnavailableScreen onRetry={() => setRetryKey((value) => value + 1)} />;
  if (state === 'ready' && me && status) {
    if (experience === 'dashboard') return <DashboardExperience me={me} status={status} />;
    if (experience === 'inbox') return <InboxExperience me={me} status={status} />;
    if (experience === 'opportunities') return <CreatorOpportunitiesExperience me={me} status={status} />;
    if (experience === 'communities') return <CommunityManagerSessionGate me={me} status={status} />;
    if (experience === 'growth') return <GrowthExperience me={me} status={status} />;
    if (experience === 'network') return <NetworkExperience me={me} status={status} />;
    if (experience === 'partners') return <PartnerDiscoveryExperience me={me} status={status} />;
    if (experience === 'profile') return <ProfileAccessExperience me={me} status={status} />;
    if (experience === 'invites') return <InviteExperience me={me} status={status} />;
    if (experience === 'wallets') return <WalletExperience me={me} status={status} />;
    if (experience === 'billing') return <BillingExperience me={me} status={status} />;
    if (experience === 'projects') return <ProjectExperienceBeta me={me} status={status} />;
    if (experience === 'team-invites') return <ProjectTeamInvitesExperience me={me} status={status} />;
    if (experience === 'admin-readiness' || experience === 'admin-community-verifications' || experience === 'admin-commercial' || experience === 'admin-coupons') {
      if (!me.user?.superadmin) return <ForbiddenScreen />;
      if (experience === 'admin-community-verifications') return <AdminCommunityVerificationExperience me={me} status={status} />;
      if (experience === 'admin-commercial') return <AdminCommercialExperience me={me} status={status} />;
      if (experience === 'admin-coupons') return <AdminCouponsExperience />;
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
  const [state, setState] = useState<GateState>('loading');
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    void getJson<ProductMe>('/api/auth/me')
      .then((result) => { if (!cancelled) setState(result.authenticated ? 'ready' : 'legacy'); })
      .catch((error: unknown) => {
        if (!cancelled) setState(requestGateState(error));
      });
    return () => { cancelled = true; };
  }, [retryKey]);

  if (state === 'legacy') return <AppV2 />;
  if (state === 'forbidden') return <ForbiddenScreen />;
  if (state === 'unavailable') return <UnavailableScreen onRetry={() => setRetryKey((value) => value + 1)} />;
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
  if (location.pathname === '/settings/plan') return <ProductGate experience="billing" />;
  if (location.pathname === '/settings/team-invites') return <ProductGate experience="team-invites" />;
  if (location.pathname === '/settings') return <ProductGate experience="projects" />;
  if (location.pathname === '/admin/readiness') return <ProductGate experience="admin-readiness" />;
  if (location.pathname === '/admin/community-verifications') return <ProductGate experience="admin-community-verifications" />;
  if (location.pathname === '/admin/commercial') return <ProductGate experience="admin-commercial" />;
  if (location.pathname === '/admin/coupons') return <ProductGate experience="admin-coupons" />;
  return <AppV2 />;
}
