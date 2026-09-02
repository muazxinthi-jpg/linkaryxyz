import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { HttpError, json, readJson } from '../http';
import { requireAuth, verifyCsrf } from '../auth/session';
import { organizationMembership } from './organizations';

const id = () => `cam_${crypto.randomUUID().replace(/-/g, '')}`;
const now = () => new Date().toISOString();

async function ensureCampaignSchema(db: Db): Promise<void> {
  await db.run(`CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    name TEXT NOT NULL,
    objective TEXT NOT NULL DEFAULT '',
    budget_usd REAL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),
    starts_at TEXT,
    ends_at TEXT,
    created_by_user_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  await db.run('CREATE INDEX IF NOT EXISTS idx_campaigns_organization ON campaigns(organization_id, created_at DESC)');
}

export async function listCampaigns(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env); const db = new Db(requireDb(env)); const organizationId = new URL(request.url).searchParams.get('organizationId');
  if (!organizationId) throw new HttpError(400, 'organizationId is required', 'organization_required');
  if (!(await organizationMembership(db, auth.user.id, organizationId))) throw new HttpError(403, 'Campaign access denied', 'forbidden');
  await ensureCampaignSchema(db);
  return json({ campaigns: await db.all(`SELECT id, name, objective, budget_usd, status, starts_at, ends_at, created_at FROM campaigns WHERE organization_id = ? ORDER BY created_at DESC`, [organizationId]) });
}

export async function createCampaign(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env); await verifyCsrf(request, env, auth); const body = await readJson<{ organizationId?: string; name?: string; objective?: string; budgetUsd?: number; startsAt?: string; endsAt?: string }>(request);
  if (!body.organizationId || !body.name?.trim()) throw new HttpError(400, 'Campaign name and organization are required', 'invalid_campaign'); const db = new Db(requireDb(env)); const membership = await organizationMembership(db, auth.user.id, body.organizationId);
  if (!membership || !['owner', 'admin', 'marketing_manager'].includes(membership.role)) throw new HttpError(403, 'Campaign access denied', 'forbidden');
  const project = await db.first<{ verification_status: string; status: string }>('SELECT verification_status, status FROM organizations WHERE id = ?', [body.organizationId]);
  if (!project || project.status !== 'active' || project.verification_status !== 'verified_x') throw new HttpError(409, 'Campaigns can only be run for an active Project registered through its X identity', 'project_verification_required');
  await ensureCampaignSchema(db);
  const campaignId = id(); const timestamp = now(); await db.run(`INSERT INTO campaigns (id, organization_id, name, objective, budget_usd, status, starts_at, ends_at, created_by_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)`, [campaignId, body.organizationId, body.name.trim().slice(0, 120), body.objective?.trim().slice(0, 500) || '', typeof body.budgetUsd === 'number' ? body.budgetUsd : null, body.startsAt || null, body.endsAt || null, auth.user.id, timestamp, timestamp]);
  return json({ id: campaignId }, { status: 201 });
}
