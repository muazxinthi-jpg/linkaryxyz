import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { json } from '../http';
import { requireAuth } from '../auth/session';

export async function listMyOpportunityApplications(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const db = new Db(requireDb(env));
  const applications = await db.all<{
    id: string;
    opportunity_id: string;
    applicant_profile_id: string;
    manager_id: string | null;
    note: string;
    status: string;
    created_at: string;
    updated_at: string;
    opportunity_title: string;
    campaign_name: string;
    project_name: string;
  }>(
    `SELECT a.id, a.opportunity_id, a.applicant_profile_id, a.manager_id, a.note, a.status,
            a.created_at, a.updated_at, o.title AS opportunity_title,
            c.name AS campaign_name, org.name AS project_name
       FROM campaign_opportunity_applications a
       JOIN profiles p ON p.id = a.applicant_profile_id
       JOIN campaign_opportunities o ON o.id = a.opportunity_id
       JOIN campaigns c ON c.id = o.campaign_id
       JOIN organizations org ON org.id = o.organization_id
      WHERE p.owner_user_id = ? AND p.profile_type = 'creator'
      ORDER BY a.updated_at DESC
      LIMIT 200`,
    [auth.user.id],
  );

  return json({ applications });
}
