import { useEffect, useMemo, useState } from 'react';
import ProfileExperienceIdentityV1 from './ProfileExperienceIdentityV1';
import { ProductWorkspace, type ProductMe, type ProductProfile, type ProductStatus } from './ProductWorkspace';

type ProjectRole = 'owner' | 'admin' | 'marketing_manager' | 'analyst' | 'viewer';
type OrganizationAccess = { id: string; role: ProjectRole };
type OrganizationsResponse = { organizations?: OrganizationAccess[] };
type AccessState = 'loading' | 'editable' | 'readonly' | 'unavailable';

function initialProfile(status: ProductStatus): ProductProfile | undefined {
  const saved = typeof window !== 'undefined' ? window.localStorage.getItem('linkary.active.profile') : null;
  if (saved) {
    const selected = status.profiles.find((profile) => profile.id === saved);
    if (selected) return selected;
  }
  return status.profiles.find((profile) => profile.profile_type === 'creator') || status.profiles[0];
}

function roleLabel(role: ProjectRole | null): string {
  if (role === 'marketing_manager') return 'Campaign Manager';
  if (role === 'analyst') return 'Analyst';
  if (role === 'viewer') return 'Viewer';
  if (role === 'admin') return 'Admin';
  if (role === 'owner') return 'Owner';
  return 'Project member';
}

export default function ProfileAccessExperience({ me, status }: { me: ProductMe; status: ProductStatus }) {
  const [profileId, setProfileId] = useState(() => initialProfile(status)?.id || '');
  const profile = useMemo(
    () => status.profiles.find((item) => item.id === profileId) || initialProfile(status),
    [profileId, status],
  );
  const [state, setState] = useState<AccessState>(profile?.profile_type === 'creator' ? 'editable' : 'loading');
  const [role, setRole] = useState<ProjectRole | null>(null);

  function changeProfile(id: string) {
    setProfileId(id);
    window.localStorage.setItem('linkary.active.profile', id);
  }

  useEffect(() => {
    if (!profile) return;
    if (profile.profile_type === 'creator') {
      setRole(null);
      setState('editable');
      return;
    }
    if (!profile.organization_id) {
      setRole(null);
      setState('readonly');
      return;
    }

    let cancelled = false;
    setState('loading');
    void fetch('/api/organizations', { credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Project access could not be loaded');
        return response.json() as Promise<OrganizationsResponse>;
      })
      .then((result) => {
        if (cancelled) return;
        const membership = (result.organizations || []).find((item) => item.id === profile.organization_id);
        const nextRole = membership?.role || null;
        setRole(nextRole);
        setState(nextRole === 'owner' || nextRole === 'admin' ? 'editable' : 'readonly');
      })
      .catch(() => {
        if (!cancelled) {
          setRole(null);
          setState('unavailable');
        }
      });
    return () => { cancelled = true; };
  }, [profile?.id, profile?.organization_id, profile?.profile_type]);

  if (!profile) return null;
  if (state === 'editable') return <ProfileExperienceIdentityV1 me={me} status={status} />;

  return (
    <ProductWorkspace me={me} status={status} profile={profile} onProfileChange={changeProfile}>
      <div className="ops-stack" data-project-profile-readonly>
        <div className="ops-heading-row">
          <div>
            <span className="ops-kicker">PUBLIC IDENTITY</span>
            <h1>Project profile</h1>
            <p>Project branding, SEO, profile sections and publish state are controlled by the Project Owner or Admin.</p>
          </div>
          <a className="ops-button secondary" href={`https://linkary.xyz/${profile.username}`} target="_blank" rel="noreferrer">Open public profile ↗</a>
        </div>
        {state === 'loading' && <div className="ops-message">Checking your Project profile permissions...</div>}
        {state === 'unavailable' && <div className="ops-message">Project profile permissions are temporarily unavailable. No editing controls are enabled.</div>}
        {state === 'readonly' && (
          <section className="ops-section">
            <div className="ops-section-title">
              <div>
                <h2>Read-only Project profile</h2>
                <p>Your {roleLabel(role)} role can continue using the campaign, partner and growth tools assigned to that role, but it cannot change the Project's public identity or publishing state.</p>
              </div>
            </div>
          </section>
        )}
      </div>
    </ProductWorkspace>
  );
}
