import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ProductStatus } from './ProductWorkspace';

type BriefSuggestion = {
  campaignName: string | null;
  objective: string | null;
  audience: string | null;
  keyMessage: string | null;
  deliverables: string[];
  successMetrics: string[];
  trackingPlan: string[];
  missingInputs: string[];
};

type AiMeta = { provider: string; model: string; usageCredits: number; latencyMs: number };
type AiResponse = { error?: string; message?: string; suggestions?: BriefSuggestion; ai?: AiMeta };

type CampaignFields = {
  name: HTMLInputElement | null;
  objective: HTMLTextAreaElement | null;
  budget: HTMLInputElement | null;
  source: HTMLSelectElement | null;
  execution: HTMLSelectElement | null;
};

function cookie(name: string): string | null {
  const match = document.cookie.split('; ').find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function findCampaignModal(): HTMLFormElement | null {
  return Array.from(document.querySelectorAll<HTMLFormElement>('form.ops-modal'))
    .find((form) => form.querySelector('.ops-kicker')?.textContent?.trim() === 'ADD CAMPAIGN') || null;
}

function campaignFields(modal: HTMLFormElement): CampaignFields {
  const selects = Array.from(modal.querySelectorAll<HTMLSelectElement>('select'));
  return {
    name: modal.querySelector<HTMLInputElement>('input[placeholder="Example: TGE creator push"]'),
    objective: modal.querySelector<HTMLTextAreaElement>('textarea[placeholder^="What result matters?"]'),
    budget: modal.querySelector<HTMLInputElement>('input[type="number"]'),
    source: selects[0] || null,
    execution: selects[1] || null,
  };
}

function currentOrganizationId(status: ProductStatus): string {
  const toolbar = document.querySelector<HTMLSelectElement>('.growth-workspace .ops-project-toolbar select');
  if (toolbar?.value) return toolbar.value;
  const saved = window.localStorage.getItem('linkary.active.profile');
  const selected = saved ? status.profiles.find((profile) => profile.id === saved) : undefined;
  if (selected?.organization_id) return selected.organization_id;
  return status.profiles.find((profile) => profile.profile_type === 'project' && profile.organization_id)?.organization_id || '';
}

function aiError(code: string | undefined, fallback: string): string {
  if (code === 'usage_credits_insufficient') return 'This Project does not have enough Linkary Usage Credits for campaign assistance.';
  if (code === 'ai_budget_exhausted') return 'LinkaryAI has reached its current usage limit. Try again later.';
  if (code === 'ai_duplicate_request') return 'This campaign brief request was already submitted. Generate a fresh draft.';
  if (code === 'ai_output_invalid') return 'LinkaryAI returned an incomplete campaign draft. Please generate again.';
  if (code === 'ai_prompt_not_found' || code === 'ai_prompt_unavailable') return 'Campaign Brief Assistant is being activated. Try again shortly.';
  if (code === 'project_verification_required') return 'Verify this Project with its official X identity before using LinkaryAI campaign assistance.';
  if (code === 'forbidden') return 'Campaign Brief Assistant requires Project Owner, Admin or Marketing Manager access.';
  return fallback;
}

function setReactValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (setter) setter.call(element, value);
  else element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function AdviceList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return <div className="campaign-ai-list"><strong>{title}</strong><ul>{items.map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}</ul></div>;
}

export default function CampaignBriefAssistant({ status }: { status: ProductStatus }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [modal, setModal] = useState<HTMLFormElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [suggestions, setSuggestions] = useState<BriefSuggestion | null>(null);
  const [aiMeta, setAiMeta] = useState<AiMeta | null>(null);

  useEffect(() => {
    const sync = () => {
      const nextModal = findCampaignModal();
      if (!nextModal) {
        setModal(null);
        setHost(null);
        return;
      }
      let nextHost = nextModal.querySelector<HTMLElement>('[data-linkary-ai-campaign-host]');
      if (!nextHost) {
        nextHost = document.createElement('div');
        nextHost.dataset.linkaryAiCampaignHost = 'true';
        const actions = nextModal.querySelector('.ops-form-actions');
        if (actions?.parentElement) actions.parentElement.insertBefore(nextHost, actions);
        else nextModal.appendChild(nextHost);
      }
      setModal((existing) => existing === nextModal ? existing : nextModal);
      setHost((existing) => existing === nextHost ? existing : nextHost);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setSuggestions(null);
    setAiMeta(null);
    setMessage('');
  }, [modal]);

  const canApply = useMemo(() => Boolean(suggestions?.campaignName || suggestions?.objective), [suggestions]);

  async function generateBrief() {
    if (!modal || busy) return;
    const fields = campaignFields(modal);
    const organizationId = currentOrganizationId(status);
    const name = fields.name?.value.trim() || '';
    const objective = fields.objective?.value.trim() || '';
    if (!name && !objective) {
      setMessage('Add a campaign name or rough objective first, then ask LinkaryAI to improve it.');
      return;
    }
    if (!organizationId) {
      setMessage('Select a Project before using LinkaryAI campaign assistance.');
      return;
    }
    const csrf = cookie('__Host-linkary_csrf');
    if (!csrf) {
      setMessage('Refresh your session before using LinkaryAI.');
      return;
    }

    const budgetValue = fields.budget?.value.trim() || '';
    const budgetUsd = budgetValue === '' ? undefined : Number(budgetValue);
    const safeBudgetUsd = typeof budgetUsd === 'number' && Number.isFinite(budgetUsd) ? budgetUsd : undefined;
    const requestId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    setBusy(true);
    setMessage('');
    setSuggestions(null);
    setAiMeta(null);
    try {
      const response = await fetch('/api/campaigns?action=brief-assist', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({
          organizationId,
          name,
          objective,
          budgetUsd: safeBudgetUsd,
          sourceType: fields.source?.value || 'external',
          executionMode: fields.execution?.value || 'tracked_elsewhere',
          idempotencyKey: `campaign-brief:${organizationId}:${requestId}`,
        }),
      });
      const result = await response.json().catch(() => ({})) as AiResponse;
      if (!response.ok) throw Object.assign(new Error(result.message || 'LinkaryAI could not create a campaign brief draft.'), { code: result.error });
      if (!result.suggestions) throw new Error('LinkaryAI did not return a usable campaign brief draft.');
      setSuggestions(result.suggestions);
      setAiMeta(result.ai || null);
      setMessage('Draft ready. Review it before applying the suggested name and objective to the campaign form.');
    } catch (error) {
      const value = error as Error & { code?: string };
      setMessage(aiError(value.code, value.message || 'LinkaryAI is temporarily unavailable.'));
    } finally {
      setBusy(false);
    }
  }

  function applyToForm() {
    if (!modal || !suggestions || !canApply) return;
    const fields = campaignFields(modal);
    if (suggestions.campaignName && fields.name) setReactValue(fields.name, suggestions.campaignName);
    if (suggestions.objective && fields.objective) setReactValue(fields.objective, suggestions.objective);
    setMessage('Suggested campaign name and objective applied to the form. Budget, source, execution mode and campaign state were not changed.');
  }

  if (!host || !modal) return null;

  return createPortal(
    <section className="campaign-ai" data-linkary-ai-campaign-brief-assistant>
      <div className="campaign-ai-head">
        <div><span>LINKARYAI</span><strong>Campaign Brief Assistant</strong><small>Turns your rough campaign context into a clearer, measurable draft. It cannot create the campaign or change your budget.</small></div>
        <button type="button" className="ops-button secondary" disabled={busy} onClick={() => void generateBrief()}>{busy ? 'Drafting...' : '✦ Improve brief'}</button>
      </div>
      {message && <div className="campaign-ai-message" role="status">{message}</div>}
      {suggestions && <div className="campaign-ai-results">
        <div className="campaign-ai-apply">
          <div><strong>Review before use</strong><small>Only the suggested campaign name and objective can be applied to this form. Everything else below is advisory.</small></div>
          <button type="button" className="ops-button primary" disabled={!canApply} onClick={applyToForm}>Apply name + objective</button>
        </div>
        <div className="campaign-ai-grid">
          <article><strong>Campaign name</strong><p>{suggestions.campaignName || 'No grounded change suggested.'}</p></article>
          <article><strong>Objective</strong><p>{suggestions.objective || 'No grounded change suggested.'}</p></article>
          <article><strong>Audience</strong><p>{suggestions.audience || 'More audience detail may be needed.'}</p></article>
          <article><strong>Key message</strong><p>{suggestions.keyMessage || 'More campaign context may be needed.'}</p></article>
        </div>
        <div className="campaign-ai-advice">
          <AdviceList title="Suggested deliverables" items={suggestions.deliverables} />
          <AdviceList title="Success metrics" items={suggestions.successMetrics} />
          <AdviceList title="Tracking plan" items={suggestions.trackingPlan} />
          <AdviceList title="Missing inputs" items={suggestions.missingInputs} />
        </div>
        {aiMeta && <div className="campaign-ai-meta">{aiMeta.provider} · {aiMeta.model} · {aiMeta.usageCredits} Usage Credits · {(aiMeta.latencyMs / 1000).toFixed(1)}s</div>}
      </div>}
    </section>,
    host,
  );
}
