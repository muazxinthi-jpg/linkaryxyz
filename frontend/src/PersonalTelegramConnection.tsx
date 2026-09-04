import { useEffect, useState } from 'react';
import {
  useGetAccessToken,
  useIsInitialized,
  useIsSignedIn,
  useLinkOAuth,
  useSignInWithEmail,
  useSignInWithOAuth,
  useSignOut,
  useVerifyEmailOTP,
} from '@coinbase/cdp-hooks';
import './personal-telegram-connection.css';

type TelegramIdentity = {
  currentHandle: string | null;
  currentDisplayName: string | null;
  ownershipVerifiedAt: string | null;
};

type TelegramIdentityResponse = {
  connected: boolean;
  identity: TelegramIdentity | null;
};

class ApiError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

const TELEGRAM_LINK_PENDING = 'linkary.personal.telegram.link.pending.v1';

function csrf(): string | null {
  const hit = document.cookie.split('; ').find((part) => part.startsWith('__Host-linkary_csrf='));
  return hit ? decodeURIComponent(hit.split('=').slice(1).join('=')) : null;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  const payload = await response.json().catch(() => ({})) as T & { error?: string; message?: string };
  if (!response.ok) throw new ApiError(payload.error || 'request_failed', payload.message || 'Request failed');
  return payload;
}

function oauthFailure(detail?: string | null): string {
  const text = detail?.trim();
  if (!text || /internal server error/i.test(text)) {
    return 'Telegram could not be connected right now. Your Linkary account and profile were not changed.';
  }
  return `Telegram connection failed: ${text}`;
}

export default function PersonalTelegramConnection({ defaultEmail = '' }: { defaultEmail?: string | null }) {
  const { linkOAuth, oauthState } = useLinkOAuth();
  const { getAccessToken } = useGetAccessToken();
  const { isInitialized } = useIsInitialized();
  const { isSignedIn } = useIsSignedIn();
  const { signOut } = useSignOut();
  const { signInWithEmail } = useSignInWithEmail();
  const { verifyEmailOTP } = useVerifyEmailOTP();
  const { signInWithOAuth } = useSignInWithOAuth();

  const [identity, setIdentity] = useState<TelegramIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const [restore, setRestore] = useState(false);
  const [email, setEmail] = useState(defaultEmail || '');
  const [flowId, setFlowId] = useState<string | null>(null);
  const [otp, setOtp] = useState('');

  async function loadIdentity() {
    setLoading(true);
    try {
      const result = await api<TelegramIdentityResponse>('/api/auth/telegram-identity');
      setIdentity(result.connected ? result.identity : null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Telegram connection status could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadIdentity(); }, []);

  async function syncCurrentAccount() {
    if (!isInitialized || !isSignedIn) throw new ApiError('secure_session_required', 'Restore your secure Linkary sign-in first.');
    const accessToken = await getAccessToken();
    const csrfToken = csrf();
    if (!accessToken || !csrfToken) throw new ApiError('secure_session_required', 'Restore your secure Linkary sign-in first.');
    await api('/api/auth/cdp/current-link', {
      method: 'POST',
      headers: { 'x-csrf-token': csrfToken },
      body: JSON.stringify({ accessToken }),
    });
    await loadIdentity();
  }

  useEffect(() => {
    if (sessionStorage.getItem(TELEGRAM_LINK_PENDING) !== '1' || oauthState?.status !== 'error') return;
    sessionStorage.removeItem(TELEGRAM_LINK_PENDING);
    setBusy('');
    setMessage(oauthFailure(oauthState.errorDescription || oauthState.error));
  }, [oauthState?.status, oauthState?.error, oauthState?.errorDescription]);

  useEffect(() => {
    if (!isInitialized || !isSignedIn || sessionStorage.getItem(TELEGRAM_LINK_PENDING) !== '1') return;
    if (oauthState?.status === 'pending' || oauthState?.status === 'error') return;
    let cancelled = false;
    void (async () => {
      setBusy('telegram-sync');
      try {
        await syncCurrentAccount();
        sessionStorage.removeItem(TELEGRAM_LINK_PENDING);
        if (!cancelled) setMessage('Telegram connected to your Personal Profile.');
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : 'Telegram could not be connected.');
      } finally {
        if (!cancelled) setBusy('');
      }
    })();
    return () => { cancelled = true; };
  }, [isInitialized, isSignedIn, oauthState?.status]);

  useEffect(() => {
    if (!restore || !isInitialized || !isSignedIn) return;
    let cancelled = false;
    void (async () => {
      setBusy('restore-sync');
      try {
        await syncCurrentAccount();
        if (!cancelled) {
          setRestore(false);
          setFlowId(null);
          setOtp('');
          setMessage('Secure sign-in restored. You can now connect Telegram.');
        }
      } catch (error) {
        if (error instanceof ApiError && error.code === 'cdp_account_mismatch') {
          try { await signOut(); } catch {}
          if (!cancelled) setMessage('That sign-in belongs to another Linkary account. Use the same email, Google account, or X account you originally used for this Linkary profile.');
        } else if (!cancelled) {
          setMessage(error instanceof Error ? error.message : 'Your secure sign-in could not be restored.');
        }
      } finally {
        if (!cancelled) setBusy('');
      }
    })();
    return () => { cancelled = true; };
  }, [restore, isInitialized, isSignedIn]);

  async function connectTelegram() {
    if (!isInitialized) {
      setMessage('Your Linkary sign-in is still loading. Try again in a moment.');
      return;
    }
    if (!isSignedIn) {
      setRestore(true);
      setMessage('Restore the secure sign-in for this Linkary account, then connect Telegram.');
      return;
    }
    setBusy('telegram-link');
    setMessage('Opening Telegram…');
    sessionStorage.setItem(TELEGRAM_LINK_PENDING, '1');
    try {
      await linkOAuth('telegram');
      if (sessionStorage.getItem(TELEGRAM_LINK_PENDING) === '1') {
        setMessage('Finish the Telegram connection. Linkary will confirm it belongs to this account when you return.');
      }
    } catch (error) {
      sessionStorage.removeItem(TELEGRAM_LINK_PENDING);
      setBusy('');
      setMessage(oauthFailure(error instanceof Error ? error.message : null));
    }
  }

  async function startEmail(event: React.FormEvent) {
    event.preventDefault();
    const value = email.trim();
    if (!value) return;
    setBusy('email');
    setMessage('');
    try {
      const result = await signInWithEmail({ email: value });
      setFlowId(result.flowId);
      setOtp('');
      setMessage(`We sent a verification code to ${value}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The verification code could not be sent.');
    } finally {
      setBusy('');
    }
  }

  async function verifyOtp(event: React.FormEvent) {
    event.preventDefault();
    if (!flowId || otp.length !== 6) return;
    setBusy('otp');
    setMessage('');
    try {
      await verifyEmailOTP({ flowId, otp });
      setMessage('Sign-in restored. Confirming that it belongs to this Linkary account…');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The verification code could not be verified.');
      setBusy('');
    }
  }

  async function social(provider: 'google' | 'x') {
    setBusy(provider);
    setMessage('');
    try {
      await signInWithOAuth(provider);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Unable to continue with ${provider}.`);
      setBusy('');
    }
  }

  const label = identity?.currentHandle
    ? `@${identity.currentHandle.replace(/^@/, '')}`
    : identity?.currentDisplayName || 'Telegram connected';

  return (
    <section className="wide personal-telegram-connection" data-personal-telegram-connection>
      <div className="personal-telegram-heading">
        <div>
          <strong>Personal Telegram</strong>
          <small>Connect your own Telegram account to your Personal Profile. You can do this even if you do not manage any Telegram communities.</small>
        </div>
        <span className={identity ? 'is-connected' : ''}>{loading ? 'Checking' : identity ? 'Connected' : 'Not connected'}</span>
      </div>

      {identity ? (
        <div className="personal-telegram-connected">
          <div><strong>{label}</strong><small>Verified personal Telegram identity</small></div>
          <span>Connected ✓</span>
        </div>
      ) : restore ? (
        <div className="personal-telegram-restore">
          <div className="personal-telegram-safe-note"><strong>Your Linkary profile will not change</strong><span>Restore the same sign-in you originally used for Linkary. Linkary checks that account before Telegram can be added.</span></div>
          {flowId ? (
            <form onSubmit={verifyOtp}>
              <label>6-digit verification code<input inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" maxLength={6} required /></label>
              <div className="personal-telegram-actions"><button type="button" className="ops-button secondary" onClick={() => { setFlowId(null); setOtp(''); setMessage(''); }}>Use another method</button><button className="ops-button primary" disabled={busy === 'otp' || otp.length !== 6}>{busy === 'otp' ? 'Verifying…' : 'Verify sign-in'}</button></div>
            </form>
          ) : (
            <>
              <form onSubmit={startEmail}>
                <label>Email used for Linkary<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></label>
                <button className="ops-button primary" disabled={Boolean(busy)}>{busy === 'email' ? 'Sending code…' : 'Continue with email'}</button>
              </form>
              <div className="personal-telegram-divider"><span>or use the same social account</span></div>
              <div className="personal-telegram-actions"><button type="button" className="ops-button secondary" disabled={Boolean(busy)} onClick={() => void social('google')}>{busy === 'google' ? 'Opening Google…' : 'Continue with Google'}</button><button type="button" className="ops-button secondary" disabled={Boolean(busy)} onClick={() => void social('x')}>{busy === 'x' ? 'Opening X…' : 'Continue with X'}</button></div>
            </>
          )}
          <button type="button" className="personal-telegram-cancel" onClick={() => { setRestore(false); setFlowId(null); setOtp(''); }}>Cancel</button>
        </div>
      ) : (
        <div className="personal-telegram-actions">
          <button type="button" className="ops-button primary" disabled={loading || busy === 'telegram-link' || busy === 'telegram-sync'} onClick={() => void connectTelegram()}>{busy === 'telegram-link' || busy === 'telegram-sync' ? 'Connecting Telegram…' : 'Connect Telegram'}</button>
        </div>
      )}

      {message && <div className="personal-telegram-message" aria-live="polite">{message}</div>}
      <p>Personal Telegram identity is separate from Community ownership verification. Connecting your account never verifies a Community or creates campaign performance proof.</p>
    </section>
  );
}
