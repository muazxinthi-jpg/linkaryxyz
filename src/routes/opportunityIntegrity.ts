import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { HttpError, json, readJson } from '../http';
import { requireAuth, verifyCsrf } from '../auth/session';
import { organizationMembership } from './organizations';
import { listCampaignOpportunities as legacyListCampaignOpportunities } from './opportunities';

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
type ApplicationStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';

async function requireOwnedCreatorProfile(db: Db, userId: string, profileId: string): Promise<void> {
  const profile = await db.first<{ id: string }>(
    `SELECT id FROM profiles WHERE id = ? AND owner_user_id = ? AND profile_type = 'creator'`,
    [profileId, userId],
  );
  if (!profile) throw new HttpError(403, 'Use your personal Creator profile to apply', 'forbidden');
}

async function requireOwnedManager(db: Db, userId: string, managerId: string | null | undefined): Promise<void> {
  if (!managerId) return;
  const manager = await db.first<{ id: string }>(
    `SELECT m.id FROM partner_managers m
      JOIN profiles p ON p.id = m.profile_id
     WHERE m.id = ? AND p.owner_user_id = ?`,
    [managerId, userId],
  );
  if (!manager) throw new HttpError(403, 'Manager listing access denied', 'forbidden');
}

async function loadOpportunity(db: Db, opportunityId: string) {
  return db.first<{ status: string; application_deadline: string | null; deadline_passed: number }>(
    `SELECT status, application_deadline,
            CASE WHEN application_deadline IS NOT NULL AND date(application_deadline) < date(?) THEN 1 ELSE 0 END AS deadline_passed
       FROM campaign_opportunities WHERE id = ?`,
    [now(), opportunityId],
  );
}

function requireOpportunityOpen(opportunity: { status: string; deadline_passed: number } | null): void {
  if (!opportunity || opportunity.status !== 'open' || Boolean(opportunity.deadline_passed)) {
    throw new HttpError(409, 'This opportunity is not accepting applications', 'opportunity_closed');
  }
}

export async function listCampaignOpportunitiesIntegrity(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.searchParams.get('mine') !== '1' || url.searchParams.get('organizationId')) {
    return legacyListCampaignOpportunities(request, env);
  }

  const auth = await requireAuth(request, env);
  const db = new Db(requireDb(env));
  const opportunities = await db.all(
    `SELECT o.id, o.campaign_id, o.organization_id, o.title, o.brief, o.compensation_text, o.deliverables_text,
            o.status, o.application_deadline, o.created_at,
            c.name AS campaign_name, org.name AS project_name,
            (SELECT COUNT(*) FROM campaign_opportunity_applications a
              WHERE a.opportunity_id = o.id AND a.status != 'withdrawn') AS applications,
            (SELECT mine_app.id
               FROM campaign_opportunity_applications mine_app
               JOIN profiles mine_profile ON mine_profile.id = mine_app.applicant_profile_id
              WHERE mine_app.opportunity_id = o.id
                AND mine_profile.owner_user_id = ?
                AND mine_profile.profile_type = 'creator'
              ORDER BY mine_app.updated_at DESC LIMIT 1) AS my_application_id,
            (SELECT mine_app.status
               FROM campaign_opportunity_applications mine_app
               JOIN profiles mine_profile ON mine_profile.id = mine_app.applicant_profile_id
              WHERE mine_app.opportunity_id = o.id
                AND mine_profile.owner_user_id = ?
                AND mine_profile.profile_type = 'creator'
              ORDER BY mine_app.updated_at DESC LIMIT 1) AS my_application_status
       FROM campaign_opportunities o
       JOIN campaigns c ON c.id = o.campaign_id
       JOIN organizations org ON org.id = o.organization_id
      WHERE EXISTS (
        SELECT 1
          FROM campaign_opportunity_applications mine_app
          JOIN profiles mine_profile ON mine_profile.id = mine_app.applicant_profile_id
         WHERE mine_app.opportunity_id = o.id
           AND mine_profile.owner_user_id = ?
           AND mine_profile.profile_type = 'creator'
      )
      ORDER BY o.created_at DESC LIMIT 200`,
    [auth.user.id, auth.user.id, auth.user.id],
  );
  return json({ opportunities });
}

export async function applyToCampaignOpportunityIntegrity(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{
    opportunityId?: string;
    profileId?: string;
    managerId?: string | null;
    note?: string;
    withdraw?: boolean;
  }>(request);
  if (!body.opportunityId || !body.profileId) {
    throw new HttpError(400, 'Opportunity and profile are required', 'invalid_application');
  }

  const db = new Db(requireDb(env));
  await requireOwnedCreatorProfile(db, auth.user.id, body.profileId);
  await requireOwnedManager(db, auth.user.id, body.managerId);

  const existing = await db.first<{ id: string; status: ApplicationStatus }>(
    `SELECT id, status FROM campaign_opportunity_applications
      WHERE opportunity_id = ? AND applicant_profile_id = ? AND COALESCE(manager_id,'') = COALESCE(?,'')`,
    [body.opportunityId, body.profileId, body.managerId || null],
  );
  const timestamp = now();

  if (existing) {
    if (body.withdraw) {
      if (existing.status !== 'pending') {
        throw new HttpError(409, 'Only a pending application can be withdrawn', 'application_state_conflict');
      }
      await db.run(
        `UPDATE campaign_opportunity_applications
            SET status = 'withdrawn', updated_at = ?
          WHERE id = ? AND status = 'pending'`,
        [timestamp, existing.id],
      );
      const current = await db.first<{ status: ApplicationStatus }>(
        `SELECT status FROM campaign_opportunity_applications WHERE id = ?`,
        [existing.id],
      );
      if (current?.status !== 'withdrawn') {
        throw new HttpError(409, 'This application changed before withdrawal completed', 'application_state_conflict');
      }
      return json({ ok: true, id: existing.id, status: 'withdrawn' });
    }

    if (existing.status !== 'pending') {
      throw new HttpError(409, 'Accepted, rejected, or withdrawn applications cannot be reset to pending', 'application_state_conflict');
    }
    requireOpportunityOpen(await loadOpportunity(db, body.opportunityId));
    await db.run(
      `UPDATE campaign_opportunity_applications SET note = ?, updated_at = ? WHERE id = ? AND status = 'pending'`,
      [body.note?.trim().slice(0, 1000) || '', timestamp, existing.id],
    );
    return json({ ok: true, id: existing.id, status: 'pending' });
  }

  if (body.withdraw) throw new HttpError(404, 'Application not found', 'application_not_found');
  requireOpportunityOpen(await loadOpportunity(db, body.opportunityId));

  const applicationId = id('app');
  await db.run(
    `INSERT INTO campaign_opportunity_applications
      (id, opportunity_id, applicant_profile_id, manager_id, note, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [applicationId, body.opportunityId, body.profileId, body.managerId || null, body.note?.trim().slice(0, 1000) || '', timestamp, timestamp],
  );
  return json({ id: applicationId, status: 'pending' }, { status: 201 });
}

export async function reviewCampaignOpportunityApplicationIntegrity(
  request: Request,
  env: Env,
  applicationId: string,
): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ status?: 'accepted' | 'rejected' }>(request);
  if (!body.status || !['accepted', 'rejected'].includes(body.status)) {
    throw new HttpError(400, 'Choose accepted or rejected', 'invalid_application_status');
  }

  const db = new Db(requireDb(env));
  const application = await db.first<{ organization_id: string; status: ApplicationStatus }>(
    `SELECT o.organization_id, a.status
       FROM campaign_opportunity_applications a
       JOIN campaign_opportunities o ON o.id = a.opportunity_id
      WHERE a.id = ?`,
    [applicationId],
  );
  if (!application) throw new HttpError(404, 'Application not found', 'application_not_found');

  const membership = await organizationMembership(db, auth.user.id, application.organization_id);
  if (!membership || !['owner', 'admin', 'marketing_manager'].includes(membership.role)) {
    throw new HttpError(403, 'Application review access denied', 'forbidden');
  }
  if (application.status !== 'pending') {
    throw new HttpError(409, 'Only a pending application can be accepted or rejected', 'application_state_conflict');
  }

  await db.run(
    `UPDATE campaign_opportunity_applications SET status = ?, updated_at = ? WHERE id = ? AND status = 'pending'`,
    [body.status, now(), applicationId],
  );
  const current = await db.first<{ status: ApplicationStatus }>(
    `SELECT status FROM campaign_opportunity_applications WHERE id = ?`,
    [applicationId],
  );
  if (current?.status !== body.status) {
    throw new HttpError(409, 'This application was already decided by another request', 'application_state_conflict');
  }
  return json({ ok: true, status: body.status });
}
