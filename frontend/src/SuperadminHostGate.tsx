import { useEffect, useState, type ReactNode } from 'react';
import {
  useGetAccessToken,
  useIsInitialized,
  useIsSignedIn,
  useSignInWithEmail,
  useSignInWithOAuth,
  useSignOut,
  useVerifyEmailOTP,
} from '@coinbase/cdp-hooks';
import type { ProductMe, ProductStatus } from './ProductWorkspace';
import './superadmin-host.css';

type GateState = 'loading' | 'signed-out' | 'ready' | 'forbidden' | 'error';
type JsonPayload = { error?: string; message?: string };

type Props = {
  render: (me: ProductMe, status: ProductStatus) => ReactNode;
};

function readCookie(name: string): string | null {
  const match = document.cookie.split('; ').find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

async function jsonRequest<T extends JsonPayload = JsonPayload>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T }> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  const data = await response.json().catch(() => ({})) as T;
  return { ok: response.ok, status: response.status, data };
}

function SuperadminLogin() {
  const { signInWithEmail } = useSignInWithEmail();
  const { verifyEmailOTP } = useVerifyEmailOTP();
  const { signInWithOAuth } = useSignInWithOAuth();
  const [email, setEmail] = useState('mmxinthi@gmail.com');
  const [otp, setOtp] = useState('');
  const [flowId, setFlowId] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  async function startEmail(event: React.FormEvent) {
    event.preventDefault();
    setBusy('email');
    setMessage('');
    try {
      const result = await signInWithEmail({ email: email.trim() });
      setFlowId(result.flowId);
      setOtp('');
    } catch {
      setMessage('The sign-in code could not be sent.');
    } finally {
      setBusy('');
    }
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    if (!flowId) return;
    setBusy('otp');
    setMessage('');
    try {
      await verifyEmailOTP({ flowId, otp });
    } catch {
      setMessage('The verification code could not be confirmed.');
      setBusy('');
    }
  }

  async function oauth(provider: 'google' | 'x') {
    setBusy(provider);
    setMessage('');
    try {
      await signInWithOAuth(provider);
    } catch {
      setMessage('Secure sign-in could not be started.');
      setBusy('');
    }
  }

  return (
    <main className="sadmin-auth-page">
      <section className="sadmin-auth-card">
        <a className="sadmin-auth-brand" href="https://linkary.xyz"><img src="/assets/brand/linkary-icon-black.png" alt="" /><span>Linkary</span></a>
        <span className="sadmin-eyebrow">SUPERADMIN CONSOLE</span>
        <h1>Restricted access</h1>
        <p>Sign in with an account that has an active Linkary Superadmin grant. This console uses a separate host-scoped session from the normal Linkary app.</p>

        {flowId ? (
          <form className="sadmin-auth-form" onSubmit={verify}>
            <label>Verification code<input required inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" /></label>
            <button disabled={busy !== '' || otp.length !== 6}>{busy === 'otp' ? 'Verifying…' : 'Verify and continue'}</button>
            <button type="button" className="secondary" onClick={() => { setFlowId(null); setOtp(''); setMessage(''); }}>Use another email</button>
          </form>
        ) : (
          <>
            <form className="sadmin-auth-form" onSubmit={startEmail}>
              <label>Authorized email<input required type="email" autoComplete="email" value={email} readOnly /></label>
              <button disabled={busy !== ''}>{busy === 'email' ? 'Sending code…' : 'Continue with email'}</button>
            </form>
            <div className="sadmin-auth-divider"><span>or</span></div>
            <div className="sadmin-auth-socials">
              <button type="button" disabled={busy !== ''} onClick={() => void oauth('google')}>{busy === 'google' ? 'Connecting…' : 'Continue with Google'}</button>
              <button type="button" disabled={busy !== ''} onClick={() => void oauth('x')}>{busy === 'x' ? 'Connecting…' : 'Continue with X'}</button>
            </div>
          </>
        )}
        {message && <div className="sadmin-auth-message">{message}</div>}
        <small>No signup or invitation flow is available from the Superadmin console.</small>
      </section>
    </main>
  );
}

export default function SuperadminHostGate({ render }: Props) {
  const { isInitialized } = useIsInitialized();
  const { isSignedIn } = useIsSignedIn();
  const { getAccessToken } = useGetAccessToken();
  const { signOut } = useSignOut();
  const [state, setState] = useState<GateState>('loading');
  const [me, setMe] = useState<ProductMe | null>(null);
  const [status, setStatus] = useState<ProductStatus | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!isInitialized) return;
    let cancelled = false;

    void (async () => {
      setState('loading');
      try {
        let current = await jsonRequest<ProductMe & JsonPayload>('/api/auth/me');
        if (cancelled) return;

        if (!current.ok || !current.data.authenticated) {
          if (!isSignedIn) {
            setMe(null);
            setStatus(null);
            setState('signed-out');
            return;
          }

          const accessToken = await getAccessToken();
          if (!accessToken) throw new Error('access_token_unavailable');
          const bridge = await jsonRequest('/api/auth/cdp/session', {
            method: 'POST',
            body: JSON.stringify({ accessToken }),
          });
          if (!bridge.ok) {
            if (bridge.status === 401 || bridge.status === 403 || bridge.data.error === 'access_required') {
              setState('forbidden');
              return;
            }
            throw new Error('session_bridge_failed');
          }
          current = await jsonRequest<ProductMe & JsonPayload>('/api/auth/me');
          if (cancelled) return;
        }

        if (!current.data.authenticated || !current.data.user?.superadmin) {
          setMe(current.data);
          setStatus(null);
          setState('forbidden');
          return;
        }

        const nextStatus = await jsonRequest<ProductStatus & JsonPayload>('/api/onboarding/status');
        if (!nextStatus.ok || !nextStatus.data.profiles?.length) throw new Error('status_unavailable');
        if (cancelled) return;
        setMe(current.data);
        setStatus(nextStatus.data);
        setState('ready');
      } catch {
        if (!cancelled) setState('error');
      }
    })();

    return () => { cancelled = true; };
  }, [isInitialized, isSignedIn, getAccessToken, retry]);

  async function clearSession() {
    try {
      const csrf = readCookie('__Host-linkary_csrf');
      if (csrf) await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'x-csrf-token': csrf } });
    } catch {}
    try { await signOut(); } catch {}
    setMe(null);
    setStatus(null);
    setState('signed-out');
  }

  if (state === 'signed-out') return <SuperadminLogin />;
  if (state === 'forbidden') {
    return (
      <main className="sadmin-auth-page">
        <section className="sadmin-auth-card">
          <span className="sadmin-eyebrow">SUPERADMIN CONSOLE</span>
          <h1>Access denied</h1>
          <p>This account does not have an active Superadmin grant. No administrative data is available.</p>
          <button className="sadmin-auth-action" type="button" onClick={() => void clearSession()}>Use a different account</button>
          <a className="sadmin-auth-back" href="https://app.linkary.xyz">Return to Linkary</a>
        </section>
      </main>
    );
  }
  if (state === 'error') {
    return (
      <main className="sadmin-auth-page">
        <section className="sadmin-auth-card">
          <span className="sadmin-eyebrow">SUPERADMIN CONSOLE</span>
          <h1>Console unavailable</h1>
          <p>The Superadmin session could not be verified. No administrative action was performed.</p>
          <button className="sadmin-auth-action" type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button>
        </section>
      </main>
    );
  }
  if (state === 'ready' && me && status) return <>{render(me, status)}</>;
  return <main className="sadmin-auth-page"><section className="sadmin-auth-card compact"><div className="sadmin-auth-spinner" /><p>Verifying Superadmin access…</p></section></main>;
}
