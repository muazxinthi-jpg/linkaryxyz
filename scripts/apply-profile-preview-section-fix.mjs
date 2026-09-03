import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(path, before, after) {
  const source = readFileSync(path, 'utf8');
  if (!source.includes(before)) throw new Error(`Expected source not found in ${path}: ${before.slice(0, 140)}`);
  writeFileSync(path, source.replace(before, after));
}

function replaceRegex(path, pattern, after) {
  const source = readFileSync(path, 'utf8');
  if (!pattern.test(source)) throw new Error(`Expected pattern not found in ${path}: ${pattern}`);
  pattern.lastIndex = 0;
  writeFileSync(path, source.replace(pattern, after));
}

const betaPath = 'frontend/src/ProfileExperienceBeta.tsx';
replaceOnce(
  betaPath,
  "  const [ownedNfts, setOwnedNfts] = useState<OwnedNft[]>([]);\n",
  "  const [ownedNfts, setOwnedNfts] = useState<OwnedNft[]>([]);\n  const [previewRevision, setPreviewRevision] = useState(() => Date.now());\n",
);
replaceOnce(
  betaPath,
  "      setClicks(analyticsResult.linkClicks || 0);\n",
  "      setClicks(analyticsResult.linkClicks || 0);\n      setPreviewRevision(Date.now());\n",
);
replaceRegex(
  betaPath,
  /  const previewBase = enabledBlocks\.slice\(0, 7\);\n  const pinnedCta = enabledBlocks\.find\([\s\S]*?\n  const previewBlocks = pinnedCta \? \[\.\.\.previewBase, pinnedCta\] : enabledBlocks\.slice\(0, 8\);\n/,
  '',
);
replaceRegex(
  betaPath,
  /          <aside className="profile-beta-preview-column">[\s\S]*?<\/aside>\n        <\/div>/,
  `          <aside className="profile-beta-preview-column"><div className="profile-beta-preview-sticky"><div className="profile-beta-preview-heading"><span className="ops-kicker">PUBLIC PROFILE PREVIEW</span><small>{data.visibility === 'published' ? 'Save changes to refresh' : 'Publish to preview'}</small></div>{data.visibility === 'published' ? <div className="profile-beta-phone profile-beta-public-preview"><iframe key={previewRevision} title="Public profile preview" src={\`https://linkary.xyz/\${profile.username}?editorPreview=\${previewRevision}\`} /></div> : <div className="profile-beta-preview-unpublished"><strong>Exact public preview appears after publishing</strong><span>Publish this profile once, then this panel will render the same public UI visitors see on linkary.xyz.</span></div>}</div></aside>\n        </div>`,
);

const cssPath = 'frontend/src/profile-beta.css';
const css = readFileSync(cssPath, 'utf8');
if (!css.includes('.profile-beta-public-preview{')) {
  writeFileSync(cssPath, css + `.profile-beta-public-preview{min-height:0!important;padding:0!important;background:#fff!important;border:1px solid #dfe1dc!important;border-radius:24px!important;box-shadow:0 18px 48px #0002!important;color:inherit!important;overflow:hidden!important}.profile-beta-public-preview iframe{display:block;width:100%;height:760px;border:0;background:#fff}.profile-beta-preview-unpublished{display:grid;gap:7px;border:1px solid #dfe1dc;border-radius:18px;background:#fff;padding:24px 18px;color:#303638;box-shadow:0 12px 30px #0000000d}.profile-beta-preview-unpublished strong{font-size:13px}.profile-beta-preview-unpublished span{color:#757d80;font-size:11px;line-height:1.5}@media(max-width:1080px){.profile-beta-public-preview iframe{height:720px}}`);
}

const profilesPath = 'src/routes/profiles.ts';
replaceOnce(
  profilesPath,
  "  const regular = blocks.filter((block) => !isSocialBlock(block) && !excluded.has(block.block_type) && (block.block_type === 'heading' || block.url));\n",
  `  const regular = blocks.filter((block) => !isSocialBlock(block) && !excluded.has(block.block_type) && (block.block_type === 'heading' || block.url));\n  const headingTitleBefore = (item: ProfileBlockRow, fallback: string): string => {\n    const index = blocks.findIndex((candidate) => candidate.id === item.id);\n    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {\n      const candidate = blocks[cursor];\n      if (candidate.block_type !== 'heading') continue;\n      return candidate.title?.trim() || fallback;\n    }\n    return fallback;\n  };\n  const galleryLabel = (items: ProfileBlockRow[], fallback: string): string => {\n    if (!items.length) return fallback;\n    const configured = items\n      .map((item) => safeJson(item.config_json) as { sectionTitle?: unknown })\n      .find((config) => typeof config.sectionTitle === 'string' && config.sectionTitle.trim());\n    if (configured && typeof configured.sectionTitle === 'string') return configured.sectionTitle.trim();\n    return headingTitleBefore(items[0], fallback);\n  };\n`,
);
replaceOnce(
  profilesPath,
  "    return `<section class=\"showcase product-showcase\"><div class=\"showcase-title\"><span>PRODUCT FEATURES</span><span>${productFeatures.length}</span></div><div class=\"product-grid\">${cards.join('')}</div></section>`;\n",
  "    return `<section class=\"showcase product-showcase\"><div class=\"showcase-title\"><span>${escapeHtml(galleryLabel(productFeatures, 'PRODUCT FEATURES'))}</span><span>${productFeatures.length}</span></div><div class=\"product-grid\">${cards.join('')}</div></section>`;\n",
);
replaceOnce(
  profilesPath,
  "    gallery(featuredImages, 'image-showcase', 'FEATURED IMAGES'),\n    gallery(nftItems, 'nft-showcase', 'COLLECTED IDENTITY'),\n",
  "    gallery(featuredImages, 'image-showcase', escapeHtml(galleryLabel(featuredImages, 'FEATURED IMAGES'))),\n    gallery(nftItems, 'nft-showcase', escapeHtml(galleryLabel(nftItems, 'COLLECTED IDENTITY'))),\n",
);
replaceRegex(
  profilesPath,
  /  const regularHtml = regular\.map\([\s\S]*?\n  const regularSection = regularHtml \? `[\s\S]*?` : '';\n/,
  `  const regularGroups: Array<{ title: string | null; items: ProfileBlockRow[] }> = [];\n  let currentRegularTitle: string | null = null;\n  let currentRegularItems: ProfileBlockRow[] = [];\n  const flushRegularGroup = () => {\n    if (!currentRegularItems.length) return;\n    regularGroups.push({ title: currentRegularTitle, items: currentRegularItems });\n    currentRegularItems = [];\n  };\n  for (const block of regular) {\n    if (block.block_type === 'heading') {\n      flushRegularGroup();\n      currentRegularTitle = block.title?.trim() || null;\n      continue;\n    }\n    currentRegularItems.push(block);\n  }\n  flushRegularGroup();\n  const regularSection = regularGroups.map((group) => {\n    const heading = group.title || (profile.profile_type === 'project' ? 'Official links' : 'Links & work');\n    const kicker = group.title ? 'PROFILE SECTION' : 'LINKARY PROFILE';\n    const cards = group.items.map((block) => \`<a class="link-card" href="\${escapeHtml(blockUrl(block))}"><b>\${publicIcon(block)}</b><span>\${escapeHtml(block.title || block.url || 'Open link')}</span><i>↗</i></a>\`).join('');\n    return \`<section class="section"><div class="section-title"><span>\${kicker}</span><h2>\${escapeHtml(heading)}</h2></div><div class="links">\${cards}</div></section>\`;\n  }).join('');\n`,
);

const editorTestPath = 'tests/profile-editor-social-nft.test.ts';
replaceRegex(
  editorTestPath,
  /test\('Book a Call style CTAs are pinned in editor preview and restored on public profiles',[\s\S]*?\n\}\);/,
  `test('profile editor preview renders the actual saved public profile instead of a separate mock layout', () => {\n  assert.equal(beta.includes('PUBLIC PROFILE PREVIEW'), true);\n  assert.equal(beta.includes('<iframe'), true);\n  assert.equal(beta.includes('editorPreview='), true);\n  assert.equal(beta.includes('Save changes to refresh'), true);\n  assert.equal(beta.includes('const previewBlocks'), false);\n  assert.equal(enhancer.includes("['work_with_me', 'media_kit']"), true);\n  assert.equal(enhancer.includes('profile-enhanced-ctas'), true);\n});`,
);

const publicTestPath = 'tests/public-profile-readability.test.ts';
let publicTest = readFileSync(publicTestPath, 'utf8');
if (!publicTest.includes("custom section headings label the real content section")) {
  publicTest += `\n\ntest('custom section headings label the real content section instead of creating a Links & work divider', () => {\n  assert.equal(profiles.includes('const headingTitleBefore'), true);\n  assert.equal(profiles.includes("galleryLabel(nftItems, 'COLLECTED IDENTITY')"), true);\n  assert.equal(profiles.includes("const regularGroups: Array<{ title: string | null; items: ProfileBlockRow[] }>"), true);\n  assert.equal(profiles.includes("const kicker = group.title ? 'PROFILE SECTION' : 'LINKARY PROFILE'"), true);\n  assert.equal(profiles.includes("? `<div class=\\\"section-break\\\">"), false);\n});\n`;
  writeFileSync(publicTestPath, publicTest);
}
