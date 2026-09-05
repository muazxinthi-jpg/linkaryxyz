import { useEffect, useState } from 'react';
import './personal-telegram-connection.css';

type Identity = { currentHandle: string | null; currentDisplayName: string | null };

export default function PersonalTelegramConnection() {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const url = new URL(window.location.href);
    const outcome = url.searchParams.get('telegram');
    const messages: Record<string, string> = {
      connected: 'Telegram connected to your Personal Profile.',
      cancelled: 'Telegram connection was cancelled. You can try again whenever you are ready.',
      conflict: 'This Telegram or Linkary account already has a different connection.',
      failed: 'Telegram could not be connected. Please try again from your signed-in Linkary account.',
    };
    if (outcome) {
      setMessage(messages[outcome] || '');
      url.searchParams.delete('telegram');
      window.history.replaceState(window.history.state, '', url);
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/auth/telegram-identity', { credentials: 'same-origin' });
        if (!response.ok) throw new Error();
        const result = await response.json() as { connected: boolean; identity: Identity | null };
        if (!cancelled) setIdentity(result.connected ? result.identity : null);
      } catch {
        if (!cancelled) setMessage('Telegram connection status could not be loaded. Please refresh to try again.');
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  async function connect() {
    setBusy(true);
    setMessage('Opening Telegram…');
    try {
      const cookie = document.cookie.split('; ').find((part) => part.startsWith('__Host-linkary_csrf='));
      const csrf = cookie ? decodeURIComponent(cookie.split('=').slice(1).join('=')) : '';
      const response = await fetch('/api/auth/telegram/start', {
        method: 'POST', credentials: 'same-origin', headers: { 'x-csrf-token': csrf },
      });
      const result = await response.json() as { authorizationUrl?: string; error?: string };
      if (!response.ok) {
        setMessage(result.error === 'telegram_not_configured'
          ? 'Telegram connection is being set up. Please try again later.'
          : 'Telegram could not be opened. Please refresh and try again.');
        setBusy(false);
        return;
      }
      const url = new URL(result.authorizationUrl || '');
      if (url.origin !== 'https://oauth.telegram.org' || url.pathname !== '/auth') throw new Error();
      window.location.assign(url.toString());
    } catch {
      setMessage('Telegram could not be opened. Please try again.');
      setBusy(false);
    }
  }
  const label = identity?.currentHandle ? `@${identity.currentHandle.replace(/^@/, '')}` : identity?.currentDisplayName || 'Telegram connected';
  return <section className="wide personal-telegram-connection" data-personal-telegram-connection>
    <div className="personal-telegram-heading"><div><strong>Personal Telegram</strong><small>Connect your own Telegram account to your Personal Profile. You can do this even if you do not manage any Telegram communities.</small></div><span className={identity ? 'is-connected' : ''}>{loading ? 'Checking' : identity ? 'Connected' : 'Not connected'}</span></div>
    {identity ? <div className="personal-telegram-connected"><div><strong>{label}</strong><small>Verified personal Telegram identity</small></div><span>Connected ✓</span></div>
      : <div className="personal-telegram-actions"><button type="button" className="ops-button primary" disabled={loading || busy} onClick={() => void connect()}>{busy ? 'Opening Telegram…' : 'Connect Telegram'}</button></div>}
    {message && <div className="personal-telegram-message" aria-live="polite">{message}</div>}
    <p>Personal Telegram identity is separate from Community ownership verification. Connecting your account never verifies a Community or creates campaign performance proof.</p>
  </section>;
}
