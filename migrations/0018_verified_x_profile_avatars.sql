-- Reuse the profile image already returned by verified X OAuth.
-- Custom user-supplied image URLs are preserved. Blank values and X page URLs
-- are repaired from the verified platform identity metadata.

UPDATE profiles
SET avatar_url = (
  SELECT replace(
    json_extract(pi.metadata_json, '$.profile_image_url'),
    '_normal.',
    '_400x400.'
  )
  FROM platform_identities pi
  WHERE pi.id = profiles.primary_platform_identity_id
    AND pi.platform = 'x'
    AND json_valid(pi.metadata_json)
    AND lower(json_extract(pi.metadata_json, '$.profile_image_url')) LIKE 'https://pbs.twimg.com/profile_images/%'
  LIMIT 1
)
WHERE primary_platform_identity_id IS NOT NULL
  AND (
    avatar_url IS NULL
    OR trim(avatar_url) = ''
    OR lower(avatar_url) LIKE 'https://x.com/%'
    OR lower(avatar_url) LIKE 'https://twitter.com/%'
    OR (
      lower(avatar_url) LIKE 'https://pbs.twimg.com/profile_images/%'
      AND lower(avatar_url) LIKE '%_normal.%'
    )
  )
  AND EXISTS (
    SELECT 1
    FROM platform_identities pi
    WHERE pi.id = profiles.primary_platform_identity_id
      AND pi.platform = 'x'
      AND json_valid(pi.metadata_json)
      AND lower(json_extract(pi.metadata_json, '$.profile_image_url')) LIKE 'https://pbs.twimg.com/profile_images/%'
  );

-- New verified profiles should not need a manual profile-image URL at all.
CREATE TRIGGER IF NOT EXISTS trg_profiles_verified_x_avatar_after_insert
AFTER INSERT ON profiles
WHEN NEW.primary_platform_identity_id IS NOT NULL
  AND (NEW.avatar_url IS NULL OR trim(NEW.avatar_url) = '')
BEGIN
  UPDATE profiles
  SET avatar_url = (
    SELECT replace(
      json_extract(pi.metadata_json, '$.profile_image_url'),
      '_normal.',
      '_400x400.'
    )
    FROM platform_identities pi
    WHERE pi.id = NEW.primary_platform_identity_id
      AND pi.platform = 'x'
      AND json_valid(pi.metadata_json)
      AND lower(json_extract(pi.metadata_json, '$.profile_image_url')) LIKE 'https://pbs.twimg.com/profile_images/%'
    LIMIT 1
  )
  WHERE id = NEW.id;
END;

-- Covers legacy Project recovery and any future verified-identity reassignment.
CREATE TRIGGER IF NOT EXISTS trg_profiles_verified_x_avatar_after_identity_update
AFTER UPDATE OF primary_platform_identity_id ON profiles
WHEN NEW.primary_platform_identity_id IS NOT NULL
  AND (
    NEW.avatar_url IS NULL
    OR trim(NEW.avatar_url) = ''
    OR lower(NEW.avatar_url) LIKE 'https://x.com/%'
    OR lower(NEW.avatar_url) LIKE 'https://twitter.com/%'
  )
BEGIN
  UPDATE profiles
  SET avatar_url = (
    SELECT replace(
      json_extract(pi.metadata_json, '$.profile_image_url'),
      '_normal.',
      '_400x400.'
    )
    FROM platform_identities pi
    WHERE pi.id = NEW.primary_platform_identity_id
      AND pi.platform = 'x'
      AND json_valid(pi.metadata_json)
      AND lower(json_extract(pi.metadata_json, '$.profile_image_url')) LIKE 'https://pbs.twimg.com/profile_images/%'
    LIMIT 1
  )
  WHERE id = NEW.id;
END;
