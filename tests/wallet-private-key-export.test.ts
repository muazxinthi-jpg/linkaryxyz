import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const walletSource = readFileSync(new URL('../frontend/src/WalletExperience.tsx', import.meta.url), 'utf8');

test('Linkary wallet export uses the CDP isolated export UI with MFA and explicit consent', () => {
  assert.equal(walletSource.includes("ExportWalletModal, EnrollMfaModal"), true);
  assert.equal(walletSource.includes("useCurrentUser, useEvmAddress"), true);
  assert.equal(walletSource.includes('isEnrolledInMfa(currentUser)'), true);
  assert.equal(walletSource.includes('Multi-factor authentication must be enabled before Linkary allows wallet export.'), true);
  assert.equal(walletSource.includes('I understand that anyone with this private key can control my wallet'), true);
  assert.equal(walletSource.includes('disabled={!exportAcknowledged}'), true);
  assert.equal(walletSource.includes('<ExportWalletModal address={exportAddress}'), true);
  assert.equal(walletSource.includes('walletMatchesCdp'), true, 'the CDP account must match the Linkary embedded wallet before export');
});

test('advanced wallet security is closed by default and must be deliberately opened', () => {
  assert.equal(walletSource.includes('const [securityOpen,setSecurityOpen]=useState(false);'), true);
  assert.equal(walletSource.includes('!securityOpen?<button className="wallet-security-toggle"'), true);
  assert.equal(walletSource.includes('onClick={()=>setSecurityOpen(true)}'), true);
  assert.equal(walletSource.includes('setSecurityOpen(false);setExportOpen(false);setExportAcknowledged(false);'), true);
});

test('Linkary application code never receives or exports raw private-key material itself', () => {
  assert.equal(walletSource.includes('useExportEvmAccount'), false, 'deprecated JS-visible key export must not be used');
  assert.equal(walletSource.includes('exportEvmAccount'), false, 'raw JS-visible key export must not be used');
  assert.equal(walletSource.includes('/api/wallet/cdp/export'), false, 'user private keys must not pass through a Linkary backend endpoint');
  assert.equal(walletSource.includes('skipMfa={true}'), false, 'CDP built-in MFA protection must not be bypassed');
  assert.equal(walletSource.includes('privateKey:'), false, 'Linkary must not hold a raw private-key field');
});

test('wallet recovery remains isolated from the accepted Private Network implementation', () => {
  const invites = readFileSync(new URL('../frontend/src/InviteExperience.tsx', import.meta.url), 'utf8');
  assert.equal(invites.includes('>Invitations</button>'), true);
  assert.equal(invites.includes('>My network</button>'), true);
  assert.equal(invites.includes('>Network map</button>'), true);
  assert.equal(invites.includes('<PersonalNetworkPanel profileId={networkProfileId} view="network" />'), true);
  assert.equal(invites.includes('<PrivateNetworkMapV2Panel profileId={networkProfileId} />'), true);
});
