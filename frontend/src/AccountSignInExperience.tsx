import { useCallback, useEffect, useState } from 'react';
import {
  LinkAuth,
  LinkAuthError,
  LinkAuthFlow,
  LinkAuthFlowBackButton,
  LinkAuthTitle,
} from '@coinbase/cdp-react';
import {
  useGetAccessToken,
  useIsInitialized,
  useIsSignedIn,
  useSignInWithEmail,
  useSignInWithOAuth,
  useSignOut,
  useVerifyEmailOTP,
} from '@coinbase/cdp-hooks';
import { ProductWorkspace, type ProductMe, type ProductProfile, type ProductStatus } from './ProductWorkspace';
import './account-sign-in.css';

type VerificationState = 'checking' | 'ready' | 'reconnect' | 'unavailable' | 'mismatch';
type CurrentLinkResponse = {
  ok: boolean;
  authenticationMethods: string[];
};
type ApiErrorBody = { error?: string; message?: string };

function csrfToken(): string | null {
  const match = document.cookie.split('; ').find((part) => part.startsWith('__Host-linkary_csrf='));
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : null;
}

function activeProfile(status: ProductStatus): ProductProfile | undefined {
  const saved = window.localStorage.getItem('linkary.active.profile');
  return (saved ? status.profiles.find((profile) => profile.id === saved) : undefined)
    || status.profiles.find((profile) => profile.profile_type === 'creator')
    || status.profiles[0];
}

export default function AccountSignInExperience({ me, status }: { me: ProductMe; status: ProductStatus }) {
  const { isInitialized } = useIsInitialized();
  const { isSignedIn } = useIsSignedIn();
  const { getAccessToken } = useGetAccessToken();
  const { signInWithEmail } = useSignInWithEmail();
  const { verifyEmailOTP } = useVerifyEmailOTP();
  const { signInWithOAuth } = useSignInWithOAuth();
  const { signOut } = useSignOut();
  const [profile, setProfile] = useState(() => activeProfile(status));
  const [verification, setVerification] = useState<VerificationState>('checking');
  const [message, setMessage] = useState('');
  const [linkedMethods, setLinkedMethods] = useState<string[]>([]);
  const [email, setEmail] = useState('');
  const [flowId, setFlowId] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState('');

  const refreshCdpLink = useCallback(async (): Promise<CurrentLinkResponse> => {
    const token = await getAccessToken();
    const csrf = csrfToken();
    if (!token || !csrf) throw new Error('Your secure Coinbase session needs to be refreshed. Sign in again with the Coinbase account linked to this Linkary account.');

    const response = await fetch('/api/auth/cdp/current-link', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
      body: JSON.stringify({ accessToken: token }),
    });
    const payload = await response.json().catch(() => ({})) as CurrentLinkResponse & ApiErrorBody;
    if (response.status === 409 && payload.error === 'cdp_account_mismatch') {
      const error = new Error('That email sign-in opened a Coinbase account that is not linked to this Linkary account. If you joined with X or Google, choose that same provider below, then add this email after your original account is restored.');
      error.name = 'CdpAccountMismatchError';
      throw error;
    }
    if (!response.ok) throw new Error(payload.message || 'We could not verify the Coinbase account linked to Linkary. Refresh and try again.');
    setLinkedMethods(payload.authenticationMethods || []);
    return payload;
  }, [getAccessToken]);

  useEffect(() => {
    const selected = activeProfile(status);
    setProfile((current) => current?.id === selected?.id ? current : selected);
  }, [status]);

  useEffect(() => {
    if (!isInitialized) {
      setVerification('checking');
      return;
    }
    if (!isSignedIn) {
      setVerification('reconnect');
      setMessage('Linkary is signed in, but Coinbase needs you to confirm the sign-in method already linked to this account. Choose the same method you originally used for Linkary.');
      return;
    }

    let cancelled = false;
    setVerification('checking');
    setMessage('');
    void refreshCdpLink().then(() => {
      if (!cancelled) setVerification('ready');
    }).catch((error: unknown) => {
      if (cancelled) return;
      if (error instanceof Error && error.name === 'CdpAccountMismatchError') setVerification('mismatch');
      else setVerification('unavailable');
      setMessage(error instanceof Error ? error.message : 'We could not verify the Coinbase account linked to Linkary.');
    });

    return () => { cancelled = true; };
  }, [isInitialized, isSignedIn, refreshCdpLink]);

  async function startEmailReconnect(event: React.FormEvent) {
    event.preventDefault();
    const value = email.trim();
    if (!value) return;
    setBusy('email');
    setMessage('');
    try {
      const result = await signInWithEmail({ email: value });
      setFlowId(result.flowId);
      setOtp('');
      setMessage(`Enter the Coinbase code sent to ${value}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Coinbase could not send a verification code.');
    } finally {
      setBusy('');
    }
  }

  async function verifyEmailReconnect(event: React.FormEvent) {
    event.preventDefault();
    if (!flowId || otp.length !== 6) return;
    setBusy('otp');
    setMessage('');
    try {
      await verifyEmailOTP({ flowId, otp });
      setMessage('Coinbase sign-in restored. Checking that it belongs to this Linkary account…');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The Coinbase verification code could not be verified.');
      setBusy('');
    }
  }

  async function reconnectWithOAuth(provider: 'google' | 'x') {
    setBusy(provider);
    setMessage('');
    try {
      await signInWithOAuth(provider);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Could not continue with ${provider === 'x' ? 'X' : 'Google'}.`);
      setBusy('');
    }
  }

  async function retryWithAnotherMethod() {
    try { await signOut(); } catch {}
    setFlowId(null);
    setOtp('');
    setVerification('reconnect');
    setMessage('Choose the same sign-in method you originally used for this Linkary account.');
  }

  const onLinkSuccess = useCallback((method: string | null) => {
    if (method !== 'email') return;
    setMessage('Email was verified with Coinbase. Confirming it is linked to this Linkary account…');
    void refreshCdpLink().then(() => {
      setMessage('Email sign-in is ready. On your phone, choose Email and use this same address to return to this Linkary account.');
    }).catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : 'Email was linked, but Linkary could not refresh the account details. Reload and check this page again.');
    });
  }, [refreshCdpLink]);

  function changeProfile(id: string) {
    window.localStorage.setItem('linkary.active.profile', id);
    setProfile(status.profiles.find((item) => item.id === id) || profile);
  }

  if (!profile) return null;

  return (
    <ProductWorkspace me={me} status={status} profile={profile} onProfileChange={changeProfile}>
      <div className="ops-stack account-sign-in">
        <div className="ops-heading-row">
          <div><span className="ops-kicker">ACCOUNT ACCESS</span><h1>Sign-in methods</h1><p>Add a verified email to your existing Coinbase account so you can sign in to the same Linkary account from your phone.</p></div>
        </div>

        <section className="ops-section account-sign-in-panel">
          <div className="ops-section-title"><div><h2>Email sign-in</h2><p>This adds email to your current Coinbase account. It does not create another Linkary account or change your X identity.</p></div><span className="account-sign-in-status">{verification === 'ready' ? 'Coinbase account verified' : verification === 'checking' ? 'Checking secure session' : 'Action needed'}</span></div>

          {verification === 'checking' && <div className="ops-empty compact"><p>Verifying that your active Coinbase account is the one already linked to Linkary…</p></div>}
          {verification === 'reconnect' && (
            <div className="account-reconnect">
              <div className="ops-message" role="status">{message}</div>
              {flowId ? (
                <form className="account-reconnect-form" onSubmit={verifyEmailReconnect}>
                  <label>6-digit Coinbase code<input inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" maxLength={6} required /></label>
                  <div className="account-reconnect-actions"><button type="button" className="ops-button secondary" onClick={() => { setFlowId(null); setOtp(''); setMessage('Choose the same sign-in method you originally used for this Linkary account.'); }}>Use another method</button><button className="ops-button primary" disabled={busy === 'otp' || otp.length !== 6}>{busy === 'otp' ? 'Verifying…' : 'Verify code'}</button></div>
                </form>
              ) : (
                <>
                  <p className="account-reconnect-note">This confirms your existing Coinbase account; it does not log you out of Linkary. X’s contact email is separate from Coinbase email sign-in. If you joined with X or Google, choose that same provider first, then add your email to the confirmed account.</p>
                  <form className="account-reconnect-form" onSubmit={startEmailReconnect}>
                    <label>Existing Coinbase email sign-in<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Only if you previously signed in with email" required /></label>
                    <button className="ops-button secondary" disabled={Boolean(busy)}>{busy === 'email' ? 'Sending code…' : 'Continue with existing email'}</button>
                  </form>
                  <p className="account-reconnect-note">Use this email option only if you previously signed in to Coinbase with email. An address connected to X or Google does not automatically count as a Coinbase email sign-in.</p>
                  <div className="account-reconnect-divider"><span>or use the same social sign-in</span></div>
                  <div className="account-reconnect-actions"><button type="button" className="ops-button secondary" disabled={Boolean(busy)} onClick={() => void reconnectWithOAuth('google')}>{busy === 'google' ? 'Opening Google…' : 'Continue with Google'}</button><button type="button" className="ops-button secondary" disabled={Boolean(busy)} onClick={() => void reconnectWithOAuth('x')}>{busy === 'x' ? 'Opening X…' : 'Continue with X'}</button></div>
                </>
              )}
            </div>
          )}
          {verification === 'unavailable' && <div className="ops-message" role="status">{message}</div>}
          {verification === 'mismatch' && <><div className="ops-message danger" role="alert">{message}</div><button type="button" className="ops-button secondary account-retry-method" onClick={() => void retryWithAnotherMethod()}>Try another sign-in method</button></>}

          {verification === 'ready' && (
            <>
              <div className="account-sign-in-instructions"><strong>Use Email on your phone</strong><span>After adding and verifying an email here, choose Email on mobile and enter the same address. Coinbase will send a one-time code.</span></div>
              {message && <div className="ops-message" role="status">{message}</div>}
              <LinkAuth onLinkSuccess={onLinkSuccess}>
                {(state) => {
                  const emailMethod = state.authMethods.find((item) => item.method === 'email');
                  const linkedEmail = emailMethod?.isLinked ? emailMethod.userAlias : '';
                  const backendHasEmail = linkedMethods.some((item) => item.toLowerCase() === 'email');

                  return (
                    <div className="account-link-auth">
                      <div className="account-link-auth-heading">
                        <div><LinkAuthTitle /><span>{linkedEmail || (backendHasEmail ? 'Email is linked to this Coinbase account.' : 'Add an email method to this Coinbase account.')}</span></div>
                        {state.methodToLink && <LinkAuthFlowBackButton />}
                      </div>
                      <LinkAuthError />
                      <LinkAuthFlow />
                    </div>
                  );
                }}
              </LinkAuth>
            </>
          )}
        </section>
      </div>
    </ProductWorkspace>
  );
}
