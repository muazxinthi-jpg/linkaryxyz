-- Personal Profile Identity V1
--
-- These fields are presentation-only. They never grant Project permissions,
-- ownership, Telegram/Community verification, manager verification, campaign
-- authority, or evidence strength.
--
-- The existing profile_type = 'creator' remains the structural personal-profile
-- type during Beta so campaign, opportunity, invite and proof semantics stay stable.

ALTER TABLE profiles ADD COLUMN public_role TEXT;
ALTER TABLE profiles ADD COLUMN professional_headline TEXT;
