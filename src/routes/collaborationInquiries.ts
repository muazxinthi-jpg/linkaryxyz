import type { Env } from '../env';
import { Db } from '../db/client';
import { ensureCollaborationInquirySchema } from '../db/collaborationInquirySchema';
import { HttpError, json } from '../http';
import { requireOperationalProjectAccess } from './organizations';
import { publicProfileUrl } from '../urls';

const now = () => new Date().toISOString();
const inquiryId = () => `inq_${crypto.randomUUID().replace(/-/g, '')}`;
const inquiryTypes = new Set(['content_collaboration', 'telegram_promotion', 'community_activation', 'x_campaign', 'ambassador', 'partnership', 'other']);

export type CollaborationInquiryMutationBody = {
  action?: 'send_inquiry' | 'review_inquiry' | 'withdraw_inquiry' | 'record_activation';
  inquiryId?: string;
  activityId?: string;
  decision?: 'accepted' | 'declined';
  organizationId?: string;
  targetKind?: 'creator' | 'community_manager';
  targetProfileId?: string;
  partnerManagerId?: string;
  partnerAssetId?: string | null;
  campaignId?: string | null;
  inquiryType?: string;
  budgetUsd?: number | null;
  message?: string;
  deliverables?: string;
};

type InquiryRow = {
  id: string;
  organization_id: string;
  project_name: string;
  target_kind: 'creator' | 'community_manager';
  target_profile_id: string;
  target_display_name: string;
  target_username: string;
  partner_manager_id: string | null;
  manager_name: string | null;
  partner_asset_id: string | null;
  community_name: string | null;
  community_verification_status: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  inquiry_type: string;
  budget_usd: number | null;
  message: string;
  deliverables: string;
  status: string;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
  activated_activity_id: string | null;
  activated_activity_title: string | null;
  activated_campaign_id: string | null;
  activated_campaign_name: string | null;
  activated_at: string | null;
};

const inquirySelect = `SELECT ci.id,
       ci.organization_id,
       o.name AS project_name,
       ci.target_kind,
       ci.target_profile_id,
       tp.display_name AS target_display_name,
       tp.username AS target_username,
       ci.partner_manager_id,
       pm.display_name AS manager_name,
       ci.partner_asset_id,
       pa.name AS community_name,
       pa.verification_status AS community_verification_status,
       ci.campaign_id,
       c.name AS campaign_name,
       ci.inquiry_type,
       ci.budget_usd,
       ci.message,
       ci.deliverables,
       ci.status,
       ci.responded_at,
       ci.created_at,
       ci.updated_at,
       ia.activity_id AS activated_activity_id,
       aa.title AS activated_activity_title,
       aa.campaign_id AS activated_campaign_id,
       ac.name AS activated_campaign_name,
       ia.activated_at
  FROM collaboration_inquiries ci
  JOIN organizations o ON o.id = ci.organization_id
  JOIN profiles tp ON tp.id = ci.target_profile_id
  LEFT JOIN partner_managers pm ON pm.id = ci.partner_manager_id
  LEFT JOIN partner_manager_assets pa ON pa.id = ci.partner_asset_id
  LEFT JOIN campaigns c ON c.id = ci.campaign_id
  LEFT JOIN collaboration_inquiry_activations ia ON ia.inquiry_id = ci.id
  LEFT JOIN campaign_activities aa ON aa.id = ia.activity_id
  LEFT JOIN campaigns ac ON ac.id = aa.campaign_id`;

export async function listCollaborationInquiries(request: Request, env: Env, userId: string, db: Db): Promise<Response> {
  await ensureCollaborationInquirySchema(db);
  const scope = new URL(request.url).searchParams.get('inquiries');
  if (scope === 'incoming') {
    const inquiries = await db.all<InquiryRow>(
      `${inquirySelect}
        WHERE tp.owner_user_id = ?
        ORDER BY CASE ci.status WHEN 'pending' THEN 0 ELSE 1 END, ci.updated_at DESC
        LIMIT 100`,
      [userId],
    );
    return json({ inquiries, scope: 'incoming' });
  }
  if (scope === 'outgoing') {
    const inquiries = await db.all<InquiryRow>(
      `${inquirySelect}
        JOIN organization_memberships om ON om.organization_id = ci.organization_id
       WHERE om.user_id = ?
         AND om.status = 'active'
         AND om.role IN ('owner','admin','marketing_manager')
       ORDER BY ci.updated_at DESC
       LIMIT 150`,
      [userId],
    );
    return json({ inquiries, scope: 'outgoing' });
  }
  throw new HttpError(400, 'Choose incoming or outgoing collaboration inquiries', 'invalid_inquiry_scope');
}

async function markShortlistContacted(db: Db, request: Request, env: Env, organizationId: string, targetKind: 'creator' | 'community_manager', targetUsername: string, partnerManagerId: string | null): Promise<void> {
  if (targetKind === 'community_manager' && partnerManagerId) {
    await db.run(
      `UPDATE project_partner_shortlists
          SET status = 'contacted', updated_at = ?
        WHERE organization_id = ? AND partner_manager_id = ? AND status = 'interested'`,
      [now(), organizationId, partnerManagerId],
    );
    return;
  }
  const profileUrl = publicProfileUrl(request, env, targetUsername);
  await db.run(
    `UPDATE project_partner_shortlists
        SET status = 'contacted', updated_at = ?
      WHERE organization_id = ?
        AND status = 'interested'
        AND network_entity_id IN (
          SELECT id FROM project_network_entities WHERE organization_id = ? AND entity_type = 'creator' AND primary_url = ?
        )`,
    [now(), organizationId, organizationId, profileUrl],
  );
}

async function markShortlistInDiscussion(db: Db, request: Request, env: Env, organizationId: string, targetKind: 'creator' | 'community_manager', targetUsername: string, partnerManagerId: string | null): Promise<void> {
  if (targetKind === 'community_manager' && partnerManagerId) {
    await db.run(
      `UPDATE project_partner_shortlists
          SET status = 'negotiating', updated_at = ?
        WHERE organization_id = ? AND partner_manager_id = ? AND status IN ('interested','contacted')`,
      [now(), organizationId, partnerManagerId],
    );
    return;
  }
  const profileUrl = publicProfileUrl(request, env, targetUsername);
  await db.run(
    `UPDATE project_partner_shortlists
        SET status = 'negotiating', updated_at = ?
      WHERE organization_id = ?
        AND status IN ('interested','contacted')
        AND network_entity_id IN (
          SELECT id FROM project_network_entities WHERE organization_id = ? AND entity_type = 'creator' AND primary_url = ?
        )`,
    [now(), organizationId, organizationId, profileUrl],
  );
}

async function markShortlistActive(db: Db, request: Request, env: Env, organizationId: string, targetKind: 'creator' | 'community_manager', targetUsername: string, partnerManagerId: string | null): Promise<void> {
  if (targetKind === 'community_manager' && partnerManagerId) {
    await db.run(
      `UPDATE project_partner_shortlists
          SET status = 'active', updated_at = ?
        WHERE organization_id = ? AND partner_manager_id = ? AND status IN ('interested','contacted','negotiating')`,
      [now(), organizationId, partnerManagerId],
    );
    return;
  }
  const profileUrl = publicProfileUrl(request, env, targetUsername);
  await db.run(
    `UPDATE project_partner_shortlists
        SET status = 'active', updated_at = ?
      WHERE organization_id = ?
        AND status IN ('interested','contacted','negotiating')
        AND network_entity_id IN (
          SELECT id FROM project_network_entities WHERE organization_id = ? AND entity_type = 'creator' AND primary_url = ?
        )`,
    [now(), organizationId, organizationId, profileUrl],
  );
}

async function currentPendingInquiry(
  db: Db,
  organizationId: string,
  targetProfileId: string,
  targetKind: 'creator' | 'community_manager',
  partnerManagerId: string | null,
): Promise<{ id: string; created_at: string; updated_at: string } | null> {
  return db.first<{ id: string; created_at: string; updated_at: string }>(
    `SELECT id, created_at, updated_at FROM collaboration_inquiries
      WHERE organization_id = ?
        AND target_profile_id = ?
        AND target_kind = ?
        AND status = 'pending'
        AND COALESCE(partner_manager_id, '') = COALESCE(?, '')
      ORDER BY created_at ASC LIMIT 1`,
    [organizationId, targetProfileId, targetKind, partnerManagerId],
  );
}

export async function handleCollaborationInquiryMutation(
  request: Request,
  env: Env,
  userId: string,
  db: Db,
  body: CollaborationInquiryMutationBody,
): Promise<Response> {
  await ensureCollaborationInquirySchema(db);

  if (body.action === 'send_inquiry') {
    if (!body.organizationId || !body.targetKind || !body.targetProfileId) {
      throw new HttpError(400, 'Project and partner are required', 'invalid_inquiry');
    }
    if (!inquiryTypes.has(body.inquiryType || '')) throw new HttpError(400, 'Choose a valid inquiry type', 'invalid_inquiry_type');
    const message = body.message?.trim() || '';
    if (message.length < 5 || message.length > 1200) throw new HttpError(400, 'Add a short collaboration message', 'invalid_inquiry_message');
    const deliverables = body.deliverables?.trim().slice(0, 1200) || '';
    const budget = body.budgetUsd === null || body.budgetUsd === undefined || body.budgetUsd === ('' as unknown as number) ? null : Number(body.budgetUsd);
    if (budget !== null && (!Number.isFinite(budget) || budget < 0)) throw new HttpError(400, 'Choose a valid optional budget', 'invalid_inquiry_budget');

    await requireOperationalProjectAccess(db, userId, body.organizationId, true);

    let targetUsername = '';
    let targetOwnerUserId: string | null = null;
    let partnerManagerId: string | null = null;
    let partnerAssetId: string | null = null;

    if (body.targetKind === 'creator') {
      if (body.partnerManagerId || body.partnerAssetId) throw new HttpError(400, 'Creator inquiry target is invalid', 'invalid_inquiry_target');
      const creator = await db.first<{ id: string; username: string; owner_user_id: string | null }>(
        `SELECT id, username, owner_user_id FROM profiles
          WHERE id = ? AND profile_type = 'creator' AND visibility = 'published'`,
        [body.targetProfileId],
      );
      if (!creator?.owner_user_id) throw new HttpError(404, 'Creator profile not found', 'partner_not_found');
      targetUsername = creator.username;
      targetOwnerUserId = creator.owner_user_id;
    } else {
      if (!body.partnerManagerId) throw new HttpError(400, 'Choose a Community Manager', 'invalid_inquiry_target');
      const manager = await db.first<{ manager_id: string; profile_id: string; username: string; owner_user_id: string | null }>(
        `SELECT m.id AS manager_id, m.profile_id, p.username, p.owner_user_id
           FROM partner_managers m
           JOIN profiles p ON p.id = m.profile_id
          WHERE m.id = ?
            AND m.profile_id = ?
            AND m.manager_type = 'community_manager'
            AND m.visibility = 'public'`,
        [body.partnerManagerId, body.targetProfileId],
      );
      if (!manager?.owner_user_id) throw new HttpError(404, 'Community Manager not found', 'partner_not_found');
      partnerManagerId = manager.manager_id;
      targetUsername = manager.username;
      targetOwnerUserId = manager.owner_user_id;
      if (body.partnerAssetId) {
        const asset = await db.first<{ id: string }>(
          `SELECT id FROM partner_manager_assets
            WHERE id = ? AND manager_id = ? AND asset_type = 'telegram_community'`,
          [body.partnerAssetId, partnerManagerId],
        );
        if (!asset) throw new HttpError(404, 'Selected Telegram Community was not found', 'community_not_found');
        partnerAssetId = asset.id;
      }
    }

    if (targetOwnerUserId === userId) throw new HttpError(409, 'Choose a partner outside your own account', 'self_inquiry');

    let campaignId: string | null = null;
    if (body.campaignId) {
      const campaign = await db.first<{ id: string }>('SELECT id FROM campaigns WHERE id = ? AND organization_id = ?', [body.campaignId, body.organizationId]);
      if (!campaign) throw new HttpError(404, 'Campaign not found for this Project', 'campaign_not_found');
      campaignId = campaign.id;
    }

    const existing = await currentPendingInquiry(db, body.organizationId, body.targetProfileId, body.targetKind, partnerManagerId);
    if (existing) throw new HttpError(409, 'A collaboration inquiry is already waiting for this partner', 'inquiry_already_pending');

    const id = inquiryId();
    const timestamp = now();
    const targetGuard = body.targetKind === 'creator'
      ? `EXISTS (
           SELECT 1 FROM profiles target
            WHERE target.id = ? AND target.profile_type = 'creator' AND target.visibility = 'published'
              AND target.owner_user_id IS NOT NULL AND target.owner_user_id != ?
         )`
      : `EXISTS (
           SELECT 1 FROM partner_managers manager
           JOIN profiles target ON target.id = manager.profile_id
            WHERE manager.id = ? AND manager.profile_id = ?
              AND manager.manager_type = 'community_manager' AND manager.visibility = 'public'
              AND target.owner_user_id IS NOT NULL AND target.owner_user_id != ?
         )
         AND (? IS NULL OR EXISTS (
           SELECT 1 FROM partner_manager_assets asset
            WHERE asset.id = ? AND asset.manager_id = ? AND asset.asset_type = 'telegram_community'
         ))`;
    const targetParams = body.targetKind === 'creator'
      ? [body.targetProfileId, userId]
      : [partnerManagerId, body.targetProfileId, userId, partnerAssetId, partnerAssetId, partnerManagerId];

    await db.run(
      `INSERT INTO collaboration_inquiries
        (id,organization_id,created_by_user_id,target_kind,target_profile_id,partner_manager_id,partner_asset_id,campaign_id,inquiry_type,budget_usd,message,deliverables,status,responded_at,created_at,updated_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM organizations project
          JOIN organization_memberships actor ON actor.organization_id = project.id
           WHERE project.id = ? AND project.status = 'active' AND project.verification_status = 'verified_x'
             AND actor.user_id = ? AND actor.status = 'active'
             AND actor.role IN ('owner','admin','marketing_manager')
        )
          AND ${targetGuard}
          AND (? IS NULL OR EXISTS (
            SELECT 1 FROM campaigns campaign WHERE campaign.id = ? AND campaign.organization_id = ?
          ))
          AND NOT EXISTS (
            SELECT 1 FROM collaboration_inquiries existing_inquiry
             WHERE existing_inquiry.organization_id = ?
               AND existing_inquiry.target_profile_id = ?
               AND existing_inquiry.target_kind = ?
               AND existing_inquiry.status = 'pending'
               AND COALESCE(existing_inquiry.partner_manager_id, '') = COALESCE(?, '')
          )`,
      [
        id, body.organizationId, userId, body.targetKind, body.targetProfileId, partnerManagerId, partnerAssetId,
        campaignId, body.inquiryType, budget, message, deliverables, timestamp, timestamp,
        body.organizationId, userId,
        ...targetParams,
        campaignId, campaignId, body.organizationId,
        body.organizationId, body.targetProfileId, body.targetKind, partnerManagerId,
      ],
    );

    const authoritative = await currentPendingInquiry(db, body.organizationId, body.targetProfileId, body.targetKind, partnerManagerId);
    if (!authoritative) {
      await requireOperationalProjectAccess(db, userId, body.organizationId, true);
      throw new HttpError(409, 'The collaboration inquiry could not be created. Refresh and try again.', 'inquiry_state_conflict');
    }
    const createdByThisRequest = authoritative.id === id && authoritative.created_at === timestamp && authoritative.updated_at === timestamp;
    if (createdByThisRequest) {
      await markShortlistContacted(db, request, env, body.organizationId, body.targetKind, targetUsername, partnerManagerId);
    }
    return json(
      { id: authoritative.id, status: 'pending', duplicate: !createdByThisRequest },
      { status: createdByThisRequest ? 201 : 200 },
    );
  }

  if (body.action === 'review_inquiry') {
    if (!body.inquiryId || !['accepted', 'declined'].includes(body.decision || '')) throw new HttpError(400, 'Choose Accept or Decline', 'invalid_inquiry_decision');
    const inquiry = await db.first<{
      id: string;
      organization_id: string;
      target_kind: 'creator' | 'community_manager';
      target_profile_id: string;
      target_username: string;
      partner_manager_id: string | null;
      owner_user_id: string | null;
      status: string;
    }>(
      `SELECT ci.id, ci.organization_id, ci.target_kind, ci.target_profile_id, p.username AS target_username, ci.partner_manager_id, p.owner_user_id, ci.status
         FROM collaboration_inquiries ci
         JOIN profiles p ON p.id = ci.target_profile_id
        WHERE ci.id = ?`,
      [body.inquiryId],
    );
    if (!inquiry || inquiry.owner_user_id !== userId) throw new HttpError(404, 'Collaboration inquiry not found', 'inquiry_not_found');
    if (inquiry.status !== 'pending') throw new HttpError(409, 'This inquiry has already been decided', 'inquiry_already_reviewed');

    const timestamp = now();
    await db.run(
      `UPDATE collaboration_inquiries
          SET status = ?, responded_at = ?, updated_at = ?
        WHERE id = ? AND status = 'pending'
          AND EXISTS (
            SELECT 1 FROM profiles target
             WHERE target.id = collaboration_inquiries.target_profile_id AND target.owner_user_id = ?
          )`,
      [body.decision, timestamp, timestamp, inquiry.id, userId],
    );
    const current = await db.first<{ status: string; responded_at: string | null; updated_at: string; owner_user_id: string | null }>(
      `SELECT ci.status, ci.responded_at, ci.updated_at, p.owner_user_id
         FROM collaboration_inquiries ci
         JOIN profiles p ON p.id = ci.target_profile_id
        WHERE ci.id = ?`,
      [inquiry.id],
    );
    if (!current || current.owner_user_id !== userId) throw new HttpError(404, 'Collaboration inquiry not found', 'inquiry_not_found');
    if (current.status !== body.decision || current.responded_at !== timestamp || current.updated_at !== timestamp) {
      throw new HttpError(409, 'This inquiry was already decided by another request', 'inquiry_already_reviewed');
    }
    if (body.decision === 'accepted') {
      await markShortlistInDiscussion(db, request, env, inquiry.organization_id, inquiry.target_kind, inquiry.target_username, inquiry.partner_manager_id);
    }
    return json({ ok: true, id: inquiry.id, status: body.decision });
  }

  if (body.action === 'record_activation') {
    if (!body.inquiryId || !body.activityId) throw new HttpError(400, 'Inquiry and activity are required', 'invalid_inquiry_activation');
    const inquiry = await db.first<{
      id: string;
      organization_id: string;
      target_kind: 'creator' | 'community_manager';
      target_profile_id: string;
      target_username: string;
      partner_manager_id: string | null;
      partner_asset_id: string | null;
      campaign_id: string | null;
      status: string;
    }>(
      `SELECT ci.id, ci.organization_id, ci.target_kind, ci.target_profile_id, p.username AS target_username,
              ci.partner_manager_id, ci.partner_asset_id, ci.campaign_id, ci.status
         FROM collaboration_inquiries ci
         JOIN profiles p ON p.id = ci.target_profile_id
        WHERE ci.id = ?`,
      [body.inquiryId],
    );
    if (!inquiry) throw new HttpError(404, 'Collaboration inquiry not found', 'inquiry_not_found');
    await requireOperationalProjectAccess(db, userId, inquiry.organization_id, true);
    if (inquiry.status !== 'accepted') throw new HttpError(409, 'Only accepted collaboration inquiries can be activated', 'inquiry_not_accepted');

    const existing = await db.first<{ activity_id: string }>('SELECT activity_id FROM collaboration_inquiry_activations WHERE inquiry_id = ?', [inquiry.id]);
    if (existing) {
      if (existing.activity_id === body.activityId) return json({ ok: true, inquiryId: inquiry.id, activityId: existing.activity_id, existing: true });
      throw new HttpError(409, 'This collaboration inquiry is already activated in another activity', 'inquiry_already_activated');
    }
    const claimed = await db.first<{ inquiry_id: string }>('SELECT inquiry_id FROM collaboration_inquiry_activations WHERE activity_id = ?', [body.activityId]);
    if (claimed) throw new HttpError(409, 'This activity is already linked to another collaboration inquiry', 'activity_already_activated');

    const activity = await db.first<{
      id: string;
      campaign_id: string;
      campaign_name: string;
      organization_id: string;
      assignment_kind: 'creator' | 'community' | null;
      creator_profile_id: string | null;
      partner_manager_id: string | null;
      partner_asset_id: string | null;
    }>(
      `SELECT a.id, a.campaign_id, c.name AS campaign_name, c.organization_id,
              la.assignment_kind, la.creator_profile_id, la.partner_manager_id, la.partner_asset_id
         FROM campaign_activities a
         JOIN campaigns c ON c.id = a.campaign_id
         LEFT JOIN campaign_activity_linkary_assignments la ON la.activity_id = a.id
        WHERE a.id = ?`,
      [body.activityId],
    );
    if (!activity || activity.organization_id !== inquiry.organization_id || (inquiry.campaign_id && activity.campaign_id !== inquiry.campaign_id)) {
      throw new HttpError(404, 'Activity not found for this Project or inquiry campaign', 'activity_not_found');
    }

    const matchesAcceptedPartner = inquiry.target_kind === 'creator'
      ? activity.assignment_kind === 'creator'
        && activity.creator_profile_id === inquiry.target_profile_id
        && !activity.partner_manager_id
        && !activity.partner_asset_id
      : activity.assignment_kind === 'community'
        && activity.partner_manager_id === inquiry.partner_manager_id
        && Boolean(activity.partner_asset_id)
        && (!inquiry.partner_asset_id || activity.partner_asset_id === inquiry.partner_asset_id);

    if (!matchesAcceptedPartner) {
      throw new HttpError(409, 'Assign the accepted inquiry partner to this exact activity before activation.', 'activation_partner_mismatch');
    }

    const timestamp = now();
    await db.run(
      `INSERT OR IGNORE INTO collaboration_inquiry_activations
        (inquiry_id, activity_id, organization_id, activated_by_user_id, activated_at)
       SELECT ci.id, a.id, ci.organization_id, ?, ?
         FROM collaboration_inquiries ci
         JOIN campaign_activities a ON a.id = ?
         JOIN campaigns c ON c.id = a.campaign_id
         JOIN campaign_activity_linkary_assignments la ON la.activity_id = a.id
        WHERE ci.id = ?
          AND ci.status = 'accepted'
          AND c.organization_id = ci.organization_id
          AND (ci.campaign_id IS NULL OR ci.campaign_id = a.campaign_id)
          AND EXISTS (
            SELECT 1 FROM organizations project
            JOIN organization_memberships actor ON actor.organization_id = project.id
             WHERE project.id = ci.organization_id
               AND project.status = 'active' AND project.verification_status = 'verified_x'
               AND actor.user_id = ? AND actor.status = 'active'
               AND actor.role IN ('owner','admin','marketing_manager')
          )
          AND (
            (ci.target_kind = 'creator'
              AND la.assignment_kind = 'creator'
              AND la.creator_profile_id = ci.target_profile_id
              AND la.partner_manager_id IS NULL
              AND la.partner_asset_id IS NULL)
            OR
            (ci.target_kind = 'community_manager'
              AND la.assignment_kind = 'community'
              AND la.partner_manager_id = ci.partner_manager_id
              AND la.partner_asset_id IS NOT NULL
              AND (ci.partner_asset_id IS NULL OR la.partner_asset_id = ci.partner_asset_id))
          )`,
      [userId, timestamp, body.activityId, inquiry.id, userId],
    );

    const activated = await db.first<{ inquiry_id: string; activity_id: string; activated_by_user_id: string; activated_at: string }>(
      'SELECT inquiry_id, activity_id, activated_by_user_id, activated_at FROM collaboration_inquiry_activations WHERE inquiry_id = ?',
      [inquiry.id],
    );
    if (activated) {
      if (activated.activity_id !== body.activityId) {
        throw new HttpError(409, 'This collaboration inquiry is already activated in another activity', 'inquiry_already_activated');
      }
      const createdByThisRequest = activated.activated_by_user_id === userId && activated.activated_at === timestamp;
      if (createdByThisRequest) {
        await markShortlistActive(db, request, env, inquiry.organization_id, inquiry.target_kind, inquiry.target_username, inquiry.partner_manager_id);
      }
      return json({
        ok: true,
        inquiryId: inquiry.id,
        activityId: activated.activity_id,
        campaignId: activity.campaign_id,
        campaignName: activity.campaign_name,
        activatedAt: activated.activated_at,
        existing: !createdByThisRequest,
      }, { status: createdByThisRequest ? 201 : 200 });
    }

    const activityClaim = await db.first<{ inquiry_id: string }>('SELECT inquiry_id FROM collaboration_inquiry_activations WHERE activity_id = ?', [body.activityId]);
    if (activityClaim) throw new HttpError(409, 'This activity is already linked to another collaboration inquiry', 'activity_already_activated');

    await requireOperationalProjectAccess(db, userId, inquiry.organization_id, true);
    const currentInquiry = await db.first<{ status: string }>('SELECT status FROM collaboration_inquiries WHERE id = ?', [inquiry.id]);
    if (currentInquiry?.status !== 'accepted') throw new HttpError(409, 'Only accepted collaboration inquiries can be activated', 'inquiry_not_accepted');
    const currentActivity = await db.first<{
      organization_id: string;
      campaign_id: string;
      assignment_kind: 'creator' | 'community' | null;
      creator_profile_id: string | null;
      partner_manager_id: string | null;
      partner_asset_id: string | null;
    }>(
      `SELECT c.organization_id, a.campaign_id, la.assignment_kind, la.creator_profile_id, la.partner_manager_id, la.partner_asset_id
         FROM campaign_activities a
         JOIN campaigns c ON c.id = a.campaign_id
         LEFT JOIN campaign_activity_linkary_assignments la ON la.activity_id = a.id
        WHERE a.id = ?`,
      [body.activityId],
    );
    if (!currentActivity || currentActivity.organization_id !== inquiry.organization_id || (inquiry.campaign_id && currentActivity.campaign_id !== inquiry.campaign_id)) {
      throw new HttpError(404, 'Activity not found for this Project or inquiry campaign', 'activity_not_found');
    }
    const stillMatches = inquiry.target_kind === 'creator'
      ? currentActivity.assignment_kind === 'creator'
        && currentActivity.creator_profile_id === inquiry.target_profile_id
        && !currentActivity.partner_manager_id
        && !currentActivity.partner_asset_id
      : currentActivity.assignment_kind === 'community'
        && currentActivity.partner_manager_id === inquiry.partner_manager_id
        && Boolean(currentActivity.partner_asset_id)
        && (!inquiry.partner_asset_id || currentActivity.partner_asset_id === inquiry.partner_asset_id);
    if (!stillMatches) throw new HttpError(409, 'Assign the accepted inquiry partner to this exact activity before activation.', 'activation_partner_mismatch');
    throw new HttpError(409, 'The inquiry activation changed before this request completed. Refresh and try again.', 'inquiry_activation_conflict');
  }

  if (body.action === 'withdraw_inquiry') {
    if (!body.inquiryId) throw new HttpError(400, 'Inquiry is required', 'invalid_inquiry');
    const inquiry = await db.first<{ id: string; organization_id: string; status: string }>('SELECT id, organization_id, status FROM collaboration_inquiries WHERE id = ?', [body.inquiryId]);
    if (!inquiry) throw new HttpError(404, 'Collaboration inquiry not found', 'inquiry_not_found');
    await requireOperationalProjectAccess(db, userId, inquiry.organization_id, true);
    if (inquiry.status !== 'pending') throw new HttpError(409, 'Only pending inquiries can be withdrawn', 'inquiry_not_pending');

    const timestamp = now();
    await db.run(
      `UPDATE collaboration_inquiries
          SET status = 'withdrawn', updated_at = ?
        WHERE id = ? AND status = 'pending'
          AND EXISTS (
            SELECT 1 FROM organizations project
            JOIN organization_memberships actor ON actor.organization_id = project.id
             WHERE project.id = collaboration_inquiries.organization_id
               AND project.status = 'active' AND project.verification_status = 'verified_x'
               AND actor.user_id = ? AND actor.status = 'active'
               AND actor.role IN ('owner','admin','marketing_manager')
          )`,
      [timestamp, inquiry.id, userId],
    );
    const current = await db.first<{ status: string; updated_at: string }>('SELECT status, updated_at FROM collaboration_inquiries WHERE id = ?', [inquiry.id]);
    if (current?.status !== 'withdrawn' || current.updated_at !== timestamp) {
      await requireOperationalProjectAccess(db, userId, inquiry.organization_id, true);
      throw new HttpError(409, 'Only pending inquiries can be withdrawn', 'inquiry_not_pending');
    }
    return json({ ok: true, id: inquiry.id, status: 'withdrawn' });
  }

  throw new HttpError(400, 'Choose a valid collaboration inquiry action', 'invalid_inquiry_action');
}