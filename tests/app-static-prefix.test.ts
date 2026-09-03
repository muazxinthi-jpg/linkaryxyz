import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('authenticated app build stays in the working root assets namespace', () => {
  const vite = readFileSync(new URL('../frontend/vite.config.ts', import.meta.url), 'utf8');
  const staticRoute = readFileSync(new URL('../src/static.ts', import.meta.url), 'utf8');
  const gitignore = readFileSync(new URL('../.gitignore', import.meta.url), 'utf8');

  assert.equal(vite.includes("base: '/assets/linkary-app/'"), true);
  assert.equal(vite.includes("outDir: '../assets/linkary-app'"), true);
  assert.equal(staticRoute.includes("const APP_SHELL_ASSET = '/assets/linkary-app/index.html'"), true);
  assert.equal(staticRoute.includes("url.pathname === '/app/index.html'"), true, 'legacy shell requests remain compatible');
  assert.equal(gitignore.includes('assets/linkary-app/'), true);
});

test('production deployment checks the live app root and profile after Cloudflare deploy', () => {
  const workflow = readFileSync(new URL('../.github/workflows/deploy-production.yml', import.meta.url), 'utf8');
  assert.equal(workflow.includes('Verify production app health'), true);
  assert.equal(workflow.includes('for path in / /profile; do'), true);
  assert.equal(workflow.includes('https://app.linkary.xyz${path}?deploycheck='), true);
  assert.equal(workflow.includes("grep -q 'id=\"root\"'"), true);
});
