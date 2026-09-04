import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import ProfileExperienceBeta from './ProfileExperienceBeta';
import PersonalTelegramConnection from './PersonalTelegramConnection';
import type { ProductMe, ProductProfile, ProductStatus } from './ProductWorkspace';
import './profile-identity-v1.css';

type IdentityOption = { value: string; label: string };
type IdentityResponse = {
  available: boolean;
  publicRole: string | null;
  publicRoleLabel: string | null;
  professionalHeadline: string | null;
  roles: IdentityOption[];
};

function cookie(name: string): string | null {
  const match = document.cookie.split('; ').find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function currentProfile(status: ProductStatus): ProductProfile | undefined {
  const saved = window.localStorage.getItem('linkary.active.profile');
  if (saved) {
    const selected = status.profiles.find((profile) => profile.id === saved);
    if (selected) return selected;
  }
  return status.profiles.find((profile) => profile.profile_type === 'creator') || status.profiles[0];
}

function refreshPublicPreview(): void {
  const iframe = document.querySelector<HTMLIFrameElement>('.profile-beta-public-preview iframe');
  if (!iframe?.src) return;
  try {
    const preview = new URL(iframe.src);
    preview.searchParams.set('editorPreview', String(Date.now()));
    iframe.src = preview.toString();
  } catch {
    // Saving identity must still succeed if the optional embedded preview is unavailable.
  }
}

function PersonalIdentityEditor({ status }: { status: ProductStatus }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [profileId, setProfileId] = useState(() => currentProfile(status)?.id || '');
  const [available, setAvailable] = useState(true);
  const [roles, setRoles] = useState<IdentityOption[]>([]);
  const [publicRole, setPublicRole] = useState('');
  const [headline, setHeadline] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const profile = useMemo(() => status.profiles.find((item) => item.id === profileId) || currentProfile(status), [profileId, status]);
  const isPersonal = profile?.profile_type === 'creator';

  useEffect(() => {
    const sync = () => {
      const nextTarget = document.querySelector<HTMLElement>('.profile-beta .profile-beta-identity-grid');
      setTarget((existing) => existing === nextTarget ? existing : nextTarget);
      const nextProfile = currentProfile(status);
      if (nextProfile?.id) setProfileId((existing) => existing === nextProfile.id ? existing : nextProfile.id);
      const root = document.querySelector<HTMLElement>('.profile-beta');
      if (root) root.classList.toggle('personal-profile-view', nextProfile?.profile_type === 'creator');
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [status]);

  useEffect(() => {
    if (!profile?.id || !isPersonal) return;
    let cancelled = false;
    setMessage('');
    void fetch(`/api/profiles/${encodeURIComponent(profile.id)}/identity`, { credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Identity settings could not be loaded.');
        return response.json() as Promise<IdentityResponse>;
      })
      .then((result) => {
        if (cancelled) return;
        setAvailable(result.available);
        setRoles(result.roles || []);
        setPublicRole(result.publicRole || '');
        setHeadline(result.professionalHeadline || '');
        if (!result.available) setMessage('Public identity setup is being upgraded. Try again shortly.');
      })
      .catch(() => { if (!cancelled) setMessage('Public identity settings are temporarily unavailable.'); });
    return () => { cancelled = true; };
  }, [profile?.id, isPersonal]);

  async function save() {
    if (!profile?.id || !isPersonal || busy || !available) return;
    const csrf = cookie('__Host-linkary_csrf');
    if (!csrf) { setMessage('Your session needs to be refreshed before saving.'); return; }
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/profiles/${encodeURIComponent(profile.id)}/identity`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ publicRole, professionalHeadline: headline }),
      });
      const result = await response.json().catch(() => ({})) as { message?: string; error?: string };
      if (!response.ok) throw new Error(result.message || 'Public identity could not be saved.');
      setMessage('Public identity saved. Preview refreshed.');
      refreshPublicPreview();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Public identity could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  if (!target || !isPersonal) return null;

  return createPortal(
    <>
      <div className="wide profile-identity-v1" data-personal-profile-identity>
        <div className="profile-identity-v1-heading">
          <div><strong>Public identity</strong><small>Choose how you want people to understand you on your public Linkary profile.</small></div>
          <span>Presentation only</span>
        </div>
        <div className="profile-identity-v1-fields">
          <label>Primary public role
            <select value={publicRole} disabled={!available || busy} onChange={(event) => setPublicRole(event.target.value)}>
              <option value="">Select your identity</option>
              {roles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
            </select>
          </label>
          <label>Professional headline
            <input value={headline} disabled={!available || busy} maxLength={140} placeholder="Example: Founder at KlineO · Web3 growth and partnerships" onChange={(event) => setHeadline(event.target.value)} />
          </label>
        </div>
        <p>Changing this label never changes Project roles, permissions, verification, manager status or campaign evidence.</p>
        <div className="profile-identity-v1-actions"><span>{message}</span><button type="button" className="ops-button secondary" disabled={!available || busy} onClick={() => void save()}>{busy ? 'Saving...' : 'Save public identity'}</button></div>
      </div>
      <PersonalTelegramConnection defaultEmail={status.user.email || ''} />
    </>,
    target,
  );
}

export default function ProfileExperienceIdentityV1({ me, status }: { me: ProductMe; status: ProductStatus }) {
  return <><ProfileExperienceBeta me={me} status={status} /><PersonalIdentityEditor status={status} /></>;
}