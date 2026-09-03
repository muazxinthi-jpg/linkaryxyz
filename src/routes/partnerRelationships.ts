import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { requireAuth } from '../auth/session';
import { HttpError, json } from '../http';
import { organizationMembership } from './organizations';
import { loadProjectPartnerRelationship, loadProjectRelationshipSummaries, type RelationshipKind } from '../partnerRelationshipMemory';

export async function partnerRelationships(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const url = new URL(request.url);
  const organizationId = url.searchParams.get('organizationId')?.trim();
  if (!organizationId) throw new HttpError(400, 'organizationId is required', 'organization_required');

  const db = new Db(requireDb(env));
  if (!(await organizationMembership(db, auth.user.id, organizationId))) {
    throw new HttpError(403, 'Project relationship access denied', 'forbidden');
  }

  const kind = url.searchParams.get('kind') as RelationshipKind | null;
  if (kind && !['creator', 'community_manager'].includes(kind)) {
    throw new HttpError(400, 'Choose a valid partner relationship type', 'invalid_relationship_type');
  }

  const targetId = url.searchParams.get('targetId')?.trim();
  if (targetId) {
    if (!kind) throw new HttpError(400, 'Partner type is required for relationship detail', 'invalid_relationship_target');
    const relationship = await loadProjectPartnerRelationship(db, organizationId, kind, targetId);
    return json({ organizationId, kind, targetId, relationship });
  }

  const summaries = await loadProjectRelationshipSummaries(db, organizationId);
  const relationships = Array.from(summaries.entries()).map(([mapKey, summary]) => {
    const separator = mapKey.indexOf(':');
    const relationshipKind = mapKey.slice(0, separator) as RelationshipKind;
    const relationshipTargetId = mapKey.slice(separator + 1);
    return { kind: relationshipKind, target_id: relationshipTargetId, ...summary };
  }).filter((item) => !kind || item.kind === kind);

  return json({ organizationId, relationships });
}
