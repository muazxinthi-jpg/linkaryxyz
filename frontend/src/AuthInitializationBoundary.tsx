import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useIsInitialized, useSignOut } from '@coinbase/cdp-hooks';
import {
  AUTH_INIT_MAX_MS,
  AUTH_INIT_SLOW_MS,
  authenticatedRoute,
  authDiagnostic,
  initializationPhase,
  isAuthenticationEntryPath,
  replaceAuthRoute,
  type InitializationPhase,
} from './authReliability';

type SessionPreflightOutcome = 'anonymous' | 'redirected' | 'blocked' | 'failed' | 'skipped';

let sessionPreflight: { path: string; promise: Promise<SessionPreflightOutcome> } | null = null;

function now() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}

async function json<T>(path: string): Promise<{ ok: boolean; data: T }> {
  const response = await fetch(path, { credentials: 'same-origin' });
  const data = await response.json().catch(() => ({})) as T;
  return { ok: response.ok, data };
}

async function inspectExistingLinkarySession(): Promise<SessionPreflightOutcome> {
  if (!isAuthenticationEntryPath(window.location.pathname)) return 'skipped';
  try {
    const current = await json<{ authenticated?: boolean }>('/api/auth/me');
    if (!current.ok || !current.data.authenticated) return 'anonymous';

    const status = await json<{ profiles?: unknown[] }>('/api/onboarding/status');
    if (!status.ok) return 'failed';

    const target = authenticatedRoute(status.data.profiles?.length || 0);
    const redirect = replaceAuthRoute(target);
    if (redirect === 'blocked') return 'blocked';
    return redirect === 'navigated' ? 'redirected' : 'skipped';
  } catch {
    // Provider initialization remains a separate recovery path. A failed server
    // preflight must not hide the bounded CDP recovery UI.
    return 'failed';
  }
}

function inspectExistingLinkarySessionOnce(): Promise<SessionPreflightOutcome> {
  const path = window.location.pathname;
  if (sessionPreflight?.path === path) return sessionPreflight.promise;
  const promise = inspectExistingLinkarySession();
  sessionPreflight = { path, promise };
  void promise.finally(() => {
    window.setTimeout(() => {
      if (sessionPreflight?.promise === promise) sessionPreflight = null;
    }, 1_500);
  });
  return promise;
}

function Brand() {
  return (
    <a className="brand" href="https://linkary.xyz" aria-label="Linkary home">
      <img src="/assets/brand/linkary-icon-black.png" alt="" />
      <span>Linkary</span>
    </a>
  );
}

function LoadingState({ phase }: { phase: Exclude<InitializationPhase, 'ready' | 'timeout'> }) {
  return (
    <main className="loading-screen" aria-live="polite">
      <Brand />
      <div className="spinner" />
      <p>{phase === 'slow' ? 'Secure sign-in is taking longer than expected.' : 'Preparing Linkary'}</p>
    </main>
  );
}

function clearLocalCdpSession() {
  // CDP keeps its refresh/session state in origin storage. Remove only keys
  // owned by Coinbase/CDP; Linkary profile, invite, and onboarding state stays intact.
  for (const storageName of ['localStorage', 'sessionStorage'] as const) {
    try {
      const storage = window[storageName];
      for (const key of Object.keys(storage)) {
        if (/^(cdp_|coinbase_)/i.test(key)) storage.removeItem(key);
      }
    } catch {
      // Restricted browser contexts may deny storage access; still allow recovery to reload.
    }
  }
}

function RecoveryState({ onRetry, onReset }: { onRetry: () => void; onReset: () => void }) {
  return (
    <main className="access-denied-page">
      <div className="denied-card">
        <Brand />
        <span className="section-label">SIGN-IN RECOVERY</span>
        <h1>Linkary is taking too long to start.</h1>
        <p>Your secure sign-in could not be prepared within the expected time. Retry to restart Linkary, or reset only secure sign-in data if this keeps happening.</p>
        <p className="security-note clean-note">Reference: LK-AUTH-INIT</p>
        <button className="button primary full" onClick={onRetry}>Retry</button>
        <button className="button secondary full" onClick={onReset}>Reset secure sign-in</button>
      </div>
    </main>
  );
}

export default function AuthInitializationBoundary({ children }: { children: ReactNode }) {
  const { isInitialized } = useIsInitialized();
  const { signOut } = useSignOut();
  const attempt = 0;
  const [phase, setPhase] = useState<InitializationPhase>(() => initializationPhase(isInitialized, 0));
  const startedAt = useRef(now());
  const timeoutLogged = useRef(false);
  const successLogged = useRef(false);

  async function resetSecureSignIn() {
    try {
      await Promise.race([
        Promise.resolve().then(() => signOut()).catch(() => undefined),
        new Promise<void>((resolve) => window.setTimeout(resolve, 1_000)),
      ]);
    } catch {
      // Continue the local reset even if CDP sign-out is unavailable.
    }
    clearLocalCdpSession();
    window.location.reload();
  }

  useEffect(() => {
    if (!isInitialized && isAuthenticationEntryPath(window.location.pathname)) {
      void inspectExistingLinkarySessionOnce();
    }
  }, [isInitialized]);

  useEffect(() => {
    if (isInitialized) {
      setPhase('ready');
      if (!successLogged.current) {
        successLogged.current = true;
        authDiagnostic('cdp_initialization', 'success', startedAt.current, {
          attempt,
          recoveredAfterTimeout: timeoutLogged.current,
        });
      }
      return undefined;
    }

    timeoutLogged.current = false;
    successLogged.current = false;
    startedAt.current = now();
    setPhase('loading');

    const slowTimer = window.setTimeout(() => {
      setPhase((current) => current === 'loading' ? 'slow' : current);
      authDiagnostic('cdp_initialization', 'slow', startedAt.current, {
        thresholdMs: AUTH_INIT_SLOW_MS,
        attempt,
      });
    }, AUTH_INIT_SLOW_MS);

    const maxTimer = window.setTimeout(() => {
      setPhase('timeout');
      if (!timeoutLogged.current) {
        timeoutLogged.current = true;
        authDiagnostic('cdp_initialization', 'timeout', startedAt.current, {
          timeoutMs: AUTH_INIT_MAX_MS,
          reference: 'LK-AUTH-INIT',
          attempt,
        });
      }
    }, AUTH_INIT_MAX_MS);

    return () => {
      window.clearTimeout(slowTimer);
      window.clearTimeout(maxTimer);
    };
  }, [isInitialized]);

  if (isInitialized || phase === 'ready') return <>{children}</>;
  if (phase === 'timeout') {
    return <RecoveryState onRetry={() => window.location.reload()} onReset={() => void resetSecureSignIn()} />;
  }
  return <LoadingState phase={phase === 'slow' ? 'slow' : 'loading'} />;
}
