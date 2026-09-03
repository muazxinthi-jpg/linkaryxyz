-- Explicitly records when an accepted inquiry is activated into one exact campaign activity.
-- Inquiry acceptance alone remains discussion-only and creates no campaign evidence.
CREATE TABLE IF NOT EXISTS collaboration_inquiry_activations (
  inquiry_id TEXT PRIMARY KEY NOT NULL REFERENCES collaboration_inquiries(id) ON DELETE CASCADE,
  activity_id TEXT NOT NULL UNIQUE REFERENCES campaign_activities(id),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  activated_by_user_id TEXT NOT NULL REFERENCES users(id),
  activated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_collaboration_inquiry_activations_project
  ON collaboration_inquiry_activations(organization_id, activated_at DESC);
