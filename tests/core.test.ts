import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidXPostUrl } from '../src/routes/access';
import { isSystemRoute, normalizeXHandle } from '../src/routes/onboarding';
import { getLinkaryUrls } from '../src/urls';

test('validates X post URLs without any external API call', () => { assert.equal(isValidXPostUrl('https://x.com/muazxinthi/status/123456789'), true); assert.equal(isValidXPostUrl('https://twitter.com/user/status/987654321?s=20'), true); assert.equal(isValidXPostUrl('https://x.com/muazxinthi'), false); assert.equal(isValidXPostUrl('https://example.com/user/status/123'), false); });
test('normalizes X handles and protects only real system routes', () => { assert.equal(normalizeXHandle('@MuazXinthi'), 'muazxinthi'); assert.equal(isSystemRoute('pricing'), true); assert.equal(isSystemRoute('muazxinthi'), false); assert.throws(() => normalizeXHandle('invalid-handle')); });
test('URL configuration is domain-agnostic until production domains are attached', () => { const request = new Request('https://temporary-worker.example/api/health'); const urls = getLinkaryUrls(request, { ASSETS: { fetch: async () => new Response() }, PUBLIC_SITE_URL: 'https://linkary.example/', APP_BASE_URL: 'https://app.linkary.example/', TRACKING_BASE_URL: 'https://l.linkary.example/', API_BASE_URL: 'https://api.linkary.example/', MCP_BASE_URL: 'https://mcp.linkary.example/' }); assert.deepEqual(urls, { publicSite: 'https://linkary.example', app: 'https://app.linkary.example', tracking: 'https://l.linkary.example', api: 'https://api.linkary.example', mcp: 'https://mcp.linkary.example' }); });
