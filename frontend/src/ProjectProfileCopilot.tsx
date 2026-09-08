import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ProductProfile, ProductStatus } from './ProductWorkspace';

type ProjectSuggestions = {
  bio: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  positioningTip: string | null;
  completenessTips: string[];
  socialTips: string[];
};

type AiResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  suggestions?: ProjectSuggestions;
  ai?: { provider: string; model: string; usageCredits: number; latencyMs: number };
};

type EditableProfileSnapshot = {
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  visibility: string;
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

function aiError(code: string | undefined, fallback: string): string {
  if (code === 'usage_credits_insufficient') return 'This Project does not have enough Linkary Usage Credits for this AI improvement.';
  if (code === 'ai_budget_exhausted') return 'LinkaryAI has reached its current usage limit. Try again later.';
  if (code === 'ai_duplicate_request') return 'This improvement request was already submitted. Generate a new draft.';
  if (code === 'ai_output_invalid') return 'LinkaryAI returned an incomplete Project draft. Please generate again.';
  if (code === 'ai_prompt_not_found' || code === 'ai_prompt_unavailable') return 'Project Profile Copilot is being activated. Try again shortly.';
  if (code === 'forbidden') return 'Project Profile Copilot requires Project Owner or Admin access.';
  return fallback;
}

export default function ProjectProfileCopilot({ status }: { status: ProductStatus }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [profileId, setProfileId] = useState(() => currentProfile(status)?.id || '');
  const [busy, setBusy] = useState(false);
  const [applyBusy, setApplyBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<ProjectSuggestions | null>(null);
  const [message, setMessage] = useState('');
  const [aiMeta, setAiMeta] = useState<AiResponse['ai'] | null>(null);

  const profile = useMemo(() => status.profiles.find((item) => item.id === profileId) || currentProfile(status), [profileId, status]);
  const isProject = profile?.profile_type === 'project';

  useEffect(() => {
    const sync = () => {
      const nextTarget = document.querySelector<HTMLElement>('.profile-beta .profile-beta-identity-grid');
      setTarget((existing) => existing === nextTarget ? existing : nextTarget);
      const nextProfile = currentProfile(status);
      if (nextProfile?.id) setProfileId((existing) => existing === nextProfile.id ? existing : nextProfile.id);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [status]);

  useEffect(() => {
    setSuggestions(null);
    setMessage('');
    setAiMeta(null);
  }, [profile?.id]);

  async function improveWithAi() {
    if (!profile?.id || !isProject || busy || applyBusy) return;
    const csrf = cookie('__Host-linkary_csrf');
    if (!csrf) { setMessage('Refresh your session before using LinkaryAI.'); return; }
    setBusy(true); setMessage(''); setSuggestions(null); setAiMeta(null);
    try {
      const requestId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      const response = await fetch(`/api/profiles/${encodeURIComponent(profile.id)}/identity`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ action: 'ai_project_improve', idempotencyKey: `project-profile-improve:${profile.id}:${requestId}` }),
      });
      const result = await response.json().catch(() => ({})) as AiResponse;
      if (!response.ok) throw Object.assign(new Error(result.message || 'LinkaryAI could not create a Project draft.'), { code: result.error });
      if (!result.suggestions) throw new Error('LinkaryAI did not return a usable Project draft.');
      setSuggestions(result.suggestions);
      setAiMeta(result.ai || null);
      setMessage('Draft ready. Review every suggestion before applying it.');
    } catch (error) {
      const value = error as Error & { code?: string };
      setMessage(aiError(value.code, value.message || 'LinkaryAI is temporarily unavailable.'));
    } finally {
      setBusy(false);
    }
  }

  async function copySuggestion(value: string | null, label: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setMessage(`${label} copied. Review it before using it.`);
    } catch {
      setMessage(`Copy was unavailable. Select the ${label.toLowerCase()} text manually.`);
    }
  }

  async function applyAllProfileText() {
    if (!profile?.id || !isProject || !suggestions || applyBusy || busy) return;
    const hasSuggestion = Boolean(suggestions.bio || suggestions.seoTitle || suggestions.seoDescription);
    if (!hasSuggestion) { setMessage('LinkaryAI did not return any grounded public profile text to apply.'); return; }
    const confirmed = window.confirm('Apply the reviewed LinkaryAI bio and SEO suggestions to this Project profile? If the Project profile is already published, these approved changes can become visible immediately.');
    if (!confirmed) return;
    const csrf = cookie('__Host-linkary_csrf');
    if (!csrf) { setMessage('Refresh your session before applying LinkaryAI suggestions.'); return; }
    setApplyBusy(true); setMessage('Applying your approved Project profile draft...');
    try {
      const currentResponse = await fetch(`/api/profiles/${encodeURIComponent(profile.id)}`, { credentials: 'same-origin' });
      const currentResult = await currentResponse.json().catch(() => ({})) as { profile?: EditableProfileSnapshot; message?: string };
      if (!currentResponse.ok || !currentResult.profile) throw new Error(currentResult.message || 'Current Project profile details could not be loaded.');
      const existing = currentResult.profile;

      const profileResponse = await fetch(`/api/profiles/${encodeURIComponent(profile.id)}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({
          displayName: existing.displayName,
          bio: suggestions.bio ?? existing.bio ?? '',
          avatarUrl: existing.avatarUrl || '',
          seoTitle: suggestions.seoTitle ?? existing.seoTitle ?? '',
          seoDescription: suggestions.seoDescription ?? existing.seoDescription ?? '',
        }),
      });
      const profileResult = await profileResponse.json().catch(() => ({})) as { message?: string };
      if (!profileResponse.ok) throw new Error(profileResult.message || 'The AI Project profile draft could not be applied.');

      setMessage(existing.visibility === 'published'
        ? 'Approved LinkaryAI Project profile text saved. This profile is published, so the changes are now live.'
        : 'Approved LinkaryAI Project profile text saved to the profile draft.');
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The approved LinkaryAI Project profile draft could not be applied.');
    } finally {
      setApplyBusy(false);
    }
  }

  if (!target || !profile || !isProject) return null;

  return createPortal(
    <div className="wide profile-ai-v1" data-linkary-ai-project-profile-copilot>
      <div className="profile-ai-v1-head">
        <div>
          <span>LINKARYAI</span>
          <strong>Project Profile Copilot</strong>
          <small>Uses only this Project's current Linkary profile evidence. It cannot invent traction, funding, partnerships, token claims or verification.</small>
        </div>
        <button type="button" className="ops-button secondary" disabled={busy || applyBusy} onClick={() => void improveWithAi()}>{busy ? 'Improving...' : '✦ Improve Project profile'}</button>
      </div>

      {message && <div className="profile-ai-v1-message" role="status">{message}</div>}

      {suggestions && <div className="profile-ai-v1-results">
        <div className="profile-ai-v1-apply">
          <div><strong>Ready to use these suggestions?</strong><small>Review the draft first. Apply updates only the Project bio and SEO fields. Project name, logo, verification, permissions, team, wallets, billing and campaign evidence are untouched.</small></div>
          <button type="button" className="ops-button primary" disabled={applyBusy || busy} onClick={() => void applyAllProfileText()}>{applyBusy ? 'Applying...' : 'Apply bio + SEO'}</button>
        </div>

        <article>
          <div><strong>Project bio</strong><span>500 characters max</span></div>
          <p>{suggestions.bio || 'No grounded improvement suggested.'}</p>
          {suggestions.bio && <button type="button" onClick={() => void copySuggestion(suggestions.bio, 'Project bio')}>Copy bio</button>}
        </article>
        <article>
          <div><strong>SEO title</strong><span>70 characters max</span></div>
          <p>{suggestions.seoTitle || 'No grounded improvement suggested.'}</p>
          {suggestions.seoTitle && <button type="button" onClick={() => void copySuggestion(suggestions.seoTitle, 'SEO title')}>Copy SEO title</button>}
        </article>
        <article>
          <div><strong>SEO description</strong><span>180 characters max</span></div>
          <p>{suggestions.seoDescription || 'No grounded improvement suggested.'}</p>
          {suggestions.seoDescription && <button type="button" onClick={() => void copySuggestion(suggestions.seoDescription, 'SEO description')}>Copy SEO description</button>}
        </article>
        <article>
          <div><strong>Positioning suggestion</strong><span>Advice only</span></div>
          <p>{suggestions.positioningTip || 'No additional grounded positioning suggestion.'}</p>
        </article>

        {(suggestions.completenessTips.length > 0 || suggestions.socialTips.length > 0) && <div className="profile-ai-v1-tips">
          {suggestions.completenessTips.length > 0 && <div><strong>Profile completeness</strong><ul>{suggestions.completenessTips.map((tip, index) => <li key={`complete-${index}`}>{tip}</li>)}</ul></div>}
          {suggestions.socialTips.length > 0 && <div><strong>Social presence</strong><ul>{suggestions.socialTips.map((tip, index) => <li key={`social-${index}`}>{tip}</li>)}</ul></div>}
        </div>}

        {aiMeta && <div className="profile-ai-v1-meta">{aiMeta.provider} · {aiMeta.model} · {aiMeta.usageCredits} Usage Credits · {(aiMeta.latencyMs / 1000).toFixed(1)}s</div>}
      </div>}
    </div>,
    target,
  );
}
