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
type Phase = 'loading' | 'auth' | 'bridging' | 'onboarding' | 'app' | 'access-denied';

interface MeResponse {
  authenticated: boolean;
  user: { id: string; displayName: string; superadmin: boolean } | null;
}

interface ProfileSummary {
  id: string;
  profile_type: AccountType;
  username: string;
  display_name: string;
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

class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

const ACCESS_STORAGE = 'linkary.access.v1';

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string } & T;
  if (!response.ok) throw new ApiError(response.status, payload.error || 'request_failed', payload.message || 'Request failed');
  return payload;
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
  try {
    return JSON.parse(sessionStorage.getItem(ACCESS_STORAGE) || '{}') as AccessContext;
  } catch {
    sessionStorage.removeItem(ACCESS_STORAGE);
    return {};
  }
}

function accessLabel(context: AccessContext): string | null {
  if (context.inviteCode) return 'Private invitation detected';
  if (context.earnedGrant) return 'Creator access approved';
  return null;
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
  return (
    <main className="loading-screen">
      <Logo />
      <div className="spinner" />
      <p>{message}</p>
    </main>
  );
}

function EarnAccessForm() {
  const [postUrl, setPostUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await apiJson<{ continueUrl: string }>('/api/access/earned', {
        method: 'POST',
        body: JSON.stringify({ postUrl }),
      });
      window.location.assign(result.continueUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start creator access');
      setBusy(false);
    }
  }

  return (
    <section className="earn-access">
      <div className="section-label">CREATOR EARN ACCESS</div>
      <h3>Already posted about Linkary?</h3>
      <p>Paste your X post URL. Linkary stores the URL as evidence and does not use TwitterAPI.io to validate the post.</p>
      <form onSubmit={submit}>
        <label>
          X post URL
          <input
            type="url"
            value={postUrl}
            onChange={(event) => setPostUrl(event.target.value)}
            placeholder="https://x.com/username/status/..."
            required
          />
        </label>
        {error && <div className="form-error">{error}</div>}
        <button className="button secondary full" disabled={busy}>{busy ? 'Checking URL...' : 'Continue with creator access'}</button>
      </form>
    </section>
  );
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
    setBusy('email');
    setError('');
    try {
      const result = await signInWithEmail({ email: email.trim() });
      setFlowId(result.flowId);
      setOtp('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send the code');
    } finally {
      setBusy(null);
    }
  }

  async function verifyOtp(event: React.FormEvent) {
    event.preventDefault();
    if (!flowId) return;
    setBusy('otp');
    setError('');
    try {
      await verifyEmailOTP({ flowId, otp });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The code could not be verified');
      setBusy(null);
    }
  }

  async function resend() {
    setBusy('resend');
    setError('');
    try {
      const result = await signInWithEmail({ email: email.trim() });
      setFlowId(result.flowId);
      setOtp('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to resend the code');
    } finally {
      setBusy(null);
    }
  }

  async function social(provider: 'google' | 'x') {
    setBusy(provider);
    setError('');
    try {
      await signInWithOAuth(provider);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Unable to continue with ${provider}`);
      setBusy(null);
    }
  }

  if (flowId) {
    return (
      <form className="auth-form" onSubmit={verifyOtp}>
        <button type="button" className="back-link" onClick={() => { setFlowId(null); setError(''); }}>← Change email</button>
        <div className="otp-intro">
          <span className="section-label">CHECK YOUR EMAIL</span>
          <h2>Enter your 6-digit code</h2>
          <p>We sent a one-time code to <strong>{email}</strong>.</p>
        </div>
        <label>
          Verification code
          <input
            className="otp-input"
            value={otp}
            onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            maxLength={6}
            required
          />
        </label>
        {error && <div className="form-error">{error}</div>}
        <button className="button primary full" disabled={busy !== null || otp.length !== 6}>{busy === 'otp' ? 'Verifying...' : 'Verify and continue'}</button>
        <button type="button" className="resend" disabled={busy !== null} onClick={resend}>{busy === 'resend' ? 'Sending...' : 'Resend code'}</button>
      </form>
    );
  }

  return (
    <div className="auth-methods">
      <form className="auth-form" onSubmit={startEmail}>
        <label>
          Email address
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
            autoComplete="email"
            required
          />
        </label>
        <button className="button primary full" disabled={busy !== null}>{busy === 'email' ? 'Sending code...' : 'Continue with email'}</button>
      </form>
      <div className="or"><span>or continue with</span></div>
      <div className="social-stack">
        <button className="social-button" onClick={() => social('google')} disabled={busy !== null}><b>G</b><span>{busy === 'google' ? 'Connecting...' : 'Continue with Google'}</span></button>
        <button className="social-button" onClick={() => social('x')} disabled={busy !== null}><b>𝕏</b><span>{busy === 'x' ? 'Connecting...' : 'Continue with X'}</span></button>
      </div>
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}

function AuthScreen({ deniedMessage }: { deniedMessage?: string }) {
  const context = useMemo(captureAccessContext, []);
  const hasAccessContext = Boolean(context.inviteCode || context.earnedGrant);
  const params = new URLSearchParams(window.location.search);
  const [mode, setMode] = useState<'login' | 'signup'>(hasAccessContext || params.get('mode') === 'signup' ? 'signup' : 'login');

  return (
    <main className="auth-layout">
      <aside className="auth-story">
        <Logo />
        <a className="back-home" href="https://linkary.xyz">← Back to linkary.xyz</a>
        <div className="story-copy">
          <span className="section-label">GROWTH INTELLIGENCE NETWORK</span>
          <h1>One identity.<br /><em>A history that compounds.</em></h1>
          <p>Connect campaigns, creator proof, first-party attribution, and your Linkary public profile in one account.</p>
        </div>
        <div className="proof-card">
          <span>PRIVATE ACCESS</span>
          <strong>Invite-only network</strong>
          <p>Existing members can log in anytime. New profiles require a valid invitation or approved creator access.</p>
        </div>
      </aside>

      <section className="auth-main">
        <div className="mobile-brand"><Logo /></div>
        <div className="auth-card-real">
          <nav className="auth-tabs" aria-label="Authentication mode">
            <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Log in</button>
            <button className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>Create account</button>
          </nav>

          <div className="auth-heading">
            {accessLabel(context) && <div className="access-chip">✓ {accessLabel(context)}</div>}
            <span className="section-label">{mode === 'login' ? 'WELCOME BACK' : 'JOIN THE NETWORK'}</span>
            <h2>{mode === 'login' ? 'Log in to Linkary' : 'Create your Linkary account'}</h2>
            <p>{mode === 'login' ? 'Continue to your profile, campaigns, and network.' : 'Authenticate first. Your Creator or Company workspace is created after access is confirmed.'}</p>
          </div>

          {deniedMessage && <div className="notice danger"><strong>Access required</strong><span>{deniedMessage}</span></div>}

          {mode === 'signup' && !hasAccessContext ? (
            <div className="invite-required">
              <div className="notice"><strong>Linkary is invite-only</strong><span>Open your Linkary invitation link to create a profile. Creator Earn Access is also available with manual X post evidence.</span></div>
              <EarnAccessForm />
            </div>
          ) : (
            <AuthMethods />
          )}

          <p className="security-note">Authentication and embedded wallets are provided by Coinbase CDP. Linkary validates the CDP access token on the server before creating a Linkary session.</p>
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

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const csrf = readCookie('__Host-linkary_csrf');
      if (!csrf) throw new Error('Secure session token is missing. Please sign in again.');
      await apiJson('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'x-csrf-token': csrf },
        body: JSON.stringify({
          accountType,
          username,
          displayName: accountType === 'creator' ? displayName : undefined,
          organizationName: accountType === 'project' ? organizationName : undefined,
        }),
      });
      const next = await apiJson<OnboardingStatus>('/api/onboarding/status');
      onComplete(next);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to finish onboarding');
      setBusy(false);
    }
  }

  return (
    <main className="onboarding-page">
      <header className="simple-header"><Logo /><span>Account setup</span></header>
      <section className="onboarding-card">
        <div className="step-count">01 / FIRST WORKSPACE</div>
        <h1>How are you joining Linkary?</h1>
        <p>This creates your first workspace. It does not permanently lock your human account to one role.</p>

        <form onSubmit={submit}>
          <div className="role-grid-real">
            {allowed.includes('creator') && (
              <button type="button" className={accountType === 'creator' ? 'selected' : ''} onClick={() => setAccountType('creator')}>
                <span>◇</span><strong>Creator</strong><small>Build your public profile, campaign proof, and referral network.</small>
              </button>
            )}
            {allowed.includes('project') && (
              <button type="button" className={accountType === 'project' ? 'selected' : ''} onClick={() => setAccountType('project')}>
                <span>▦</span><strong>Company / Project</strong><small>Run campaigns, track partners, creators, communities, and outcomes.</small>
              </button>
            )}
          </div>

          {status.xIdentity?.current_handle && (
            <div className="identity-note"><span>𝕏</span><div><strong>X identity connected</strong><small>@{status.xIdentity.current_handle}. Stable identity history will remain attached if the handle changes.</small></div></div>
          )}

          <div className="field-grid">
            <label>
              Linkary username
              <div className="username-field"><span>linkary.xyz/</span><input value={username} onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} placeholder="username" minLength={3} maxLength={30} required /></div>
              <small>3 to 30 characters. Letters, numbers, and underscores.</small>
            </label>
            {accountType === 'creator' ? (
              <label>Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your name" required /></label>
            ) : (
              <label>Company / Project name<input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} placeholder="Project name" minLength={2} maxLength={100} required /></label>
            )}
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
  const balance = balances.find((row) => profile.profile_type === 'creator'
    ? row.owner_type === 'profile' && row.owner_id === profile.id
    : row.owner_type === 'organization' && row.owner_id === profile.organization_id);

  return (
    <div className="page-stack">
      <div className="dashboard-hero">
        <div><span className="section-label">COMMAND CENTER</span><h1>Welcome, {status.user.displayName || profile.display_name}.</h1><p>Your Linkary foundation is active. Start with identity, profile, and first-party tracking before adding deeper intelligence.</p></div>
        <a className="button secondary" href={`https://linkary.xyz/${profile.username}`} target="_blank" rel="noreferrer">Public URL ↗</a>
      </div>
      <div className="real-metrics">
        <article><span>PROFILE</span><strong>{profile.visibility === 'published' ? 'Published' : 'Private draft'}</strong><small>linkary.xyz/{profile.username}</small></article>
        <article><span>NETWORK INVITES</span><strong>{balance ? balance.available_credits : '...'}</strong><small>{balance ? `${balance.lifetime_used} used` : 'Loading balance'}</small></article>
        <article><span>WORKSPACE</span><strong>{profile.profile_type === 'creator' ? 'Creator' : 'Project'}</strong><small>{status.xIdentity ? 'X identity connected' : 'Identity setup can continue later'}</small></article>
      </div>
      <section className="command-card">
        <header><div><span className="section-label">NEXT ACTIONS</span><h2>Build the first reliable growth record</h2></div></header>
        <div className="action-list">
          <NavLink to="/profile"><b>01</b><span><strong>Complete your public profile</strong><small>Add the identity and links people should trust.</small></span><em>→</em></NavLink>
          <NavLink to="/invites"><b>02</b><span><strong>Invite the right people</strong><small>Use first-party Linkary invitations and keep referral attribution in-house.</small></span><em>→</em></NavLink>
          <NavLink to="/tracking"><b>03</b><span><strong>Prepare first-party tracking</strong><small>Campaign and destination tracking will build on the same account identity.</small></span><em>→</em></NavLink>
        </div>
      </section>
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
  const copy = pageCopy[name];
  return <div className="foundation-page"><span className="section-label">{copy.eyebrow}</span><h1>{copy.title}</h1><p>{copy.body}</p><div className="foundation-box"><strong>Foundation ready</strong><span>This route is part of the real authenticated Linkary shell. The feature workflow is intentionally next, not simulated.</span></div></div>;
}

function AdminPage() {
  return <div className="foundation-page"><span className="section-label">SUPERADMIN</span><h1>Linkary administration</h1><p>This surface is isolated from normal organization dashboards and requires an active server-side Superadmin grant.</p><div className="foundation-box"><strong>Authorization boundary active</strong><span>No public privilege escalation route exists.</span></div></div>;
}

function AppShell({ me, status, onLogout }: { me: MeResponse; status: OnboardingStatus; onLogout: () => Promise<void> }) {
  const [profileId, setProfileId] = useState(status.profiles[0]?.id || '');
  const profile = status.profiles.find((item) => item.id === profileId) || status.profiles[0];
  if (!profile) return <Navigate to="/" replace />;

  const nav = [
    ['dashboard', 'Overview'], ['campaigns', 'Campaigns'], ['creators', 'Creators'], ['communities', 'Communities'],
    ['tracking', 'Tracking'], ['profile', 'Profile'], ['invites', 'Invites'], ['settings', 'Settings'],
  ];

  return (
    <main className="app-shell">
      <aside className="app-sidebar">
        <Logo />
        <div className="workspace-picker">
          <label>WORKSPACE</label>
          <select value={profile.id} onChange={(event) => setProfileId(event.target.value)}>
            {status.profiles.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}
          </select>
        </div>
        <nav>{nav.map(([path, label]) => <NavLink key={path} to={`/${path}`} className={({ isActive }) => isActive ? 'active' : ''}>{label}</NavLink>)}</nav>
        {me.user?.superadmin && <NavLink className="admin-link" to="/admin">Superadmin</NavLink>}
        <div className="sidebar-user"><span>{status.user.displayName || status.user.email || 'Linkary user'}</span><button onClick={onLogout}>Log out</button></div>
      </aside>
      <section className="app-content">
        <header className="app-topbar"><div><strong>{profile.display_name}</strong><span>/{profile.username}</span></div><a href="https://linkary.xyz" target="_blank" rel="noreferrer">linkary.xyz ↗</a></header>
        <div className="app-page">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard status={status} profile={profile} />} />
            <Route path="/campaigns" element={<FoundationPage name="campaigns" />} />
            <Route path="/creators" element={<FoundationPage name="creators" />} />
            <Route path="/communities" element={<FoundationPage name="communities" />} />
            <Route path="/tracking" element={<FoundationPage name="tracking" />} />
            <Route path="/profile" element={<FoundationPage name="profile" />} />
            <Route path="/invites" element={<FoundationPage name="invites" />} />
            <Route path="/settings" element={<FoundationPage name="settings" />} />
            <Route path="/admin/*" element={me.user?.superadmin ? <AdminPage /> : <Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </div>
      </section>
    </main>
  );
}

export default function App() {
  const { isInitialized } = useIsInitialized();
  const { isSignedIn } = useIsSignedIn();
  const { getAccessToken } = useGetAccessToken();
  const { signOut } = useSignOut();
  const [phase, setPhase] = useState<Phase>('loading');
  const [me, setMe] = useState<MeResponse>({ authenticated: false, user: null });
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [deniedMessage, setDeniedMessage] = useState('');
  const bridgeAttempted = useRef(false);

  async function loadAuthenticated(): Promise<void> {
    const nextMe = await apiJson<MeResponse>('/api/auth/me');
    setMe(nextMe);
    if (!nextMe.authenticated) {
      setPhase('auth');
      return;
    }
    const nextStatus = await apiJson<OnboardingStatus>('/api/onboarding/status');
    setStatus(nextStatus);
    setPhase(nextStatus.profiles.length ? 'app' : 'onboarding');
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

        if (!isSignedIn) {
          bridgeAttempted.current = false;
          setPhase('auth');
          return;
        }
        if (bridgeAttempted.current) return;
        bridgeAttempted.current = true;
        setPhase('bridging');
        const accessToken = await getAccessToken();
        if (!accessToken) throw new Error('Coinbase CDP did not return an access token');
        const context = captureAccessContext();
        await apiJson('/api/auth/cdp/session', {
          method: 'POST',
          body: JSON.stringify({ accessToken, inviteCode: context.inviteCode, earnedGrant: context.earnedGrant }),
        });
        sessionStorage.removeItem(ACCESS_STORAGE);
        if (cancelled) return;
        await loadAuthenticated();
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && ['access_required', 'invalid_invite', 'invalid_access_grant', 'invite_exhausted'].includes(err.code)) {
          setDeniedMessage(err.message);
          setPhase('access-denied');
          return;
        }
        setDeniedMessage(err instanceof Error ? err.message : 'Authentication could not be completed');
        setPhase('auth');
      }
    })();
    return () => { cancelled = true; };
  }, [isInitialized, isSignedIn]);

  async function logout() {
    try {
      const csrf = readCookie('__Host-linkary_csrf');
      if (csrf) await apiJson('/api/auth/logout', { method: 'POST', headers: { 'x-csrf-token': csrf } });
    } catch {}
    try { await signOut(); } catch {}
    sessionStorage.removeItem(ACCESS_STORAGE);
    bridgeAttempted.current = false;
    setMe({ authenticated: false, user: null });
    setStatus(null);
    setDeniedMessage('');
    setPhase('auth');
    window.history.replaceState(null, '', '/');
  }

  if (!isInitialized || phase === 'loading') return <LoadingScreen />;
  if (phase === 'bridging') return <LoadingScreen message="Securing your Linkary session" />;
  if (phase === 'auth') return <AuthScreen deniedMessage={deniedMessage || undefined} />;
  if (phase === 'access-denied') {
    return (
      <main className="access-denied-page">
        <div className="denied-card"><Logo /><span className="section-label">PRIVATE NETWORK</span><h1>Linkary access is required.</h1><p>{deniedMessage}</p><button className="button primary full" onClick={logout}>Sign out and use an invitation</button><a href="https://linkary.xyz">Back to Linkary</a></div>
      </main>
    );
  }
  if (phase === 'onboarding' && status) return <OnboardingScreen status={status} onComplete={(next) => { setStatus(next); setPhase('app'); }} />;
  if (phase === 'app' && status) return <AppShell me={me} status={status} onLogout={logout} />;
  return <LoadingScreen />;
}
