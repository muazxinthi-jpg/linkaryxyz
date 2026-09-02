import assert from 'node:assert/strict';
import test from 'node:test';
import { html, json } from '../src/http';

function responseSetCookies(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const value = response.headers.get('set-cookie');
  return value ? [value] : [];
}

test('json response preserves multiple session Set-Cookie headers', async () => {
  const outgoing = new Headers();
  outgoing.append('set-cookie', '__Host-linkary_session=session-token; Path=/; HttpOnly; Secure; SameSite=Lax');
  outgoing.append('set-cookie', '__Host-linkary_csrf=csrf-token; Path=/; Secure; SameSite=Lax');

  const response = json({ ok: true }, { status: 201, headers: outgoing });
  const cookies = responseSetCookies(response);

  assert.equal(response.status, 201);
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.ok(cookies.some((cookie) => cookie.includes('__Host-linkary_session=session-token')));
  assert.ok(cookies.some((cookie) => cookie.includes('__Host-linkary_csrf=csrf-token')));
  assert.deepEqual(await response.json(), { ok: true });
});

test('response helpers preserve caller headers and allow safe overrides', () => {
  const response = json({ ok: true }, { headers: { 'cache-control': 'private, max-age=60', 'x-linkary-test': 'yes' } });
  assert.equal(response.headers.get('cache-control'), 'private, max-age=60');
  assert.equal(response.headers.get('x-linkary-test'), 'yes');

  const page = html('<p>ok</p>', { headers: { 'x-linkary-page': 'yes' } });
  assert.equal(page.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal(page.headers.get('x-linkary-page'), 'yes');
});
