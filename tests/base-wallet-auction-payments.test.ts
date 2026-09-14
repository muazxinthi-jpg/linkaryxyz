import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const balances = readFileSync(new URL('../src/routes/baseWalletBalances.ts', import.meta.url), 'utf8');
const wallet = readFileSync(new URL('../frontend/src/WalletExperience.tsx', import.meta.url), 'utf8');
const auction = readFileSync(new URL('../frontend/src/PromotionAuctionExperience.tsx', import.meta.url), 'utf8');
const payments = readFileSync(new URL('../src/routes/profilePromotionPayments.ts', import.meta.url), 'utf8');
const promotions = readFileSync(new URL('../src/routes/profilePromotions.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../migrations/0053_snapshot_promotion_seller_wallet.sql', import.meta.url), 'utf8');
const index = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

test('Base balance endpoint reads the canonical primary CDP EOA and only official Base USDC', () => {
  assert.match(balances, /BASE_USDC_CONTRACT = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'/);
  assert.match(balances, /eth_getBalance/);
  assert.match(balances, /eth_call/);
  assert.match(balances, /BALANCE_OF_SELECTOR/);
  assert.match(balances, /provider = 'coinbase_cdp'/);
  assert.match(balances, /ORDER BY is_primary DESC/);
  assert.match(balances, /BASE_BALANCE_TTL_MS = 45_000/);
  assert.match(balances, /wallet_address_invalid/);
  assert.match(index, /\/api\/wallets\/base-balances/);
});

test('Wallet shows Base ETH and USDC with loading, zero, failure and a safe receive explanation', () => {
  assert.match(wallet, /Balances on Base/);
  assert.match(wallet, /ETH and official USDC/);
  assert.match(wallet, /Loading ETH and USDC/);
  assert.match(wallet, /Balances are temporarily unavailable/);
  assert.match(wallet, /baseAmount\(balances\.ethWei,18,5\)/);
  assert.match(wallet, /baseAmount\(balances\.usdcAtomic,6,2\)/);
  assert.match(wallet, /Only send ETH or USDC using the Base network/);
  assert.match(wallet, /Private key export/);
  assert.match(wallet, /WalletSendPanel/);
});

test('Auction payment sends exact USDC from the displayed CDP EOA and still verifies server-side', () => {
  assert.match(auction, /useSendUsdc/);
  assert.match(auction, /from: evmAddress/);
  assert.match(auction, /network: 'base'/);
  assert.match(auction, /amount: String\(payment\.required_amount_atomic\)/);
  assert.match(auction, /\/payment\/verify/);
  assert.match(auction, /You need more USDC to complete this payment/);
  assert.match(auction, /You need a small amount of ETH on Base for network fees/);
  assert.match(auction, /Your active Coinbase CDP wallet does not match your Linkary wallet/);
  assert.match(payments, /eth_getTransactionReceipt/);
  assert.match(payments, /receiptContainsExactUsdcTransfer/);
  assert.match(payments, /tx_hash = \? AND auction_id <> \?/);
  assert.match(payments, /promotion_payment_tx_failed/);
  assert.match(payments, /promotion_payment_transfer_mismatch/);
});

test('Each auction snapshots the seller payout wallet before payment', () => {
  assert.match(migration, /ADD COLUMN seller_payout_wallet_address/);
  assert.match(promotions, /seller_payout_wallet_address/);
  assert.match(promotions, /slot\.payout_wallet_address/);
  assert.match(promotions, /recipientWalletAddress = auction\.seller_payout_wallet_address/);
  assert.match(promotions, /promotion_payout_snapshot_missing/);
});
