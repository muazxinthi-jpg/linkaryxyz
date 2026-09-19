import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { json } from '../http';
import { safeHttpsUrl } from '../profileMedia';

type TotalRow = { total: number | string };
type PublicCreatorRow = { username: string; display_name: string; avatar_url: string | null };

function total(row: TotalRow | null): number {
  const value = Number(row?.total ?? 0);
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

export async function publicHomepageCommunity(_request: Request, env: Env): Promise<Response> {
  const db = new Db(requireDb(env));
  const [members, projects, wallets, creators] = await Promise.all([
    db.first<TotalRow>("SELECT COUNT(*) AS total FROM users WHERE status = 'active'"),
    db.first<TotalRow>(
      "SELECT COUNT(DISTINCT o.id) AS total FROM organizations o JOIN profiles p ON p.organization_id = o.id AND p.profile_type = 'project' WHERE o.status = 'active' AND p.visibility <> 'archived'",
    ),
    db.first<TotalRow>(
      "SELECT COUNT(*) AS total FROM profile_wallet_destinations w JOIN profiles p ON p.id = w.profile_id WHERE w.status = 'active' AND p.visibility <> 'archived'",
    ),
    db.all<PublicCreatorRow>(
      "SELECT p.username, p.display_name, p.avatar_url FROM profiles p JOIN users u ON u.id = p.owner_user_id WHERE p.profile_type = 'creator' AND p.visibility = 'published' AND u.status = 'active' ORDER BY p.published_at DESC, p.id ASC LIMIT 5",
    ),
  ]);

  return json({
    metrics: {
      registeredMembers: total(members),
      projects: total(projects),
      walletsSubmitted: total(wallets),
    },
    supporters: creators.map((creator) => ({
      username: creator.username,
      displayName: creator.display_name.trim() || creator.username,
      avatarUrl: safeHttpsUrl(creator.avatar_url),
    })),
  }, { headers: { 'cache-control': 'public, max-age=60, s-maxage=600' } });
}
