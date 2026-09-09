import { useEffect, useMemo, useState } from 'react';
import { useEvmAddress, useSendUsdc } from '@coinbase/cdp-hooks';
import './wallet-send.css';

type RecipientWallet = { kind: 'linkary' | 'saved_evm'; label: string; address: string };
type Recipient = { id: string; username: string; displayName: string; avatarUrl: string | null; wallets: RecipientWallet[] };
type SelectedRecipient = { username: string; displayName: string; wallet: RecipientWallet };
type Step = 'recipient' | 'amount' | 'review' | 'success';

const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const USDC_DECIMALS = 6;
const USDC_SCALE = BigInt(1_000_000);

function shortAddress(address: string): string {
  return address.length > 18 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;
}

function validUsdcAmount(value: string): boolean {
  if (!/^\d+(?:\.\d{0,6})?$/.test(value.trim())) return false;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0;
}

function usdcAmountToBaseUnits(value: string): bigint {
  const [whole = '0', fraction = ''] = value.trim().split('.');
  const paddedFraction = `${fraction}${'0'.repeat(USDC_DECIMALS)}`.slice(0, USDC_DECIMALS);
  return BigInt(whole) * USDC_SCALE + BigInt(paddedFraction || '0');
}

function transferReference(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const value = result as Record<string, unknown>;
  for (const key of ['transactionHash', 'userOpHash', 'transactionSignature']) {
    if (typeof value[key] === 'string' && value[key]) return value[key] as string;
  }
  return null;
}

export default function WalletSendPanel({ profileId, expectedSenderAddress }: { profileId: string; expectedSenderAddress: string }) {
  const { evmAddress } = useEvmAddress();
  const { sendUsdc } = useSendUsdc();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('recipient');
  const [mode, setMode] = useState<'linkary' | 'address'>('linkary');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Recipient[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [selected, setSelected] = useState<SelectedRecipient | null>(null);
  const [manualAddress, setManualAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [reference, setReference] = useState<string | null>(null);

  const activeSender = evmAddress || '';
  const senderMatches = Boolean(activeSender && expectedSenderAddress && activeSender.toLowerCase() === expectedSenderAddress.toLowerCase());
  const recipientAddress = selected?.wallet.address || manualAddress.trim();
  const recipientValid = EVM_ADDRESS.test(recipientAddress);
  const amountValid = validUsdcAmount(amount);
  const explorerUrl = reference?.startsWith('0x') && reference.length === 66 ? `https://basescan.org/tx/${reference}` : null;

  const title = useMemo(() => {
    if (step === 'recipient') return 'Choose recipient';
    if (step === 'amount') return 'Enter amount';
    if (step === 'review') return 'Review send';
    return 'USDC sent';
  }, [step]);

  function reset() {
    setStep('recipient');
    setMode('linkary');
    setQuery('');
    setResults([]);
    setSearchError('');
    setSelected(null);
    setManualAddress('');
    setAmount('');
    setSending(false);
    setSendError('');
    setReference(null);
  }

  function close() {
    setOpen(false);
    reset();
  }

  useEffect(() => {
    if (!open || mode !== 'linkary') return;
    const handle = query.trim().replace(/^@+/, '');
    if (handle.length < 2) {
      setResults([]);
      setSearchError('');
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setSearchError('');
      try {
        const response = await fetch(`/api/profile-wallets?profileId=${encodeURIComponent(profileId)}&recipientSearch=${encodeURIComponent(handle)}`, { credentials: 'same-origin' });
        const payload = await response.json().catch(() => ({})) as { recipients?: Recipient[]; message?: string };
        if (!response.ok) throw new Error(payload.message || 'Search failed');
        if (!cancelled) setResults(Array.isArray(payload.recipients) ? payload.recipients : []);
      } catch {
        if (!cancelled) {
          setResults([]);
          setSearchError('Could not search Linkary members right now. You can use a wallet address instead.');
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [open, mode, profileId, query]);

  function selectWallet(recipient: Recipient, wallet: RecipientWallet) {
    setSelected({ username: recipient.username, displayName: recipient.displayName, wallet });
    setManualAddress('');
    setStep('amount');
  }

  function continueManual() {
    setSelected(null);
    if (EVM_ADDRESS.test(manualAddress.trim())) setStep('amount');
  }

  async function confirmSend() {
    if (!evmAddress || !senderMatches || !recipientValid || !amountValid || sending) return;
    setSending(true);
    setSendError('');
    try {
      const result = await sendUsdc({
        from: evmAddress,
        to: recipientAddress as `0x${string}`,
        amount: usdcAmountToBaseUnits(amount),
        network: 'base',
      });
      setReference(transferReference(result));
      setStep('success');
    } catch (error) {
      const text = error instanceof Error ? error.message : '';
      setSendError(text ? `Send failed: ${text}` : 'Send failed. Check your balance and try again.');
    } finally {
      setSending(false);
    }
  }

  return <>
    <button className="wallet-send-trigger" type="button" onClick={() => { reset(); setOpen(true); }}>Send</button>
    {open && <div className="wallet-send-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section className="wallet-send-modal" role="dialog" aria-modal="true" aria-label={title}>
        <header className="wallet-send-header">
          <div><span>BASE WALLET</span><h3>{title}</h3></div>
          <button type="button" onClick={close} aria-label="Close send flow">×</button>
        </header>

        {!senderMatches && <div className="wallet-send-alert">Your active Coinbase CDP wallet does not match this Linkary wallet. Sign in again before sending.</div>}

        {step === 'recipient' && <div className="wallet-send-body">
          <div className="wallet-send-tabs" role="tablist">
            <button type="button" className={mode === 'linkary' ? 'active' : ''} onClick={() => { setMode('linkary'); setSelected(null); }}>Linkary member</button>
            <button type="button" className={mode === 'address' ? 'active' : ''} onClick={() => { setMode('address'); setSelected(null); }}>Wallet address</button>
          </div>

          {mode === 'linkary' ? <>
            <label className="wallet-send-field"><span>Search Linkary handle</span><div className="wallet-send-search"><b>@</b><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="muazxinthi" autoComplete="off" spellCheck={false}/>{searching && <i>Searching…</i>}</div></label>
            <p className="wallet-send-help">Search published Personal profiles. Select the member, then choose the wallet attached to that Linkary identity.</p>
            {searchError && <div className="wallet-send-alert">{searchError}</div>}
            <div className="wallet-send-results">
              {!searching && query.trim().replace(/^@+/, '').length >= 2 && results.length === 0 && !searchError && <div className="wallet-send-empty">No Linkary member with an eligible Base wallet was found.</div>}
              {results.map((recipient) => <article className="wallet-send-recipient" key={recipient.id}>
                <div className="wallet-send-person">
                  {recipient.avatarUrl ? <img src={recipient.avatarUrl} alt=""/> : <div className="wallet-send-avatar">{recipient.displayName.slice(0, 1).toUpperCase()}</div>}
                  <div><strong>{recipient.displayName}</strong><span>@{recipient.username}</span></div>
                </div>
                <div className="wallet-send-wallets">{recipient.wallets.map((wallet) => <button type="button" key={`${recipient.id}-${wallet.kind}-${wallet.address}`} onClick={() => selectWallet(recipient, wallet)}><span>{wallet.label}</span><code>{shortAddress(wallet.address)}</code><b>Select</b></button>)}</div>
              </article>)}
            </div>
          </> : <>
            <label className="wallet-send-field"><span>Base wallet address</span><input autoFocus value={manualAddress} onChange={(e) => setManualAddress(e.target.value.trim())} placeholder="0x..." autoComplete="off" spellCheck={false}/></label>
            <p className="wallet-send-help">Only send to an EVM address that can receive USDC on Base. Blockchain transfers cannot be reversed.</p>
            <button className="wallet-send-primary" type="button" disabled={!EVM_ADDRESS.test(manualAddress.trim()) || !senderMatches} onClick={continueManual}>Continue</button>
          </>}
        </div>}

        {step === 'amount' && <div className="wallet-send-body">
          <div className="wallet-send-selected">
            <span>Sending to</span>
            {selected ? <div><strong>{selected.displayName}</strong><em>@{selected.username}</em><small>{selected.wallet.label} · {shortAddress(selected.wallet.address)}</small></div> : <div><strong>External wallet</strong><small>{shortAddress(manualAddress)}</small></div>}
          </div>
          <label className="wallet-send-field"><span>Amount</span><div className="wallet-send-amount"><input autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00"/><b>USDC</b></div></label>
          <div className="wallet-send-network"><span>Network</span><strong>Base</strong></div>
          <div className="wallet-send-footer"><button type="button" className="wallet-send-secondary" onClick={() => setStep('recipient')}>Back</button><button type="button" className="wallet-send-primary" disabled={!amountValid || !senderMatches} onClick={() => setStep('review')}>Review send</button></div>
        </div>}

        {step === 'review' && <div className="wallet-send-body">
          <div className="wallet-send-review">
            <div><span>Asset</span><strong>{amount} USDC</strong></div>
            <div><span>Network</span><strong>Base</strong></div>
            <div><span>From</span><code>{shortAddress(expectedSenderAddress)}</code></div>
            <div><span>To</span><code>{shortAddress(recipientAddress)}</code></div>
            {selected && <div><span>Linkary recipient</span><strong>@{selected.username} · {selected.wallet.label}</strong></div>}
          </div>
          <div className="wallet-send-danger"><strong>Check the recipient and amount.</strong><span>Onchain transfers are irreversible. Linkary cannot recover USDC sent to the wrong wallet.</span></div>
          {sendError && <div className="wallet-send-alert">{sendError}</div>}
          <div className="wallet-send-footer"><button type="button" className="wallet-send-secondary" disabled={sending} onClick={() => setStep('amount')}>Back</button><button type="button" className="wallet-send-primary" disabled={sending || !senderMatches} onClick={() => void confirmSend()}>{sending ? 'Sending…' : 'Confirm and send'}</button></div>
        </div>}

        {step === 'success' && <div className="wallet-send-body wallet-send-success">
          <div className="wallet-send-success-mark">✓</div>
          <h4>Send submitted</h4>
          <p>{amount} USDC was submitted on Base to {selected ? `@${selected.username}` : shortAddress(recipientAddress)}.</p>
          {reference && <code>{reference}</code>}
          {explorerUrl && <a href={explorerUrl} target="_blank" rel="noreferrer">View on BaseScan ↗</a>}
          <button className="wallet-send-primary" type="button" onClick={close}>Done</button>
        </div>}
      </section>
    </div>}
  </>;
}
