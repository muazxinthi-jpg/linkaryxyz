import { requireDb } from '../env';
import { Db } from '../db/client';

const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;

/**
 * Credits invite owners after a referred creator's first public publication.
 * The event uniqueness key makes retries and duplicate publish requests safe.
 */
export async function rewardReferralOnProfilePublish(
  db: Db,
  profile: { id: string; owner_user_id: string | null; profile_type: string; visibility: string },
  wasPublished: boolean,
): Promise<void> {
  if (wasPublished || profile.visibility !== 'published' || profile.profile_type !== 'creator' || !profile.owner_user_id) return;

  const direct = await db.first<{ invite_id: string; inviter_user_id: string }>(
    `SELECT e.source_invite_id AS invite_id, e.inviter_user_id
       FROM network_referral_edges e
       JOIN invites i ON i.id = e.source_invite_id AND i.invite_type = 'network_invite'
      WHERE e.invitee_user_id = ? AND e.status = 'active'
      LIMIT 1`,
    [profile.owner_user_id],
  );
  if (!direct) return;

  const ancestors = await db.all<{ beneficiary_user_id: string; generation: number }>(
    `SELECT ancestor_user_id AS beneficiary_user_id, depth AS generation
       FROM network_referral_paths
      WHERE descendant_user_id = ? AND depth BETWEEN 1 AND 7
      ORDER BY depth ASC`,
    [profile.owner_user_id],
  );
  const beneficiaries = new Map<string, number>();
  beneficiaries.set(direct.inviter_user_id, 2);
  for (const ancestor of ancestors) {
    if (ancestor.beneficiary_user_id !== direct.inviter_user_id && ancestor.generation >= 2) {
      beneficiaries.set(ancestor.beneficiary_user_id, 1);
    }
  }

  for (const [beneficiaryUserId, amount] of beneficiaries) {
    const beneficiary = await db.first<{ id: string }>(
      `SELECT p.id FROM profiles p
       JOIN invite_balances b ON b.owner_type = 'profile' AND b.owner_id = p.id AND b.privileges_status = 'active'
        WHERE p.owner_user_id = ? AND p.profile_type = 'creator'
        ORDER BY CASE WHEN p.visibility = 'published' THEN 0 ELSE 1 END, p.created_at ASC
        LIMIT 1`,
      [beneficiaryUserId],
    );
    if (!beneficiary) continue;
    const generation = amount === 2 ? 1 : (ancestors.find((item) => item.beneficiary_user_id === beneficiaryUserId)?.generation || 2);
    const eventId = id('ireward');
    const event = await db.first<{ id: string }>(
      `INSERT INTO invite_reward_events
        (id, invite_id, qualified_user_id, qualified_profile_id, beneficiary_user_id,
         beneficiary_owner_type, beneficiary_owner_id, generation, amount, reason, created_at)
       VALUES (?, ?, ?, ?, ?, 'profile', ?, ?, ?, ?, ?)
       ON CONFLICT (invite_id, qualified_user_id, generation) DO NOTHING
       RETURNING id`,
      [eventId, direct.invite_id, profile.owner_user_id, profile.id, beneficiaryUserId, beneficiary.id, generation, amount,
        generation === 1 ? 'direct_referral_published' : 'downline_referral_published', new Date().toISOString()],
    );
    if (!event) continue;
    const timestamp = new Date().toISOString();
    await db.batch([
      db.statement(
        `UPDATE invite_balances
            SET available_credits = available_credits + ?, lifetime_granted = lifetime_granted + ?, updated_at = ?
          WHERE owner_type = 'profile' AND owner_id = ? AND privileges_status = 'active'`,
        [amount, amount, timestamp, beneficiary.id],
      ),
      db.statement(
        `INSERT INTO invite_ledger
          (id, owner_type, owner_id, transaction_type, amount, reason, related_invite_id, created_at)
         VALUES (?, 'profile', ?, 'reward', ?, ?, ?, ?)`,
        [id('iled'), beneficiary.id, amount, generation === 1 ? 'direct_referral_published' : 'downline_referral_published', direct.invite_id, timestamp],
      ),
      db.statement(`UPDATE invite_redemptions SET quality_state = 'qualified' WHERE invite_id = ? AND user_id = ? AND quality_state = 'pending'`, [direct.invite_id, profile.owner_user_id]),
    ]);
  }
}
