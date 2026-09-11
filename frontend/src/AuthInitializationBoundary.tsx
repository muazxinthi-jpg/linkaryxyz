import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useIsInitialized } from '@coinbase/cdp-hooks';
import {
  AUTH_INIT_MAX_MS,
  AUTH_INIT_SLOW_MS,
  authDiagnostic,
  initializationPhase,
  type InitializationPhase,
} from './authReliability';

function now() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
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

function RecoveryState({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="access-denied-page">
      <div className="denied-card">
        <Brand />
        <span className="section-label">SIGN-IN RECOVERY</span>
        <h1>Linkary is taking too long to start.</h1>
        <p>Your secure sign-in could not be prepared within the expected time. You can retry without losing this page, or reload the app.</p>
        <p className="security-note clean-note">Reference: LK-AUTH-INIT</p>
        <button className="button primary full" onClick={onRetry}>Retry</button>
        <button className="button secondary full" onClick={() => window.location.reload()}>Reload</button>
      </div>
    </main>
  );
}

export default function AuthInitializationBoundary({ children }: { children: ReactNode }) {
  const { isInitialized } = useIsInitialized();
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<InitializationPhase>(() => initializationPhase(isInitialized, 0));
  const startedAt = useRef(now());
  const terminalLogged = useRef(false);

  useEffect(() => {
    if (isInitialized) {
      setPhase('ready');
      if (!terminalLogged.current) {
        terminalLogged.current = true;
        authDiagnostic('cdp_initialization', 'success', startedAt.current, { attempt });
      }
      return undefined;
    }

    terminalLogged.current = false;
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
      if (!terminalLogged.current) {
        terminalLogged.current = true;
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
  }, [isInitialized, attempt]);

  if (isInitialized || phase === 'ready') return <>{children}</>;
  if (phase === 'timeout') {
    return <RecoveryState onRetry={() => setAttempt((value) => value + 1)} />;
  }
  return <LoadingState phase={phase === 'slow' ? 'slow' : 'loading'} />;
}
