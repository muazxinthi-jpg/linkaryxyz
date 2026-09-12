import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { CDPReactProvider, type Config } from '@coinbase/cdp-react';
import App from './AppV3';
import SuperadminApp from './SuperadminApp';
import SuperadminHostGate from './SuperadminHostGate';
import AuthInitializationBoundary from './AuthInitializationBoundary';
import AuthSessionContinuity from './AuthSessionContinuity';
import { installAuthFetchTimeoutGuard } from './authReliability';
import UiSafetyGuard from './UiSafetyGuard';
import OnboardingCompletionBoundary from './OnboardingCompletionBoundary';
import './styles.css';
import './creator-access.css';
import './simplified-shell.css';
import './operations.css';
import './network.css';
import './invites.css';
import './wallets.css';
import './dashboard-next.css';
import './profile-next.css';
import './growth.css';
import './campaign-ai.css';
import './partners.css';
import './ux-system.css';
import './partner-discovery-stabilization.css';
import './tracking-assignment.css';
import './onchain-attribution.css';
import './collaboration-inquiry.css';
import './partner-relationship-memory.css';
import './dashboard-polish.css';
import './beta-responsive-acceptance.css';
import './profile-beta-acceptance.css';
import './growth-beta-acceptance.css';
import './inbox-beta-acceptance.css';
import './invites-beta-acceptance.css';
import './wallets-beta-acceptance.css';
import './network-beta-acceptance.css';
import './admin-readiness-beta-acceptance.css';
import './admin-commercial.css';

const cdpConfig: Config = {
  projectId: 'ec85aa2b-208c-4ec9-a0f2-3da31a8e2218',
  ethereum: { createOnLogin: 'eoa' },
  appName: 'Linkary',
  appLogoUrl: 'https://linkary.xyz/assets/brand/linkary-icon-black.png',
  authMethods: ['email', 'oauth:google', 'oauth:x'],
};

const APP_RELEASE = '2026-09-09-private-network-v7-fluid-map';
const APP_SHELL_PATH = '/assets/linkary-app/index.html';
const RELEASE_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const isSuperadminHost = typeof window !== 'undefined' && window.location.hostname.toLowerCase() === 'sadmin.linkary.xyz';

if (typeof document !== 'undefined') document.documentElement.dataset.linkaryRelease = APP_RELEASE;
installAuthFetchTimeoutGuard();

function moduleBundlePath(root: Document): string | null {
  const script = root.querySelector<HTMLScriptElement>('script[type="module"][src]');
  if (!script) return null;
  try {
    return new URL(script.getAttribute('src') || '', window.location.origin).pathname;
  } catch {
    return null;
  }
}

function ReleaseFreshnessGuard() {
  useEffect(() => {
    let stopped = false;
    let reloading = false;

    async function verifyCurrentBundle() {
      if (stopped || reloading) return;
      try {
        const response = await fetch(`${APP_SHELL_PATH}?release-check=${encodeURIComponent(APP_RELEASE)}-${Date.now()}`, {
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'cache-control': 'no-cache' },
        });
        if (!response.ok) return;

        const html = await response.text();
        const latestDocument = new DOMParser().parseFromString(html, 'text/html');
        const latestBundle = moduleBundlePath(latestDocument);
        const runningBundle = moduleBundlePath(document);
        if (!latestBundle || !runningBundle || latestBundle === runningBundle) return;

        reloading = true;
        const next = new URL(window.location.href);
        next.searchParams.set('_linkary_release', APP_RELEASE);
        window.location.replace(next.toString());
      } catch {
        // Freshness checks must never block the active workspace during a transient network failure.
      }
    }

    void verifyCurrentBundle();
    const interval = window.setInterval(() => void verifyCurrentBundle(), RELEASE_CHECK_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void verifyCurrentBundle();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stopped = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return null;
}

function RootApp() {
  if (isSuperadminHost) {
    return (
      <>
        <ReleaseFreshnessGuard />
        <UiSafetyGuard />
        <SuperadminHostGate render={(me) => <SuperadminApp me={me} />} />
      </>
    );
  }

  return (
    <AuthInitializationBoundary>
      <AuthSessionContinuity>
        <ReleaseFreshnessGuard />
        <UiSafetyGuard />
        <OnboardingCompletionBoundary />
        <App />
      </AuthSessionContinuity>
    </AuthInitializationBoundary>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CDPReactProvider config={cdpConfig}>
      <BrowserRouter>
        <RootApp />
      </BrowserRouter>
    </CDPReactProvider>
  </StrictMode>,
);
