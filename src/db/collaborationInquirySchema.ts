import { Db } from './client';

/**
 * Production D1 migrations are deliberately controlled. This idempotent guard
 * keeps Collaboration Inquiry V1 and its explicit activation provenance usable
 * when a normal Worker deploy happens before the protected migration ledger is advanced.
 */
export async function ensureCollaborationInquirySchema(db: Db): Promise<void> {
  await db.run(`CREATE TABLE IF NOT EXISTS collaboration_inquiries (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    created_by_user_id TEXT NOT NULL REFERENCES users(id),
    target_kind TEXT NOT NULL CHECK (target_kind IN ('creator','community_manager')),
    target_profile_id TEXT NOT NULL REFERENCES profiles(id),
    partner_manager_id TEXT REFERENCES partner_managers(id),
    partner_asset_id TEXT REFERENCES partner_manager_assets(id),
    campaign_id TEXT REFERENCES campaigns(id),
    inquiry_type TEXT NOT NULL CHECK (inquiry_type IN ('content_collaboration','telegram_promotion','community_activation','x_campaign','ambassador','partnership','other')),
    budget_usd REAL CHECK (budget_usd IS NULL OR budget_usd >= 0),
    message TEXT NOT NULL DEFAULT '',
    deliverables TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','withdrawn','closed')),
    responded_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (
      (target_kind = 'creator' AND partner_manager_id IS NULL AND partner_asset_id IS NULL)
      OR
      (target_kind = 'community_manager' AND partner_manager_id IS NOT NULL)
    )
  )`);
  await db.run('CREATE INDEX IF NOT EXISTS idx_collaboration_inquiries_project ON collaboration_inquiries(organization_id, status, updated_at DESC)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_collaboration_inquiries_target ON collaboration_inquiries(target_profile_id, status, created_at DESC)');
  await db.run("CREATE INDEX IF NOT EXISTS idx_collaboration_inquiries_manager ON collaboration_inquiries(partner_manager_id, status, created_at DESC) WHERE partner_manager_id IS NOT NULL");

  await db.run(`CREATE TABLE IF NOT EXISTS collaboration_inquiry_activations (
    inquiry_id TEXT PRIMARY KEY NOT NULL REFERENCES collaboration_inquiries(id) ON DELETE CASCADE,
    activity_id TEXT NOT NULL UNIQUE REFERENCES campaign_activities(id),
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    activated_by_user_id TEXT NOT NULL REFERENCES users(id),
    activated_at TEXT NOT NULL
  )`);
  await db.run('CREATE INDEX IF NOT EXISTS idx_collaboration_inquiry_activations_project ON collaboration_inquiry_activations(organization_id, activated_at DESC)');
}
