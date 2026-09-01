import { randomToken, sha256 } from './security/crypto';

const OWNER_BOOTSTRAP_CASEFOLD_HASH = 'ZetNxKAgJ3lN0DzvyD14t4t62Bvyolk8EYr3nq8o0nU';
const OWNER_BOOTSTRAP_INVITE_ID = 'inv_bootstrap_owner_20260901';

export function canonicalInviteCode(value: string): string {
  return value.trim().toUpperCase();
}

export function createHumanInviteCode(): string {
  return `LNK-${randomToken(18).toUpperCase()}`;
}

export async function inviteLookupHashes(value: string): Promise<string[]> {
  const raw = value.trim();
  if (!raw) return [];
  const normalized = canonicalInviteCode(raw);
  const values = raw === normalized ? [raw] : [raw, normalized];
  return [...new Set(await Promise.all(values.map((candidate) => sha256(candidate))))];
}

export function legacyBootstrapInviteId(hashes: string[]): string | null {
  return hashes.includes(OWNER_BOOTSTRAP_CASEFOLD_HASH) ? OWNER_BOOTSTRAP_INVITE_ID : null;
}
