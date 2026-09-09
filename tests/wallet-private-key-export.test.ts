import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const walletSource = readFileSync(new URL('../frontend/src/WalletExperience.tsx', import.meta.url), 'utf8');

test('Linkary wallet export uses the CDP isolated export UI with 2-step verification and explicit consent', () => {
  assert.equal(walletSource.includes("ExportWalletModal, EnrollMfaModal, VerifyMfaModal"), true);
  assert.equal(walletSource.includes("useCurrentUser, useEvmAddress"), true);
  assert.equal(walletSource.includes('isEnrolledInMfa(currentUser)'), true);
  assert.equal(walletSource.includes('2-step verification must be enabled before Linkary allows wallet export.'), true);
  assert.equal(walletSource.includes('Set up 2-step verification'), true);
  assert.equal(walletSource.includes("mfaReady?'2-STEP READY':'2-STEP REQUIRED'"), true);
  assert.equal(walletSource.includes('MFA REQUIRED'), false, 'the user-facing wallet UI should not expose an unexplained MFA acronym');
  assert.equal(walletSource.includes('Set up MFA'), false, 'the user-facing wallet UI should use plain language');
  assert.equal(walletSource.includes('I understand that anyone with this private key can control my wallet'), true);
  assert.equal(walletSource.includes('disabled={!exportAcknowledged}'), true);
  assert.equal(walletSource.includes('<ExportWalletModal address={exportAddress}'), true);
  assert.equal(walletSource.includes('walletMatchesCdp'), true, 'the CDP account must match the Linkary embedded wallet before export');
});

test('2-step verification setup is directly available before private-key export unlocks', () => {
  const setupGate = walletSource.indexOf("!mfaReady?<><div className=\"wallet-export-state\">2-step verification must be enabled before Linkary allows wallet export. Set it up here first, then the export option will unlock.</div>");
  const setupButton = walletSource.indexOf('>Set up 2-step verification</button>');
  const verifyGate = walletSource.indexOf(':!exportVerified?<><div className="wallet-export-state">For every private key export, confirm a fresh 2-step verification challenge first.</div>');
  const exportGate = walletSource.indexOf(':!exportOpen?<button className="wallet-export-start"');
  assert.notEqual(setupGate, -1, 'users without 2-step verification must see the setup state immediately after opening Advanced Security');
  assert.notEqual(setupButton, -1, 'the 2-step setup button must be visible before export');
  assert.notEqual(verifyGate, -1, 'an enrolled user must still pass a fresh verification gate before export');
  assert.notEqual(exportGate, -1, 'private-key export must remain gated until 2-step verification is ready');
  assert.equal(setupGate < setupButton && setupButton < verifyGate && verifyGate < exportGate, true, 'setup and fresh verification must both come before the export action');
});

test('every private-key export attempt requires a fresh 2-step verification challenge', () => {
  assert.equal(walletSource.includes('VerifyMfaModal'), true);
  assert.equal(walletSource.includes('>Verify 2-step to export</button>'), true);
  assert.equal(walletSource.includes('setExportVerified(true)'), true, 'successful verification should unlock only the current export attempt');
  assert.equal(walletSource.includes('setExportVerified(false);setSecurityOpen(false);'), true, 'successful export must reset the verification gate');
  assert.equal(walletSource.includes("Secure export session expired. Verify 2-step again to continue."), true, 'expired export sessions must require a new verification');
  assert.equal(walletSource.includes('skipMfa={true}'), false, 'the Coinbase export component must keep its built-in MFA protection enabled');
});

test('advanced wallet security is closed by default and must be deliberately opened', () => {
  assert.equal(walletSource.includes('const [securityOpen,setSecurityOpen]=useState(false);'), true);
  assert.equal(walletSource.includes('!securityOpen?<button className="wallet-security-toggle"'), true);
  assert.equal(walletSource.includes('onClick={()=>setSecurityOpen(true)}'), true);
  assert.equal(walletSource.includes('setSecurityOpen(false);setExportOpen(false);setExportAcknowledged(false);setExportVerified(false);'), true);
});

test('Linkary application code never receives or exports raw private-key material itself', () => {
  assert.equal(walletSource.includes('useExportEvmAccount'), false, 'deprecated JS-visible key export must not be used');
  assert.equal(walletSource.includes('exportEvmAccount'), false, 'raw JS-visible key export must not be used');
  assert.equal(walletSource.includes('/api/wallet/cdp/export'), false, 'user private keys must not pass through a Linkary backend endpoint');
  assert.equal(walletSource.includes('skipMfa={true}'), false, 'CDP built-in second-factor protection must not be bypassed');
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
