import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { json } from '../http';
import { requireAuth } from '../auth/session';

type InboxAction = {
  id: string;
  kind: 'project_access_request' | 'opportunity_application';
  title: string;
  detail: string;
  status: 'pending';
  occurredAt: string;
  organizationId: string;
  projectName: string;
  requestId?: string;
  applicationId?: string;
  requestedRole?: string;
  actorRole?: string;
  ownerRequired?: boolean;
  applicantName?: string;
  opportunityTitle?: string;
  campaignName?: string;
  note?: string;
};

type InboxUpdate = {
  id: string;
  kind: 'project_access_decision' | 'opportunity_application_decision';
  title: string;
  detail: string;
  status: 'approved' | 'rejected' | 'accepted';
  occurredAt: string;
  organizationId: string;
  projectName: string;
  requestedRole?: string;
  opportunityTitle?: string;
  campaignName?: string;
};

export async function inboxSummary(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const db = new Db(requireDb(env));

  const [projectRequests, opportunityApplications, myProjectDecisions, myOpportunityDecisions] = await Promise.all([
    db.all<{
      id: string;
      organization_id: string;
      requested_role: string;
      note: string;
      created_at: string;
      display_name: string;
      email: string | null;
      project_name: string;
      actor_role: string;
    }>(
      `SELECT r.id, r.organization_id, r.requested_role, r.note, r.created_at,
              u.display_name, u.email, o.name AS project_name, m.role AS actor_role
         FROM project_access_requests r
         JOIN users u ON u.id = r.requested_by_user_id
         JOIN organizations o ON o.id = r.organization_id
         JOIN organization_memberships m ON m.organization_id = r.organization_id
        WHERE m.user_id = ? AND m.status = 'active' AND m.role IN ('owner','admin')
          AND r.status = 'submitted'
        ORDER BY r.created_at ASC
        LIMIT 100`,
      [auth.user.id],
    ).catch(() => []),
    db.all<{
      id: string;
      organization_id: string;
      note: string;
      created_at: string;
      applicant_name: string;
      applicant_username: string;
      opportunity_title: string;
      campaign_name: string;
      project_name: string;
      actor_role: string;
    }>(
      `SELECT a.id, o.organization_id, a.note, a.created_at,
              p.display_name AS applicant_name, p.username AS applicant_username,
              o.title AS opportunity_title, c.name AS campaign_name, org.name AS project_name,
              m.role AS actor_role
         FROM campaign_opportunity_applications a
         JOIN campaign_opportunities o ON o.id = a.opportunity_id
         JOIN campaigns c ON c.id = o.campaign_id
         JOIN organizations org ON org.id = o.organization_id
         JOIN profiles p ON p.id = a.applicant_profile_id
         JOIN organization_memberships m ON m.organization_id = o.organization_id
        WHERE m.user_id = ? AND m.status = 'active' AND m.role IN ('owner','admin','marketing_manager')
          AND a.status = 'pending'
        ORDER BY a.created_at ASC
        LIMIT 100`,
      [auth.user.id],
    ).catch(() => []),
    db.all<{
      id: string;
      organization_id: string;
      requested_role: string;
      status: 'approved' | 'rejected';
      updated_at: string;
      project_name: string;
    }>(
      `SELECT r.id, r.organization_id, r.requested_role, r.status, r.updated_at, o.name AS project_name
         FROM project_access_requests r
         JOIN organizations o ON o.id = r.organization_id
        WHERE r.requested_by_user_id = ? AND r.status IN ('approved','rejected')
        ORDER BY r.updated_at DESC
        LIMIT 30`,
      [auth.user.id],
    ).catch(() => []),
    db.all<{
      id: string;
      organization_id: string;
      status: 'accepted' | 'rejected';
      updated_at: string;
      opportunity_title: string;
      campaign_name: string;
      project_name: string;
    }>(
      `SELECT a.id, o.organization_id, a.status, a.updated_at,
              o.title AS opportunity_title, c.name AS campaign_name, org.name AS project_name
         FROM campaign_opportunity_applications a
         JOIN profiles p ON p.id = a.applicant_profile_id
         JOIN campaign_opportunities o ON o.id = a.opportunity_id
         JOIN campaigns c ON c.id = o.campaign_id
         JOIN organizations org ON org.id = o.organization_id
        WHERE p.owner_user_id = ? AND p.profile_type = 'creator'
          AND a.status IN ('accepted','rejected')
        ORDER BY a.updated_at DESC
        LIMIT 30`,
      [auth.user.id],
    ).catch(() => []),
  ]);

  const actions: InboxAction[] = [
    ...projectRequests.map((row) => ({
      id: `project-access:${row.id}`,
      kind: 'project_access_request' as const,
      title: `${row.display_name || row.email || 'A Linkary member'} requested ${row.requested_role === 'marketing_manager' ? 'Campaign Manager' : row.requested_role.replace(/_/g, ' ')} access`,
      detail: `Review access to ${row.project_name}.`,
      status: 'pending' as const,
      occurredAt: row.created_at,
      organizationId: row.organization_id,
      projectName: row.project_name,
      requestId: row.id,
      requestedRole: row.requested_role,
      actorRole: row.actor_role,
      ownerRequired: row.actor_role === 'admin' && row.requested_role === 'admin',
      applicantName: row.display_name || row.email || 'Linkary member',
      note: row.note || '',
    })),
    ...opportunityApplications.map((row) => ({
      id: `opportunity:${row.id}`,
      kind: 'opportunity_application' as const,
      title: `${row.applicant_name} applied to ${row.opportunity_title}`,
      detail: `${row.campaign_name} · ${row.project_name}`,
      status: 'pending' as const,
      occurredAt: row.created_at,
      organizationId: row.organization_id,
      projectName: row.project_name,
      applicationId: row.id,
      actorRole: row.actor_role,
      applicantName: row.applicant_name,
      opportunityTitle: row.opportunity_title,
      campaignName: row.campaign_name,
      note: row.note || '',
    })),
  ].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());

  const updates: InboxUpdate[] = [
    ...myProjectDecisions.map((row) => ({
      id: `my-project-access:${row.id}:${row.status}`,
      kind: 'project_access_decision' as const,
      title: row.status === 'approved' ? `Project access approved by ${row.project_name}` : `Project access request declined by ${row.project_name}`,
      detail: `${row.requested_role === 'marketing_manager' ? 'Campaign Manager' : row.requested_role.replace(/_/g, ' ')} access`,
      status: row.status,
      occurredAt: row.updated_at,
      organizationId: row.organization_id,
      projectName: row.project_name,
      requestedRole: row.requested_role,
    })),
    ...myOpportunityDecisions.map((row) => ({
      id: `my-opportunity:${row.id}:${row.status}`,
      kind: 'opportunity_application_decision' as const,
      title: row.status === 'accepted' ? `Application accepted by ${row.project_name}` : `Application not selected by ${row.project_name}`,
      detail: `${row.opportunity_title} · ${row.campaign_name}`,
      status: row.status,
      occurredAt: row.updated_at,
      organizationId: row.organization_id,
      projectName: row.project_name,
      opportunityTitle: row.opportunity_title,
      campaignName: row.campaign_name,
    })),
  ].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()).slice(0, 50);

  return json({
    actions,
    updates,
    counts: {
      actionRequired: actions.filter((item) => !item.ownerRequired).length,
      ownerRequired: actions.filter((item) => item.ownerRequired).length,
      updates: updates.length,
    },
  });
}
