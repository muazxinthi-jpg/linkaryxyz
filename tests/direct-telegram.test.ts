import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { verifyTelegramIdentity, startTelegramConnection, finishTelegramConnection, saveTelegramIdentity } from '../src/auth/telegram';
import { Db } from '../src/db/client';
import { sha256 } from '../src/security/crypto';
import type { Env } from '../src/env';
import type { D1Database, D1PreparedStatement } from '../src/platform';

async function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8'));
  function statement(query: string, values: any[] = []): D1PreparedStatement {
    return {
      bind: (...args) => statement(query, args),
      async first<T>() { return (sql.prepare(query).get(...values) || null) as T | null; },
      async all<T>() { return { success: true, results: sql.prepare(query).all(...values) as T[] }; },
      async run() { sql.prepare(query).run(...values); return { success: true }; },
    };
  }
  const database: D1Database = { prepare: statement, async batch(statements) { return Promise.all(statements.map(s => s.run())); } };
  const env: Env = { DB: database, ASSETS: { fetch: async () => new Response() }, TELEGRAM_CLIENT_ID: '123', TELEGRAM_CLIENT_SECRET: 'test-secret', APP_BASE_URL: 'https://app.linkary.xyz' };
  for (const id of ['a', 'b']) {
    sql.prepare("INSERT INTO users (id, display_name, created_at, updated_at) VALUES (?, ?, ?, ?)").run(id, id, new Date().toISOString(), new Date().toISOString());
    sql.prepare('INSERT INTO sessions (id,user_id,token_hash,csrf_token_hash,expires_at,last_seen_at,created_at) VALUES (?,?,?,?,?,?,?)')
      .run(`session-${id}`, id, await sha256(`token-${id}`), await sha256(`csrf-${id}`), new Date(Date.now()+600000).toISOString(), '', '');
  }
  function request(path: string, id = 'a', method = 'GET', csrf = true) {
    return new Request(`https://app.linkary.xyz${path}`, { method, headers: {
      cookie: `__Host-linkary_session=token-${id}; __Host-linkary_csrf=csrf-${id}`,
      ...(csrf ? { 'x-csrf-token': `csrf-${id}` } : {}),
    } });
  }
  return { sql, env, db: new Db(database), request };
}

test('Telegram signature verification rejects forged, expired and wrong-audience identities', async () => {
  const pair = await generateKeyPair('RS256');
  const other = await generateKeyPair('RS256');
  async function token(audience = '123', expires = '5m', signingKey = pair.privateKey, issuer = 'https://oauth.telegram.org', id: unknown = 987654321) {
    return new SignJWT({ id, name: 'Person', preferred_username: 'person' }).setProtectedHeader({ alg: 'RS256' })
      .setSubject('distinct-oidc-subject').setIssuer(issuer).setAudience(audience).setIssuedAt().setExpirationTime(expires).sign(signingKey);
  }
  const key = async () => pair.publicKey;
  assert.equal((await verifyTelegramIdentity(await token(), '123', key)).providerUserId, '987654321');
  for (const bad of [await token('wrong'), await token('123', '-1m'), await token('123','5m',other.privateKey), await token('123','5m',pair.privateKey,'https://attacker.test'), await token('123','5m',pair.privateKey,'https://oauth.telegram.org', 'bad')]) {
    await assert.rejects(verifyTelegramIdentity(bad, '123', key));
  }
});

test('start requires session and CSRF, uses PKCE, and never returns credentials', async () => {
  const f = await fixture();
  try {
    await assert.rejects(startTelegramConnection(f.request('/api/auth/telegram/start','a','POST',false), f.env));
    await assert.rejects(startTelegramConnection(new Request('https://app.linkary.xyz/api/auth/telegram/start', { method: 'POST' }), f.env));
    await assert.rejects(startTelegramConnection(f.request('/api/auth/telegram/start','a','POST'), { ...f.env, TELEGRAM_CLIENT_SECRET: undefined }));
    const response = await startTelegramConnection(f.request('/api/auth/telegram/start','a','POST'), f.env);
    const body = await response.text();
    const url = new URL(JSON.parse(body).authorizationUrl);
    assert.equal(url.origin, 'https://oauth.telegram.org');
    assert.equal(url.searchParams.get('redirect_uri'), 'https://app.linkary.xyz/api/auth/telegram/callback');
    assert.equal(url.searchParams.get('scope'), 'openid profile');
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.ok(!body.includes('test-secret'));
    const stored = f.sql.prepare('SELECT * FROM oauth_states').get()!;
    assert.equal(stored.state_hash, await sha256(url.searchParams.get('state')!));
    assert.equal(url.searchParams.get('code_challenge'), await sha256(String(stored.code_verifier)));
  } finally { f.sql.close(); }
});

test('callback state is session-bound, expires and is consumed only once', async () => {
  const f = await fixture();
  try {
    const start = await startTelegramConnection(f.request('/api/auth/telegram/start','a','POST'), f.env);
    const { authorizationUrl } = await start.json() as { authorizationUrl: string };
    const state = new URL(authorizationUrl).searchParams.get('state');
    const path = `/api/auth/telegram/callback?state=${state}&error=access_denied`;
    assert.match((await finishTelegramConnection(f.request(path, 'b'), f.env)).headers.get('location') || '', /telegram=failed&telegram_phase=session_verified/);
    assert.equal(f.sql.prepare('SELECT used_at FROM oauth_states').get()!.used_at, null);
    assert.match((await finishTelegramConnection(f.request(path), f.env)).headers.get('location') || '', /telegram=cancelled&telegram_phase=provider_cancelled/);
    assert.match((await finishTelegramConnection(f.request(path), f.env)).headers.get('location') || '', /telegram=failed&telegram_phase=session_verified/);
    f.sql.exec("UPDATE oauth_states SET used_at=NULL, expires_at='2000-01-01'");
    assert.match((await finishTelegramConnection(f.request(path), f.env)).headers.get('location') || '', /telegram=failed&telegram_phase=session_verified/);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM platform_identity_links').get()!.n, 0);
  } finally { f.sql.close(); }
});

test('verified identity cannot transfer accounts or alter sign-in identities', async () => {
  const f = await fixture();
  try {
    const identity = { providerUserId: '987654321', username: 'person', displayName: 'Person' };
    await saveTelegramIdentity(f.db, 'a', identity);
    await saveTelegramIdentity(f.db, 'a', identity);
    await assert.rejects(saveTelegramIdentity(f.db, 'b', identity));
    await assert.rejects(saveTelegramIdentity(f.db, 'a', { ...identity, providerUserId: '123456789' }));
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM platform_identity_links').get()!.n, 1);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM users').get()!.n, 2);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM sessions').get()!.n, 2);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM auth_identities').get()!.n, 0);
    const stored = f.sql.prepare("SELECT * FROM platform_identities WHERE provider_uid='987654321'").get()!;
    assert.ok(stored.ownership_verified_at);
    assert.deepEqual(JSON.parse(String(stored.metadata_json)), { source: 'telegram_oidc' });
  } finally { f.sql.close(); }
});

test('full callback exchanges PKCE code, verifies Telegram and persists only the profile connection', async () => {
  const f = await fixture();
  const originalFetch = globalThis.fetch;
  const pair = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(pair.publicKey), kid: 'telegram-test', alg: 'RS256', use: 'sig' };
  const token = await new SignJWT({ id: 7654321, preferred_username: 'verifiedperson', name: 'Verified Person' })
    .setProtectedHeader({ alg: 'RS256', kid: 'telegram-test' }).setSubject('oidc-subject')
    .setIssuer('https://oauth.telegram.org').setAudience('123').setIssuedAt().setExpirationTime('5m').sign(pair.privateKey);
  let exchanges = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith('/.well-known/jwks.json')) return Response.json({ keys: [jwk] });
    assert.equal(url, 'https://oauth.telegram.org/token');
    assert.equal(init?.method, 'POST');
    const body = new URLSearchParams(String(init?.body));
    assert.equal(body.get('code'), 'test-code');
    assert.equal(body.get('redirect_uri'), 'https://app.linkary.xyz/api/auth/telegram/callback');
    assert.equal(body.get('code_verifier'), f.sql.prepare('SELECT code_verifier FROM oauth_states').get()!.code_verifier);
    exchanges++;
    return Response.json({ id_token: token, access_token: 'must-not-persist' });
  };
  try {
    const response = await startTelegramConnection(f.request('/api/auth/telegram/start', 'a', 'POST'), f.env);
    const start = await response.json() as { authorizationUrl: string };
    const state = new URL(start.authorizationUrl).searchParams.get('state');
    const request = f.request(`/api/auth/telegram/callback?state=${state}&code=test-code`);
    const callback = await finishTelegramConnection(request, f.env);
    assert.equal(callback.headers.get('location'), '/profile?telegram=connected&telegram_phase=identity_saved');
    assert.equal(callback.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(callback.headers.get('set-cookie'), null);
    assert.match((await finishTelegramConnection(request, f.env)).headers.get('location') || '', /telegram=failed&telegram_phase=session_verified/);
    assert.equal(exchanges, 1);
    const identity = f.sql.prepare("SELECT * FROM platform_identities WHERE provider_uid='7654321'").get()!;
    assert.equal(identity.current_handle, 'verifiedperson');
    assert.ok(!JSON.stringify(identity).includes('must-not-persist'));
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM auth_identities').get()!.n, 0);
  } finally { globalThis.fetch = originalFetch; f.sql.close(); }
});

test('sign-in UI offers email, Google and X with no Telegram authentication option', () => {
  for (const file of ['main.tsx', 'App.tsx', 'AppV2.tsx']) {
    const source = readFileSync(new URL(`../frontend/src/${file}`, import.meta.url), 'utf8');
    assert.ok(!source.includes('oauth:telegram'));
    assert.ok(!source.includes("social('telegram')"));
  }
});
