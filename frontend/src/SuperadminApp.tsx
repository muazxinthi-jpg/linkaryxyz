import { Navigate, useLocation } from 'react-router-dom';
import AdminAiGovernanceExperience from './AdminAiGovernanceExperience';
import AdminCommercialExperience from './AdminCommercialExperience';
import AdminCommunityVerificationExperience from './AdminCommunityVerificationExperience';
import AdminCouponsExperience from './AdminCouponsExperience';
import AdminCreatorAccessExperience from './AdminCreatorAccessExperience';
import AdminNetworkRewardsExperience from './AdminNetworkRewardsExperience';
import AdminPlatformIntelligenceExperience from './AdminPlatformIntelligenceExperience';
import AdminReadinessExperience from './AdminReadinessExperience';
import SuperadminWorkspace from './SuperadminWorkspace';
import type { ProductMe, ProductStatus } from './ProductWorkspace';

function compatibilityStatus(me: ProductMe): ProductStatus {
  const userId = me.user?.id || 'superadmin';
  return {
    user: {
      id: userId,
      displayName: me.user?.displayName || 'Superadmin',
      email: null,
    },
    profiles: [{
      id: 'superadmin-console',
      profile_type: 'creator',
      username: 'superadmin',
      display_name: 'Superadmin',
      visibility: 'private',
      organization_id: null,
    }],
  };
}

export default function SuperadminApp({ me }: { me: ProductMe }) {
  const location = useLocation();
  const status = compatibilityStatus(me);

  if (location.pathname === '/admin/creator-access') return <AdminCreatorAccessExperience me={me} />;
  if (location.pathname === '/admin/community-verifications') return <AdminCommunityVerificationExperience me={me} status={status} />;
  if (location.pathname === '/admin/commercial') return <AdminCommercialExperience me={me} status={status} />;
  if (location.pathname === '/admin/coupons') return <SuperadminWorkspace me={me}><AdminCouponsExperience /></SuperadminWorkspace>;
  if (location.pathname === '/admin/ai-governance') return <SuperadminWorkspace me={me}><AdminAiGovernanceExperience /></SuperadminWorkspace>;
  if (location.pathname === '/admin/platform-intelligence') return <SuperadminWorkspace me={me}><AdminPlatformIntelligenceExperience /></SuperadminWorkspace>;
  if (location.pathname === '/admin/network-rewards') return <SuperadminWorkspace me={me}><AdminNetworkRewardsExperience /></SuperadminWorkspace>;
  if (location.pathname === '/admin/readiness') return <AdminReadinessExperience me={me} status={status} />;

  return <Navigate to="/admin/readiness" replace />;
}
