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
