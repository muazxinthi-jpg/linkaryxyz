import { useEffect, useMemo, useState } from 'react';
import './profile-social-connections.css';

type SocialBlock = {
  id: string;
  type: string;
  title: string | null;
  url: string | null;
  enabled: boolean;
  config: { socialPlatform?: string };
};

type Platform = {
  key: string;
  label: string;
  icon: string;
  placeholder: string;
  hosts: string[];
};

const PLATFORMS: Platform[] = [
  { key: 'instagram', label: 'Instagram', icon: '/assets/social/instagram.svg', placeholder: 'https://instagram.com/username', hosts: ['instagram.com'] },
  { key: 'tiktok', label: 'TikTok', icon: '/assets/social/tiktok.svg', placeholder: 'https://tiktok.com/@username', hosts: ['tiktok.com'] },
  { key: 'youtube', label: 'YouTube', icon: '/assets/social/youtube.svg', placeholder: 'https://youtube.com/@channel', hosts: ['youtube.com', 'youtu.be'] },
  { key: 'facebook', label: 'Facebook', icon: '/assets/social/facebook.svg', placeholder: 'https://facebook.com/username', hosts: ['facebook.com', 'fb.com'] },
  { key: 'linkedin', label: 'LinkedIn', icon: '/assets/social/linkedin.svg', placeholder: 'https://linkedin.com/in/username', hosts: ['linkedin.com'] },
  { key: 'github', label: 'GitHub', icon: '/assets/social/github.svg', placeholder: 'https://github.com/username', hosts: ['github.com'] },
  { key: 'reddit', label: 'Reddit', icon: '/assets/social/reddit.svg', placeholder: 'https://reddit.com/user/username', hosts: ['reddit.com'] },
  { key: 'farcaster', label: 'Farcaster', icon: '/assets/social/farcaster.svg', placeholder: 'https://warpcast.com/username', hosts: ['warpcast.com'] },
];

function csrfToken(): string {
  const match = document.cookie.split('; ').find((part) => part.startsWith('__Host-linkary_csrf='));
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : '';
}

function socialKey(block: SocialBlock): string {
  const saved = block.config?.socialPlatform?.toLowerCase().trim();
  if (saved) return saved;
  const value = `${block.title || ''} ${block.url || ''}`.toLowerCase();
  for (const platform of PLATFORMS) {
    if (platform.hosts.some((host) => value.includes(host))) return platform.key;
  }
  return '';
}

function normalizeSocialUrl(platform: Platform, raw: string): string {
  const value = raw.trim();
  if (!value) throw new Error(`Enter your ${platform.label} profile URL.`);
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(`Enter a valid ${platform.label} URL.`); }
  if (url.protocol !== 'https:') throw new Error(`${platform.label} must use a secure HTTPS URL.`);
  const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
  const allowed = platform.hosts.some((candidate) => host === candidate || host.endsWith(`.${candidate}`));
  if (!allowed) throw new Error(`Use an official ${platform.label} profile URL.`);
  url.hash = '';
  return url.toString();
}

export default function ProfileSocialConnections({ profileId, onChanged }: { profileId: string; onChanged?: () => void }) {
  const [blocks, setBlocks] = useState<SocialBlock[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!profileId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/profiles/${encodeURIComponent(profileId)}/blocks`, { credentials: 'same-origin' });
      if (!response.ok) throw new Error();
      const result = await response.json() as { blocks: SocialBlock[] };
      setBlocks(result.blocks || []);
      setDrafts(Object.fromEntries(PLATFORMS.map((platform) => {
        const block = (result.blocks || []).find((item) => socialKey(item) === platform.key && item.enabled);
        return [platform.key, block?.url || ''];
      })));
    } catch {
      setMessage('Social connections could not be loaded. Refresh and try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [profileId]);

  const connected = useMemo(() => new Map(PLATFORMS.map((platform) => [platform.key, blocks.find((block) => socialKey(block) === platform.key && block.enabled)])), [blocks]);
  const connectedCount = useMemo(() => Array.from(connected.values()).filter(Boolean).length, [connected]);

  async function save(platform: Platform) {
    const token = csrfToken();
    if (!token) { setMessage('Refresh your session before changing social connections.'); return; }
    let url: string;
    try { url = normalizeSocialUrl(platform, drafts[platform.key] || ''); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Enter a valid social profile URL.'); return; }
    const existing = connected.get(platform.key);
    setBusy(platform.key); setMessage('');
    try {
      const path = existing
        ? `/api/profiles/${encodeURIComponent(profileId)}/blocks/${encodeURIComponent(existing.id)}`
        : `/api/profiles/${encodeURIComponent(profileId)}/blocks`;
      const response = await fetch(path, {
        method: existing ? 'PATCH' : 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-csrf-token': token },
        body: JSON.stringify(existing
          ? { title: platform.label, url, enabled: true, config: { ...existing.config, socialPlatform: platform.key } }
          : { type: 'social_link', title: platform.label, url, config: { socialPlatform: platform.key } }),
      });
      const result = await response.json().catch(() => ({})) as { message?: string };
      if (!response.ok) throw new Error(result.message || `${platform.label} could not be connected.`);
      setEditing(null);
      setMessage(`${platform.label} connected to your public profile.`);
      await load();
      onChanged?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `${platform.label} could not be connected.`);
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(platform: Platform) {
    const block = connected.get(platform.key);
    if (!block) return;
    const token = csrfToken();
    if (!token) { setMessage('Refresh your session before changing social connections.'); return; }
    if (!window.confirm(`Disconnect ${platform.label} from this public profile? Existing historical click evidence is preserved.`)) return;
    setBusy(platform.key); setMessage('');
    try {
      const response = await fetch(`/api/profiles/${encodeURIComponent(profileId)}/blocks/${encodeURIComponent(block.id)}`, {
        method: 'DELETE', credentials: 'same-origin', headers: { 'x-csrf-token': token },
      });
      if (!response.ok) throw new Error(`${platform.label} could not be disconnected.`);
      setDrafts((current) => ({ ...current, [platform.key]: '' }));
      setEditing(null);
      setMessage(`${platform.label} disconnected. Historical click evidence was preserved.`);
      await load();
      onChanged?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `${platform.label} could not be disconnected.`);
    } finally {
      setBusy(null);
    }
  }

  return <section className="wide profile-social-connections" data-profile-social-connections>
    <div className="psc-heading">
      <div><strong>Social connections</strong><small>Connect the public channels you want people to discover from your Linkary profile.</small></div>
      <span>{connectedCount ? `${connectedCount} connected` : 'Profile links'}</span>
    </div>
    <p className="psc-boundary">These connections publish a validated profile link and enable Linkary outbound-click measurement. They are not provider verification. X and Telegram use their separate identity connection flows.</p>
    <div className="psc-grid">
      {PLATFORMS.map((platform) => {
        const block = connected.get(platform.key);
        const isEditing = editing === platform.key || !block;
        return <article key={platform.key} className={block ? 'connected' : ''}>
          <div className="psc-platform">
            <img src={platform.icon} alt="" aria-hidden="true" />
            <div><strong>{platform.label}</strong><small>{block ? 'Connected profile' : 'Not connected'}</small></div>
            <span>{block ? 'Connected ✓' : 'Add'}</span>
          </div>
          {isEditing ? <div className="psc-editor">
            <label><span>{platform.label} profile URL</span><input type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" placeholder={platform.placeholder} value={drafts[platform.key] || ''} onChange={(event) => setDrafts((current) => ({ ...current, [platform.key]: event.target.value }))} /></label>
            <div><button type="button" className="ops-button primary" disabled={loading || busy !== null} onClick={() => void save(platform)}>{busy === platform.key ? 'Saving...' : block ? 'Save' : 'Connect'}</button>{block && <button type="button" className="ops-button ghost" disabled={busy !== null} onClick={() => { setEditing(null); setDrafts((current) => ({ ...current, [platform.key]: block.url || '' })); }}>Cancel</button>}</div>
          </div> : <div className="psc-connected-row"><a href={block?.url || '#'} target="_blank" rel="noopener noreferrer">{block?.url}</a><div><button type="button" onClick={() => setEditing(platform.key)}>Edit</button><button type="button" className="danger" disabled={busy !== null} onClick={() => void disconnect(platform)}>Disconnect</button></div></div>}
        </article>;
      })}
    </div>
    {message && <div className="psc-message" role="status">{message}</div>}
  </section>;
}
