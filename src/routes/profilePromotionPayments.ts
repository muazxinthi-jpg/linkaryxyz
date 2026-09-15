import type { Env } from '../env';
import { requireDb, ServiceConfigurationError } from '../env';
import { Db } from '../db/client';
import { requireAuth, requireSuperadmin, verifyCsrf } from '../auth/session';
import { HttpError, json, readJson } from '../http';
import { primaryBaseWalletBalances } from './baseWalletBalances';

const BASE_USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const ERC20_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const now = () => new Date().toISOString();

type ReceiptLog = { address?: string; topics?: string[]; data?: string };
type Receipt = { status?: string; blockNumber?: string; logs?: ReceiptLog[] };

type PaymentRow = {
  id: string;
  auction_id: string;
  payer_user_id: string;
  recipient_wallet_address: string;
  required_amount_atomic: number;
  tx_hash: string | null;
  status: string;
};

function normalizeAddress(value: string | null | undefined): string | null {
  const candidate = value?.trim().toLowerCase() || '';
  return /^0x[a-f0-9]{40}$/.test(candidate) ? candidate : null;
}

function normalizeTxHash(value: string | null | undefined): string | null {
  const candidate = value?.trim().toLowerCase() || '';
  return /^0x[a-f0-9]{64}$/.test(candidate) ? candidate : null;
}

function topicAddress(topic: string | undefined): string | null {
  if (!topic || !/^0x[a-fA-F0-9]{64}$/.test(topic)) return null;
  return normalizeAddress(`0x${topic.slice(-40)}`);
}

function amountFromData(data: string | undefined): bigint | null {
  if (!data || !/^0x[a-fA-F0-9]{1,64}$/.test(data)) return null;
  try { return BigInt(data); } catch { return null; }
}

async function alchemyRpc<T>(env: Env, method: string, params: unknown[]): Promise<T> {
  if (!env.ALCHEMY_API_KEY) throw new ServiceConfigurationError('Alchemy API key is not configured');
  const response = await fetch(`https://base-mainnet.g.alchemy.com/v2/${encodeURIComponent(env.ALCHEMY_API_KEY)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!response.ok) throw new HttpError(502, 'Base promotion payment verification is temporarily unavailable', 'promotion_chain_verification_unavailable');
  const payload = await response.json() as { result?: T; error?: unknown };
  if (payload.error || payload.result === undefined) throw new HttpError(502, 'Base promotion payment verification is temporarily unavailable', 'promotion_chain_verification_unavailable');
  return payload.result;
}

function receiptContainsExactUsdcTransfer(receipt: Receipt, payers: Set<string>, recipient: string, expectedAtomic: bigint): boolean {
  return (receipt.logs || []).some((log) => {
    if (normalizeAddress(log.address) !== BASE_USDC) return false;
    if (log.topics?.[0]?.toLowerCase() !== ERC20_TRANSFER_TOPIC) return false;
    const payer = topicAddress(log.topics?.[1]);
    if (!payer || !payers.has(payer)) return false;
    if (topicAddress(log.topics?.[2]) !== recipient) return false;
    return amountFromData(log.data) === expectedAtomic;
  });
}

export async function getMyPromotionPayment(request: Request, env: Env, auctionId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  const db = new Db(requireDb(env));
  const payment = await db.first<PaymentRow & { verified_at: string | null }>(
    `SELECT id, auction_id, payer_user_id, recipient_wallet_address, required_amount_atomic, tx_hash, status, verified_at
       FROM profile_promotion_payments WHERE auction_id = ? AND payer_user_id = ? LIMIT 1`,
    [auctionId, auth.user.id],
  );
  if (!payment) return json({ payment: null, walletBalances: null });
  const auction = await db.first<{ payment_due_at: string | null; status: string }>(`SELECT payment_due_at, status FROM profile_promotion_auctions WHERE id = ?`, [auctionId]);
  return json({ payment: { ...payment, payment_due_at: auction?.payment_due_at || null, auction_status: auction?.status || null } });
}

export async function verifyPromotionPayment(request: Request, env: Env, auctionId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ txHash?: string }>(request);
  const txHash = normalizeTxHash(body.txHash);
  if (!txHash) throw new HttpError(400, 'Valid Base transaction hash required', 'promotion_payment_invalid');

  const db = new Db(requireDb(env));
  const payment = await db.first<PaymentRow>(`SELECT id, auction_id, payer_user_id, recipient_wallet_address, required_amount_atomic, tx_hash, status FROM profile_promotion_payments WHERE auction_id = ?`, [auctionId]);
  if (!payment || payment.payer_user_id !== auth.user.id) throw new HttpError(404, 'Promotion payment obligation not found', 'promotion_payment_not_found');
  if (payment.status === 'verified') return json({ ok: true, status: 'verified', txHash: payment.tx_hash, duplicate: true });
  if (!['pending', 'submitted'].includes(payment.status)) throw new HttpError(409, 'Promotion payment is no longer payable', 'promotion_payment_closed');
  if (payment.tx_hash && payment.tx_hash !== txHash) throw new HttpError(409, 'A different transaction is already attached to this payment', 'promotion_payment_tx_conflict');

  const auctionDeadline = await db.first<{ payment_due_at: string | null }>(`SELECT payment_due_at FROM profile_promotion_auctions WHERE id = ?`, [auctionId]);
  const timestamp = now();
  if (auctionDeadline?.payment_due_at && auctionDeadline.payment_due_at <= timestamp) {
    await db.batch([
      db.statement(`UPDATE profile_promotion_payments SET status = 'expired', updated_at = ? WHERE id = ? AND status IN ('pending','submitted')`, [timestamp, payment.id]),
      db.statement(`UPDATE profile_promotion_auctions SET status = 'payment_expired', updated_at = ? WHERE id = ? AND status IN ('payment_pending','payment_detected')`, [timestamp, auctionId]),
    ]);
    throw new HttpError(409, 'Promotion payment deadline has expired', 'promotion_payment_expired');
  }

  const duplicate = await db.first<{ auction_id: string }>(`SELECT auction_id FROM profile_promotion_payments WHERE tx_hash = ? AND auction_id <> ? LIMIT 1`, [txHash, auctionId]);
  if (duplicate) throw new HttpError(409, 'This transaction has already been used for another promotion', 'promotion_payment_tx_reused');

  if (payment.status === 'pending') await db.run(`UPDATE profile_promotion_payments SET status = 'submitted', tx_hash = ?, updated_at = ? WHERE id = ? AND status = 'pending'`, [txHash, timestamp, payment.id]);

  const receipt = await alchemyRpc<Receipt | null>(env, 'eth_getTransactionReceipt', [txHash]);
  if (!receipt) return json({ ok: false, status: 'pending', message: 'Payment is waiting for Base confirmation.' }, { status: 202 });
  if (receipt.status?.toLowerCase() !== '0x1') throw new HttpError(409, 'The Base transaction did not complete successfully', 'promotion_payment_tx_failed');

  const wallets = await db.all<{ address: string }>(`SELECT address FROM wallet_accounts WHERE user_id = ? AND chain_family = 'evm' AND status = 'active'`, [auth.user.id]);
  const payerAddresses = new Set(wallets.map((wallet) => normalizeAddress(wallet.address)).filter((value): value is string => Boolean(value)));
  if (!payerAddresses.size) throw new HttpError(409, 'Winning account has no active Linkary EVM wallet', 'promotion_payment_wallet_missing');
  const recipient = normalizeAddress(payment.recipient_wallet_address);
  if (!recipient || !receiptContainsExactUsdcTransfer(receipt, payerAddresses, recipient, BigInt(payment.required_amount_atomic))) {
    throw new HttpError(409, 'Transaction does not match the winning promotion payment', 'promotion_payment_transfer_mismatch');
  }

  const blockNumber = receipt.blockNumber ? Number.parseInt(receipt.blockNumber, 16) : null;
  const auction = await db.first<{ live_duration_hours: number }>(`SELECT s.live_duration_hours FROM profile_promotion_auctions a JOIN profile_promotion_slots s ON s.id = a.slot_id WHERE a.id = ?`, [auctionId]);
  if (!auction) throw new HttpError(404, 'Auction not found', 'auction_not_found');
  const promotionEndsAt = new Date(Date.now() + auction.live_duration_hours * 60 * 60 * 1000).toISOString();
  await db.batch([
    db.statement(`UPDATE profile_promotion_payments SET status = 'verified', tx_hash = ?, block_number = ?, verified_at = ?, updated_at = ? WHERE id = ? AND status IN ('pending','submitted')`, [txHash, blockNumber, timestamp, timestamp, payment.id]),
    db.statement(`UPDATE profile_promotion_auctions SET status = 'creative_pending', promotion_ends_at = ?, updated_at = ? WHERE id = ? AND status IN ('payment_pending','payment_detected')`, [promotionEndsAt, timestamp, auctionId]),
  ]);
  return json({ ok: true, status: 'verified', txHash, verifiedAt: timestamp, promotionEndsAt, duplicate: false });
}

export async function reviewPromotionCreative(request: Request, env: Env, creativeId: string): Promise<Response> {
  const auth = await requireSuperadmin(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ action?: 'approve' | 'reject' }>(request);
  if (!body.action || !['approve', 'reject'].includes(body.action)) throw new HttpError(400, 'Review action must be approve or reject', 'promotion_review_invalid');
  const db = new Db(requireDb(env));
  const creative = await db.first<{ id: string; auction_id: string }>(`SELECT id, auction_id FROM profile_promotion_creatives WHERE id = ?`, [creativeId]);
  if (!creative) throw new HttpError(404, 'Promotion creative not found', 'promotion_creative_not_found');
  const timestamp = now();
  if (body.action === 'reject') {
    await db.batch([
      db.statement(`UPDATE profile_promotion_creatives SET moderation_status = 'rejected', updated_at = ? WHERE id = ?`, [timestamp, creative.id]),
      db.statement(`UPDATE profile_promotion_auctions SET status = 'rejected', updated_at = ? WHERE id = ? AND status <> 'live'`, [timestamp, creative.auction_id]),
    ]);
    return json({ ok: true, status: 'rejected' });
  }
  const verified = await db.first<{ id: string }>(`SELECT id FROM profile_promotion_payments WHERE auction_id = ? AND status = 'verified' LIMIT 1`, [creative.auction_id]);
  if (!verified) throw new HttpError(409, 'Promotion payment is not verified', 'promotion_payment_not_verified');
  await db.batch([
    db.statement(`UPDATE profile_promotion_creatives SET moderation_status = 'approved', updated_at = ? WHERE id = ?`, [timestamp, creative.id]),
    db.statement(`UPDATE profile_promotion_auctions SET status = 'live', live_at = COALESCE(live_at, ?), updated_at = ? WHERE id = ? AND status IN ('creative_pending','ready','live')`, [timestamp, timestamp, creative.auction_id]),
  ]);
  return json({ ok: true, status: 'live', liveAt: timestamp });
}
