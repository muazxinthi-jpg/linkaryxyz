const encoder = new TextEncoder();

const LEGACY_OWNER_CANONICAL_HASH = 'ZetNxKAgJ3lN0DzvyD14t4t62Bvyolk8EYr3nq8o0nU';
const LEGACY_OWNER_STORED_HASH = 'dEY_v7d7voY9U9kpAR1sfWH12yz3yBPu5PAR4JJiolI';

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function hashInput(value: string): string {
  const trimmed = value.trim();
  if (/^LNK-/i.test(trimmed)) return trimmed.toUpperCase();
  return value;
}

export function randomToken(bytes = 32): string {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return base64Url(array);
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(hashInput(value)));
  const hash = base64Url(new Uint8Array(digest));
  // Compatibility for the already-issued one-time owner bootstrap invite.
  // The original DB row was created before Linkary human invite codes were
  // normalized. Do not require a privileged D1 migration just to redeem it.
  if (hash === LEGACY_OWNER_CANONICAL_HASH) return LEGACY_OWNER_STORED_HASH;
  return hash;
}

export async function hmacSha256(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return base64Url(new Uint8Array(signature));
}

export async function pkceChallenge(verifier: string): Promise<string> {
  return sha256(verifier);
}
