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
        <header className="ops-page-header community-manager-hero">
          <div>
            <span className="ops-kicker">COMMUNITY PORTFOLIO</span>
            <h1>Communities</h1>
            <p>List every Telegram community you manage. Your Community Portfolio is automatically published on your public Linkary profile and stays in sync with the communities you manage here.</p>
          </div>
          {manager && <div className="community-manager-stats"><strong>{assets.length}</strong><span>communities</span><strong>{compact(combinedAudience)}</strong><span>combined audience</span></div>}
        </header>

        {message && <div className="ops-banner">{message}</div>}
        {loading ? <div className="ops-empty">Loading your Community Portfolio…</div> : !personalProfile ? (
          <div className="ops-empty"><strong>Create a Personal Profile first</strong><p>Your Personal Profile owns your Community Manager portfolio. Project workspaces cannot own it directly.</p></div>
        ) : (
          <>
            {telegramIdentity ? (
              <section className="ops-card community-list-card">
                <div className="ops-card-title"><div><span>TELEGRAM ACCOUNT</span><h2>{telegramLabel}</h2></div><span className="community-status status-verified">Connected ✓</span></div>
                <p>Your personal Telegram identity is verified. Telegram's stable account ID is kept private and is used by Linkary as the canonical identity key.</p>
              </section>
            ) : (
              <section className="ops-card community-list-card">
                <div className="ops-card-title"><div><span>TELEGRAM IDENTITY</span><h2>Personal Telegram not verified</h2></div><span className="community-status status-unverified">Optional for Beta</span></div>
                <p>You can create your Community Manager profile, list Telegram communities and submit exact Community ownership proof without connecting your personal Telegram account. Linkary will not show a verified personal Telegram identity badge until this connection succeeds.</p>
                <div className="community-actions">
                  <button type="button" className="ops-button primary" disabled={busy === 'telegram-link' || busy === 'telegram-sync'} onClick={() => void connectTelegram()}>
                    {busy === 'telegram-link' || busy === 'telegram-sync' ? 'Connecting Telegram…' : 'Connect Telegram in Personal Profile'}
                  </button>
                </div>
                <div className="community-verification-note"><strong>Evidence stays separate</strong><span>Personal Telegram verification and exact Community verification are independent. A Community only becomes Verified after Linkary reviews Community-specific public management proof.</span></div>
                <div className="community-verification-note"><strong>LinkaryTrackerBot is optional</strong><span>You do not need to install LinkaryTrackerBot to create or verify a Community. The bot can later provide stronger campaign, join, leave and retention evidence.</span></div>
              </section>
            )}

            <section className="community-manager-grid">
              <form className="ops-card community-manager-form" onSubmit={saveManager}>
                <div className="ops-card-title"><div><span>MANAGER PROFILE</span><h2>{manager ? 'Community Manager details' : 'Create your Community Portfolio'}</h2></div>{manager && <span className={`community-status status-${manager.verification_status}`}>{verificationLabel(manager.verification_status)}</span>}</div>
                <label>Headline<input value={managerForm.headline} onChange={(event) => setManagerForm((value) => ({ ...value, headline: event.target.value }))} maxLength={160} placeholder="Telegram Community Manager" /></label>
                <label>About<textarea value={managerForm.bio} onChange={(event) => setManagerForm((value) => ({ ...value, bio: event.target.value }))} maxLength={800} rows={4} placeholder="What kinds of communities do you manage, and what projects are a good fit?" /></label>
                <div className="community-verification-note"><strong>Telegram identity</strong><span>{telegramIdentity ? `${telegramLabel} is your verified personal Telegram identity.` : 'Not verified yet. Your Community Portfolio can still be created, and each Community can be verified separately with public proof.'}</span></div>
                <label>Email<input value={managerForm.email} onChange={(event) => setManagerForm((value) => ({ ...value, email: event.target.value }))} placeholder="you@example.com" type="email" /></label>
                <label>Website or media kit<input value={managerForm.websiteUrl} onChange={(event) => setManagerForm((value) => ({ ...value, websiteUrl: event.target.value }))} placeholder="https://…" /></label>
                <label className="community-check"><input type="checkbox" checked={managerForm.openToCampaigns} onChange={(event) => setManagerForm((value) => ({ ...value, openToCampaigns: event.target.checked }))} /><span>Open to campaign opportunities from Projects</span></label>
                <button className="ops-primary" disabled={busy === 'manager'}>{busy === 'manager' ? 'Saving…' : manager ? 'Save manager profile' : 'Create Community Portfolio'}</button>
              </form>

              <form className={`ops-card community-manager-form ${!manager ? 'is-disabled' : ''}`} onSubmit={saveCommunity}>
                <div className="ops-card-title"><div><span>TELEGRAM COMMUNITY</span><h2>{draft.assetId ? 'Edit community' : 'Add a community'}</h2></div></div>
                {!manager && <p className="community-help">Create your Community Manager profile first.</p>}
                <fieldset disabled={!manager || busy === 'community'}>
                  <label>Community name<input required value={draft.name} onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))} placeholder="Example Alpha Community" /></label>
                  <div className="community-manager-two">
                    <label>Telegram handle<input value={draft.handle} onChange={(event) => setDraft((value) => ({ ...value, handle: event.target.value }))} placeholder="@community" /></label>
                    <label>Audience size<input type="number" min="0" value={draft.audienceSize} onChange={(event) => setDraft((value) => ({ ...value, audienceSize: event.target.value }))} placeholder="25000" /></label>
                  </div>
                  <label>Telegram URL<input required value={draft.url} onChange={(event) => setDraft((value) => ({ ...value, url: event.target.value }))} placeholder="https://t.me/community" /></label>
                  <label>Notes<textarea value={draft.notes} onChange={(event) => setDraft((value) => ({ ...value, notes: event.target.value }))} rows={3} maxLength={500} placeholder="Main language, regions, category, posting format, audience notes…" /></label>
                  <div className="community-actions"><button className="ops-primary">{busy === 'community' ? 'Saving…' : draft.assetId ? 'Update community' : 'Add community'}</button>{draft.assetId && <button type="button" className="ops-secondary" onClick={() => setDraft(emptyCommunity())}>Cancel</button>}</div>
                </fieldset>
              </form>
            </section>

            <section className="ops-card community-list-card">
              <div className="ops-card-title"><div><span>MANAGED COMMUNITIES</span><h2>Your portfolio</h2></div><small>{assets.length ? 'Automatically shown on your public Linkary profile' : 'Add your first Telegram community'}</small></div>
              {!assets.length ? <div className="ops-empty"><strong>No communities listed yet</strong><p>Add the communities you manage. They will appear automatically on your public Linkary profile and can be discovered by Projects.</p></div> : (
                <div className="community-list">
                  {assets.map((asset) => (
                    <article className="community-row" key={asset.id}>
                      <div className="community-avatar">{asset.name.slice(0, 2).toUpperCase()}</div>
                      <div className="community-main"><div><strong>{asset.name}</strong><span className={`community-status status-${asset.verification_status}`}>{verificationLabel(asset.verification_status)}</span></div><small>{asset.handle ? `@${asset.handle.replace(/^@/, '')}` : 'Telegram community'} · {compact(asset.audience_size)} audience</small>{asset.notes && <p>{asset.notes}</p>}<CommunityVerificationPanel asset={asset} onChanged={load} /></div>
                      <div className="community-row-actions">
                        {asset.url && <a href={asset.url} target="_blank" rel="noreferrer">Open ↗</a>}
                        <button type="button" onClick={() => editCommunity(asset)}>Edit</button>
                        <button type="button" disabled={busy === `remove:${asset.id}`} onClick={() => void removeCommunity(asset)}>Remove</button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
              <div className="community-verification-note"><strong>Public profile</strong><span>Your listed communities appear automatically on your public Linkary profile. Update or remove them here and the public Community Portfolio follows the same source of truth.</span></div>
              <div className="community-verification-note"><strong>Community verification</strong><span>Listed means the Personal Profile owner supplied this community. Verified means Linkary separately reviewed public Telegram proof showing that person manages the exact Community. Personal Telegram verification is a separate badge and is not required for Community ownership review. LinkaryTrackerBot remains optional and can later add stronger automated evidence.</span></div>
            </section>
          </>
        )}
      </section>
    </ProductWorkspace>
  );
}
