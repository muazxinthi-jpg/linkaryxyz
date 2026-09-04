import { useEffect, useMemo, useState } from 'react';
import {
  useGetAccessToken,
  useIsInitialized,
  useIsSignedIn,
  useSignInWithEmail,
  useSignInWithOAuth,
  useSignOut,
  useVerifyEmailOTP,
} from '@coinbase/cdp-hooks';
import CommunityManagerExperience from './CommunityManagerExperience';
import { ProductWorkspace, type ProductMe, type ProductProfile, type ProductStatus } from './ProductWorkspace';
import './community-session-gate.css';

type GateState = 'checking' | 'ready' | 'reconnect';

class ApiError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

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

export default function CommunityManagerSessionGate({ me, status }: { me: ProductMe; status: ProductStatus }) {
  const { isInitialized } = useIsInitialized();
  const { isSignedIn } = useIsSignedIn();
  const { getAccessToken } = useGetAccessToken();
  const { signOut } = useSignOut();
  const { signInWithEmail } = useSignInWithEmail();
  const { verifyEmailOTP } = useVerifyEmailOTP();
  const { signInWithOAuth } = useSignInWithOAuth();
  const creator = useMemo(() => status.profiles.find((item) => item.profile_type === 'creator') || status.profiles[0], [status]);
  const [profileId, setProfileId] = useState(() => creator?.id || '');
  const profile = status.profiles.find((item) => item.id === profileId) || creator;
  const [gateState, setGateState] = useState<GateState>('checking');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState(status.user.email || '');
  const [flowId, setFlowId] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState('');

  function changeProfile(id: string) {
    setProfileId(id);
    window.localStorage.setItem('linkary.active.profile', id);
  }

  useEffect(() => {
    if (!isInitialized) {
      setGateState('checking');
      return;
    }
    if (!isSignedIn) {
      setGateState('reconnect');
      return;
    }
    let cancelled = false;
    void (async () => {
      setGateState('checking');
      try {
        const token = await getAccessToken();
        const csrfToken = csrf();
        if (!token || !csrfToken) throw new ApiError('session_unavailable', 'Your secure session could not be verified.');
        await api('/api/auth/cdp/current-link', {
          method: 'POST',
          headers: { 'x-csrf-token': csrfToken },
          body: JSON.stringify({ accessToken: token }),
        });
        if (!cancelled) {
          setMessage('');
          setGateState('ready');
        }
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.code === 'cdp_account_mismatch') {
          try { await signOut(); } catch {}
          if (!cancelled) {
            setMessage('That sign-in belongs to another Linkary account. Your current Linkary profile was not changed. Please reconnect with the same account you originally used for Linkary.');
            setGateState('reconnect');
          }
          return;
        }
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : 'Your secure session needs to be restored before Telegram can be linked.');
          setGateState('reconnect');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [isInitialized, isSignedIn, getAccessToken, signOut]);

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
      setMessage('Secure session restored. Verifying that it belongs to this Linkary account…');
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

  if (gateState === 'ready') return <CommunityManagerExperience me={me} status={status} />;
  if (!profile) return null;

  return (
    <ProductWorkspace me={me} status={status} profile={profile as ProductProfile} onProfileChange={changeProfile}>
      <section className="community-session-gate">
        <header className="ops-page-header">
          <div><span className="ops-kicker">TELEGRAM IDENTITY</span><h1>Communities</h1><p>Connect Telegram to the Linkary account you are already using. You do not need to log out or create another Linkary profile.</p></div>
        </header>
        <section className="ops-card community-session-card">
          <div className="community-session-heading">
            <div><span>SECURE SESSION</span><h2>{gateState === 'checking' ? 'Checking your Linkary sign-in' : 'Restore your secure sign-in'}</h2></div>
            <span className="community-status">{gateState === 'checking' ? 'Checking' : 'Required'}</span>
          </div>
          {gateState === 'checking' ? (
            <div className="community-session-checking"><div className="spinner" /><p>Confirming the secure account connected to this Linkary profile…</p></div>
          ) : (
            <>
              <div className="community-session-safe-note"><strong>Your Linkary account stays signed in</strong><span>This step only restores the secure Coinbase authentication session in this browser. Linkary verifies that it maps to your current account before Telegram can be linked. It cannot create or replace your current Linkary profile.</span></div>
              {message && <div className="ops-banner">{message}</div>}
              {flowId ? (
                <form className="community-session-form" onSubmit={verifyOtp}>
                  <label>6-digit verification code<input inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" maxLength={6} required /></label>
                  <div className="community-session-actions"><button type="button" className="ops-button secondary" onClick={() => { setFlowId(null); setOtp(''); setMessage(''); }}>Use another method</button><button className="ops-button primary" disabled={busy === 'otp' || otp.length !== 6}>{busy === 'otp' ? 'Verifying…' : 'Verify secure session'}</button></div>
                </form>
              ) : (
                <>
                  <form className="community-session-form" onSubmit={startEmail}>
                    <label>Email used for Linkary<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></label>
                    <button className="ops-button primary" disabled={Boolean(busy)}>{busy === 'email' ? 'Sending code…' : 'Continue with email'}</button>
                  </form>
                  <div className="community-session-divider"><span>or restore with the same social account</span></div>
                  <div className="community-session-socials"><button type="button" className="ops-button secondary" disabled={Boolean(busy)} onClick={() => void social('google')}>{busy === 'google' ? 'Opening Google…' : 'Continue with Google'}</button><button type="button" className="ops-button secondary" disabled={Boolean(busy)} onClick={() => void social('x')}>{busy === 'x' ? 'Opening X…' : 'Continue with X'}</button></div>
                </>
              )}
              <p className="community-session-footnote">Use the same email, Google account, or X account you originally used for Linkary. Telegram is intentionally not offered as a sign-in method here, because it must be linked to your existing account after this check.</p>
            </>
          )}
        </section>
      </section>
    </ProductWorkspace>
  );
}
