import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const backend = readFileSync('src/routes/walletPortfolio.ts', 'utf8');
const walletRoute = readFileSync('src/routes/wallets.ts', 'utf8');
const panel = readFileSync('frontend/src/WalletPortfolioPanel.tsx', 'utf8');
const experience = readFileSync('frontend/src/WalletExperience.tsx', 'utf8');
const send = readFileSync('frontend/src/WalletSendPanel.tsx', 'utf8');

test('wallet portfolio values the Linkary and saved wallets through the server-only Alchemy Portfolio API', () => {
  assert.match(backend, /env\.ALCHEMY_API_KEY/);
  assert.match(backend, /assets\/tokens\/by-address/);
  assert.match(backend, /withMetadata:\s*true/);
  assert.match(backend, /withPrices:\s*true/);
  assert.match(backend, /includeNativeTokens:\s*true/);
  assert.match(backend, /includeErc20Tokens:\s*true/);
  assert.match(backend, /\.\.\.embeddedWallets,\s*\.\.\.destinations/);
  assert.doesNotMatch(panel, /ALCHEMY_API_KEY/);
});

test('portfolio stays on the approved Controlled Beta chain set and deduplicates attached wallets', () => {
  for (const network of ['eth-mainnet', 'base-mainnet', 'bnb-mainnet', 'robinhood-mainnet', 'sol-mainnet']) {
    assert.match(backend, new RegExp(network));
  }
  assert.match(backend, /evm\.set\(address\.toLowerCase\(\), address\)/);
  assert.match(backend, /solana\.set\(address, address\)/);
});

test('portfolio ranks by real USD value, shows only the top six and combines the remainder as Other', () => {
  assert.match(backend, /sort\(\(a, b\) => b\.usdValue - a\.usdValue\)/);
  assert.match(backend, /all\.slice\(0, 6\)/);
  assert.match(backend, /all\.slice\(6\)/);
  assert.match(backend, /symbol:\s*'OTHER'/);
  assert.match(backend, /Unpriced|non-zero assets with available USD pricing/i);
  assert.doesNotMatch(backend, /\['BTC',\s*'ETH'/);
});

test('portfolio uses a bounded short-lived cache and can explicitly refresh without changing wallet storage', () => {
  assert.match(backend, /PORTFOLIO_TTL_MS\s*=\s*60_000/);
  assert.match(backend, /MAX_CACHE_ENTRIES\s*=\s*120/);
  assert.match(walletRoute, /includePortfolio/);
  assert.match(walletRoute, /refreshPortfolio/);
  assert.doesNotMatch(backend, /INSERT INTO|UPDATE profile_wallet|DELETE FROM profile_wallet/i);
});

test('wallet balance UI exposes total value, donut allocation, top assets and pricing limitations responsively', () => {
  assert.match(panel, /Estimated portfolio value/);
  assert.match(panel, /wallet-portfolio-donut/);
  assert.match(panel, /Top portfolio assets/);
  assert.match(panel, /Other/);
  assert.match(panel, /Unpriced or unsupported tokens are not shown/);
  assert.match(panel, /Refresh/);
});

test('portfolio restoration is additive and preserves Send, Receive and secure private-key export', () => {
  assert.match(experience, /WalletPortfolioPanel/);
  assert.match(experience, /WalletSendPanel/);
  assert.match(experience, />Receive</);
  assert.match(experience, /ExportWalletModal/);
  assert.match(experience, /Private key export/);
  assert.match(send, /Confirm and send/);
  assert.doesNotMatch(backend + walletRoute + panel, /PersonalNetworkPanel|PrivateNetwork/);
});
