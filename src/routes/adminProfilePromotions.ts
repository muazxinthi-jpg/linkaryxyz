import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { requireSuperadmin } from '../auth/session';
import { json } from '../http';

export async function listPromotionCreativeQueue(request: Request, env: Env): Promise<Response> {
  await requireSuperadmin(request, env);
  const db = new Db(requireDb(env));
  const rows = await db.all<{
    creative_id: string;
    auction_id: string;
    profile_id: string;
    username: string;
    display_name: string;
    advertiser_user_id: string;
    banner_url: string;
    destination_url: string;
    cta_type: string;
    moderation_status: string;
    payment_status: string | null;
    amount_atomic: number | null;
    created_at: string;
  }>(
    `SELECT c.id AS creative_id, c.auction_id, a.profile_id, p.username, p.display_name,
            c.advertiser_user_id, c.banner_url, c.destination_url, c.cta_type,
            c.moderation_status, pay.status AS payment_status, pay.required_amount_atomic AS amount_atomic,
            c.created_at
       FROM profile_promotion_creatives c
       JOIN profile_promotion_auctions a ON a.id = c.auction_id
       JOIN profiles p ON p.id = a.profile_id
       LEFT JOIN profile_promotion_payments pay ON pay.auction_id = a.id
      WHERE c.moderation_status IN ('pending','flagged')
      ORDER BY c.created_at ASC
      LIMIT 100`,
  );
  return json({ creatives: rows });
}
