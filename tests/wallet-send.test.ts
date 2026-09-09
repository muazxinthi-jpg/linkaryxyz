import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const wallet = readFileSync(new URL('../frontend/src/WalletExperience.tsx', import.meta.url), 'utf8');
const send = readFileSync(new URL('../frontend/src/WalletSendPanel.tsx', import.meta.url), 'utf8');
const recipients = readFileSync(new URL('../src/routes/walletRecipients.ts', import.meta.url), 'utf8');
const walletRoute = readFileSync(new URL('../src/routes/wallets.ts', import.meta.url), 'utf8');

test('Linkary wallet exposes a real Send flow without weakening private-key export', () => {
  assert.equal(wallet.includes("import WalletSendPanel from './WalletSendPanel'"), true);
  assert.equal(wallet.includes('<WalletSendPanel profileId={profile.id} expectedSenderAddress={primary.address} />'), true);
  assert.equal(wallet.includes('Secure wallet sending is not available yet'), false);
  assert.equal(wallet.includes('ExportWalletModal'), true);
  assert.equal(wallet.includes('Set up 2-step verification'), true);
});

test('Send flow supports Linkary-handle recipient selection and manual Base address fallback', () => {
  assert.equal(send.includes('useSendUsdc'), true);
  assert.equal(send.includes("network: 'base'"), true);
  assert.equal(send.includes('Search Linkary handle'), true);
  assert.equal(send.includes('Linkary member'), true);
  assert.equal(send.includes('Wallet address'), true);
  assert.equal(send.includes('recipientSearch='), true);
  assert.equal(send.includes('Confirm and send'), true);
  assert.equal(send.includes('Blockchain transfers cannot be reversed'), true);
  assert.equal(send.includes('expectedSenderAddress'), true, 'send must verify the active CDP sender matches the Linkary wallet');
});

test('recipient search resolves one canonical Linkary Base wallet for published Personal profiles', () => {
  assert.equal(recipients.includes("p.profile_type = 'creator'"), true);
  assert.equal(recipients.includes("p.visibility = 'published'"), true);
  assert.equal(recipients.includes('p.owner_user_id <> ?'), true, 'sender must not appear in recipient results');
  assert.equal(recipients.includes("wa.provider = 'coinbase_cdp'"), true);
  assert.equal(recipients.includes("wa.chain_family = 'evm'"), true);
  assert.equal(recipients.includes("kind: 'linkary'"), true);
  assert.equal(recipients.includes('profile_wallet_destinations'), false, 'generic saved EVM destinations must not be mislabeled as username Base receive wallets');
  assert.equal(recipients.includes('LIMIT 8'), true);
  assert.equal(walletRoute.includes('recipientSearch'), true);
  assert.equal(walletRoute.includes('searchWalletRecipients'), true);
});

test('wallet Send work remains isolated from the accepted Personal Private Network', () => {
  const invites = readFileSync(new URL('../frontend/src/InviteExperience.tsx', import.meta.url), 'utf8');
  assert.equal(invites.includes('>Invitations</button>'), true);
  assert.equal(invites.includes('>My network</button>'), true);
  assert.equal(invites.includes('>Network map</button>'), true);
  assert.equal(invites.includes('<PrivateNetworkMapV2Panel profileId={networkProfileId} />'), true);
});
