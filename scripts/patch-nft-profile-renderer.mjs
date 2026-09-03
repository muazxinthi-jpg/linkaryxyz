import { readFileSync, writeFileSync } from 'node:fs';

function replaceExact(path, before, after) {
  let source = readFileSync(path, 'utf8');
  if (!source.includes(before)) throw new Error(`Expected source not found in ${path}: ${before.slice(0, 120)}`);
  source = source.replace(before, after);
  writeFileSync(path, source);
}

function replaceAllExact(path, before, after, expectedCount) {
  let source = readFileSync(path, 'utf8');
  const count = source.split(before).length - 1;
  if (count !== expectedCount) throw new Error(`Expected ${expectedCount} matches in ${path}, found ${count}`);
  source = source.split(before).join(after);
  writeFileSync(path, source);
}

const profilesPath = 'src/routes/profiles.ts';
replaceExact(
  profilesPath,
  "import { resolveFeaturedMedia, resolveFeaturedPreview, safeHttpsUrl } from '../profileMedia';",
  "import { resolveFeaturedMedia, resolveFeaturedPreview, resolveNftArtworkPreview, safeHttpsUrl } from '../profileMedia';",
);

replaceExact(
  profilesPath,
  `  const gallery = async (items: ProfileBlockRow[], label: string, className = '') => {\n    if (!items.length) return '';\n    const cards = await Promise.all(items.map(async (block) => {\n      const config = safeJson(block.config_json) as { mediaUrl?: string };\n      const media = await resolveFeaturedPreview(config.mediaUrl, block.url, 'featured_image');`,
  `  const gallery = async (items: ProfileBlockRow[], label: string, className = '') => {\n    if (!items.length) return '';\n    const cards = await Promise.all(items.map(async (block) => {\n      const config = safeJson(block.config_json) as { mediaUrl?: string; chain?: string; nftContract?: string; nftTokenId?: string };\n      const media = className === 'nfts'\n        ? await resolveNftArtworkPreview(env, config.mediaUrl, config.chain, config.nftContract, config.nftTokenId)\n        : await resolveFeaturedPreview(config.mediaUrl, block.url, 'featured_image');`,
);

replaceExact(
  profilesPath,
  `  const gallery = async (items: ProfileBlockRow[], className: string, label: string) => {\n    if (!items.length) return '';\n    const cards = await Promise.all(items.map(async (block) => {\n      const config = safeJson(block.config_json) as { mediaUrl?: string; chain?: string };\n      const media = await resolveFeaturedPreview(config.mediaUrl, block.url, 'featured_image');`,
  `  const gallery = async (items: ProfileBlockRow[], className: string, label: string) => {\n    if (!items.length) return '';\n    const cards = await Promise.all(items.map(async (block) => {\n      const config = safeJson(block.config_json) as { mediaUrl?: string; chain?: string; nftContract?: string; nftTokenId?: string };\n      const media = className === 'nft-showcase'\n        ? await resolveNftArtworkPreview(env, config.mediaUrl, config.chain, config.nftContract, config.nftTokenId)\n        : await resolveFeaturedPreview(config.mediaUrl, block.url, 'featured_image');`,
);

replaceExact(
  profilesPath,
  `function validateNftItemUrl(value: string | null | undefined): string | null {\n  const destination = validateDestination(value);\n  if (!destination) return destination;\n  const url = new URL(destination);\n  const host = url.hostname.toLowerCase().replace(/^www\\./, '');\n  if (host === 'opensea.io' && /^\\/collection\\//i.test(url.pathname)) {\n    throw new HttpError(400, 'Use an individual NFT item URL, not a collection URL', 'nft_item_url_required');\n  }\n  return destination;\n}`,
  `function validateNftDestinationUrl(value: string | null | undefined): string | null {\n  return validateDestination(value);\n}`,
);
replaceAllExact(profilesPath, 'validateNftItemUrl(body.url)', 'validateNftDestinationUrl(body.url)', 2);

const testPath = 'tests/profile-editor-social-nft.test.ts';
let tests = readFileSync(testPath, 'utf8');
const marker = "const wrangler = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');";
if (!tests.includes("const media = readFileSync(new URL('../src/profileMedia.ts'")) {
  tests = tests.replace(marker, `${marker}\nconst media = readFileSync(new URL('../src/profileMedia.ts', import.meta.url), 'utf8');\nconst profiles = readFileSync(new URL('../src/routes/profiles.ts', import.meta.url), 'utf8');`);
}
tests = tests.replace(
  "  assert.equal(beta.includes('NFT item URL'), true);\n  assert.equal(beta.includes('NFT artwork or item URL'), true);",
  "  assert.equal(beta.includes('Destination URL'), true);\n  assert.equal(beta.includes('NFT artwork source'), true);",
);
tests = tests.replace(
  `test('NFT showcases reject collection pages where a specific owned item is required', () => {\n  const profiles = readFileSync(new URL('../src/routes/profiles.ts', import.meta.url), 'utf8');\n  assert.equal(profiles.includes("function validateNftItemUrl"), true);\n  assert.equal(profiles.includes("'nft_item_url_required'"), true);\n  assert.equal(profiles.includes("/^\\\\/collection\\\\//i.test(url.pathname)"), true);\n});`,
  `test('NFT click destination stays separate from the artwork source', () => {\n  assert.equal(beta.includes('A collection page, individual NFT page, or another relevant destination is allowed.'), true);\n  assert.equal(beta.includes('Linkary uses this only to resolve the artwork; it does not control where the card clicks.'), true);\n  assert.equal(profiles.includes('function validateNftDestinationUrl'), true);\n  assert.equal(profiles.includes("'nft_item_url_required'"), false);\n});\n\ntest('NFT item pages resolve real token artwork through Alchemy metadata instead of social preview cards', () => {\n  assert.equal(media.includes('resolveNftArtworkPreview'), true);\n  assert.equal(media.includes('parseOpenSeaNftItemUrl'), true);\n  assert.equal(media.includes('getNFTMetadata'), true);\n  assert.equal(media.includes('image.originalUrl'), true);\n  assert.equal(profiles.includes("className === 'nft-showcase'"), true);\n  assert.equal(profiles.includes("className === 'nfts'"), true);\n});`,
);
writeFileSync(testPath, tests);
