import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mapV3 = readFileSync(new URL('../frontend/src/InteractiveNetworkMapV3.tsx', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../frontend/src/PrivateNetworkMapV2Panel.tsx', import.meta.url), 'utf8');

test('Private Network uses V3 with a draggable center profile', () => {
  assert.match(panel, /InteractiveNetworkMapV3/);
  assert.match(panel, /<InteractiveNetworkMapV3 graph=\{network\.graph\} \/>/);
  assert.match(mapV3, /data-network-map-v3/);
  assert.match(mapV3, /Drag any node, including your center profile/);
  assert.match(mapV3, /function handleNodePointerDown/);
  assert.doesNotMatch(mapV3, /function handleNodePointerDown[\s\S]{0,240}node\.id === 'self'/);
  assert.doesNotMatch(mapV3, /particle\.x = GRAPH_CENTER\.x/);
  assert.match(mapV3, /setSelectedId\(node\.id\)/);
});

test('V3 renders avatar URLs through an HTML image inside SVG with fallback initials', () => {
  assert.match(mapV3, /<foreignObject/);
  assert.match(mapV3, /src=\{node\.avatarUrl\}/);
  assert.match(mapV3, /referrerPolicy="no-referrer"/);
  assert.match(mapV3, /onError=\{\(event\) => \{ event\.currentTarget\.style\.display = 'none'; \}\}/);
  assert.match(mapV3, /root \? 'YOU' : initials\(node\.displayName\)/);
});
