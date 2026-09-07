import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const panel = readFileSync(new URL('../frontend/src/PrivateNetworkMapV2Panel.tsx', import.meta.url), 'utf8');

test('Private Network root avatar renders as a normal HTML image and follows the draggable SVG root', () => {
  assert.match(panel, /data-network-root-avatar-host/);
  assert.match(panel, /data-network-root-avatar-overlay/);
  assert.match(panel, /network\?\.graph\?\.nodes\.find\(\(node\) => node\.id === 'self'\)\?\.avatarUrl/);
  assert.match(panel, /\.network-map-v2-node\.root \.network-map-v2-node-bg/);
  assert.match(panel, /getBoundingClientRect\(\)/);
  assert.match(panel, /MutationObserver/);
  assert.match(panel, /ResizeObserver/);
  assert.match(panel, /pointerEvents: 'none'/);
  assert.match(panel, /objectFit: 'cover'/);
});
