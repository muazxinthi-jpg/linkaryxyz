import { useEffect, useState } from 'react';

function csrfToken(): string {
  const pair = document.cookie.split('; ').find((item) => item.startsWith('__Host-linkary_csrf='));
  return pair ? decodeURIComponent(pair.slice(pair.indexOf('=') + 1)) : '';
}

type Creative = {
  creative_id: string;
  auction_id: string;
  username: string;
  display_name: string;
  banner_url: string;
  destination_url: string;
  cta_type: string;
  moderation_status: string;
  payment_status: string | null;
  amount_atomic: number | null;
  created_at: string;
};

export default function AdminPromotionReviewExperience() {
  const [rows, setRows] = useState<Creative[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const response = await fetch('/api/admin/promotion-creatives', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error('Could not load promotion review queue');
    const payload = await response.json() as { creatives?: Creative[] };
    setRows(payload.creatives || []);
  }
  useEffect(() => { void load().catch((error) => setMessage(error instanceof Error ? error.message : 'Queue unavailable.')); }, []);

  async function review(id: string, action: 'approve' | 'reject') {
    setBusy(id); setMessage('');
    try {
      const response = await fetch(`/api/admin/promotion-creatives/${encodeURIComponent(id)}/review`, {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken() }, body: JSON.stringify({ action }),
      });
      const payload = await response.json().catch(() => ({})) as { message?: string };
      if (!response.ok) throw new Error(payload.message || 'Review failed');
      setMessage(action === 'approve' ? 'Banner approved and activated.' : 'Banner rejected.');
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Review failed.'); }
    finally { setBusy(null); }
  }

  return <div className="ops-stack"><div className="ops-heading-row"><div><span className="ops-kicker">MONETIZATION</span><h1>Sponsored banner review</h1><p>Approve only paid, safe banner creatives before they appear on public profiles.</p></div></div>{message && <div className="ops-message">{message}</div>}<section className="ops-section"><div className="ops-section-title"><div><h2>Pending creatives</h2><p>{rows.length} awaiting review.</p></div></div>{!rows.length && <div className="ops-message">No sponsored banners are waiting for review.</div>}<div className="promotion-review-grid">{rows.map((row) => <article className="promotion-review-card" key={row.creative_id}><img src={row.banner_url} alt="Sponsored banner preview" /><div><strong>{row.display_name}</strong><span>/{row.username}</span><p>CTA: {row.cta_type.replaceAll('_', ' ')} · Payment: {row.payment_status || 'unknown'} · {row.amount_atomic ? `${(row.amount_atomic / 1_000_000).toFixed(2)} USDC` : ''}</p><a href={row.destination_url} target="_blank" rel="noreferrer">Open destination ↗</a></div><div className="promotion-review-actions"><button type="button" className="ops-button secondary" disabled={busy === row.creative_id} onClick={() => review(row.creative_id, 'reject')}>Reject</button><button type="button" className="ops-button primary" disabled={busy === row.creative_id || row.payment_status !== 'verified'} onClick={() => review(row.creative_id, 'approve')}>Approve & activate</button></div></article>)}</div></section></div>;
}
