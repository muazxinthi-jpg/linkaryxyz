import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { ProductMe, ProductProfile, ProductStatus } from './ProductWorkspace';

function csrfToken(): string {
  const pair = document.cookie.split('; ').find((item) => item.startsWith('__Host-linkary_csrf='));
  return pair ? decodeURIComponent(pair.slice(pair.indexOf('=') + 1)) : '';
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers || {});
  if (init?.body) headers.set('content-type', 'application/json');
  if (init?.method && !['GET', 'HEAD'].includes(init.method.toUpperCase())) headers.set('x-csrf-token', csrfToken());
  const response = await fetch(path, { credentials: 'same-origin', ...init, headers });
  const payload = await response.json().catch(() => ({})) as T & { message?: string };
  if (!response.ok) throw new Error(payload.message || `Request failed (${response.status})`);
  return payload;
}

type Auction = {
  id: string;
  profile_id: string;
  status: string;
  duration_hours: number;
  starting_bid_cents: number;
  highest_bid_cents: number | null;
  winner_user_id: string | null;
  expires_at: string;
  payment_due_at: string | null;
};

type AuctionResponse = { auction: Auction; bids: Array<{ id: string; amount_cents: number; created_at: string }> };
type Payment = { recipient_wallet_address: string; required_amount_atomic: number; tx_hash: string | null; status: string; payment_due_at: string | null; auction_status: string | null };

function dollars(cents: number | null | undefined) {
  return `$${((cents || 0) / 100).toFixed(2)}`;
}

export function PromotionOwnerPanel({ profile }: { profile: ProductProfile }) {
  const [wallet, setWallet] = useState('');
  const [startingBid, setStartingBid] = useState('10');
  const [duration, setDuration] = useState('24');
  const [auctionId, setAuctionId] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function enable() {
    setBusy(true); setMessage('');
    try {
      await api(`/api/profiles/${encodeURIComponent(profile.id)}/promotion-slot`, {
        method: 'PUT', body: JSON.stringify({ enabled: true, payoutWalletAddress: wallet }),
      });
      setMessage('Sponsored header monetization is enabled for this profile.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not enable monetization.'); }
    finally { setBusy(false); }
  }

  async function createAuction() {
    setBusy(true); setMessage('');
    try {
      const result = await api<{ auctionId: string }>(`/api/profiles/${encodeURIComponent(profile.id)}/promotion-auctions`, {
        method: 'POST', body: JSON.stringify({ startingBidCents: Math.round(Number(startingBid) * 100), durationHours: Number(duration) }),
      });
      setAuctionId(result.auctionId);
      setMessage('Auction is live. Share the bidder link with projects.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not start auction.'); }
    finally { setBusy(false); }
  }

  const bidderUrl = auctionId ? `${window.location.origin}/promotion-auction/${auctionId}` : '';
  return (
    <section className="ops-section promotion-owner-panel" data-promotion-owner-panel>
      <div className="ops-section-title"><div><span className="ops-kicker">PUBLIC PROFILE MONETIZATION</span><h2>Sponsored header auction</h2><p>Rent the header banner on your public profile. The winning project pays you directly in USDC on Base.</p></div></div>
      <div className="promotion-grid">
        <label><span>Payout wallet</span><input value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder="0x..." /></label>
        <button type="button" className="ops-button secondary" disabled={busy || !wallet} onClick={enable}>Enable monetization</button>
        <label><span>Starting bid (USD)</span><input inputMode="decimal" value={startingBid} onChange={(e) => setStartingBid(e.target.value)} /></label>
        <label><span>Auction window</span><select value={duration} onChange={(e) => setDuration(e.target.value)}><option value="6">6 hours</option><option value="12">12 hours</option><option value="24">24 hours</option></select></label>
        <button type="button" className="ops-button primary" disabled={busy || Number(startingBid) <= 0} onClick={createAuction}>Start auction</button>
      </div>
      {auctionId && <div className="promotion-share"><strong>Bidder link</strong><input readOnly value={bidderUrl} /><button type="button" className="ops-button secondary" onClick={() => navigator.clipboard?.writeText(bidderUrl)}>Copy</button></div>}
      {message && <div className="ops-message">{message}</div>}
    </section>
  );
}

export default function PromotionAuctionExperience({ me, status }: { me: ProductMe; status: ProductStatus }) {
  const location = useLocation();
  const auctionId = useMemo(() => location.pathname.split('/').filter(Boolean)[1] || '', [location.pathname]);
  const [data, setData] = useState<AuctionResponse | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [bidUsd, setBidUsd] = useState('');
  const [txHash, setTxHash] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [destinationUrl, setDestinationUrl] = useState('');
  const [ctaType, setCtaType] = useState('join');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const next = await api<AuctionResponse>(`/api/promotion-auctions/${encodeURIComponent(auctionId)}`);
    setData(next);
    const mine = await api<{ payment: Payment | null }>(`/api/promotion-auctions/${encodeURIComponent(auctionId)}/payment`);
    setPayment(mine.payment);
  }
  useEffect(() => { void refresh().catch((error) => setMessage(error instanceof Error ? error.message : 'Auction unavailable.')); }, [auctionId]);

  async function bid() {
    setBusy(true); setMessage('');
    try {
      await api(`/api/promotion-auctions/${encodeURIComponent(auctionId)}/bids`, { method: 'POST', headers: { 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify({ amountCents: Math.round(Number(bidUsd) * 100) }) });
      setMessage('Bid submitted.'); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Bid failed.'); }
    finally { setBusy(false); }
  }

  async function verifyPayment() {
    setBusy(true); setMessage('');
    try {
      const result = await api<{ status: string }>(`/api/promotion-auctions/${encodeURIComponent(auctionId)}/payment/verify`, { method: 'POST', body: JSON.stringify({ txHash }) });
      setMessage(result.status === 'verified' ? 'Payment verified. You can now submit the banner.' : 'Payment is waiting for confirmation.'); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Payment verification failed.'); }
    finally { setBusy(false); }
  }

  async function submitCreative() {
    setBusy(true); setMessage('');
    try {
      await api(`/api/promotion-auctions/${encodeURIComponent(auctionId)}/creative`, { method: 'PUT', body: JSON.stringify({ bannerUrl, destinationUrl, ctaType }) });
      setMessage('Banner submitted for Linkary review.'); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Creative submission failed.'); }
    finally { setBusy(false); }
  }

  const profile = status.profiles.find((item) => item.id === data?.auction.profile_id) || status.profiles[0];
  if (!profile) return null;
  const auction = data?.auction;
  const minimumCents = auction ? Math.max(auction.starting_bid_cents, (auction.highest_bid_cents || 0) + 1) : 0;
  return (
    <main className="promotion-auction-page">
      <a className="promotion-back" href="/dashboard">← Back to Linkary</a>
      <section className="promotion-auction-card">
        <span className="ops-kicker">SPONSORED HEADER AUCTION</span>
        <h1>{profile.display_name || profile.username}</h1>
        {!auction && <p>Loading auction...</p>}
        {auction && <>
          <div className="promotion-auction-stats"><div><span>Status</span><strong>{auction.status.replaceAll('_', ' ')}</strong></div><div><span>Highest bid</span><strong>{auction.highest_bid_cents ? dollars(auction.highest_bid_cents) : 'No bids yet'}</strong></div><div><span>Closes</span><strong>{new Date(auction.expires_at).toLocaleString()}</strong></div></div>
          {auction.status === 'open' && <div className="promotion-bid-box"><label><span>Your bid (USD), minimum {dollars(minimumCents)}</span><input inputMode="decimal" value={bidUsd} onChange={(e) => setBidUsd(e.target.value)} placeholder={(minimumCents / 100).toFixed(2)} /></label><button type="button" className="ops-button primary" disabled={busy || Number(bidUsd) * 100 < minimumCents} onClick={bid}>Place bid</button></div>}
          {payment && <section className="promotion-payment-box"><h2>You won this auction</h2><p>Send exactly <strong>{(payment.required_amount_atomic / 1_000_000).toFixed(2)} USDC</strong> on Base to:</p><code>{payment.recipient_wallet_address}</code>{payment.status !== 'verified' && <><label><span>Transaction hash</span><input value={txHash} onChange={(e) => setTxHash(e.target.value)} placeholder="0x..." /></label><button type="button" className="ops-button primary" disabled={busy || !txHash} onClick={verifyPayment}>Verify payment</button></>}{payment.status === 'verified' && <div className="promotion-creative-form"><label><span>Banner image URL</span><input value={bannerUrl} onChange={(e) => setBannerUrl(e.target.value)} placeholder="https://..." /></label><label><span>Destination URL</span><input value={destinationUrl} onChange={(e) => setDestinationUrl(e.target.value)} placeholder="https://..." /></label><label><span>CTA</span><select value={ctaType} onChange={(e) => setCtaType(e.target.value)}><option value="join">Join</option><option value="register">Register</option><option value="book_now">Book now</option><option value="learn_more">Learn more</option><option value="visit">Visit</option><option value="explore">Explore</option><option value="trade">Trade</option><option value="mint">Mint</option><option value="buy">Buy</option><option value="view">View</option></select></label><button type="button" className="ops-button primary" disabled={busy || !bannerUrl || !destinationUrl} onClick={submitCreative}>Submit banner</button></div>}</section>}
        </>}
        {message && <div className="ops-message">{message}</div>}
      </section>
    </main>
  );
}
