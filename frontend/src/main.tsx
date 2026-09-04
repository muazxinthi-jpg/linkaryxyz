import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { CDPReactProvider, type Config } from '@coinbase/cdp-react';
import App from './AppV3';
import AuthSessionContinuity from './AuthSessionContinuity';
import UiSafetyGuard from './UiSafetyGuard';
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
import './partners.css';
import './ux-system.css';
import './partner-discovery-stabilization.css';
import './tracking-assignment.css';
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

const cdpConfig: Config = {
  projectId: 'ec85aa2b-208c-4ec9-a0f2-3da31a8e2218',
  ethereum: { createOnLogin: 'eoa' },
  appName: 'Linkary',
  appLogoUrl: 'https://linkary.xyz/assets/brand/linkary-icon-black.png',
  authMethods: ['email', 'oauth:google', 'oauth:x', 'oauth:telegram'],
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CDPReactProvider config={cdpConfig}>
      <BrowserRouter>
        <AuthSessionContinuity>
          <UiSafetyGuard />
          <App />
        </AuthSessionContinuity>
      </BrowserRouter>
    </CDPReactProvider>
  </StrictMode>,
);
