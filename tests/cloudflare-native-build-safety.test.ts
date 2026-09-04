import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')) as {
  scripts?: Record<string, string>;
};
const nodeVersion = readFileSync(new URL('.nvmrc', root), 'utf8').trim();
const viteConfig = readFileSync(new URL('frontend/vite.config.ts', root), 'utf8');
const wranglerConfig = readFileSync(new URL('wrangler.jsonc', root), 'utf8');

test('dependency installation prepares authenticated app assets before Cloudflare native deploy', () => {
  assert.equal(pkg.scripts?.postinstall, 'npm run app:build');
  assert.equal(pkg.scripts?.['app:build'], 'vite build --config frontend/vite.config.ts');
});

test('Cloudflare native and GitHub deployments use the same Node major', () => {
  assert.equal(nodeVersion, '22');
});

test('authenticated app build output remains inside the Worker asset directory', () => {
  assert.match(viteConfig, /outDir:\s*['"]\.\.\/assets\/linkary-app['"]/);
  assert.match(wranglerConfig, /"directory"\s*:\s*"\."/);
  assert.match(wranglerConfig, /"binding"\s*:\s*"ASSETS"/);
});

test('explicit GitHub deploy still rebuilds app assets immediately before Wrangler deploy', () => {
  assert.equal(pkg.scripts?.deploy, 'npm run app:build && wrangler deploy');
  assert.equal(pkg.scripts?.['deploy:dry'], 'npm run app:build && wrangler deploy --dry-run');
});
