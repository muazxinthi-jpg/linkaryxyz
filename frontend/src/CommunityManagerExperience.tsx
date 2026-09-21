import { useEffect, useMemo, useState } from 'react';
import { ProductWorkspace, type ProductMe, type ProductStatus } from './ProductWorkspace';
import CommunityVerificationPanel from './CommunityVerificationPanel';
import './community-manager.css';

type Manager = {
  id: string;
  profile_id: string;
  manager_type: 'community_manager';
  display_name: string;
  headline: string;
  bio: string;
  telegram_contact: string | null;
  email: string | null;
  website_url: string | null;
  verification_status: string;
  open_to_campaigns: boolean;
  asset_count: number;
  combined_audience: number;
};

type TelegramIdentity = {
  verified: true;
  current_handle: string | null;
  current_display_name: string | null;
  ownership_verified_at: string | null;
};

type CommunityAsset = {
  id: string;
  asset_type: 'telegram_community';
  name: string;
  platform: string;
  handle: string | null;
  url: string | null;
  audience_size: number;
  verification_status: string;
  notes: string;
};

type CommunityDraft = {
  assetId: string | null;
  name: string;
  handle: string;
  url: string;
  audienceSize: string;
  notes: string;
};

class ApiError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}


async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (!response.ok) throw new ApiError(payload.error || 'request_failed', payload.message || 'Request failed');
  return payload;
}

function csrf(): string | null {
  const hit = document.cookie.split('; ').find((part) => part.startsWith('__Host-linkary_csrf='));
  return hit ? decodeURIComponent(hit.split('=').slice(1).join('=')) : null;
}

function emptyCommunity(): CommunityDraft {
  return { assetId: null, name: '', handle: '', url: '', audienceSize: '', notes: '' };
}

function compact(value: number): string {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(Math.max(0, value || 0));
}

function verificationLabel(value: string): string {
  if (value === 'verified') return 'Verified';
  if (value === 'submitted') return 'Verification submitted';
  if (value === 'rejected') return 'Needs review';
  return 'Listed';
}

function friendly(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  if (error.code === 'manager_exists') return 'Your Community Manager portfolio already exists. Refresh this page.';
  if (error.code === 'invalid_url') return 'Enter a valid community or website URL.';
  if (error.code === 'invalid_audience') return 'Audience size must be zero or greater.';
  if (error.code === 'forbidden') return 'Only the owner of the Personal Profile can manage this community portfolio.';
  return error.message || fallback;
}

export default function CommunityManagerExperience({ me, status }: { me: ProductMe; status: ProductStatus }) {
  const creator = status.profiles.find((item) => item.profile_type === 'creator');
  const [profileId, setProfileId] = useState(creator?.id || status.profiles[0]?.id || '');
  const profile = status.profiles.find((item) => item.id === profileId) || creator || status.profiles[0];
  const personalProfile = creator || null;
  const [telegramIdentity, setTelegramIdentity] = useState<TelegramIdentity | null>(null);
  const [manager, setManager] = useState<Manager | null>(null);
  const [assets, setAssets] = useState<CommunityAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [managerForm, setManagerForm] = useState({ headline: 'Telegram Community Manager', bio: '', email: '', websiteUrl: '', openToCampaigns: true });
  const [draft, setDraft] = useState<CommunityDraft>(emptyCommunity());

  const combinedAudience = useMemo(() => assets.reduce((sum, item) => sum + Number(item.audience_size || 0), 0), [assets]);

  function changeProfile(id: string) {
    setProfileId(id);
    window.localStorage.setItem('linkary.active.profile', id);
  }

  async function load() {
    if (!personalProfile) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const managerResult = await api<{ managers: Manager[]; telegram_identity: TelegramIdentity | null }>('/api/partner-managers?type=community_manager');
      const mine = managerResult.managers.find((item) => item.profile_id === personalProfile.id) || null;
      setTelegramIdentity(managerResult.telegram_identity || null);
      setManager(mine);
      if (mine) {
        setManagerForm({
          headline: mine.headline || 'Telegram Community Manager',
          bio: mine.bio || '',
          email: mine.email || '',
          websiteUrl: mine.website_url || '',
          openToCampaigns: mine.open_to_campaigns !== false,
        });
        const assetResult = await api<{ assets: CommunityAsset[] }>(`/api/partner-manager-assets?managerId=${encodeURIComponent(mine.id)}`);
        setAssets(assetResult.assets || []);
      } else {
        setAssets([]);
      }
    } catch (error) {
      setMessage(friendly(error, 'Community portfolio could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [personalProfile?.id]);

  function connectTelegram() { window.location.assign('/profile'); }

  async function disconnectTelegram() {
    if (!window.confirm('Disconnect your personal Telegram account? Community listings and historical evidence will be preserved.')) return;
    const token = csrf();
    if (!token) return;
    setBusy('telegram-disconnect');
    setMessage('');
    try {
      await api('/api/auth/telegram/disconnect', { method: 'POST', headers: { 'x-csrf-token': token } });
      setTelegramIdentity(null);
      setMessage('Telegram disconnected. You can connect another account whenever you are ready.');
    } catch (error) {
      setMessage(friendly(error, 'Telegram could not be disconnected.'));
    } finally { setBusy(''); }
  }

  async function saveManager(event: React.FormEvent) {
    event.preventDefault();
    if (!personalProfile) return;
    const token = csrf();
    if (!token) return;
    setBusy('manager');
    setMessage('');
    try {
      await api('/api/partner-managers', {
        method: 'POST',
        headers: { 'x-csrf-token': token },
        body: JSON.stringify({
          ...(manager ? { managerId: manager.id } : { profileId: personalProfile.id, managerType: 'community_manager' }),
          displayName: personalProfile.display_name,
          headline: managerForm.headline,
          bio: managerForm.bio,
          email: managerForm.email,
          websiteUrl: managerForm.websiteUrl,
          visibility: 'public',
          openToCampaigns: managerForm.openToCampaigns,
        }),
      });
      setMessage(manager ? 'Community Manager portfolio updated.' : 'Community Manager portfolio created. You can now add communities.');
      await load();
    } catch (error) {
      setMessage(friendly(error, 'Community Manager portfolio could not be saved.'));
    } finally {
      setBusy('');
    }
  }

  async function saveCommunity(event: React.FormEvent) {
    event.preventDefault();
    if (!manager) return;
    const token = csrf();
    if (!token) return;
    const audience = draft.audienceSize.trim() ? Number(draft.audienceSize) : 0;
    setBusy('community');
    setMessage('');
    try {
      await api('/api/partner-manager-assets', {
        method: 'POST',
        headers: { 'x-csrf-token': token },
        body: JSON.stringify({
          managerId: manager.id,
          ...(draft.assetId ? { assetId: draft.assetId } : {}),
          name: draft.name,
          handle: draft.handle,
          url: draft.url,
          audienceSize: audience,
          notes: draft.notes,
        }),
      });
      setDraft(emptyCommunity());
      setMessage(draft.assetId ? 'Community updated. Your public Community Portfolio will reflect the change automatically.' : 'Community added. It will appear automatically on your public Linkary profile.');
      await load();
    } catch (error) {
      setMessage(friendly(error, 'Community could not be saved.'));
    } finally {
      setBusy('');
    }
  }

  function editCommunity(asset: CommunityAsset) {
    setDraft({
      assetId: asset.id,
      name: asset.name,
      handle: asset.handle || '',
      url: asset.url || '',
      audienceSize: String(asset.audience_size || ''),
      notes: asset.notes || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function removeCommunity(asset: CommunityAsset) {
    if (!manager || !window.confirm(`Remove ${asset.name} from your Community Portfolio?`)) return;
    const token = csrf();
    if (!token) return;
    setBusy(`remove:${asset.id}`);
    try {
      await api('/api/partner-manager-assets', {
        method: 'POST',
        headers: { 'x-csrf-token': token },
        body: JSON.stringify({ managerId: manager.id, assetId: asset.id, remove: true }),
      });
      setMessage('Community removed. It will also disappear from your automatic public Community Portfolio.');
      await load();
    } catch (error) {
      setMessage(friendly(error, 'Community could not be removed.'));
    } finally {
      setBusy('');
    }
  }

  if (!profile) return null;

  const telegramLabel = telegramIdentity?.current_handle
    ? `@${telegramIdentity.current_handle.replace(/^@/, '')}`
    : telegramIdentity?.current_display_name || 'Verified Telegram account';

  return (
    <ProductWorkspace me={me} status={status} profile={profile} onProfileChange={changeProfile}>
      <section className="community-manager-page">
        <header className="community-manager-hero">
          <div className="community-manager-intro">
            <span className="ops-kicker">COMMUNITY PORTFOLIO</span>
            <h1>Communities</h1>
            <p>List every Telegram community you manage. Your portfolio appears on your public Linkary profile and stays in sync with the communities you manage here.</p>
          </div>
          <div className="community-manager-stats" aria-label="Community portfolio summary">
            <article><span>COMMUNITIES</span><strong>{loading ? '—' : assets.length}</strong></article>
            <article><span>COMBINED AUDIENCE</span><strong>{loading ? '—' : compact(combinedAudience)}</strong></article>
            <article><span>PORTFOLIO STATUS</span><strong className={`community-summary-status status-${manager?.verification_status || 'unverified'}`}>{loading ? 'Loading' : manager ? verificationLabel(manager.verification_status) : 'Setup needed'}</strong></article>
          </div>
        </header>

        {message && <div className="ops-banner" role="status">{message}</div>}
        {loading ? <div className="ops-empty">Loading your Community Portfolio…</div> : !personalProfile ? (
          <div className="ops-empty"><strong>Create a Personal Profile first</strong><p>Your Personal Profile owns your Community Manager portfolio. Project workspaces cannot own it directly.</p></div>
        ) : (
          <>
            <section className={`community-telegram-card ${telegramIdentity ? 'is-connected' : 'is-unverified'}`} aria-label="Personal Telegram identity">
              <span className="community-telegram-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m21 3-7.5 18-3.7-7.1L3 10.2 21 3Z"/><path d="m9.8 13.9 4.4-4.4"/></svg></span>
              <div className="community-telegram-copy">
                <div className="community-telegram-heading"><span className="community-section-eyebrow">{telegramIdentity ? 'PERSONAL TELEGRAM ACCOUNT' : 'TELEGRAM IDENTITY'}</span><span className={`community-status ${telegramIdentity ? 'status-verified' : 'status-unverified'}`}>{telegramIdentity ? 'Connected' : 'Not connected'}</span></div>
                <h2>{telegramIdentity ? <>Connected as <code>{telegramLabel}</code></> : 'Connect your personal Telegram account'}</h2>
                <p>{telegramIdentity ? "Your personal Telegram identity is verified. Telegram's stable account ID stays private and is used by Linkary as the canonical identity key. This does not verify ownership of an individual Community." : 'You can create your portfolio and list Communities without connecting Telegram. Personal identity verification is separate from verification of the Communities you manage.'}</p>
              </div>
              {telegramIdentity ? <button type="button" className="ops-button secondary community-telegram-action" disabled={busy === 'telegram-disconnect'} onClick={() => void disconnectTelegram()}>{busy === 'telegram-disconnect' ? 'Disconnecting…' : 'Disconnect Telegram'}</button> : <button type="button" className="ops-button secondary community-telegram-action" onClick={connectTelegram}>Connect in Profile</button>}
            </section>

            <section className="community-manager-grid" aria-label="Community portfolio forms">
              <form className="ops-card community-manager-form community-manager-profile-form" onSubmit={saveManager}>
                <div className="community-form-heading"><div><span className="community-section-eyebrow">MANAGER PROFILE</span><h2>{manager ? 'Manager Profile' : 'Create your Manager Profile'}</h2><p>Your public portfolio representation shown to Projects.</p></div>{manager && <span className={`community-status status-${manager.verification_status}`}>{verificationLabel(manager.verification_status)}</span>}</div>
                <label>Headline<input value={managerForm.headline} onChange={(event) => setManagerForm((value) => ({ ...value, headline: event.target.value }))} maxLength={160} placeholder="Telegram Community Manager" /></label>
                <label>About<textarea value={managerForm.bio} onChange={(event) => setManagerForm((value) => ({ ...value, bio: event.target.value }))} maxLength={800} rows={4} placeholder="What kinds of communities do you manage, and what projects are a good fit?" /></label>
                <div className="community-manager-contact-grid">
                  <label>Contact email<input value={managerForm.email} onChange={(event) => setManagerForm((value) => ({ ...value, email: event.target.value }))} placeholder="you@example.com" type="email" /></label>
                  <label>Website or media kit<input value={managerForm.websiteUrl} onChange={(event) => setManagerForm((value) => ({ ...value, websiteUrl: event.target.value }))} placeholder="https://…" /></label>
                </div>
                <label className="community-check"><input type="checkbox" checked={managerForm.openToCampaigns} onChange={(event) => setManagerForm((value) => ({ ...value, openToCampaigns: event.target.checked }))} /><span>Open to campaign opportunities from Projects</span></label>
                <div className="community-form-footer"><span>{telegramIdentity ? `Personal identity: ${telegramLabel}` : 'Personal Telegram verification is optional.'}</span><button className="ops-primary" disabled={busy === 'manager'}>{busy === 'manager' ? 'Saving…' : manager ? 'Save manager profile' : 'Create Community Portfolio'}</button></div>
              </form>

              <form className={`ops-card community-manager-form community-add-form ${!manager ? 'is-disabled' : ''}`} onSubmit={saveCommunity}>
                <div className="community-form-heading"><div><span className="community-section-eyebrow">TELEGRAM COMMUNITY</span><h2>{draft.assetId ? 'Edit Community' : 'Add a Community'}</h2><p>List a Telegram community you actively manage or moderate.</p></div></div>
                {!manager && <p className="community-help">Create your Community Manager profile first.</p>}
                <fieldset disabled={!manager || busy === 'community'}>
                  <label>Community name<input required value={draft.name} onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))} placeholder="Example Alpha Community" /></label>
                  <div className="community-manager-two">
                    <label>Telegram handle<input value={draft.handle} onChange={(event) => setDraft((value) => ({ ...value, handle: event.target.value }))} placeholder="@community" /></label>
                    <label>Audience size<input type="number" min="0" value={draft.audienceSize} onChange={(event) => setDraft((value) => ({ ...value, audienceSize: event.target.value }))} placeholder="25000" /></label>
                  </div>
                  <label>Telegram URL<input required value={draft.url} onChange={(event) => setDraft((value) => ({ ...value, url: event.target.value }))} placeholder="https://t.me/community" /></label>
                  <label>Role and internal notes<textarea value={draft.notes} onChange={(event) => setDraft((value) => ({ ...value, notes: event.target.value }))} rows={3} maxLength={500} placeholder="Describe your role, language, regions, category, posting format, and audience…" /></label>
                  <div className="community-form-footer"><span>LinkaryTrackerBot is optional.</span><div className="community-actions"><button className="ops-primary">{busy === 'community' ? 'Saving…' : draft.assetId ? 'Update community' : 'Add community'}</button>{draft.assetId && <button type="button" className="ops-secondary" onClick={() => setDraft(emptyCommunity())}>Cancel</button>}</div></div>
                </fieldset>
              </form>
            </section>

            <section className="community-managed-section" aria-labelledby="community-managed-title">
              <div className="community-managed-heading"><div><span className="community-section-eyebrow">YOUR LINKARY PORTFOLIO</span><h2 id="community-managed-title">Managed Communities <span>({assets.length})</span></h2><p>These Communities appear on your public Linkary profile and can be discovered by Projects.</p></div><span className="community-managed-total">{compact(combinedAudience)} total audience</span></div>
              {!assets.length ? <div className="community-managed-empty"><span className="community-empty-icon" aria-hidden="true">◎</span><strong>No communities listed yet</strong><p>Add the Telegram communities you manage. Your public Community Portfolio will update automatically.</p></div> : (
                <div className="community-card-grid">
                  {assets.map((asset) => (
                    <article className="community-portfolio-card" key={asset.id}>
                      <div className="community-portfolio-card-head"><span className="community-avatar" aria-hidden="true">{asset.name.slice(0, 2).toUpperCase()}</span><span className={`community-status status-${asset.verification_status}`}>{verificationLabel(asset.verification_status)}</span></div>
                      <div className="community-portfolio-identity"><h3>{asset.name}</h3><span>{asset.handle ? `@${asset.handle.replace(/^@/, '')}` : 'Telegram community'}</span></div>
                      <div className="community-audience-pill"><span aria-hidden="true">♧</span><strong>{compact(asset.audience_size)}</strong><span>members</span></div>
                      {asset.notes ? <p className="community-portfolio-notes">{asset.notes}</p> : <p className="community-portfolio-notes community-no-notes">No community notes added.</p>}
                      <CommunityVerificationPanel asset={asset} onChanged={load} />
                      <div className="community-portfolio-actions">
                        {asset.url && <a href={asset.url} target="_blank" rel="noreferrer">Open community ↗</a>}
                        <button type="button" onClick={() => editCommunity(asset)}>Edit</button>
                        <button type="button" disabled={busy === `remove:${asset.id}`} onClick={() => void removeCommunity(asset)}>{busy === `remove:${asset.id}` ? 'Removing…' : 'Remove'}</button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
              <div className="community-verification-guide">
                <span className="community-guide-icon" aria-hidden="true">✓</span>
                <div><strong>About Community status and verification</strong><p><b>Listed</b> means you supplied the Community details; it can appear on your public portfolio. <b>Verified</b> means Linkary separately reviewed public proof that you manage that exact Community. Verifying your personal Telegram identity does not automatically verify Community ownership.</p><p>LinkaryTrackerBot is optional. It may later provide stronger campaign, join, leave, and retention evidence; it is not required to list or verify a Community.</p></div>
              </div>
            </section>
          </>
        )}
      </section>
    </ProductWorkspace>
  );
}
