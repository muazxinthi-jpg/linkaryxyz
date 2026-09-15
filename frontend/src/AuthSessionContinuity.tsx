import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useGetAccessToken, useIsInitialized, useIsSignedIn, useSignOut } from '@coinbase/cdp-hooks';
import {
  AUTH_RECOVERY_MAX_MS,
  AUTH_RECOVERY_SLOW_MS,
  AUTH_TOKEN_TIMEOUT_MS,
  AuthReliabilityError,
  authenticatedRoute,
  authReliabilityCode,
  authReliabilityReference,
  replaceAuthRoute,
  shouldRecoverSession,
  withPromiseTimeout,
} from './authReliability';

type AccessContext = { inviteCode?: string; earnedGrant?: string };
type StoredAccessContext = AccessContext & { savedAt: number };
type RecoveryState = 'idle' | 'recovering' | 'error';
type RecoveryDetails = { message: string; reference: string };
type JsonResult<T> = { ok: boolean; status: number; data: T & { error?: string } };
type RecoveryOutcome = { kind: 'redirected' } | { kind: 'error'; details: RecoveryDetails };

const ACCESS_STORAGE = 'linkary.access.v1';
const DURABLE_ACCESS_STORAGE = 'linkary.pending-access.v2';
const SIGNUP_INTENT_STORAGE = 'linkary.signup.intent.v1';
const CLAIM_TOKEN_STORAGE = 'linkary.creator.claim.v1';
const ACCESS_TTL_MS = 24 * 60 * 60 * 1000;
const RECOVERY_FLIGHT_GRACE_MS = 2_000;

let activeRecovery: { key: string; promise: Promise<RecoveryOutcome> } | null = null;

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

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<JsonResult<T>> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  return { ok: response.ok, status: response.status, data };
}

async function routeAuthenticatedUser(signal: AbortSignal) {
  const status = await jsonRequest<{ profiles?: unknown[] }>('/api/onboarding/status', { signal });
  if (!status.ok) throw new Error('account_state_unavailable');
  const target = authenticatedRoute(status.data.profiles?.length || 0);
  const result = replaceAuthRoute(target);
  if (result === 'blocked') {
    throw new AuthReliabilityError(
      'auth_redirect_loop',
      'LK-AUTH-ROUTE',
      'Linkary paused a repeated redirect. Reload the page or try a different account.',
    );
  }
}

function recoveryDetails(code?: string, status?: number, reference?: string): RecoveryDetails {
  if (code === 'auth_recovery_timeout') {
    return {
      message: 'Secure sign-in took longer than expected. Retry, reload, or use a different account.',
      reference: 'LK-AUTH-RECOVERY',
    };
  }
  if (code === 'auth_me_timeout') {
    return {
      message: 'Linkary could not load your secure account state in time. Please retry or reload.',
      reference: reference || 'LK-AUTH-ME',
    };
  }
  if (code === 'session_bridge_timeout') {
    return {
      message: 'Linkary could not finish opening your secure session in time. Please retry or reload.',
      reference: reference || 'LK-AUTH-BRIDGE',
    };
  }
  if (code === 'onboarding_status_timeout') {
    return {
      message: 'Your account is signed in, but Linkary could not load the next setup step in time.',
      reference: reference || 'LK-AUTH-ONBOARDING',
    };
  }
  if (code === 'token_retrieval_timeout') {
    return {
      message: 'Your secure sign-in could not be resumed in time. Please retry or use a different account.',
      reference: reference || 'LK-AUTH-TOKEN',
    };
  }
  if (code === 'auth_redirect_loop') {
    return {
      message: 'Linkary stopped a repeated navigation loop before it could keep reloading your account.',
      reference: reference || 'LK-AUTH-ROUTE',
    };
  }
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
    message: 'Linkary could not finish opening your account. Retry and we will continue from where you stopped.',
    reference: reference || (status && status >= 500 ? 'LK-AUTH-SERVER' : 'LK-AUTH-UNEXPECTED'),
  };
}

function RecoveryScreen({
  details,
  slow,
  onRetry,
  onReload,
  onDifferentAccount,
}: {
  details: RecoveryDetails | null;
  slow: boolean;
  onRetry: () => void;
  onReload: () => void;
  onDifferentAccount?: () => void;
}) {
  if (!details) {
    return (
      <main className="loading-screen" aria-live="polite">
        <a className="brand" href="https://linkary.xyz" aria-label="Linkary home">
          <img src="/assets/brand/linkary-icon-black.png" alt="" />
          <span>Linkary</span>
        </a>
        <div className="spinner" />
        <p>{slow ? 'Secure sign-in is taking longer than expected.' : 'Finishing your Linkary sign-in'}</p>
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
        <span className="section-label">SIGN-IN RECOVERY</span>
        <h1>Let’s get Linkary open.</h1>
        <p>{details.message}</p>
        <p className="security-note clean-note">Reference: {details.reference}</p>
        <button className="button primary full" onClick={onRetry}>Retry</button>
        <button className="button secondary full" onClick={onReload}>Reload</button>
        {onDifferentAccount && <button className="button secondary full" onClick={onDifferentAccount}>Use a different account</button>}
      </div>
    </main>
  );
}

async function performRecovery(
  accessContext: AccessContext,
  getAccessToken: () => Promise<string | null>,
): Promise<RecoveryOutcome> {
  const controller = new AbortController();
  let recoveryTimedOut = false;
  const maximum = window.setTimeout(() => {
    recoveryTimedOut = true;
    controller.abort();
  }, AUTH_RECOVERY_MAX_MS);

  try {
    const current = await jsonRequest<{ authenticated?: boolean }>('/api/auth/me', { signal: controller.signal });
    if (current.ok && current.data.authenticated) {
      clearAccessContext();
      sessionStorage.removeItem(SIGNUP_INTENT_STORAGE);
      await routeAuthenticatedUser(controller.signal);
      return { kind: 'redirected' };
    }

    const accessToken = await withPromiseTimeout(
      'token_retrieval',
      getAccessToken(),
      AUTH_TOKEN_TIMEOUT_MS,
      'token_retrieval_timeout',
      'LK-AUTH-TOKEN',
      'Secure sign-in took too long to resume. Please try again.',
    );
    if (controller.signal.aborted || recoveryTimedOut) {
      throw new AuthReliabilityError('auth_recovery_timeout', 'LK-AUTH-RECOVERY', 'Secure sign-in took too long to finish.');
    }
    if (!accessToken) throw new Error('access_token_unavailable');

    const context = hasAccessContext(accessContext) ? accessContext : rememberAccessContext();
    const bridged = await jsonRequest('/api/auth/cdp/session', {
      method: 'POST',
      signal: controller.signal,
      body: JSON.stringify({
        accessToken,
        inviteCode: context.inviteCode,
        earnedGrant: context.earnedGrant,
      }),
    });

    if (bridged.ok) {
      clearAccessContext();
      sessionStorage.removeItem(SIGNUP_INTENT_STORAGE);
      sessionStorage.removeItem(CLAIM_TOKEN_STORAGE);
      await routeAuthenticatedUser(controller.signal);
      return { kind: 'redirected' };
    }

    if (bridged.data.error === 'access_required') {
      const creatorEarnIntent = sessionStorage.getItem(SIGNUP_INTENT_STORAGE) === 'creator_earn';
      const claim = await jsonRequest<{ claimToken?: string }>('/api/access/creator/claim', {
        method: 'POST',
        signal: controller.signal,
        body: JSON.stringify({ accessToken, resumeOnly: !creatorEarnIntent }),
      });
      if (claim.ok && claim.data.claimToken) {
        sessionStorage.setItem(CLAIM_TOKEN_STORAGE, claim.data.claimToken);
        const route = replaceAuthRoute('/creator-access');
        if (route === 'blocked') {
          return { kind: 'error', details: recoveryDetails('auth_redirect_loop') };
        }
        return { kind: 'redirected' };
      }
      if (creatorEarnIntent || claim.status !== 404 || claim.data.error !== 'creator_claim_not_found') {
        throw new Error('creator_claim_unavailable');
      }
    }

    return { kind: 'error', details: recoveryDetails(bridged.data.error, bridged.status) };
  } catch (error) {
    if (recoveryTimedOut || controller.signal.aborted) {
      return { kind: 'error', details: recoveryDetails('auth_recovery_timeout') };
    }
    return {
      kind: 'error',
      details: recoveryDetails(authReliabilityCode(error), undefined, authReliabilityReference(error)),
    };
  } finally {
    window.clearTimeout(maximum);
  }
}

function recoverOnce(
  key: string,
  accessContext: AccessContext,
  getAccessToken: () => Promise<string | null>,
): Promise<RecoveryOutcome> {
  if (activeRecovery?.key === key) return activeRecovery.promise;
  const promise = performRecovery(accessContext, getAccessToken);
  activeRecovery = { key, promise };
  void promise.finally(() => {
    window.setTimeout(() => {
      if (activeRecovery?.promise === promise) activeRecovery = null;
    }, RECOVERY_FLIGHT_GRACE_MS);
  });
  return promise;
}

export default function AuthSessionContinuity({ children }: { children: ReactNode }) {
  const { isInitialized } = useIsInitialized();
  const { isSignedIn } = useIsSignedIn();
  const { getAccessToken } = useGetAccessToken();
  const { signOut } = useSignOut();
  const [state, setState] = useState<RecoveryState>('idle');
  const [details, setDetails] = useState<RecoveryDetails | null>(null);
  const [slow, setSlow] = useState(false);
  const [retry, setRetry] = useState(0);

  const accessContext = useMemo(() => rememberAccessContext(), []);
  const shouldRecover = shouldRecoverSession(isInitialized, isSignedIn, window.location.pathname);

  useEffect(() => {
    if (!shouldRecover) return undefined;
    let cancelled = false;
    setState('recovering');
    setDetails(null);
    setSlow(false);

    const slowTimer = window.setTimeout(() => {
      if (!cancelled) setSlow(true);
    }, AUTH_RECOVERY_SLOW_MS);

    const recoveryKey = `${window.location.pathname}:${retry}`;
    void recoverOnce(recoveryKey, accessContext, getAccessToken).then((outcome) => {
      if (cancelled || outcome.kind === 'redirected') return;
      setState('error');
      setDetails(outcome.details);
      setSlow(false);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(slowTimer);
    };
  }, [shouldRecover, retry, getAccessToken, accessContext]);

  async function useDifferentAccount() {
    try {
      const csrf = document.cookie.split('; ').find((part) => part.startsWith('__Host-linkary_csrf='))?.split('=').slice(1).join('=');
      if (csrf) await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'x-csrf-token': decodeURIComponent(csrf) } });
    } catch {}
    try { await signOut(); } catch {}
    clearAccessContext();
    sessionStorage.removeItem(CLAIM_TOKEN_STORAGE);
    sessionStorage.removeItem(SIGNUP_INTENT_STORAGE);
    activeRecovery = null;
    setState('idle');
    setDetails(null);
    if (window.location.pathname === '/signup') window.location.reload();
    else window.location.replace('/signup');
  }

  if (shouldRecover || state === 'recovering' || state === 'error') {
    return (
      <RecoveryScreen
        details={state === 'error' ? details : null}
        slow={slow}
        onRetry={() => setRetry((value) => value + 1)}
        onReload={() => window.location.reload()}
        onDifferentAccount={isInitialized ? () => void useDifferentAccount() : undefined}
      />
    );
  }

  return <>{children}</>;
}
