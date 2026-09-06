-- Freeze the final redirect and attribution parameters for newly created links.
-- Existing links remain compatible: NULL context_version means the Worker uses
-- the legacy runtime derivation until a new link is created.
ALTER TABLE tracked_links ADD COLUMN effective_destination_url TEXT;
ALTER TABLE tracked_links ADD COLUMN utm_source TEXT;
ALTER TABLE tracked_links ADD COLUMN utm_medium TEXT;
ALTER TABLE tracked_links ADD COLUMN utm_campaign TEXT;
ALTER TABLE tracked_links ADD COLUMN utm_content TEXT;
ALTER TABLE tracked_links ADD COLUMN utm_term TEXT;
ALTER TABLE tracked_links ADD COLUMN linkary_activity TEXT;
ALTER TABLE tracked_links ADD COLUMN linkary_creator TEXT;
ALTER TABLE tracked_links ADD COLUMN tracking_context_version INTEGER;
