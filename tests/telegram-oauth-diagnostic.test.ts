import test from 'node:test';
import assert from 'node:assert/strict';
import { safeDiagnosticText, telegramOAuthDiagnostic } from '../frontend/src/telegramOAuthDiagnostic';

test('diagnostic preserves useful provider errors and redacts credentials', () => {
  assert.equal(safeDiagnosticText('Internal server error'), 'Internal server error');
  assert.equal(safeDiagnosticText('Origin is not allowed'), 'Origin is not allowed');
  for (const value of [
    'accessToken: secret-value', 'API key secret-value', 'Cookie: sid=secret-value',
    'Authorization: Bearer secret-value', 'Telegram bot token secret-value',
    'OTP 123456', 'verification code 123456', 'session_token=secret-value',
    'access%54oken%3Dsecret-value', 'private key secret-value',
  ]) assert.equal(safeDiagnosticText(value), '[redacted sensitive diagnostic text]');
  assert.equal(safeDiagnosticText({ accessToken: 'secret-value' }), null);
  for (const value of ['https://provider.test/callback?code=secret-value', 'code=secret-value', 'state=secret-value', 'session=secret-value']) {
    assert.ok(!safeDiagnosticText(value)?.includes('secret-value'));
  }
  assert.ok(!safeDiagnosticText('123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi')?.includes('ABCDEFGHIJKLMNOPQRSTUVWXYZ'));
  assert.ok(!safeDiagnosticText('123456')?.includes('123456'));
});

test('failure logs only sanitized fields with timestamp and origin; never serializes SDK objects', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { origin: 'https://app.linkary.xyz' } } });
  const originalError = console.error;
  const originalInfo = console.info;
  const logs: unknown[][] = [];
  console.error = (...args) => { logs.push(args); };
  console.info = (...args) => { logs.push(args); };
  try {
    const error = Object.assign(new Error('Internal server error'), { accessToken: 'never-log-me' });
    const state = { status: 'error', error: 'internal_error', errorDescription: 'Internal server error', accessToken: 'never-log-me' };
    telegramOAuthDiagnostic('cdp_link_error', state, error);
    assert.equal(logs[0][0], '[Linkary Telegram OAuth Diagnostic]');
    const record = logs[0][1] as any;
    assert.deepEqual(record.oauthState, { status: 'error', error: 'internal_error', errorDescription: 'Internal server error' });
    assert.deepEqual(record.caughtError, { name: 'Error', message: 'Internal server error' });
    assert.equal(record.origin, 'https://app.linkary.xyz');
    assert.ok(Number.isFinite(Date.parse(record.timestamp)));
    assert.ok(!JSON.stringify(logs).includes('never-log-me'));
    for (const stage of ['telegram_link_clicked', 'cdp_link_started', 'cdp_link_returned', 'current_link_sync_started', 'current_link_sync_success', 'current_link_sync_failed'] as const) {
      telegramOAuthDiagnostic(stage);
      assert.equal((logs.at(-1)![1] as any).stage, stage);
    }
    console.error = () => { throw new Error('console unavailable'); };
    assert.doesNotThrow(() => telegramOAuthDiagnostic('cdp_link_error', state, error));
  } finally {
    console.error = originalError;
    console.info = originalInfo;
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
