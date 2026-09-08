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

type AiSuggestions = {
  professionalHeadline: string | null;
  bio: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  profileTips: string[];
};

type AiResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  suggestions?: AiSuggestions;
  ai?: { provider: string; model: string; usageCredits: number; latencyMs: number };
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

function aiError(code: string | undefined, fallback: string): string {
  if (code === 'usage_credits_insufficient') return 'You do not have enough Linkary Usage Credits for this AI improvement.';
  if (code === 'ai_budget_exhausted') return 'LinkaryAI has reached its current usage limit. Try again later.';
  if (code === 'ai_duplicate_request') return 'This improvement request was already submitted. Generate a new draft.';
  if (code === 'ai_output_invalid') return 'LinkaryAI returned an incomplete draft. Please generate again.';
  if (code === 'forbidden') return 'You cannot run AI improvements for this profile.';
  return fallback;
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
  const [aiBusy, setAiBusy] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestions | null>(null);
  const [aiMessage, setAiMessage] = useState('');
  const [aiMeta, setAiMeta] = useState<AiResponse['ai'] | null>(null);

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
    setAiSuggestions(null);
    setAiMessage('');
    setAiMeta(null);
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

  async function improveWithAi() {
    if (!profile?.id || !isPersonal || aiBusy || !available) return;
    const csrf = cookie('__Host-linkary_csrf');
    if (!csrf) { setAiMessage('Refresh your session before using LinkaryAI.'); return; }
    setAiBusy(true); setAiMessage(''); setAiSuggestions(null); setAiMeta(null);
    try {
      const requestId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      const response = await fetch(`/api/profiles/${encodeURIComponent(profile.id)}/identity`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ action: 'ai_improve', idempotencyKey: `profile-improve:${profile.id}:${requestId}` }),
      });
      const result = await response.json().catch(() => ({})) as AiResponse;
      if (!response.ok) throw Object.assign(new Error(result.message || 'LinkaryAI could not create a draft.'), { code: result.error });
      if (!result.suggestions) throw new Error('LinkaryAI did not return a usable draft.');
      setAiSuggestions(result.suggestions);
      setAiMeta(result.ai || null);
      setAiMessage('Draft ready. Review every suggestion before using it.');
    } catch (error) {
      const value = error as Error & { code?: string };
      setAiMessage(aiError(value.code, value.message || 'LinkaryAI is temporarily unavailable.'));
    } finally {
      setAiBusy(false);
    }
  }

  async function copySuggestion(value: string | null, label: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setAiMessage(`${label} copied. Paste it into the matching profile field, review it, then Save.`);
    } catch {
      setAiMessage(`Copy was unavailable. Select the ${label.toLowerCase()} text manually.`);
    }
  }

  if (!target || !isPersonal || !profile) return null;

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

        <div className="profile-ai-v1" data-linkary-ai-profile-improvement>
          <div className="profile-ai-v1-head">
            <div><span>LINKARYAI</span><strong>Improve your profile</strong><small>Uses only your current Linkary profile evidence. It cannot invent metrics, credentials or verification.</small></div>
            <button type="button" className="ops-button secondary" disabled={!available || aiBusy} onClick={() => void improveWithAi()}>{aiBusy ? 'Improving...' : '✦ Improve with LinkaryAI'}</button>
          </div>
          {aiMessage && <div className="profile-ai-v1-message" role="status">{aiMessage}</div>}
          {aiSuggestions && <div className="profile-ai-v1-results">
            <article>
              <div><strong>Professional headline</strong><span>140 characters max</span></div>
              <p>{aiSuggestions.professionalHeadline || 'No grounded improvement suggested.'}</p>
              {aiSuggestions.professionalHeadline && <button type="button" onClick={() => { setHeadline(aiSuggestions.professionalHeadline || ''); setAiMessage('Headline applied to the editor. Review it, then Save public identity.'); }}>Use headline</button>}
            </article>
            <article>
              <div><strong>Bio</strong><span>500 characters max</span></div>
              <p>{aiSuggestions.bio || 'No grounded improvement suggested.'}</p>
              {aiSuggestions.bio && <button type="button" onClick={() => void copySuggestion(aiSuggestions.bio, 'Bio')}>Copy bio</button>}
            </article>
            <article>
              <div><strong>SEO title</strong><span>70 characters max</span></div>
              <p>{aiSuggestions.seoTitle || 'No grounded improvement suggested.'}</p>
              {aiSuggestions.seoTitle && <button type="button" onClick={() => void copySuggestion(aiSuggestions.seoTitle, 'SEO title')}>Copy SEO title</button>}
            </article>
            <article>
              <div><strong>SEO description</strong><span>180 characters max</span></div>
              <p>{aiSuggestions.seoDescription || 'No grounded improvement suggested.'}</p>
              {aiSuggestions.seoDescription && <button type="button" onClick={() => void copySuggestion(aiSuggestions.seoDescription, 'SEO description')}>Copy SEO description</button>}
            </article>
            {aiSuggestions.profileTips.length > 0 && <div className="profile-ai-v1-tips"><strong>Profile improvements</strong><ul>{aiSuggestions.profileTips.map((tip, index) => <li key={`${index}-${tip}`}>{tip}</li>)}</ul></div>}
            <div className="profile-ai-v1-foot"><span>AI suggestions are drafts only. Nothing is saved or published automatically.</span>{aiMeta && <small>{aiMeta.usageCredits} Usage Credits · {aiMeta.provider}</small>}</div>
          </div>}
        </div>

        <div className="profile-identity-v1-actions"><span>{message}</span><button type="button" className="ops-button secondary" disabled={!available || busy} onClick={() => void save()}>{busy ? 'Saving...' : 'Save public identity'}</button></div>
      </div>
      <PersonalTelegramConnection />
    </>,
    target,
  );
}

export default function ProfileExperienceIdentityV1({ me, status }: { me: ProductMe; status: ProductStatus }) {
  return <><ProfileExperienceBeta me={me} status={status} /><PersonalIdentityEditor status={status} /></>;
}
