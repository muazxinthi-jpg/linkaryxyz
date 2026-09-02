import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useGetAccessToken,
  useIsInitialized,
  useIsSignedIn,
  useSignInWithEmail,
  useSignInWithOAuth,
  useSignOut,
  useVerifyEmailOTP,
} from '@coinbase/cdp-hooks';
import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';

type AccountType = 'creator' | 'project';
type Phase = 'loading' | 'auth' | 'bridging' | 'creator-access' | 'onboarding' | 'app' | 'access-denied';
type ClaimStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'consumed' | 'revoked' | 'expired';

interface MeResponse {
  authenticated: boolean;
  user: { id: string; displayName: string; superadmin: boolean } | null;
}

interface ProfileSummary {
  id: string;
  profile_type: AccountType;
  username: string;
  display_name: string;
  bio: string;
  seo_title: string | null;
  seo_description: string | null;
  visibility: string;
  organization_id: string | null;
}

interface OnboardingStatus {
  user: { id: string; displayName: string; email: string | null };
  access: boolean;
  allowedAccountTypes: AccountType[];
  accessSources: string[];
  suggestedUsername: string | null;
  xIdentity: { id: string; current_handle: string | null; current_display_name: string | null } | null;
  profiles: ProfileSummary[];
}

interface AccessContext {
  inviteCode?: string;
  earnedGrant?: string;
}

interface InviteBalance {
  owner_type: 'profile' | 'organization';
  owner_id: string;
  available_credits: number;
  lifetime_granted: number;
  lifetime_used: number;
  quality_score: number;
  privileges_status: string;
}

interface CreatorClaim {
  id: string;
  claimCode: string;
  status: ClaimStatus;
  submittedPostUrl: string | null;
  rejectionReason: string | null;
  reviewMode: 'manual' | 'twitterapi_io';
  expiresAt: string;
  postText: string;
  composeUrl: string;
  accessReady: boolean;
  createdAt?: string;
  reviewedAt?: string | null;
}

class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

const ACCESS_STORAGE = 'linkary.access.v1';
const SIGNUP_INTENT_STORAGE = 'linkary.signup.intent.v1';
const CLAIM_TOKEN_STORAGE = 'linkary.creator.claim.v1';

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string } & T;
  if (!response.ok) throw new ApiError(response.status, payload.error || 'request_failed', payload.message || 'Request failed');
  return payload;
}

function publicError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  if (error instanceof ApiError && (
    error.code.startsWith('cdp_') ||
    error.code.startsWith('sign_in_') ||
    error.code === 'user_mapping_failed'
  )) return 'Sign-in could not be completed. Please try again.';
  return error.message || fallback;
}

function readCookie(name: string): string | null {
  const match = document.cookie.split('; ').find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function captureAccessContext(): AccessContext {
  const params = new URLSearchParams(window.location.search);
  const incoming: AccessContext = {};
  const inviteCode = params.get('invite')?.trim();
  const earnedGrant = params.get('grant')?.trim();
  if (inviteCode) incoming.inviteCode = inviteCode;
  if (earnedGrant) incoming.earnedGrant = earnedGrant;
  if (incoming.inviteCode || incoming.earnedGrant) {
    sessionStorage.setItem(ACCESS_STORAGE, JSON.stringify(incoming));
    return incoming;
  }
  try { return JSON.parse(sessionStorage.getItem(ACCESS_STORAGE) || '{}') as AccessContext; }
  catch { sessionStorage.removeItem(ACCESS_STORAGE); return {}; }
}

function signupIntent(): string | null {
  return sessionStorage.getItem(SIGNUP_INTENT_STORAGE);
}

function claimToken(): string | null {
  return sessionStorage.getItem(CLAIM_TOKEN_STORAGE);
}

function accessLabel(context: AccessContext): string | null {
  if (context.inviteCode) return 'Private invitation detected';
  if (context.earnedGrant) return 'Creator access approved';
  return null;
}

function setCleanPath(path: string) {
  if (window.location.pathname !== path || window.location.search) window.history.replaceState(null, '', path);
}

function Logo() {
  return (
    <a className="brand" href="https://linkary.xyz" aria-label="Linkary home">
      <img src="/assets/brand/linkary-icon-black.png" alt="" />
      <span>Linkary</span>
    </a>
  );
}

function LoadingScreen({ message = 'Preparing Linkary' }: { message?: string }) {
  return <main className="loading-screen"><Logo /><div className="spinner" /><p>{message}</p></main>;
}

function AuthMethods() {
  const { signInWithEmail } = useSignInWithEmail();
  const { verifyEmailOTP } = useVerifyEmailOTP();
  const { signInWithOAuth } = useSignInWithOAuth();
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [flowId, setFlowId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function startEmail(event: React.FormEvent) {
    event.preventDefault();
    setBusy('email'); setError('');
    try {
      const result = await signInWithEmail({ email: email.trim() });
      setFlowId(result.flowId); setOtp('');
    } catch (err) { setError(publicError(err, 'Unable to send the code.')); }
    finally { setBusy(null); }
  }

  async function verifyOtp(event: React.FormEvent) {
    event.preventDefault();
    if (!flowId) return;
    setBusy('otp'); setError('');
    try { await verifyEmailOTP({ flowId, otp }); }
    catch (err) { setError(publicError(err, 'The code could not be verified.')); setBusy(null); }
  }

  async function resend() {
    setBusy('resend'); setError('');
    try {
      const result = await signInWithEmail({ email: email.trim() });
      setFlowId(result.flowId); setOtp('');
    } catch (err) { setError(publicError(err, 'Unable to resend the code.')); }
    finally { setBusy(null); }
  }

  async function social(provider: 'google' | 'x' | 'telegram') {
    setBusy(provider); setError('');
    try { await signInWithOAuth(provider); }
    catch (err) { setError(publicError(err, 'Unable to continue sign-in.')); setBusy(null); }
  }

  if (flowId) {
    return (
      <form className="auth-form" onSubmit={verifyOtp}>
        <button type="button" className="back-link" onClick={() => { setFlowId(null); setError(''); }}>← Change email</button>
        <div className="otp-intro"><span className="section-label">CHECK YOUR EMAIL</span><h2>Enter your 6-digit code</h2><p>We sent a one-time code to <strong>{email}</strong>.</p></div>
        <label>Verification code<input className="otp-input" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" maxLength={6} required /></label>
        {error && <div className="form-error">{error}</div>}
        <button className="button primary full" disabled={busy !== null || otp.length !== 6}>{busy === 'otp' ? 'Verifying...' : 'Verify and continue'}</button>
        <button type="button" className="resend" disabled={busy !== null} onClick={resend}>{busy === 'resend' ? 'Sending...' : 'Resend code'}</button>
      </form>
    );
  }

  return (
    <div className="auth-methods">
      <form className="auth-form" onSubmit={startEmail}>
        <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" autoComplete="email" required /></label>
        <button className="button primary full" disabled={busy !== null}>{busy === 'email' ? 'Sending code...' : 'Continue with email'}</button>
      </form>
      <div className="or"><span>or continue with</span></div>
      <div className="social-stack">
        <button className="social-button" onClick={() => social('google')} disabled={busy !== null}><b>G</b><span>{busy === 'google' ? 'Connecting...' : 'Continue with Google'}</span></button>
        <button className="social-button" onClick={() => social('x')} disabled={busy !== null}><b>𝕏</b><span>{busy === 'x' ? 'Connecting...' : 'Continue with X'}</span></button>
        <button className="social-button" onClick={() => social('telegram')} disabled={busy !== null}><b>↗</b><span>{busy === 'telegram' ? 'Connecting...' : 'Continue with Telegram'}</span></button>
      </div>
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}

function SignupGateway({ onCreator }: { onCreator: () => void }) {
  const navigate = useNavigate();
  const [role, setRole] = useState<AccountType | null>('creator');
  const [invite, setInvite] = useState('');

  function useInvite(event: React.FormEvent) {
    event.preventDefault();
    if (!invite.trim()) return;
    sessionStorage.removeItem(SIGNUP_INTENT_STORAGE);
    navigate(`/signup?invite=${encodeURIComponent(invite.trim())}`, { replace: true });
    window.location.reload();
  }

  return (
    <div className="signup-gateway">
      <div className="role-grid-real compact">
        <button type="button" className={role === 'creator' ? 'selected' : ''} onClick={() => setRole('creator')}><span>◇</span><strong>Creator</strong><small>Earn access, build your public profile, and create verified campaign history.</small></button>
        <button type="button" className={role === 'project' ? 'selected' : ''} onClick={() => setRole('project')}><span>▦</span><strong>Company / Project</strong><small>Join with a Linkary invitation to run campaigns and track growth.</small></button>
      </div>
      {role === 'creator' ? (
        <div className="creator-entry-card">
          <span className="section-label">CREATOR EARN ACCESS</span>
          <h3>Build your Linkary creator identity.</h3>
          <p>Sign in first. Linkary will prepare an approved X post with your unique claim code. Publish it, return here, and submit the post for review.</p>
          <button className="button primary full" onClick={onCreator}>Continue to sign in</button>
        </div>
      ) : (
        <form className="invite-code-card" onSubmit={useInvite}>
          <span className="section-label">PRIVATE INVITATION</span>
          <h3>Enter your Linkary invite code.</h3>
          <label>Invite code<input value={invite} onChange={(event) => setInvite(event.target.value)} placeholder="Paste invite code" required /></label>
          <button className="button primary full">Continue with invitation</button>
        </form>
      )}
    </div>
  );
}

function AuthScreen({ deniedMessage }: { deniedMessage?: string }) {
  const navigate = useNavigate();
  const context = useMemo(captureAccessContext, []);
  const hasAccessContext = Boolean(context.inviteCode || context.earnedGrant);
  const pathMode = window.location.pathname === '/signup' ? 'signup' : window.location.pathname === '/login' ? 'login' : null;
  const params = new URLSearchParams(window.location.search);
  const [mode, setMode] = useState<'login' | 'signup'>(pathMode || (hasAccessContext || params.get('mode') === 'signup' ? 'signup' : 'login'));
  const [creatorAuth, setCreatorAuth] = useState(signupIntent() === 'creator_earn');

  function switchMode(next: 'login' | 'signup') {
    setMode(next);
    setCreatorAuth(false);
    if (next === 'login') sessionStorage.removeItem(SIGNUP_INTENT_STORAGE);
    navigate(next === 'login' ? '/login' : '/signup', { replace: true });
  }

  function beginCreator() {
    sessionStorage.setItem(SIGNUP_INTENT_STORAGE, 'creator_earn');
    setCreatorAuth(true);
  }

  return (
    <main className="auth-layout">
      <aside className="auth-story">
        <Logo />
        <a className="back-home" href="https://linkary.xyz">← Back to linkary.xyz</a>
        <div className="story-copy"><span className="section-label">GROWTH INTELLIGENCE NETWORK</span><h1>One identity.<br /><em>A history that compounds.</em></h1><p>Connect campaigns, creator proof, first-party attribution, and your Linkary public profile in one account.</p></div>
        <div className="proof-card"><span>PRIVATE ACCESS</span><strong>Invite-only network</strong><p>Existing members can log in anytime. New profiles require a valid invitation or approved creator access.</p></div>
      </aside>
      <section className="auth-main">
        <div className="mobile-brand"><Logo /></div>
        <div className="auth-card-real wide-auth-card">
          <nav className="auth-tabs" aria-label="Authentication mode"><button className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>Log in</button><button className={mode === 'signup' ? 'active' : ''} onClick={() => switchMode('signup')}>Create account</button></nav>
          <div className="auth-heading">
            {accessLabel(context) && <div className="access-chip">✓ {accessLabel(context)}</div>}
            <span className="section-label">{mode === 'login' ? 'WELCOME BACK' : 'JOIN THE NETWORK'}</span>
            <h2>{mode === 'login' ? 'Log in to Linkary' : 'Create your Linkary account'}</h2>
            <p>{mode === 'login' ? 'Continue to your profile, campaigns, and network.' : 'Choose how you are joining. This creates your first workspace, not a permanent account type.'}</p>
          </div>
          {deniedMessage && <div className="notice danger"><strong>Access required</strong><span>{deniedMessage}</span></div>}
          {mode === 'login' ? <AuthMethods /> : hasAccessContext ? <AuthMethods /> : creatorAuth ? (
            <div><button className="back-link creator-back" onClick={() => { setCreatorAuth(false); sessionStorage.removeItem(SIGNUP_INTENT_STORAGE); }}>← Change account type</button><div className="notice"><strong>Creator Earn Access</strong><span>Sign in to receive your unique Linkary creator claim.</span></div><AuthMethods /></div>
          ) : <SignupGateway onCreator={beginCreator} />}
          <p className="security-note clean-note">Secure sign-in. Your wallet and account stay under your control.</p>
        </div>
      </section>
    </main>
  );
}

function CreatorAccessScreen({ claim, onClaim, onContinue, onSignOut }: { claim: CreatorClaim; onClaim: (claim: CreatorClaim) => void; onContinue: () => Promise<void>; onSignOut: () => Promise<void> }) {
  const [postUrl, setPostUrl] = useState(claim.submittedPostUrl || '');
  const [busy, setBusy] = useState(false);
  const [copyState, setCopyState] = useState('Copy post');
  const [error, setError] = useState('');

  async function refresh() {
    const token = claimToken();
    if (!token) return;
    try {
      const result = await apiJson<{ claim: CreatorClaim }>('/api/access/creator/claim', { headers: { 'x-linkary-claim-token': token } });
      onClaim(result.claim);
    } catch (err) { setError(publicError(err, 'Unable to refresh your claim.')); }
  }

  useEffect(() => {
    if (claim.status !== 'submitted') return;
    const timer = window.setInterval(() => { void refresh(); }, 15000);
    return () => window.clearInterval(timer);
  }, [claim.status]);

  async function copyPost() {
    try { await navigator.clipboard.writeText(claim.postText); setCopyState('Copied'); window.setTimeout(() => setCopyState('Copy post'), 1500); }
    catch { setCopyState('Select and copy'); }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const token = claimToken();
    if (!token) return;
    setBusy(true); setError('');
    try {
      const result = await apiJson<{ claim: CreatorClaim }>('/api/access/creator/claim/submit', {
        method: 'POST',
        headers: { 'x-linkary-claim-token': token },
        body: JSON.stringify({ postUrl }),
      });
      onClaim(result.claim);
    } catch (err) { setError(publicError(err, 'Unable to submit your post.')); }
    finally { setBusy(false); }
  }

  return (
    <main className="claim-page">
      <header className="simple-header claim-header"><Logo /><button className="text-button" onClick={onSignOut}>Sign out</button></header>
      <section className="claim-shell">
        <div className="claim-intro"><span className="section-label">CREATOR EARN ACCESS</span><h1>Publish your Linkary claim.</h1><p>Your claim is unique to this sign-in. Keep the approved copy unchanged so the reviewer can verify it quickly.</p></div>
        <div className="claim-grid">
          <article className="claim-copy-card">
            <div className="claim-card-top"><span>APPROVED POST COPY</span><strong>{claim.claimCode}</strong></div>
            <pre>{claim.postText}</pre>
            <div className="claim-actions"><button className="button secondary" onClick={copyPost}>{copyState}</button><a className="button primary" href={claim.composeUrl} target="_blank" rel="noreferrer">Post on X ↗</a></div>
          </article>
          <article className="claim-status-card">
            <span className={`claim-status status-${claim.status}`}>{claim.status === 'draft' ? 'Ready to post' : claim.status === 'submitted' ? 'Under review' : claim.status === 'approved' ? 'Approved' : claim.status === 'rejected' ? 'Needs an update' : claim.status}</span>
            {claim.status === 'approved' ? (
              <><h2>Your creator access is approved.</h2><p>Continue to claim your Linkary username and create your creator profile.</p><button className="button primary full" onClick={() => void onContinue()}>Continue to Linkary</button></>
            ) : claim.status === 'submitted' ? (
              <><h2>Your post is in the review queue.</h2><p>A Linkary reviewer will approve or reject the submission. This page checks for updates automatically.</p>{claim.submittedPostUrl && <a className="submitted-link" href={claim.submittedPostUrl} target="_blank" rel="noreferrer">Open submitted post ↗</a>}<button className="button secondary full" onClick={() => void refresh()}>Check review status</button></>
            ) : (
              <form onSubmit={submit}>
                <h2>{claim.status === 'rejected' ? 'Update your post submission.' : 'Return after publishing.'}</h2>
                {claim.status === 'rejected' && <div className="notice danger"><strong>Review note</strong><span>{claim.rejectionReason || 'The post could not be approved.'}</span></div>}
                <label>X post URL<input type="url" value={postUrl} onChange={(event) => setPostUrl(event.target.value)} placeholder="https://x.com/username/status/..." required /></label>
                <button className="button primary full" disabled={busy}>{busy ? 'Submitting...' : 'Submit post for review'}</button>
              </form>
            )}
            {error && <div className="form-error">{error}</div>}
            <small>Claims expire on {new Date(claim.expiresAt).toLocaleDateString()}.</small>
          </article>
        </div>
      </section>
    </main>
  );
}

function OnboardingScreen({ status, onComplete }: { status: OnboardingStatus; onComplete: (status: OnboardingStatus) => void }) {
  const navigate = useNavigate();
  const allowed = status.allowedAccountTypes;
  const [accountType, setAccountType] = useState<AccountType>(allowed[0] || 'creator');
  const [username, setUsername] = useState(status.suggestedUsername || '');
  const [displayName, setDisplayName] = useState(status.user.displayName || '');
  const [organizationName, setOrganizationName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { setCleanPath('/onboarding'); }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const csrf = readCookie('__Host-linkary_csrf');
      if (!csrf) throw new Error('Your secure session expired. Please sign in again.');
      await apiJson('/api/onboarding/complete', {
        method: 'POST', headers: { 'x-csrf-token': csrf },
        body: JSON.stringify({ accountType, username, displayName: accountType === 'creator' ? displayName : undefined, organizationName: accountType === 'project' ? organizationName : undefined }),
      });
      const next = await apiJson<OnboardingStatus>('/api/onboarding/status');
      onComplete(next); navigate('/dashboard', { replace: true });
    } catch (err) { setError(publicError(err, 'Unable to finish onboarding.')); setBusy(false); }
  }

  return (
    <main className="onboarding-page">
      <header className="simple-header"><Logo /><span>Account setup</span></header>
      <section className="onboarding-card">
        <div className="step-count">01 / FIRST WORKSPACE</div><h1>How are you joining Linkary?</h1><p>This creates your first workspace. It does not permanently lock your human account to one role.</p>
        <form onSubmit={submit}>
          <div className="role-grid-real">
            {allowed.includes('creator') && <button type="button" className={accountType === 'creator' ? 'selected' : ''} onClick={() => setAccountType('creator')}><span>◇</span><strong>Creator</strong><small>Build your public profile, campaign proof, and referral network.</small></button>}
            {allowed.includes('project') && <button type="button" className={accountType === 'project' ? 'selected' : ''} onClick={() => setAccountType('project')}><span>▦</span><strong>Company / Project</strong><small>Run campaigns, track partners, creators, communities, and outcomes.</small></button>}
          </div>
          {status.xIdentity?.current_handle && <div className="identity-note"><span>𝕏</span><div><strong>X identity connected</strong><small>@{status.xIdentity.current_handle}. Your history remains connected even if the handle changes.</small></div></div>}
          <div className="field-grid">
            <label>Linkary username<div className="username-field"><span>linkary.xyz/</span><input value={username} onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} placeholder="username" minLength={3} maxLength={30} required /></div><small>3 to 30 characters. Letters, numbers, and underscores.</small></label>
            {accountType === 'creator' ? <label>Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your name" required /></label> : <label>Company / Project name<input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} placeholder="Project name" minLength={2} maxLength={100} required /></label>}
          </div>
          {error && <div className="form-error">{error}</div>}
          <button className="button primary full large" disabled={busy}>{busy ? 'Creating workspace...' : 'Create my Linkary workspace'}</button>
          <p className="allocation-note">Creator accounts start with 10 network invites. Company / Project accounts start with 50.</p>
        </form>
      </section>
    </main>
  );
}

function Dashboard({ status, profile }: { status: OnboardingStatus; profile: ProfileSummary }) {
  const [balances, setBalances] = useState<InviteBalance[]>([]);
  useEffect(() => { apiJson<{ balances: InviteBalance[] }>('/api/invites/balances').then((result) => setBalances(result.balances)).catch(() => undefined); }, []);
  const balance = balances.find((row) => profile.profile_type === 'creator' ? row.owner_type === 'profile' && row.owner_id === profile.id : row.owner_type === 'organization' && row.owner_id === profile.organization_id);
  return (
    <div className="page-stack">
      <div className="dashboard-hero"><div><span className="section-label">COMMAND CENTER</span><h1>Welcome, {status.user.displayName || profile.display_name}.</h1><p>Your Linkary workspace is active. Build your public identity and start creating attributable growth records.</p></div><a className="button secondary" href={`https://linkary.xyz/${profile.username}`} target="_blank" rel="noreferrer">Public URL ↗</a></div>
      <div className="real-metrics"><article><span>PROFILE</span><strong>{profile.visibility === 'published' ? 'Published' : 'Private draft'}</strong><small>linkary.xyz/{profile.username}</small></article><article><span>NETWORK INVITES</span><strong>{balance ? balance.available_credits : '...'}</strong><small>{balance ? `${balance.lifetime_used} used` : 'Loading balance'}</small></article><article><span>WORKSPACE</span><strong>{profile.profile_type === 'creator' ? 'Creator' : 'Project'}</strong><small>{status.xIdentity ? 'X identity connected' : 'Identity setup can continue later'}</small></article></div>
      <section className="command-card"><header><div><span className="section-label">NEXT ACTIONS</span><h2>Build the first reliable growth record</h2></div></header><div className="action-list"><NavLink to="/profile"><b>01</b><span><strong>Complete your public profile</strong><small>Add the identity and links people should trust.</small></span><em>→</em></NavLink><NavLink to="/invites"><b>02</b><span><strong>Invite the right people</strong><small>Use Linkary invitations and keep referral attribution in-house.</small></span><em>→</em></NavLink><NavLink to="/tracking"><b>03</b><span><strong>Prepare first-party tracking</strong><small>Campaign and destination tracking will build on the same account identity.</small></span><em>→</em></NavLink></div></section>
    </div>
  );
}

const pageCopy: Record<string, { eyebrow: string; title: string; body: string }> = {
  campaigns: { eyebrow: 'CAMPAIGNS', title: 'Campaign operations', body: 'Manual campaign tracking and Linkary first-party attribution will live here. No fake metrics are shown before real campaign data exists.' },
  creators: { eyebrow: 'NETWORK', title: 'Creator discovery', body: 'Your creator network will connect identity, campaign history, contact access, and performance proof.' },
  communities: { eyebrow: 'COMMUNITIES', title: 'Community intelligence', body: 'Promotional communities and their POCs remain separate reputation entities, with campaign evidence attached to each.' },
  tracking: { eyebrow: 'FIRST-PARTY ATTRIBUTION', title: 'Tracking', body: 'Linkary tracking URLs, clicks, destination joins, and later Telegram verified outcomes will be managed here.' },
  profile: { eyebrow: 'PUBLIC IDENTITY', title: 'Profile editor', body: 'Your public Linkary page will evolve into a media kit, campaign proof page, reputation layer, and Work With Me surface.' },
  invites: { eyebrow: 'PRIVATE NETWORK', title: 'Invites', body: 'Invite credits, generated links, clicks, registrations, and referral quality will be managed here.' },
  settings: { eyebrow: 'ACCOUNT', title: 'Settings', body: 'Account security, organizations, connected identities, wallet details, and workspace configuration will live here.' },
};

function FoundationPage({ name }: { name: keyof typeof pageCopy }) {
  if (name === 'campaigns') return <CampaignPage />;
  if (name === 'tracking') return <TrackingPage />;
  const copy = pageCopy[name];
  return <div className="foundation-page"><span className="section-label">{copy.eyebrow}</span><h1>{copy.title}</h1><p>{copy.body}</p><div className="foundation-box"><strong>Foundation ready</strong><span>This route is part of the real authenticated Linkary shell. The feature workflow is intentionally next, not simulated.</span></div></div>;
}

function CampaignPage() {
  type Org = { id: string; name: string }; type Campaign = { id: string; name: string; objective: string; budget_usd: number | null; status: string; created_at: string };
  const [organizations, setOrganizations] = useState<Org[]>([]); const [organizationId, setOrganizationId] = useState(''); const [campaigns, setCampaigns] = useState<Campaign[]>([]); const [form, setForm] = useState({ name: '', objective: '', budgetUsd: '' }); const [message, setMessage] = useState('');
  useEffect(() => { apiJson<{ organizations: Org[] }>('/api/organizations').then((r) => { setOrganizations(r.organizations); setOrganizationId(r.organizations[0]?.id || ''); }).catch(() => setMessage('Create a Project workspace to start campaigns.')); }, []);
  useEffect(() => { if (organizationId) apiJson<{ campaigns: Campaign[] }>(`/api/campaigns?organizationId=${encodeURIComponent(organizationId)}`).then((r) => setCampaigns(r.campaigns)).catch(() => setMessage('Run the production D1 migration to activate campaigns.')); }, [organizationId]);
  async function create(event: React.FormEvent) { event.preventDefault(); const csrf = readCookie('__Host-linkary_csrf'); if (!csrf || !organizationId) return; try { await apiJson('/api/campaigns', { method: 'POST', headers: { 'x-csrf-token': csrf }, body: JSON.stringify({ organizationId, name: form.name, objective: form.objective, budgetUsd: form.budgetUsd ? Number(form.budgetUsd) : undefined }) }); setForm({ name: '', objective: '', budgetUsd: '' }); const r = await apiJson<{ campaigns: Campaign[] }>(`/api/campaigns?organizationId=${encodeURIComponent(organizationId)}`); setCampaigns(r.campaigns); } catch (err) { setMessage(publicError(err, 'Unable to create campaign.')); } }
  return <div className="feature-page"><span className="section-label">CAMPAIGNS</span><h1>Campaign operations</h1><p>Plan activities, assign destinations, and connect marketing spend to reliable outcomes.</p><form className="feature-form" onSubmit={create}><label>Project workspace<select value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} required><option value="">Select a Project</option>{organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label><label>Campaign name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Summer Growth" required /></label><label>Objective<textarea value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })} placeholder="What outcome should this campaign drive?" /></label><label>Budget (USD)<input type="number" min="0" step="0.01" value={form.budgetUsd} onChange={(e) => setForm({ ...form, budgetUsd: e.target.value })} placeholder="20000" /></label><button className="button primary" disabled={!organizationId || !form.name.trim()}>Create campaign</button>{message && <div className="form-error">{message}</div>}</form><section className="feature-form"><h2>Campaigns</h2>{!campaigns.length ? <p>No campaigns in this workspace yet.</p> : campaigns.map((campaign) => <div className="link-row" key={campaign.id}><span><strong>{campaign.name}</strong><small>{campaign.objective || 'No objective set'} · {campaign.status}</small></span><b>{campaign.budget_usd === null ? '—' : `$${campaign.budget_usd.toLocaleString()}`}</b></div>)}</section></div>;
}

function TrackingPage() {
  type Org = { id: string; name: string }; type Campaign = { id: string; name: string }; type Activity = { id: string; title: string; activity_type: string; destination_url: string | null; status: string };
  const [organizations, setOrganizations] = useState<Org[]>([]); const [organizationId, setOrganizationId] = useState(''); const [campaigns, setCampaigns] = useState<Campaign[]>([]); const [campaignId, setCampaignId] = useState(''); const [activities, setActivities] = useState<Activity[]>([]); const [form, setForm] = useState({ title: '', type: 'creator_content', destinationUrl: '', plannedCostUsd: '' }); const [message, setMessage] = useState(''); const [link, setLink] = useState(''); const [outcome, setOutcome] = useState<{ conversions: number; value_usd: number; tracked_clicks: number } | null>(null); const [trackedLinks, setTrackedLinks] = useState<Array<{ id: string; code: string; destination_url: string }>>([]); const [conversion, setConversion] = useState({ trackedLinkId: '', eventType: 'registration', eventKey: '', valueUsd: '' });
  useEffect(() => { apiJson<{ organizations: Org[] }>('/api/organizations').then((r) => { setOrganizations(r.organizations); setOrganizationId(r.organizations[0]?.id || ''); }).catch(() => undefined); }, []);
  useEffect(() => { if (organizationId) apiJson<{ campaigns: Campaign[] }>(`/api/campaigns?organizationId=${encodeURIComponent(organizationId)}`).then((r) => { setCampaigns(r.campaigns); setCampaignId(r.campaigns[0]?.id || ''); }).catch(() => setMessage('Run the manual D1 migrations to activate tracking.')); }, [organizationId]);
  const loadActivities = () => { if (campaignId) apiJson<{ activities: Activity[] }>(`/api/campaign-activities?campaignId=${encodeURIComponent(campaignId)}`).then((r) => setActivities(r.activities)).catch(() => undefined); };
  useEffect(() => { loadActivities(); }, [campaignId]);
  useEffect(() => { if (campaignId) apiJson<{ summary: { conversions: number; value_usd: number; tracked_clicks: number } }>(`/api/campaign-outcomes?campaignId=${encodeURIComponent(campaignId)}`).then((r) => setOutcome(r.summary)).catch(() => setOutcome(null)); }, [campaignId]);
  useEffect(() => { if (campaignId) apiJson<{ links: Array<{ id: string; code: string; destination_url: string }> }>(`/api/tracked-links?campaignId=${encodeURIComponent(campaignId)}`).then((r) => { setTrackedLinks(r.links); setConversion((current) => ({ ...current, trackedLinkId: current.trackedLinkId || r.links[0]?.id || '' })); }).catch(() => setTrackedLinks([])); }, [campaignId]);
  async function create(event: React.FormEvent) { event.preventDefault(); const csrf = readCookie('__Host-linkary_csrf'); if (!csrf || !campaignId) return; try { await apiJson('/api/campaign-activities', { method: 'POST', headers: { 'x-csrf-token': csrf }, body: JSON.stringify({ campaignId, title: form.title, activityType: form.type, destinationUrl: form.destinationUrl, plannedCostUsd: form.plannedCostUsd ? Number(form.plannedCostUsd) : undefined }) }); setForm({ title: '', type: 'creator_content', destinationUrl: '', plannedCostUsd: '' }); loadActivities(); } catch (err) { setMessage(publicError(err, 'Unable to create activity.')); } }
  async function track(activityId: string) { const csrf = readCookie('__Host-linkary_csrf'); if (!csrf) return; try { const r = await apiJson<{ url: string }>('/api/tracked-links', { method: 'POST', headers: { 'x-csrf-token': csrf }, body: JSON.stringify({ activityId }) }); setLink(r.url); } catch (err) { setMessage(publicError(err, 'Add a destination URL before generating a tracking link.')); } }
  async function recordConversion(event: React.FormEvent) { event.preventDefault(); const csrf = readCookie('__Host-linkary_csrf'); if (!csrf || !conversion.trackedLinkId) return; try { await apiJson('/api/conversions', { method: 'POST', headers: { 'x-csrf-token': csrf }, body: JSON.stringify({ ...conversion, valueUsd: conversion.valueUsd ? Number(conversion.valueUsd) : undefined }) }); setConversion({ trackedLinkId: conversion.trackedLinkId, eventType: 'registration', eventKey: '', valueUsd: '' }); const r = await apiJson<{ summary: { conversions: number; value_usd: number; tracked_clicks: number } }>(`/api/campaign-outcomes?campaignId=${encodeURIComponent(campaignId)}`); setOutcome(r.summary); } catch (err) { setMessage(publicError(err, 'Unable to record this conversion.')); } }
  return <div className="feature-page"><span className="section-label">FIRST-PARTY ATTRIBUTION</span><h1>Activities & tracking</h1><p>Create the work that drives a campaign, then give it a Linkary redirect URL to measure clicks and downstream outcomes.</p><form className="feature-form" onSubmit={create}><label>Project<select value={organizationId} onChange={(e) => setOrganizationId(e.target.value)}>{organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label><label>Campaign<select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></label><label>Activity<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Creator post, community placement, or video" required /></label><label>Type<select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option value="creator_content">Creator content</option><option value="community_placement">Community placement</option><option value="website">Website</option><option value="video">Video</option><option value="other">Other</option></select></label><label>Destination URL<input type="url" value={form.destinationUrl} onChange={(e) => setForm({ ...form, destinationUrl: e.target.value })} placeholder="https://..." required /></label><button className="button primary" disabled={!campaignId || !form.title || !form.destinationUrl}>Create activity</button>{message && <div className="form-error">{message}</div>}</form>{outcome && <section className="real-metrics"><article><span>TRACKED CLICKS</span><strong>{outcome.tracked_clicks}</strong><small>Linkary tracked</small></article><article><span>CONVERSIONS</span><strong>{outcome.conversions}</strong><small>Manual evidence</small></article><article><span>ATTRIBUTED VALUE</span><strong>${outcome.value_usd.toLocaleString()}</strong><small>Recorded outcomes</small></article></section>}<form className="feature-form" onSubmit={recordConversion}><div><span className="section-label">OUTCOME LEDGER</span><h2>Record a conversion</h2></div><label>Tracked link<select value={conversion.trackedLinkId} onChange={(e) => setConversion({ ...conversion, trackedLinkId: e.target.value })}>{trackedLinks.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.destination_url}</option>)}</select></label><label>Outcome type<input value={conversion.eventType} onChange={(e) => setConversion({ ...conversion, eventType: e.target.value })} placeholder="registration, sale, activation" required /></label><label>Evidence key<input value={conversion.eventKey} onChange={(e) => setConversion({ ...conversion, eventKey: e.target.value })} placeholder="Your unique CRM or order ID" required /></label><label>Attributed value (USD)<input type="number" min="0" step="0.01" value={conversion.valueUsd} onChange={(e) => setConversion({ ...conversion, valueUsd: e.target.value })} placeholder="Optional" /></label><button className="button primary" disabled={!conversion.trackedLinkId || !conversion.eventKey}>Record manual conversion</button></form><section className="feature-form"><h2>Tracked activities</h2>{activities.map((activity) => <div className="link-row" key={activity.id}><span><strong>{activity.title}</strong><small>{activity.activity_type} · {activity.status}</small></span><button className="button secondary" onClick={() => void track(activity.id)}>Create tracking link</button></div>)}{link && <div className="created-invite"><strong>Tracking link ready</strong><input value={link} readOnly onFocus={(e) => e.currentTarget.select()} /></div>}</section></div>;
}

function ProfileEditor({ profile }: { profile: ProfileSummary }) {
  const [form, setForm] = useState({ displayName: profile.display_name, bio: profile.bio || '', seoTitle: profile.seo_title || '', seoDescription: profile.seo_description || '' });
  const [blocks, setBlocks] = useState<Array<{ id: string; title: string | null; url: string | null; enabled: boolean }>>([]);
  const [newLink, setNewLink] = useState({ title: '', url: '' });
  const [message, setMessage] = useState('');
  const csrf = () => readCookie('__Host-linkary_csrf');
  useEffect(() => { apiJson<{ profile: { displayName: string; bio: string; seoTitle: string | null; seoDescription: string | null } }>(`/api/profiles/${encodeURIComponent(profile.id)}`).then((result) => setForm({ displayName: result.profile.displayName, bio: result.profile.bio || '', seoTitle: result.profile.seoTitle || '', seoDescription: result.profile.seoDescription || '' })).catch(() => setForm({ displayName: profile.display_name, bio: profile.bio || '', seoTitle: profile.seo_title || '', seoDescription: profile.seo_description || '' })); }, [profile.id]);
  useEffect(() => { apiJson<{ blocks: typeof blocks }>(`/api/profiles/${encodeURIComponent(profile.id)}/blocks`).then((r) => setBlocks(r.blocks)).catch(() => undefined); }, [profile.id]);
  async function save(event: React.FormEvent) { event.preventDefault(); const csrf = readCookie('__Host-linkary_csrf'); if (!csrf) { setMessage('Please sign in again.'); return; } try { await apiJson(`/api/profiles/${encodeURIComponent(profile.id)}`, { method: 'PATCH', headers: { 'x-csrf-token': csrf }, body: JSON.stringify(form) }); setMessage('Profile saved.'); } catch (err) { setMessage(publicError(err, 'Unable to save profile.')); } }
  async function addLink(event: React.FormEvent) { event.preventDefault(); const token = csrf(); if (!token) return setMessage('Please sign in again.'); try { const r = await apiJson<{ id: string }>(`/api/profiles/${encodeURIComponent(profile.id)}/blocks`, { method: 'POST', headers: { 'x-csrf-token': token }, body: JSON.stringify({ type: 'link', title: newLink.title, url: newLink.url }) }); setBlocks([...blocks, { id: r.id, title: newLink.title, url: newLink.url, enabled: true }]); setNewLink({ title: '', url: '' }); } catch (err) { setMessage(publicError(err, 'Unable to add link.')); } }
  async function toggleLink(block: typeof blocks[number]) { const token = csrf(); if (!token) return; await apiJson(`/api/profiles/${encodeURIComponent(profile.id)}/blocks/${encodeURIComponent(block.id)}`, { method: 'PATCH', headers: { 'x-csrf-token': token }, body: JSON.stringify({ enabled: !block.enabled }) }); setBlocks(blocks.map((item) => item.id === block.id ? { ...item, enabled: !item.enabled } : item)); }
  async function publish() { const token = csrf(); if (!token) return setMessage('Please sign in again.'); try { await apiJson(`/api/profiles/${encodeURIComponent(profile.id)}/publish`, { method: 'POST', headers: { 'x-csrf-token': token } }); setMessage('Profile published.'); } catch (err) { setMessage(publicError(err, 'Verification is required before publishing.')); } }
  return <div className="feature-page"><span className="section-label">PUBLIC IDENTITY</span><h1>Profile editor</h1><p>Shape the public page people see when they discover your Linkary identity.</p><form className="feature-form" onSubmit={save}><label>Display name<input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} maxLength={80} required /></label><label>Bio<textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} maxLength={500} placeholder="What should people know about this profile?" /></label><label>SEO title<input value={form.seoTitle} onChange={(e) => setForm({ ...form, seoTitle: e.target.value })} maxLength={70} /></label><label>SEO description<textarea value={form.seoDescription} onChange={(e) => setForm({ ...form, seoDescription: e.target.value })} maxLength={180} /></label>{message && <div className="form-error">{message}</div>}<div className="profile-actions"><button className="button primary" type="submit">Save draft</button><button className="button secondary" type="button" onClick={() => void publish()}>Publish profile</button></div></form><ProfileLinkManager profile={profile} /><a className="button secondary" href={`https://linkary.xyz/${profile.username}`} target="_blank" rel="noreferrer">Open public profile ↗</a></div>;
}

function ProfileLinkManager({ profile }: { profile: ProfileSummary }) {
  type Block = { id: string; title: string | null; url: string | null; enabled: boolean };
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [draft, setDraft] = useState({ title: '', url: '' });
  const [blockType, setBlockType] = useState('link');
  const [error, setError] = useState('');
  const load = () => apiJson<{ blocks: Block[] }>(`/api/profiles/${encodeURIComponent(profile.id)}/blocks`).then((r) => setBlocks(r.blocks)).catch((err) => setError(publicError(err, 'Unable to load profile links.')));
  useEffect(() => { void load(); }, [profile.id]);
  const secure = () => readCookie('__Host-linkary_csrf');
  async function add(event: React.FormEvent) { event.preventDefault(); const csrf = secure(); if (!csrf) return setError('Please sign in again.'); try { await apiJson(`/api/profiles/${encodeURIComponent(profile.id)}/blocks`, { method: 'POST', headers: { 'x-csrf-token': csrf }, body: JSON.stringify({ type: blockType, title: draft.title, url: draft.url, config: blockType === 'team_member' ? { role: 'Team member' } : {} }) }); setDraft({ title: '', url: '' }); await load(); } catch (err) { setError(publicError(err, 'Unable to add this item.')); } }
  async function update(block: Block, enabled: boolean) { const csrf = secure(); if (!csrf) return; await apiJson(`/api/profiles/${encodeURIComponent(profile.id)}/blocks/${encodeURIComponent(block.id)}`, { method: 'PATCH', headers: { 'x-csrf-token': csrf }, body: JSON.stringify({ enabled }) }); await load(); }
  async function move(index: number, by: -1 | 1) { const target = index + by; if (target < 0 || target >= blocks.length) return; const ordered = [...blocks]; [ordered[index], ordered[target]] = [ordered[target], ordered[index]]; const csrf = secure(); if (!csrf) return; await apiJson(`/api/profiles/${encodeURIComponent(profile.id)}/blocks-reorder`, { method: 'POST', headers: { 'x-csrf-token': csrf }, body: JSON.stringify({ blockIds: ordered.map((block) => block.id) }) }); setBlocks(ordered); }
  return <section className="feature-form"><div><span className="section-label">LINKS & SHOWCASE</span><h2>Build your public link page</h2></div><div className="preset-links">{[['X', 'https://x.com/'], ['Telegram', 'https://t.me/'], ['LinkedIn', 'https://linkedin.com/in/'], ['YouTube', 'https://youtube.com/'], ['TikTok', 'https://tiktok.com/@']].map(([title, url]) => <button type="button" className="button secondary" key={title} onClick={() => { setBlockType('social_link'); setDraft({ title, url }); }}>+ {title}</button>)}</div>{blocks.map((block, index) => <div className="link-row" key={block.id}><span><strong>{block.title || 'Untitled link'}</strong><small>{block.url}</small></span><div className="link-actions"><button type="button" onClick={() => void move(index, -1)} disabled={index === 0}>↑</button><button type="button" onClick={() => void move(index, 1)} disabled={index === blocks.length - 1}>↓</button><button type="button" className="button secondary" onClick={() => void update(block, !block.enabled)}>{block.enabled ? 'Hide' : 'Show'}</button></div></div>)}<form className="add-link" onSubmit={add}><select value={blockType} onChange={(e) => setBlockType(e.target.value)}><option value="link">Link</option><option value="featured_video">Featured video</option><option value="featured_article">Featured article</option><option value="featured_image">Featured work</option>{profile.profile_type === 'project' && <option value="team_member">Team member</option>}</select><input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder={blockType === 'team_member' ? 'Member name' : 'Title'} required /><input type="url" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder={blockType === 'team_member' ? 'Profile or social URL' : 'https://...'} required /><button className="button primary" type="submit">Add to profile</button></form>{error && <div className="form-error">{error}</div>}</section>;
}

function InviteDashboard({ profile }: { profile: ProfileSummary }) {
  const [balance, setBalance] = useState<InviteBalance | null>(null); const [created, setCreated] = useState(''); const [error, setError] = useState('');
  const [invites, setInvites] = useState<Array<{ id: string; status: string; uses: number; max_uses: number; clicks: number; registrations: number; chosen_account_type: string | null; created_at: string }>>([]);
  const ownerType = profile.profile_type === 'creator' ? 'profile' : 'organization';
  useEffect(() => { apiJson<{ balances: InviteBalance[] }>('/api/invites/balances').then((r) => setBalance(r.balances.find((b) => b.owner_type === ownerType && b.owner_id === (ownerType === 'profile' ? profile.id : profile.organization_id)) || null)).catch(() => undefined); }, [profile.id, profile.organization_id, ownerType]);
  useEffect(() => { apiJson<{ invites: typeof invites }>('/api/invites/list').then((r) => setInvites(r.invites)).catch(() => undefined); }, []);
  async function create() { const csrf = readCookie('__Host-linkary_csrf'); if (!csrf || !balance) return; setError(''); try { const r = await apiJson<{ inviteUrl: string }>('/api/invites', { method: 'POST', headers: { 'x-csrf-token': csrf }, body: JSON.stringify({ ownerType, ownerId: ownerType === 'profile' ? profile.id : profile.organization_id }) }); setCreated(r.inviteUrl); setBalance({ ...balance, available_credits: balance.available_credits - 1, lifetime_used: balance.lifetime_used + 1 }); } catch (err) { setError(publicError(err, 'Unable to create invite.')); } }
  return <div className="feature-page"><span className="section-label">PRIVATE NETWORK</span><h1>Invite dashboard</h1><p>Invite people into the right workspace and keep every referral attributable.</p><div className="invite-balance"><span>AVAILABLE INVITES</span><strong>{balance?.available_credits ?? '—'}</strong><small>{balance ? `${balance.lifetime_used} used of ${balance.lifetime_granted}` : 'Loading balance'}</small></div><button className="button primary" onClick={() => void create()} disabled={!balance || balance.available_credits < 1}>Generate invitation</button>{created && <div className="created-invite"><strong>Invitation ready</strong><input readOnly value={created} onFocus={(e) => e.currentTarget.select()} /></div>}<section className="feature-form"><h2>Invitation activity</h2>{!invites.length ? <p>No invitations created yet.</p> : invites.map((invite) => <div className="link-row" key={invite.id}><span><strong>{invite.registrations ? 'Joined' : invite.status === 'active' ? 'Active invitation' : invite.status}</strong><small>{invite.clicks} clicks · {invite.registrations} registration{invite.registrations === 1 ? '' : 's'} · {new Date(invite.created_at).toLocaleDateString()}</small></span><b>{invite.uses}/{invite.max_uses}</b></div>)}</section>{error && <div className="form-error">{error}</div>}</div>;
}

function AdminPage() {
  const [claims, setClaims] = useState<CreatorClaim[]>([]);
  const [users, setUsers] = useState<Array<{ id: string; email: string | null; display_name: string; status: string }>>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [setting, setSetting] = useState<{ mode: string; automationAvailable: boolean } | null>(null);

  async function load() {
    try {
      const [queue, verification, userList] = await Promise.all([
        apiJson<{ claims: CreatorClaim[] }>('/api/admin/creator-access?status=submitted'),
        apiJson<{ mode: string; automationAvailable: boolean }>('/api/admin/settings/creator-access-verification'),
        apiJson<{ users: Array<{ id: string; email: string | null; display_name: string; status: string }> }>('/api/admin/users'),
      ]);
      setClaims(queue.claims); setSetting(verification); setUsers(userList.users); setError('');
    } catch (err) { setError(publicError(err, 'Unable to load the review queue.')); }
  }
  useEffect(() => { void load(); }, []);

  async function review(id: string, decision: 'approve' | 'reject') {
    const csrf = readCookie('__Host-linkary_csrf');
    if (!csrf) { setError('Your secure session expired. Please sign in again.'); return; }
    setBusy(id); setError('');
    try {
      await apiJson(`/api/admin/creator-access/${encodeURIComponent(id)}/${decision}`, {
        method: 'POST', headers: { 'x-csrf-token': csrf },
        body: decision === 'reject' ? JSON.stringify({ reason: reasons[id] || '' }) : undefined,
      });
      await load();
    } catch (err) { setError(publicError(err, `Unable to ${decision} this claim.`)); }
    finally { setBusy(null); }
  }
  async function changeUserStatus(userId: string, status: 'active' | 'suspended') { const csrf = readCookie('__Host-linkary_csrf'); if (!csrf) return; try { await apiJson(`/api/admin/users/${encodeURIComponent(userId)}/status`, { method: 'POST', headers: { 'x-csrf-token': csrf }, body: JSON.stringify({ status }) }); await load(); } catch (err) { setError(publicError(err, 'Unable to update user status.')); } }

  return (
    <div className="admin-review-page">
      <div className="admin-heading"><div><span className="section-label">SUPERADMIN</span><h1>Creator access review</h1><p>Review submitted creator posts before granting access to the Linkary network.</p></div><button className="button secondary" onClick={() => void load()}>Refresh queue</button></div>
      <div className="verification-mode"><div><strong>Verification mode</strong><span>{setting?.mode === 'manual' ? 'Manual review is active' : 'Automated X verification'}</span></div><div className="mode-pill active">Manual</div><div className="mode-pill disabled">Automated X verification, not configured</div></div>
      {error && <div className="form-error">{error}</div>}
      <div className="review-list">
        {!claims.length && <div className="empty-review"><strong>No creator posts waiting for review.</strong><span>New submissions will appear here.</span></div>}
        {claims.map((claim) => (
          <article className="review-card" key={claim.id}>
            <div className="review-main"><span className="section-label">{claim.claimCode}</span><h3>Creator Earn Access submission</h3><a href={claim.submittedPostUrl || '#'} target="_blank" rel="noreferrer">Open X post ↗</a><pre>{claim.postText}</pre></div>
            <div className="review-actions"><button className="button primary full" disabled={busy !== null} onClick={() => void review(claim.id, 'approve')}>{busy === claim.id ? 'Saving...' : 'Approve access'}</button><label>Rejection note<textarea value={reasons[claim.id] || ''} onChange={(event) => setReasons((current) => ({ ...current, [claim.id]: event.target.value }))} placeholder="Optional reason for the creator" maxLength={240} /></label><button className="button secondary full" disabled={busy !== null} onClick={() => void review(claim.id, 'reject')}>Reject submission</button></div>
          </article>
        ))}
      </div>
      <section className="feature-form"><div><span className="section-label">USER MODERATION</span><h2>Network users</h2></div>{users.map((user) => <div className="link-row" key={user.id}><span><strong>{user.display_name || user.email || 'Linkary user'}</strong><small>{user.email || 'No email'} · {user.status}</small></span><button className="button secondary" disabled={busy !== null} onClick={() => void changeUserStatus(user.id, user.status === 'active' ? 'suspended' : 'active')}>{user.status === 'active' ? 'Suspend' : 'Restore'}</button></div>)}</section>
    </div>
  );
}

function AppShell({ me, status, onLogout }: { me: MeResponse; status: OnboardingStatus; onLogout: () => Promise<void> }) {
  const [profiles, setProfiles] = useState(status.profiles);
  const [profileId, setProfileId] = useState(status.profiles[0]?.id || '');
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceUsername, setWorkspaceUsername] = useState('');
  const [workspaceError, setWorkspaceError] = useState('');
  const profile = profiles.find((item) => item.id === profileId) || profiles[0];
  if (!profile) return <Navigate to="/onboarding" replace />;
  async function createWorkspace(event: React.FormEvent) {
    event.preventDefault();
    const csrf = readCookie('__Host-linkary_csrf');
    if (!csrf) { setWorkspaceError('Your secure session expired. Please sign in again.'); return; }
    setWorkspaceError('');
    try {
      const created = await apiJson<{ profileId: string }>('/api/organizations', { method: 'POST', headers: { 'x-csrf-token': csrf }, body: JSON.stringify({ name: workspaceName, username: workspaceUsername }) });
      const refreshed = await apiJson<OnboardingStatus>('/api/onboarding/status');
      setProfiles(refreshed.profiles);
      setProfileId(created.profileId);
      setWorkspaceName(''); setWorkspaceUsername(''); setCreatingWorkspace(false);
    } catch (err) { setWorkspaceError(publicError(err, 'Unable to create this workspace.')); }
  }
  const nav = [['dashboard', 'Overview'], ['campaigns', 'Campaigns'], ['creators', 'Creators'], ['communities', 'Communities'], ['tracking', 'Tracking'], ['profile', 'Profile'], ['invites', 'Invites'], ['settings', 'Settings']];
  return (
    <main className="app-shell">
      <aside className="app-sidebar"><Logo /><div className="workspace-picker"><label>WORKSPACE</label><select value={profile.id} onChange={(event) => setProfileId(event.target.value)}>{profiles.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select><button className="workspace-add" type="button" onClick={() => { setWorkspaceError(''); setCreatingWorkspace(true); }}>+ Create workspace</button></div><nav>{nav.map(([path, label]) => <NavLink key={path} to={`/${path}`} className={({ isActive }) => isActive ? 'active' : ''}>{label}</NavLink>)}</nav><div className="sidebar-user"><span>{status.user.displayName || status.user.email || 'Linkary user'}</span><button onClick={onLogout}>Log out</button></div>{creatingWorkspace && <div className="workspace-modal-backdrop"><form className="workspace-modal" onSubmit={createWorkspace}><button className="workspace-modal-close" type="button" onClick={() => setCreatingWorkspace(false)}>×</button><span className="section-label">NEW PROJECT WORKSPACE</span><h2>Create a project</h2><p>Your human account stays the same. This adds a Project profile and 50 network invites.</p><label>Project name<input value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} placeholder="e.g. KlineO" minLength={2} maxLength={100} required /></label><label>Linkary username<input value={workspaceUsername} onChange={(event) => setWorkspaceUsername(event.target.value.toLowerCase())} placeholder="e.g. klineo" pattern="[a-z0-9_]{3,30}" required /></label>{workspaceError && <div className="form-error">{workspaceError}</div>}<button className="button primary full" disabled={!workspaceName.trim() || !workspaceUsername.trim()}>Create workspace</button></form></div>}</aside>
      <section className="app-content"><header className="app-topbar"><div><strong>{profile.display_name}</strong><span>/{profile.username}</span></div><a href="https://linkary.xyz" target="_blank" rel="noreferrer">linkary.xyz ↗</a></header><div className="app-page"><Routes><Route path="/" element={<Navigate to="/dashboard" replace />} /><Route path="/dashboard" element={<Dashboard status={status} profile={profile} />} /><Route path="/campaigns" element={<FoundationPage name="campaigns" />} /><Route path="/creators" element={<FoundationPage name="creators" />} /><Route path="/communities" element={<FoundationPage name="communities" />} /><Route path="/tracking" element={<FoundationPage name="tracking" />} /><Route path="/profile" element={<ProfileEditor profile={profile} />} /><Route path="/invites" element={<InviteDashboard profile={profile} />} /><Route path="/settings" element={<FoundationPage name="settings" />} /><Route path="/admin/*" element={me.user?.superadmin ? <AdminPage /> : <Navigate to="/dashboard" replace />} /><Route path="*" element={<Navigate to="/dashboard" replace />} /></Routes></div></section>
    </main>
  );
}

export default function AppV2() {
  const { isInitialized } = useIsInitialized();
  const { isSignedIn } = useIsSignedIn();
  const { getAccessToken } = useGetAccessToken();
  const { signOut } = useSignOut();
  const [phase, setPhase] = useState<Phase>('loading');
  const [me, setMe] = useState<MeResponse>({ authenticated: false, user: null });
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [claim, setClaim] = useState<CreatorClaim | null>(null);
  const [deniedMessage, setDeniedMessage] = useState('');
  const bridgeAttempted = useRef(false);

  async function loadAuthenticated() {
    const nextMe = await apiJson<MeResponse>('/api/auth/me');
    setMe(nextMe);
    if (!nextMe.authenticated) { setPhase('auth'); return; }
    const nextStatus = await apiJson<OnboardingStatus>('/api/onboarding/status');
    setStatus(nextStatus);
    if (nextStatus.profiles.length) setPhase('app');
    else setPhase('onboarding');
  }

  async function bridge(accessToken: string, context: AccessContext) {
    await apiJson('/api/auth/cdp/session', { method: 'POST', body: JSON.stringify({ accessToken, inviteCode: context.inviteCode, earnedGrant: context.earnedGrant }) });
    sessionStorage.removeItem(ACCESS_STORAGE);
    sessionStorage.removeItem(SIGNUP_INTENT_STORAGE);
    sessionStorage.removeItem(CLAIM_TOKEN_STORAGE);
    await loadAuthenticated();
  }

  async function loadOrCreateCreatorClaim(accessToken: string) {
    const storedToken = claimToken();
    if (storedToken) {
      try {
        const result = await apiJson<{ claim: CreatorClaim }>('/api/access/creator/claim', { headers: { 'x-linkary-claim-token': storedToken } });
        setClaim(result.claim); setPhase('creator-access'); setCleanPath('/creator-access'); return;
      } catch (err) {
        if (!(err instanceof ApiError) || !['claim_not_found', 'claim_expired'].includes(err.code)) throw err;
        sessionStorage.removeItem(CLAIM_TOKEN_STORAGE);
      }
    }
    const result = await apiJson<{ claimToken: string; claim: CreatorClaim }>('/api/access/creator/claim', { method: 'POST', body: JSON.stringify({ accessToken }) });
    sessionStorage.setItem(CLAIM_TOKEN_STORAGE, result.claimToken);
    setClaim(result.claim); setPhase('creator-access'); setCleanPath('/creator-access');
  }

  useEffect(() => {
    if (!isInitialized) return;
    let cancelled = false;
    void (async () => {
      try {
        const current = await apiJson<MeResponse>('/api/auth/me');
        if (cancelled) return;
        setMe(current);
        if (current.authenticated) {
          const currentStatus = await apiJson<OnboardingStatus>('/api/onboarding/status');
          if (cancelled) return;
          setStatus(currentStatus);
          setPhase(currentStatus.profiles.length ? 'app' : 'onboarding');
          return;
        }
        if (!isSignedIn) { bridgeAttempted.current = false; setPhase('auth'); return; }
        if (bridgeAttempted.current) return;
        bridgeAttempted.current = true; setPhase('bridging');
        const accessToken = await getAccessToken();
        if (!accessToken) throw new Error('Sign-in could not be completed. Please try again.');

        if (signupIntent() === 'creator_earn') {
          const storedToken = claimToken();
          if (storedToken) {
            try {
              const result = await apiJson<{ claim: CreatorClaim }>('/api/access/creator/claim', { headers: { 'x-linkary-claim-token': storedToken } });
              if (result.claim.status === 'approved') {
                await bridge(accessToken, { inviteCode: storedToken });
                return;
              }
              if (cancelled) return;
              setClaim(result.claim); setPhase('creator-access'); setCleanPath('/creator-access'); return;
            } catch (err) {
              if (!(err instanceof ApiError) || !['claim_not_found', 'claim_expired'].includes(err.code)) throw err;
              sessionStorage.removeItem(CLAIM_TOKEN_STORAGE);
            }
          }
        }

        const context = captureAccessContext();
        try {
          await bridge(accessToken, context);
          return;
        } catch (err) {
          if (err instanceof ApiError && err.code === 'access_required' && signupIntent() === 'creator_earn') {
            await loadOrCreateCreatorClaim(accessToken);
            return;
          }
          throw err;
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && ['access_required', 'invalid_invite', 'invalid_access_grant', 'invite_exhausted'].includes(err.code)) {
          setDeniedMessage(publicError(err, 'A valid Linkary invitation or approved creator access is required.'));
          setPhase('access-denied'); return;
        }
        setDeniedMessage(publicError(err, 'Authentication could not be completed.'));
        setPhase('auth');
      }
    })();
    return () => { cancelled = true; };
  }, [isInitialized, isSignedIn]);

  async function continueApprovedClaim() {
    const token = claimToken();
    if (!token) throw new Error('Creator access claim is missing.');
    setPhase('bridging');
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error('Sign-in expired. Please sign in again.');
      await bridge(accessToken, { inviteCode: token });
    } catch (err) {
      setDeniedMessage(publicError(err, 'Unable to continue into Linkary.'));
      setPhase('creator-access');
    }
  }

  async function signOutOnly() {
    try { await signOut(); } catch {}
    bridgeAttempted.current = false;
    setMe({ authenticated: false, user: null }); setStatus(null); setClaim(null); setDeniedMessage(''); setPhase('auth');
    sessionStorage.removeItem(SIGNUP_INTENT_STORAGE);
    setCleanPath('/login');
  }

  async function logout() {
    try {
      const csrf = readCookie('__Host-linkary_csrf');
      if (csrf) await apiJson('/api/auth/logout', { method: 'POST', headers: { 'x-csrf-token': csrf } });
    } catch {}
    try { await signOut(); } catch {}
    sessionStorage.removeItem(ACCESS_STORAGE); sessionStorage.removeItem(SIGNUP_INTENT_STORAGE); sessionStorage.removeItem(CLAIM_TOKEN_STORAGE);
    bridgeAttempted.current = false; setMe({ authenticated: false, user: null }); setStatus(null); setClaim(null); setDeniedMessage(''); setPhase('auth'); setCleanPath('/login');
  }

  if (!isInitialized || phase === 'loading') return <LoadingScreen />;
  if (phase === 'bridging') return <LoadingScreen message="Securing your Linkary session" />;
  if (phase === 'auth') return <AuthScreen deniedMessage={deniedMessage || undefined} />;
  if (phase === 'creator-access' && claim) return <CreatorAccessScreen claim={claim} onClaim={setClaim} onContinue={continueApprovedClaim} onSignOut={signOutOnly} />;
  if (phase === 'access-denied') return <main className="access-denied-page"><div className="denied-card"><Logo /><span className="section-label">PRIVATE NETWORK</span><h1>Linkary access is required.</h1><p>{deniedMessage}</p><button className="button primary full" onClick={signOutOnly}>Sign out and try another access path</button><a href="https://linkary.xyz">Back to Linkary</a></div></main>;
  if (phase === 'onboarding' && status) return <OnboardingScreen status={status} onComplete={(next) => { setStatus(next); setPhase('app'); }} />;
  if (phase === 'app' && status) return <AppShell me={me} status={status} onLogout={logout} />;
  return <LoadingScreen />;
}
