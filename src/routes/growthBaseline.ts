import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { HttpError, json, readJson } from '../http';
import { requireAuth, verifyCsrf } from '../auth/session';
import { organizationMembership } from './organizations';

const METRICS = new Set(['x_followers', 'community_members', 'website_users', 'waitlist_members', 'signups', 'wallet_users']);
const PROVENANCE = new Set(['founder_manual', 'provider_verified', 'telegram_verified', 'estimated']);
const id = () => `baseline_${crypto.randomUUID().replace(/-/g, '')}`;
const now = () => new Date().toISOString();

async function access(request: Request, env: Env, organizationId: string, write = false) {
  const auth = await requireAuth(request, env);
  const db = new Db(requireDb(env));
  const membership = await organizationMembership(db, auth.user.id, organizationId);
  if (!membership || (write && !['owner', 'admin', 'marketing_manager'].includes(membership.role))) throw new HttpError(403, 'Growth baseline access denied', 'forbidden');
  return { auth, db };
}

export async function listGrowthBaselines(request: Request, env: Env): Promise<Response> {
  const organizationId = new URL(request.url).searchParams.get('organizationId')?.trim();
  if (!organizationId) throw new HttpError(400, 'organizationId is required', 'organization_required');
  const { db } = await access(request, env, organizationId);
  const rows = await db.all('SELECT id, metric_key, metric_value, observed_at, provenance, source_url, notes FROM project_growth_baselines WHERE organization_id = ? ORDER BY observed_at DESC, metric_key ASC LIMIT 500', [organizationId]);
  return json({ baselines: rows });
}

export async function saveGrowthBaseline(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ organizationId?: string; metricKey?: string; metricValue?: number; observedAt?: string; provenance?: string; sourceUrl?: string; notes?: string }>(request);
  const organizationId = body.organizationId?.trim();
  if (!organizationId || !body.metricKey || !METRICS.has(body.metricKey) || !body.provenance || !PROVENANCE.has(body.provenance) || !body.observedAt) throw new HttpError(400, 'Metric, value, date and provenance are required', 'invalid_growth_baseline');
  const value = Number(body.metricValue);
  if (!Number.isFinite(value) || value < 0 || value > 1_000_000_000) throw new HttpError(400, 'Metric value must be a valid non-negative number', 'invalid_growth_baseline');
  const observedAt = new Date(body.observedAt).toISOString();
  const { db } = await access(request, env, organizationId, true);
  const timestamp = now();
  await db.run(`INSERT INTO project_growth_baselines (id, organization_id, metric_key, metric_value, observed_at, provenance, source_url, notes, created_by_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(organization_id, metric_key, observed_at) DO UPDATE SET metric_value = excluded.metric_value, provenance = excluded.provenance, source_url = excluded.source_url, notes = excluded.notes, updated_at = excluded.updated_at`, [id(), organizationId, body.metricKey, value, observedAt, body.provenance, body.sourceUrl?.trim().slice(0, 500) || null, body.notes?.trim().slice(0, 1000) || null, auth.user.id, timestamp, timestamp]);
  return json({ ok: true }, { status: 201 });
}
