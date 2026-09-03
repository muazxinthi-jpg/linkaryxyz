import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { ensureAttributionSchema } from '../db/attributionSchema';
import { HttpError, json, readJson } from '../http';
import { requireAuth, verifyCsrf } from '../auth/session';
import { requireOperationalProjectAccess } from './organizations';

export type ActivityLifecycleStatus = 'planned' | 'live' | 'completed' | 'cancelled';
export type ActivityLifecycleTarget = 'live' | 'completed' | 'cancelled';

const ALLOWED_TRANSITIONS: Record<ActivityLifecycleStatus, readonly ActivityLifecycleTarget[]> = {
  planned: ['live', 'completed', 'cancelled'],
  live: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function canTransitionActivityStatus(current: ActivityLifecycleStatus, next: ActivityLifecycleTarget): boolean {
  return ALLOWED_TRANSITIONS[current].includes(next);
}

export async function updateActivityLifecycleStatus(request: Request, env: Env, activityId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ status?: ActivityLifecycleTarget }>(request);
  if (!body.status || !['live', 'completed', 'cancelled'].includes(body.status)) {
    throw new HttpError(400, 'Choose a valid activity status', 'invalid_activity_status');
  }

  const db = new Db(requireDb(env));
  await ensureAttributionSchema(db);
  const activity = await db.first<{
    id: string;
    status: ActivityLifecycleStatus;
    organization_id: string;
  }>(
    `SELECT a.id, a.status, c.organization_id
       FROM campaign_activities a
       JOIN campaigns c ON c.id = a.campaign_id
      WHERE a.id = ?`,
    [activityId],
  );
  if (!activity) throw new HttpError(404, 'Activity not found', 'activity_not_found');
  await requireOperationalProjectAccess(db, auth.user.id, activity.organization_id, true);

  const next = body.status;
  if (activity.status === next) {
    return json({ ok: true, id: activity.id, status: next, previousStatus: activity.status, existing: true });
  }
  if (!canTransitionActivityStatus(activity.status, next)) {
    throw new HttpError(
      409,
      activity.status === 'completed' || activity.status === 'cancelled'
        ? 'Completed and cancelled activities are final in this Beta workflow.'
        : `Activity cannot move from ${activity.status} to ${next}.`,
      'invalid_activity_transition',
    );
  }

  const timestamp = new Date().toISOString();
  await db.run(
    'UPDATE campaign_activities SET status = ?, updated_at = ? WHERE id = ?',
    [next, timestamp, activity.id],
  );

  return json({
    ok: true,
    id: activity.id,
    status: next,
    previousStatus: activity.status,
    updatedAt: timestamp,
    existing: false,
    performanceEvidenceCreated: false,
  });
}
