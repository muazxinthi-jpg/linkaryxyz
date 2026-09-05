import { useMemo, useState } from 'react';
import ActivityMeasurementPanel from './ActivityMeasurementPanel';
import './activity-lifecycle.css';

type ActivityStatus = 'planned' | 'live' | 'completed' | 'cancelled';
type ActivityTarget = 'live' | 'completed' | 'cancelled';

type ApiPayload = { error?: string; message?: string };

const NEXT: Record<ActivityStatus, readonly ActivityTarget[]> = {
  planned: ['live', 'completed', 'cancelled'],
  live: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

function label(value: ActivityStatus | ActivityTarget): string {
  if (value === 'live') return 'Live';
  if (value === 'completed') return 'Completed';
  if (value === 'cancelled') return 'Cancelled';
  return 'Planned';
}

function actionLabel(value: ActivityTarget): string {
  if (value === 'live') return 'Mark live';
  if (value === 'completed') return 'Complete';
  return 'Cancel';
}

function csrf(): string | null {
  const hit = document.cookie.split('; ').find((part) => part.startsWith('__Host-linkary_csrf='));
  return hit ? decodeURIComponent(hit.split('=').slice(1).join('=')) : null;
}

export default function ActivityLifecycleActions({ activityId, initialStatus, writable }: { activityId: string; initialStatus: string; writable: boolean }) {
  const safeInitial: ActivityStatus = ['planned', 'live', 'completed', 'cancelled'].includes(initialStatus) ? initialStatus as ActivityStatus : 'planned';
  const [status, setStatus] = useState<ActivityStatus>(safeInitial);
  const [saving, setSaving] = useState<ActivityTarget | null>(null);
  const [message, setMessage] = useState('');
  const choices = useMemo(() => NEXT[status], [status]);

  async function update(next: ActivityTarget) {
    if (!writable || saving) return;
    if (next === 'cancelled' && !window.confirm('Cancel this activity? Existing tracking links, clicks, outcomes and partner history will remain stored.')) return;
    if (next === 'completed' && !window.confirm('Mark this activity completed? This records that the activity happened. It does not create performance proof by itself.')) return;
    const token = csrf();
    if (!token) { setMessage('Your session needs to be refreshed before updating activity status.'); return; }
    setSaving(next);
    setMessage('');
    try {
      const response = await fetch(`/api/campaign-activities/${encodeURIComponent(activityId)}/status`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-csrf-token': token },
        body: JSON.stringify({ status: next }),
      });
      const payload = (await response.json().catch(() => ({}))) as ApiPayload;
      if (!response.ok) throw new Error(payload.message || 'Activity status could not be updated.');
      setStatus(next);
      setMessage(next === 'completed' ? 'History updated. Performance proof still depends on tracked or verified evidence.' : next === 'cancelled' ? 'Cancelled. Existing evidence was preserved.' : 'Activity is now live.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Activity status could not be updated.');
    } finally {
      setSaving(null);
    }
  }

  return <div className="activity-lifecycle-control">
    <span className={`ops-status status-${status}`}>{label(status)}</span>
    {writable && choices.length > 0 && <div className="activity-lifecycle-actions" aria-label="Activity lifecycle actions">
      {choices.map((next) => <button
        key={next}
        type="button"
        className={`activity-lifecycle-action ${next === 'cancelled' ? 'danger' : next === 'completed' ? 'complete' : 'live'}`}
        disabled={Boolean(saving)}
        onClick={() => void update(next)}
      >{saving === next ? 'Updating...' : actionLabel(next)}</button>)}
    </div>}
    <ActivityMeasurementPanel activityId={activityId} canSubmit={writable} canReview={writable} />
    {message && <small className="activity-lifecycle-message" role="status">{message}</small>}
  </div>;
}
