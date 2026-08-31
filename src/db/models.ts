export interface UserRow {
  id: string;
  email: string | null;
  display_name: string;
  status: 'active' | 'suspended' | 'deleted';
  created_at: string;
  updated_at: string;
}

export interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  csrf_token_hash: string;
  expires_at: string;
  last_seen_at: string;
  created_at: string;
  revoked_at: string | null;
}

export interface PlatformIdentityRow {
  id: string;
  platform: string;
  provider_uid: string;
  provider_object_type: string;
  current_handle: string | null;
  current_display_name: string | null;
  status: string;
  ownership_verified_at: string | null;
  first_seen_at: string;
  last_seen_at: string;
  metadata_json: string;
}

export interface ProfileRow {
  id: string;
  owner_user_id: string | null;
  organization_id: string | null;
  primary_platform_identity_id: string | null;
  profile_type: 'creator' | 'project';
  username: string;
  display_name: string;
  bio: string;
  avatar_url: string | null;
  visibility: 'private' | 'published' | 'archived';
  verification_status: string;
  seo_title: string | null;
  seo_description: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProfileBlockRow {
  id: string;
  profile_id: string;
  block_type: string;
  position: number;
  enabled: 0 | 1;
  title: string | null;
  url: string | null;
  config_json: string;
  created_at: string;
  updated_at: string;
}
