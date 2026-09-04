import { useMemo, useState } from 'react';
import './campaign-lifecycle.css';

export type CampaignLifecycleStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived';
type CampaignTarget = 'active' | 'paused' | 'completed' | 'archived';

type ApiPayload = { error?: string; message?: string };

const NEXT: Record<CampaignLifecycleStatus, readonly CampaignTarget[]> = {
  draft: ['active', 'archived'],
  active: ['paused', 'completed', 'archived'],
  paused: ['active', 'completed', 'archived'],
  completed: ['archived'],
  archived: [],
};

function actionLabel(status: CampaignLifecycleStatus, next: CampaignTarget): string {
  if (status === 'draft' && next === 'active') return 'Start campaign';
  if (status === 'paused' && next === 'active') return 'Resume';
  if (next === 'paused') return 'Pause';
  if (next === 'completed') return 'Complete';
  return 'Archive';
}

function csrf(): string | null {
  const hit = document.cookie.split('; ').find((part) => part.startsWith('__Host-linkary_csrf='));
  return hit ? decodeURIComponent(hit.split('=').slice(1).join('=')) : null;
}

export default function CampaignLifecycleActions({
  campaignId,
  initialStatus,
  writable,
  onStatusChange,
}: {
  campaignId: string;
  initialStatus: CampaignLifecycleStatus;
  writable: boolean;
  onStatusChange?: (status: CampaignLifecycleStatus) => void;
}) {
  const [status, setStatus] = useState<CampaignLifecycleStatus>(initialStatus);
  const [saving, setSaving] = useState<CampaignTarget | null>(null);
  const [message, setMessage] = useState('');
  const choices = useMemo(() => NEXT[status], [status]);

  async function update(next: CampaignTarget) {
    if (!writable || saving) return;
    if (next === 'completed' && !window.confirm('Complete this campaign? Existing activities, tracking links, clicks, outcomes, reports and partner history will remain stored. Completing the campaign does not create performance proof.')) return;
    if (next === 'archived' && !window.confirm('Archive this campaign? It will leave active operating focus, but activities, tracking links, clicks, outcomes, reports and relationship history remain stored. Attribution confidence is not changed.')) return;

    const token = csrf();
    if (!token) {
      setMessage('Your session needs to be refreshed before updating campaign status.');
      return;
    }

    setSaving(next);
    setMessage('');
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/status`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-csrf-token': token },
        body: JSON.stringify({ status: next }),
      });
      const payload = (await response.json().catch(() => ({}))) as ApiPayload;
      if (!response.ok) throw new Error(payload.message || 'Campaign status could not be updated.');

      setStatus(next);
      onStatusChange?.(next);
      setMessage(
        next === 'completed'
          ? 'Campaign completed. Performance proof still depends on tracked or verified evidence.'
          : next === 'archived'
            ? 'Campaign archived. Existing evidence and reporting remain stored.'
            : next === 'paused'
              ? 'Campaign paused. Historical evidence remains unchanged.'
              : status === 'paused'
                ? 'Campaign resumed.'
                : 'Campaign started.',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Campaign status could not be updated.');
    } finally {
      setSaving(null);
    }
  }

  if (!writable || choices.length === 0) return null;

  return <div className="campaign-lifecycle-control">
    <div className="campaign-lifecycle-actions" aria-label="Campaign lifecycle actions">
      {choices.map((next) => <button
        key={next}
        type="button"
        className={`campaign-lifecycle-action ${next === 'archived' ? 'archive' : next === 'completed' ? 'complete' : next === 'paused' ? 'pause' : 'active'}`}
        disabled={Boolean(saving)}
        onClick={() => void update(next)}
      >{saving === next ? 'Updating...' : actionLabel(status, next)}</button>)}
    </div>
    {message && <small className="campaign-lifecycle-message" role="status">{message}</small>}
  </div>;
}
