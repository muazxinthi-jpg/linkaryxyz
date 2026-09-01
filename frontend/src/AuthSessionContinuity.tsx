import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useGetAccessToken, useIsInitialized, useIsSignedIn, useSignOut } from '@coinbase/cdp-hooks';

type AccessContext = { inviteCode?: string; earnedGrant?: string };
type StoredAccessContext = AccessContext & { savedAt: number };
type RecoveryState = 'idle' | 'recovering' | 'error';
type RecoveryDetails = { message: string; reference: string };

const ACCESS_STORAGE = 'linkary.access.v1';
const DURABLE_ACCESS_STORAGE = 'linkary.pending-access.v2';
const SIGNUP_INTENT_STORAGE = 'linkary.signup.intent.v1';
const CLAIM_TOKEN_STORAGE = 'linkary.creator.claim.v1';
const ACCESS_TTL_MS = 24 * 60 * 60 * 1000;

function readJson<T>(value: string | null): T | null {
  if (!value) return null;
  try { return JSON.parse(value) as T; } catch { return null; }
}

function accessFromSearch(): AccessContext {
  const params = new URLSearchParams(window.location.search);
  const inviteCode = params.get('invite')?.trim();
  const earnedGrant = params.get('grant')?.trim();
  return {
    ...(inviteCode ? { inviteCode } : {}),
    ...(earnedGrant ? { earnedGrant } : {}),
  };
}

function hasAccessContext(value: AccessContext | null | undefined): value is AccessContext {
  return Boolean(value?.inviteCode || value?.earnedGrant);
}

function rememberAccessContext(): AccessContext {
  const incoming = accessFromSearch();
  if (hasAccessContext(incoming)) {
    sessionStorage.setItem(ACCESS_STORAGE, JSON.stringify(incoming));
    localStorage.setItem(DURABLE_ACCESS_STORAGE, JSON.stringify({ ...incoming, savedAt: Date.now() } satisfies StoredAccessContext));
    return incoming;
  }

  const session = readJson<AccessContext>(sessionStorage.getItem(ACCESS_STORAGE));
  if (hasAccessContext(session)) return session;

  const durable = readJson<StoredAccessContext>(localStorage.getItem(DURABLE_ACCESS_STORAGE));
  if (durable && Date.now() - durable.savedAt <= ACCESS_TTL_MS && hasAccessContext(durable)) {
    const restored: AccessContext = { inviteCode: durable.inviteCode, earnedGrant: durable.earnedGrant };
    sessionStorage.setItem(ACCESS_STORAGE, JSON.stringify(restored));
    return restored;
  }

  if (durable) localStorage.removeItem(DURABLE_ACCESS_STORAGE);
  return {};
}

function clearAccessContext() {
  sessionStorage.removeItem(ACCESS_STORAGE);
  localStorage.removeItem(DURABLE_ACCESS_STORAGE);
}

function isAuthenticationEntryPath() {
  return window.location.pathname === '/' || window.location.pathname === '/login' || window.location.pathname === '/signup';
}

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  return { ok: response.ok, status: response.status, data };
}

async function routeAuthenticatedUser() {
  const status = await jsonRequest<{ profiles?: unknown[] }>('/api/onboarding/status');
  if (!status.ok) throw new Error('account_state_unavailable');
  window.location.replace(status.data.profiles?.length ? '/dashboard' : '/onboarding');
}

function recoveryDetails(code?: string, status?: number): RecoveryDetails {
  if (code === 'invalid_invite' || code === 'invite_exhausted') {
    return {
      message: 'Your invitation could not be completed. Reopen the invitation you received, or use a different account.',
      reference: 'LK-AUTH-INVITE',
    };
  }
  if (code === 'invalid_access_grant') {
    return {
      message: 'Your creator access approval is no longer available. Return to the creator access flow and try again.',
      reference: 'LK-AUTH-GRANT',
    };
  }
  if (code === 'access_required') {
    return {
      message: 'You are signed in, but this account still needs a valid Linkary invitation or approved creator access.',
      reference: 'LK-AUTH-ACCESS',
    };
  }
  if (code === 'cdp_access_token_invalid' || code === 'access_token_unavailable') {
    return {
      message: 'Your secure sign-in session needs to be refreshed before Linkary can open your account.',
      reference: 'LK-AUTH-SESSION',
    };
  }
  if (code === 'cdp_validation_failed' || code === 'cdp_invalid_response') {
    return {
      message: 'Linkary could not verify the completed sign-in. Please continue once more.',
      reference: 'LK-AUTH-VERIFY',
    };
  }
  if (code === 'user_mapping_failed') {
    return {
      message: 'Your sign-in is complete, but Linkary could not load the account mapping.',
      reference: 'LK-AUTH-USER',
    };
  }
  if (code === 'account_state_unavailable') {
    return {
      message: 'Your account is signed in, but Linkary could not load the next setup step.',
      reference: 'LK-AUTH-STATE',
    };
  }
  if (code === 'creator_claim_unavailable') {
    return {
      message: 'Your sign-in is complete, but creator access could not be prepared.',
      reference: 'LK-AUTH-CREATOR',
    };
  }
  return {
    message: 'Your sign-in is complete, but Linkary could not finish opening your account. Try again and we will continue from where you stopped.',
    reference: status && status >= 500 ? 'LK-AUTH-SERVER' : 'LK-AUTH-UNEXPECTED',
  };
}

function RecoveryScreen({ details, onRetry, onDifferentAccount }: { details: RecoveryDetails | null; onRetry: () => void; onDifferentAccount: () => void }) {
  if (!details) {
    return (
      <main className="loading-screen" aria-live="polite">
        <a className="brand" href="https://linkary.xyz" aria-label="Linkary home">
          <img src="/assets/brand/linkary-icon-black.png" alt="" />
          <span>Linkary</span>
        </a>
        <div className="spinner" />
        <p>Finishing your Linkary sign-in</p>
      </main>
    );
  }

  return (
    <main className="access-denied-page">
      <div className="denied-card">
        <a className="brand" href="https://linkary.xyz" aria-label="Linkary home">
          <img src="/assets/brand/linkary-icon-black.png" alt="" />
          <span>Linkary</span>
        </a>
        <span className="section-label">SIGN-IN COMPLETE</span>
        <h1>Let’s finish setting up Linkary.</h1>
        <p>{details.message}</p>
        <p className="security-note clean-note">Reference: {details.reference}</p>
        <button className="button primary full" onClick={onRetry}>Continue</button>
        <button className="button secondary full" onClick={onDifferentAccount}>Use a different account</button>
      </div>
    </main>
  );
}

export default function AuthSessionContinuity({ children }: { children: ReactNode }) {
  const { isInitialized } = useIsInitialized();
  const { isSignedIn } = useIsSignedIn();
  const { getAccessToken } = useGetAccessToken();
  const { signOut } = useSignOut();
  const [state, setState] = useState<RecoveryState>('idle');
  const [details, setDetails] = useState<RecoveryDetails | null>(null);
  const [retry, setRetry] = useState(0);

  const accessContext = useMemo(() => rememberAccessContext(), []);
  const shouldRecover = Boolean(isInitialized && isSignedIn && isAuthenticationEntryPath());

  useEffect(() => {
    if (!shouldRecover) return;
    let cancelled = false;

    void (async () => {
      setState('recovering');
      setDetails(null);
      try {
        const current = await jsonRequest<{ authenticated?: boolean }>('/api/auth/me');
        if (cancelled) return;
        if (current.ok && current.data.authenticated) {
          clearAccessContext();
          sessionStorage.removeItem(SIGNUP_INTENT_STORAGE);
          await routeAuthenticatedUser();
          return;
        }

        const accessToken = await getAccessToken();
        if (!accessToken) throw new Error('access_token_unavailable');

        const context = hasAccessContext(accessContext) ? accessContext : rememberAccessContext();
        const bridged = await jsonRequest('/api/auth/cdp/session', {
          method: 'POST',
          body: JSON.stringify({
            accessToken,
            inviteCode: context.inviteCode,
            earnedGrant: context.earnedGrant,
          }),
        });
        if (cancelled) return;

        if (bridged.ok) {
          clearAccessContext();
          sessionStorage.removeItem(SIGNUP_INTENT_STORAGE);
          sessionStorage.removeItem(CLAIM_TOKEN_STORAGE);
          await routeAuthenticatedUser();
          return;
        }

        if (bridged.data.error === 'access_required' && sessionStorage.getItem(SIGNUP_INTENT_STORAGE) === 'creator_earn') {
          const claim = await jsonRequest<{ claimToken?: string }>('/api/access/creator/claim', {
            method: 'POST',
            body: JSON.stringify({ accessToken }),
          });
          if (!claim.ok || !claim.data.claimToken) throw new Error('creator_claim_unavailable');
          sessionStorage.setItem(CLAIM_TOKEN_STORAGE, claim.data.claimToken);
          window.location.replace('/creator-access');
          return;
        }

        setState('error');
        setDetails(recoveryDetails(bridged.data.error, bridged.status));
      } catch (error) {
        if (cancelled) return;
        const code = error instanceof Error ? error.message : undefined;
        setState('error');
        setDetails(recoveryDetails(code));
      }
    })();

    return () => { cancelled = true; };
  }, [shouldRecover, retry, getAccessToken, accessContext]);

  async function useDifferentAccount() {
    try {
      const csrf = document.cookie.split('; ').find((part) => part.startsWith('__Host-linkary_csrf='))?.split('=').slice(1).join('=');
      if (csrf) await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'x-csrf-token': decodeURIComponent(csrf) } });
    } catch {}
    try { await signOut(); } catch {}
    sessionStorage.removeItem(CLAIM_TOKEN_STORAGE);
    setState('idle');
    setDetails(null);
    window.location.replace('/signup');
  }

  if (shouldRecover || state === 'recovering' || state === 'error') {
    return <RecoveryScreen details={state === 'error' ? details : null} onRetry={() => setRetry((value) => value + 1)} onDifferentAccount={() => void useDifferentAccount()} />;
  }

  return <>{children}</>;
}
