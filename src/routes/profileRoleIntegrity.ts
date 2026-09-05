import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { HttpError } from '../http';
import { requireAuth } from '../auth/session';
import { organizationMembership } from './organizations';
import {
  addProfileBlock,
  deleteProfileBlock,
  getEditableProfile,
  listProfileBlocks,
  profileAnalytics,
  publishProfile,
  reorderProfileBlocks,
  updateProfile,
  updateProfileBlock,
} from './profiles';

type EditableProfile = {
  id: string;
  profile_type: 'creator' | 'project';
  owner_user_id: string | null;
  organization_id: string | null;
};

async function requireProfileEditBoundary(request: Request, env: Env, profileId: string): Promise<void> {
  const auth = await requireAuth(request, env);
  const db = new Db(requireDb(env));
  const profile = await db.first<EditableProfile>(
    `SELECT id, profile_type, owner_user_id, organization_id FROM profiles WHERE id = ?`,
    [profileId],
  );
  if (!profile) throw new HttpError(404, 'Profile not found', 'profile_not_found');

  if (profile.profile_type === 'creator') {
    if (profile.owner_user_id !== auth.user.id) throw new HttpError(403, 'Profile edit access denied', 'forbidden');
    return;
  }

  if (!profile.organization_id) throw new HttpError(403, 'Profile edit access denied', 'forbidden');
  const membership = await organizationMembership(db, auth.user.id, profile.organization_id);
  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    throw new HttpError(403, 'Project profile editing requires Owner or Admin access', 'forbidden');
  }
}

export async function getEditableProfileIntegrity(request: Request, env: Env, profileId: string): Promise<Response> {
  await requireProfileEditBoundary(request, env, profileId);
  return getEditableProfile(request, env, profileId);
}

export async function updateProfileIntegrity(request: Request, env: Env, profileId: string): Promise<Response> {
  await requireProfileEditBoundary(request, env, profileId);
  return updateProfile(request, env, profileId);
}

export async function listProfileBlocksIntegrity(request: Request, env: Env, profileId: string): Promise<Response> {
  await requireProfileEditBoundary(request, env, profileId);
  return listProfileBlocks(request, env, profileId);
}

export async function addProfileBlockIntegrity(request: Request, env: Env, profileId: string): Promise<Response> {
  await requireProfileEditBoundary(request, env, profileId);
  return addProfileBlock(request, env, profileId);
}

export async function updateProfileBlockIntegrity(request: Request, env: Env, profileId: string, blockId: string): Promise<Response> {
  await requireProfileEditBoundary(request, env, profileId);
  return updateProfileBlock(request, env, profileId, blockId);
}

export async function deleteProfileBlockIntegrity(request: Request, env: Env, profileId: string, blockId: string): Promise<Response> {
  await requireProfileEditBoundary(request, env, profileId);
  return deleteProfileBlock(request, env, profileId, blockId);
}

export async function reorderProfileBlocksIntegrity(request: Request, env: Env, profileId: string): Promise<Response> {
  await requireProfileEditBoundary(request, env, profileId);
  return reorderProfileBlocks(request, env, profileId);
}

export async function publishProfileIntegrity(request: Request, env: Env, profileId: string, published: boolean): Promise<Response> {
  await requireProfileEditBoundary(request, env, profileId);
  return publishProfile(request, env, profileId, published);
}

export async function profileAnalyticsIntegrity(request: Request, env: Env, profileId: string): Promise<Response> {
  await requireProfileEditBoundary(request, env, profileId);
  return profileAnalytics(request, env, profileId);
}
