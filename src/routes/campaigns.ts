import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { ensureAttributionSchema } from '../db/attributionSchema';
import { HttpError, json, readJson } from '../http';
import { requireAuth, verifyCsrf } from '../auth/session';
import { organizationMembership } from './organizations';

const id = () => `cam_${crypto.randomUUID().replace(/-/g, '')}`;
const now = () => new Date().toISOString();
const sourceTypes = new Set(['external', 'internal_team', 'agency', 'creator_kol', 'community', 'launchpad', 'linkary', 'other']);
const executionModes = new Set(['tracked_elsewhere', 'run_on_linkary']);

export async function listCampaigns(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env); const db = new Db(requireDb(env)); const organizationId = new URL(request.url).searchParams.get('organizationId');
  if (!organizationId) throw new HttpError(400, 'organizationId is required', 'organization_required');
  if (!(await organizationMembership(db, auth.user.id, organizationId))) throw new HttpError(403, 'Growth tracking access denied', 'forbidden');
  await ensureAttributionSchema(db);
  return json({ campaigns: await db.all(`SELECT id, name, objective, budget_usd, status, starts_at, ends_at, created_at, COALESCE(source_type, 'external') AS source_type, COALESCE(execution_mode, 'tracked_elsewhere') AS execution_mode FROM campaigns WHERE organization_id = ? ORDER BY created_at DESC`, [organizationId]) });
}

export async function createCampaign(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ organizationId?: string; name?: string; objective?: string; budgetUsd?: number; startsAt?: string; endsAt?: string; sourceType?: string; executionMode?: string }>(request);
  if (!body.organizationId || !body.name?.trim()) throw new HttpError(400, 'Campaign name and Project are required', 'invalid_campaign');
  const db = new Db(requireDb(env));
  const membership = await organizationMembership(db, auth.user.id, body.organizationId);
  if (!membership || !['owner', 'admin', 'marketing_manager'].includes(membership.role)) throw new HttpError(403, 'Growth tracking access denied', 'forbidden');
  const project = await db.first<{ verification_status: string; status: string }>('SELECT verification_status, status FROM organizations WHERE id = ?', [body.organizationId]);
  if (!project || project.status !== 'active' || project.verification_status !== 'verified_x') throw new HttpError(409, 'Verify the Project with its official X identity before adding tracked growth records', 'project_verification_required');
  await ensureAttributionSchema(db);
  const sourceType = sourceTypes.has(body.sourceType || '') ? body.sourceType! : 'external';
  const executionMode = executionModes.has(body.executionMode || '') ? body.executionMode! : 'tracked_elsewhere';
  const campaignId = id();
  const timestamp = now();
  await db.run(
    `INSERT INTO campaigns (id, organization_id, name, objective, budget_usd, status, starts_at, ends_at, created_by_user_id, created_at, updated_at, source_type, execution_mode)
     VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)`,
    [campaignId, body.organizationId, body.name.trim().slice(0, 120), body.objective?.trim().slice(0, 500) || '', typeof body.budgetUsd === 'number' ? body.budgetUsd : null, body.startsAt || null, body.endsAt || null, auth.user.id, timestamp, timestamp, sourceType, executionMode],
  );
  return json({ id: campaignId, sourceType, executionMode }, { status: 201 });
}
