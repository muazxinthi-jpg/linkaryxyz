import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { HttpError, json, readJson } from '../http';
import { requireAuth, verifyCsrf } from '../auth/session';
import { organizationMembership } from './organizations';

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;

export async function listCampaignOpportunities(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const db = new Db(requireDb(env));
  const url = new URL(request.url);
  const organizationId = url.searchParams.get('organizationId');
  const mine = url.searchParams.get('mine') === '1';

  if (organizationId) {
    if (!(await organizationMembership(db, auth.user.id, organizationId))) throw new HttpError(403, 'Opportunity access denied', 'forbidden');
    const opportunities = await db.all(
      `SELECT o.id, o.campaign_id, o.organization_id, o.title, o.brief, o.compensation_text, o.deliverables_text, o.status, o.application_deadline, o.created_at,
              c.name AS campaign_name,
              (SELECT COUNT(*) FROM campaign_opportunity_applications a WHERE a.opportunity_id = o.id AND a.status != 'withdrawn') AS applications
         FROM campaign_opportunities o
         JOIN campaigns c ON c.id = o.campaign_id
        WHERE o.organization_id = ? ORDER BY o.created_at DESC`,
      [organizationId],
    );
    return json({ opportunities });
  }

  const creatorProfiles = await db.all<{ id: string }>("SELECT id FROM profiles WHERE owner_user_id = ? AND profile_type = 'creator'", [auth.user.id]);
  const creatorIds = creatorProfiles.map((p) => p.id);
  const params: unknown[] = [];
  let mineClause = '';
  if (mine && creatorIds.length) {
    mineClause = `AND EXISTS (SELECT 1 FROM campaign_opportunity_applications a WHERE a.opportunity_id = o.id AND a.applicant_profile_id IN (${creatorIds.map(() => '?').join(',')}))`;
    params.push(...creatorIds);
  }
  const opportunities = await db.all(
    `SELECT o.id, o.campaign_id, o.organization_id, o.title, o.brief, o.compensation_text, o.deliverables_text, o.status, o.application_deadline, o.created_at,
            c.name AS campaign_name, org.name AS project_name,
            (SELECT COUNT(*) FROM campaign_opportunity_applications a WHERE a.opportunity_id = o.id AND a.status != 'withdrawn') AS applications
       FROM campaign_opportunities o
       JOIN campaigns c ON c.id = o.campaign_id
       JOIN organizations org ON org.id = o.organization_id
      WHERE o.status = 'open' ${mineClause}
      ORDER BY o.created_at DESC LIMIT 200`,
    params,
  );
  return json({ opportunities });
}

export async function saveCampaignOpportunity(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{
    opportunityId?: string; campaignId?: string; title?: string; brief?: string; compensationText?: string; deliverablesText?: string; applicationDeadline?: string | null; status?: 'draft' | 'open' | 'closed';
  }>(request);
  const db = new Db(requireDb(env));

  let campaignId = body.campaignId;
  let organizationId: string | undefined;
  if (body.opportunityId) {
    const existing = await db.first<{ campaign_id: string; organization_id: string }>('SELECT campaign_id, organization_id FROM campaign_opportunities WHERE id = ?', [body.opportunityId]);
    if (!existing) throw new HttpError(404, 'Opportunity not found', 'opportunity_not_found');
    campaignId = existing.campaign_id;
    organizationId = existing.organization_id;
  } else {
    if (!campaignId) throw new HttpError(400, 'Campaign is required', 'campaign_required');
    const campaign = await db.first<{ organization_id: string }>('SELECT organization_id FROM campaigns WHERE id = ?', [campaignId]);
    if (!campaign) throw new HttpError(404, 'Campaign not found', 'campaign_not_found');
    organizationId = campaign.organization_id;
  }

  const membership = await organizationMembership(db, auth.user.id, organizationId!);
  if (!membership || !['owner', 'admin', 'marketing_manager'].includes(membership.role)) throw new HttpError(403, 'Opportunity access denied', 'forbidden');
  const project = await db.first<{ status: string; verification_status: string }>('SELECT status, verification_status FROM organizations WHERE id = ?', [organizationId]);
  if (!project || project.status !== 'active' || project.verification_status !== 'verified_x') throw new HttpError(409, 'Verify the Project before publishing opportunities', 'project_verification_required');

  const title = body.title?.trim().slice(0, 140);
  if (!title) throw new HttpError(400, 'Opportunity title is required', 'invalid_opportunity');
  const status = ['draft', 'open', 'closed'].includes(body.status || '') ? body.status! : 'draft';
  const timestamp = now();

  if (body.opportunityId) {
    await db.run(
      `UPDATE campaign_opportunities SET title = ?, brief = ?, compensation_text = ?, deliverables_text = ?, status = ?, application_deadline = ?, updated_at = ? WHERE id = ?`,
      [title, body.brief?.trim().slice(0, 1500) || '', body.compensationText?.trim().slice(0, 500) || '', body.deliverablesText?.trim().slice(0, 1000) || '', status, body.applicationDeadline || null, timestamp, body.opportunityId],
    );
    return json({ ok: true, id: body.opportunityId });
  }

  const existing = await db.first<{ id: string }>('SELECT id FROM campaign_opportunities WHERE campaign_id = ?', [campaignId]);
  if (existing) throw new HttpError(409, 'This campaign already has an opportunity', 'opportunity_exists');
  const opportunityId = id('opp');
  await db.run(
    `INSERT INTO campaign_opportunities (id, campaign_id, organization_id, title, brief, compensation_text, deliverables_text, status, application_deadline, created_by_user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [opportunityId, campaignId, organizationId, title, body.brief?.trim().slice(0, 1500) || '', body.compensationText?.trim().slice(0, 500) || '', body.deliverablesText?.trim().slice(0, 1000) || '', status, body.applicationDeadline || null, auth.user.id, timestamp, timestamp],
  );
  return json({ id: opportunityId }, { status: 201 });
}

export async function applyToCampaignOpportunity(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ opportunityId?: string; profileId?: string; managerId?: string | null; note?: string; withdraw?: boolean }>(request);
  if (!body.opportunityId || !body.profileId) throw new HttpError(400, 'Opportunity and profile are required', 'invalid_application');
  const db = new Db(requireDb(env));
  const profile = await db.first<{ id: string }>("SELECT id FROM profiles WHERE id = ? AND owner_user_id = ? AND profile_type = 'creator'", [body.profileId, auth.user.id]);
  if (!profile) throw new HttpError(403, 'Use your personal Creator profile to apply', 'forbidden');
  if (body.managerId) {
    const manager = await db.first<{ id: string }>(`SELECT m.id FROM partner_managers m JOIN profiles p ON p.id = m.profile_id WHERE m.id = ? AND p.owner_user_id = ?`, [body.managerId, auth.user.id]);
    if (!manager) throw new HttpError(403, 'Manager listing access denied', 'forbidden');
  }
  const opportunity = await db.first<{ status: string }>('SELECT status FROM campaign_opportunities WHERE id = ?', [body.opportunityId]);
  if (!opportunity || opportunity.status !== 'open') throw new HttpError(409, 'This opportunity is not accepting applications', 'opportunity_closed');
  const existing = await db.first<{ id: string }>(
    'SELECT id FROM campaign_opportunity_applications WHERE opportunity_id = ? AND applicant_profile_id = ? AND COALESCE(manager_id,\'\') = COALESCE(?,\'\')',
    [body.opportunityId, body.profileId, body.managerId || null],
  );
  const timestamp = now();
  if (existing) {
    await db.run('UPDATE campaign_opportunity_applications SET note = ?, status = ?, updated_at = ? WHERE id = ?', [body.note?.trim().slice(0, 1000) || '', body.withdraw ? 'withdrawn' : 'pending', timestamp, existing.id]);
    return json({ ok: true, id: existing.id });
  }
  if (body.withdraw) throw new HttpError(404, 'Application not found', 'application_not_found');
  const applicationId = id('app');
  await db.run(
    `INSERT INTO campaign_opportunity_applications (id, opportunity_id, applicant_profile_id, manager_id, note, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [applicationId, body.opportunityId, body.profileId, body.managerId || null, body.note?.trim().slice(0, 1000) || '', timestamp, timestamp],
  );
  return json({ id: applicationId }, { status: 201 });
}

export async function listCampaignOpportunityApplications(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const opportunityId = new URL(request.url).searchParams.get('opportunityId');
  if (!opportunityId) throw new HttpError(400, 'opportunityId is required', 'opportunity_required');
  const db = new Db(requireDb(env));
  const opportunity = await db.first<{ organization_id: string }>('SELECT organization_id FROM campaign_opportunities WHERE id = ?', [opportunityId]);
  if (!opportunity) throw new HttpError(404, 'Opportunity not found', 'opportunity_not_found');
  const membership = await organizationMembership(db, auth.user.id, opportunity.organization_id);
  if (!membership || !['owner', 'admin', 'marketing_manager', 'analyst', 'viewer'].includes(membership.role)) throw new HttpError(403, 'Application access denied', 'forbidden');
  const applications = await db.all(
    `SELECT a.id, a.status, a.note, a.created_at, p.id AS profile_id, p.display_name, p.username, a.manager_id,
            m.manager_type, m.display_name AS manager_name
       FROM campaign_opportunity_applications a
       JOIN profiles p ON p.id = a.applicant_profile_id
       LEFT JOIN partner_managers m ON m.id = a.manager_id
      WHERE a.opportunity_id = ? ORDER BY a.created_at DESC`,
    [opportunityId],
  );
  return json({ applications });
}

export async function reviewCampaignOpportunityApplication(request: Request, env: Env, applicationId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ status?: 'accepted' | 'rejected' }>(request);
  if (!body.status || !['accepted', 'rejected'].includes(body.status)) throw new HttpError(400, 'Choose accepted or rejected', 'invalid_application_status');
  const db = new Db(requireDb(env));
  const application = await db.first<{ organization_id: string }>(
    `SELECT o.organization_id FROM campaign_opportunity_applications a JOIN campaign_opportunities o ON o.id = a.opportunity_id WHERE a.id = ?`,
    [applicationId],
  );
  if (!application) throw new HttpError(404, 'Application not found', 'application_not_found');
  const membership = await organizationMembership(db, auth.user.id, application.organization_id);
  if (!membership || !['owner', 'admin', 'marketing_manager'].includes(membership.role)) throw new HttpError(403, 'Application review access denied', 'forbidden');
  await db.run('UPDATE campaign_opportunity_applications SET status = ?, updated_at = ? WHERE id = ?', [body.status, now(), applicationId]);
  return json({ ok: true, status: body.status });
}
