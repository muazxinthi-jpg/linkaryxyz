import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { HttpError, json } from '../http';
import { requireAuth } from '../auth/session';

type RecipientRow = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  linkary_wallet_address: string | null;
};

type RecipientWallet = {
  kind: 'linkary';
  label: string;
  address: string;
};

function normalizeSearch(raw: string | null): string {
  const value = (raw || '').trim().replace(/^@+/, '').toLowerCase();
  if (!value) return '';
  if (value.length < 2) throw new HttpError(400, 'Enter at least 2 characters of a Linkary handle', 'recipient_search_too_short');
  if (value.length > 40 || !/^[a-z0-9._-]+$/.test(value)) throw new HttpError(400, 'Enter a valid Linkary handle', 'invalid_recipient_search');
  return value;
}

function walletOptions(row: RecipientRow): RecipientWallet[] {
  if (!row.linkary_wallet_address || !/^0x[a-fA-F0-9]{40}$/.test(row.linkary_wallet_address)) return [];
  return [{ kind: 'linkary', label: 'Linkary wallet', address: row.linkary_wallet_address }];
}

export async function searchWalletRecipients(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const query = normalizeSearch(new URL(request.url).searchParams.get('q'));
  if (!query) return json({ recipients: [] });

  const db = new Db(requireDb(env));
  const rows = await db.all<RecipientRow>(
    `SELECT p.id,
            p.username,
            p.display_name,
            p.avatar_url,
            (
              SELECT wa.address
                FROM wallet_accounts wa
               WHERE wa.user_id = p.owner_user_id
                 AND wa.provider = 'coinbase_cdp'
                 AND wa.chain_family = 'evm'
                 AND wa.status = 'active'
               ORDER BY wa.is_primary DESC, wa.created_at ASC
               LIMIT 1
            ) AS linkary_wallet_address
       FROM profiles p
      WHERE p.profile_type = 'creator'
        AND p.visibility = 'published'
        AND p.owner_user_id IS NOT NULL
        AND p.owner_user_id <> ?
        AND LOWER(p.username) LIKE ?
      ORDER BY CASE WHEN LOWER(p.username) = ? THEN 0 ELSE 1 END,
               p.username ASC
      LIMIT 8`,
    [auth.user.id, `${query}%`, query],
  );

  const recipients = rows
    .map((row) => ({
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      wallets: walletOptions(row),
    }))
    .filter((recipient) => recipient.wallets.length > 0);

  return json({ recipients });
}
