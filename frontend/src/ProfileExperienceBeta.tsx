import { useEffect, useMemo, useState } from 'react';
import { ProductWorkspace, type ProductMe, type ProductProfile, type ProductStatus } from './ProductWorkspace';
import './profile-beta.css';

type ProfileData = {
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  visibility: string;
};

type BlockConfig = { mediaUrl?: string; role?: string; avatarUrl?: string };
type Block = {
  id: string;
  type: string;
  title: string | null;
  url: string | null;
  enabled: boolean;
  config: BlockConfig;
};

type BlockDraft = {
  type: string;
  title: string;
  url: string;
  mediaUrl: string;
  role: string;
  avatarUrl: string;
};

class ApiError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string } & T;
  if (!response.ok) throw new ApiError(payload.error || 'request_failed', payload.message || 'Request failed');
  return payload;
}

function cookie(name: string): string | null {
  const match = document.cookie.split('; ').find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function safeError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  if (error.code === 'verification_required') return 'Verify the X identity for this profile before publishing.';
  if (error.code === 'forbidden') return 'Your current role cannot edit this profile.';
  if (error.code === 'invalid_url') return 'Enter a valid HTTPS image or destination URL.';
  return fallback;
}

function safeHttps(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function blockLabel(type: string): string {
  const labels: Record<string, string> = {
    link: 'Link',
    social_link: 'Social',
    featured_video: 'Featured video',
    featured_article: 'Featured article',
    featured_image: 'Featured work',
    media_kit: 'Media kit',
    work_with_me: 'Work with me',
    project_card: 'Project',
    community_card: 'Community',
    team_member: 'Team member',
    heading: 'Section heading',
  };
  return labels[type] || type.replace(/_/g, ' ');
}

function emptyDraft(): BlockDraft {
  return { type: 'link', title: '', url: '', mediaUrl: '', role: 'Team member', avatarUrl: '' };
}

function isSocialBlock(block: Block): boolean {
  const value = `${block.type} ${block.title || ''} ${block.url || ''}`.toLowerCase();
  return block.type === 'social_link' || ['x.com/', 'twitter.com/', 't.me/', 'linkedin.com/', 'instagram.com/', 'tiktok.com/', 'youtube.com/'].some((part) => value.includes(part));
}

function iconFor(block: Block): string {
  const key = `${block.type} ${block.title || ''} ${block.url || ''}`.toLowerCase();
  if (block.type === 'work_with_me') return '✦';
  if (block.type === 'media_kit') return '▣';
  if (block.type === 'project_card') return '◫';
  if (block.type === 'community_card') return '◎';
  if (block.type === 'team_member') return '●';
  if (key.includes('x.com') || key.includes('twitter') || key === 'x') return '𝕏';
  if (key.includes('telegram')) return 'T';
  if (key.includes('linkedin')) return 'in';
  if (key.includes('youtube')) return '▶';
  return '↗';
}

export default function ProfileExperienceBeta({ me, status }: { me: ProductMe; status: ProductStatus }) {
  const creatorFirst = status.profiles.find((item) => item.profile_type === 'creator') || status.profiles[0];
  const saved = window.localStorage.getItem('linkary.active.profile');
  const [profileId, setProfileId] = useState(saved && status.profiles.some((item) => item.id === saved) ? saved : creatorFirst?.id || '');
  const profile = status.profiles.find((item) => item.id === profileId) || creatorFirst;

  const [data, setData] = useState<ProfileData>({ displayName: '', bio: '', avatarUrl: '', seoTitle: '', seoDescription: '', visibility: 'private' });
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [clicks, setClicks] = useState(0);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const [showSeo, setShowSeo] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState<Block | null>(null);
  const [draft, setDraft] = useState<BlockDraft>(emptyDraft());
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);

  function changeProfile(id: string) {
    setProfileId(id);
    window.localStorage.setItem('linkary.active.profile', id);
  }

  async function load() {
    if (!profile) return;
    setMessage('');
    try {
      const [profileResult, blockResult, analyticsResult] = await Promise.all([
        apiJson<{ profile: ProfileData }>(`/api/profiles/${encodeURIComponent(profile.id)}`),
        apiJson<{ blocks: Block[] }>(`/api/profiles/${encodeURIComponent(profile.id)}/blocks`),
        apiJson<{ linkClicks: number }>(`/api/profiles/${encodeURIComponent(profile.id)}/analytics`).catch(() => ({ linkClicks: 0 })),
      ]);
      setData({
        ...profileResult.profile,
        bio: profileResult.profile.bio || '',
        avatarUrl: profileResult.profile.avatarUrl || '',
        seoTitle: profileResult.profile.seoTitle || '',
        seoDescription: profileResult.profile.seoDescription || '',
      });
      setAvatarFailed(false);
      setBlocks(blockResult.blocks);
      setClicks(analyticsResult.linkClicks || 0);
    } catch {
      setMessage('Profile settings are temporarily unavailable. Please try again shortly.');
    }
  }

  useEffect(() => { void load(); }, [profileId]);

  async function saveProfile() {
    if (!profile) return;
    const token = cookie('__Host-linkary_csrf');
    if (!token) return;
    setBusy('profile');
    setMessage('');
    try {
      await apiJson(`/api/profiles/${encodeURIComponent(profile.id)}`, {
        method: 'PATCH',
        headers: { 'x-csrf-token': token },
        body: JSON.stringify({
          displayName: data.displayName,
          bio: data.bio,
          avatarUrl: data.avatarUrl || '',
          seoTitle: data.seoTitle,
          seoDescription: data.seoDescription,
        }),
      });
      setMessage('Profile saved.');
      await load();
    } catch (error) {
      setMessage(safeError(error, 'The profile could not be saved.'));
    } finally {
      setBusy('');
    }
  }

  async function publish() {
    if (!profile) return;
    const token = cookie('__Host-linkary_csrf');
    if (!token) return;
    setBusy('publish');
    setMessage('');
    try {
      const action = data.visibility === 'published' ? 'unpublish' : 'publish';
      await apiJson(`/api/profiles/${encodeURIComponent(profile.id)}/${action}`, { method: 'POST', headers: { 'x-csrf-token': token } });
      setMessage(data.visibility === 'published' ? 'Profile moved to draft.' : 'Profile published.');
      await load();
    } catch (error) {
      setMessage(safeError(error, 'The profile visibility could not be changed.'));
    } finally {
      setBusy('');
    }
  }

  function openNew(type = 'link') {
    setEditing(null);
    setDraft({ ...emptyDraft(), type });
    setShowEditor(true);
  }

  function openEdit(block: Block) {
    setEditing(block);
    setDraft({
      type: block.type,
      title: block.title || '',
      url: block.url || '',
      mediaUrl: block.config?.mediaUrl || '',
      role: block.config?.role || 'Team member',
      avatarUrl: block.config?.avatarUrl || '',
    });
    setShowEditor(true);
  }

  function closeEditor() {
    setShowEditor(false);
    setEditing(null);
    setDraft(emptyDraft());
  }

  function configForDraft(): BlockConfig {
    return {
      ...(draft.mediaUrl ? { mediaUrl: draft.mediaUrl } : {}),
      ...(draft.type === 'team_member' ? { role: draft.role, ...(draft.avatarUrl ? { avatarUrl: draft.avatarUrl } : {}) } : {}),
    };
  }

  async function saveBlock(event: React.FormEvent) {
    event.preventDefault();
    if (!profile) return;
    const token = cookie('__Host-linkary_csrf');
    if (!token) return;
    setBusy('block');
    setMessage('');
    try {
      const noUrl = draft.type === 'heading';
      if (editing) {
        await apiJson(`/api/profiles/${encodeURIComponent(profile.id)}/blocks/${encodeURIComponent(editing.id)}`, {
          method: 'PATCH',
          headers: { 'x-csrf-token': token },
          body: JSON.stringify({ title: draft.title, url: noUrl ? '' : draft.url, config: configForDraft() }),
        });
      } else {
        await apiJson(`/api/profiles/${encodeURIComponent(profile.id)}/blocks`, {
          method: 'POST',
          headers: { 'x-csrf-token': token },
          body: JSON.stringify({ type: draft.type, title: draft.title, url: noUrl ? '' : draft.url, config: configForDraft() }),
        });
      }
      closeEditor();
      setMessage(editing ? 'Profile item updated.' : 'Profile item added.');
      await load();
    } catch (error) {
      setMessage(safeError(error, 'This profile item could not be saved.'));
    } finally {
      setBusy('');
    }
  }

  async function setBlockEnabled(block: Block) {
    if (!profile) return;
    const token = cookie('__Host-linkary_csrf');
    if (!token) return;
    try {
      await apiJson(`/api/profiles/${encodeURIComponent(profile.id)}/blocks/${encodeURIComponent(block.id)}`, {
        method: 'PATCH',
        headers: { 'x-csrf-token': token },
        body: JSON.stringify({ enabled: !block.enabled }),
      });
      await load();
    } catch {
      setMessage('This profile item could not be updated.');
    }
  }

  async function removeBlock(block: Block) {
    if (!profile || !window.confirm(`Remove ${block.title || 'this item'} from the profile?`)) return;
    const token = cookie('__Host-linkary_csrf');
    if (!token) return;
    const response = await fetch(`/api/profiles/${encodeURIComponent(profile.id)}/blocks/${encodeURIComponent(block.id)}`, {
      method: 'DELETE', headers: { 'x-csrf-token': token }, credentials: 'same-origin',
    });
    if (!response.ok) { setMessage('This profile item could not be removed.'); return; }
    await load();
  }

  async function persistOrder(ordered: Block[]) {
    if (!profile) return;
    const token = cookie('__Host-linkary_csrf');
    if (!token) return;
    setBlocks(ordered);
    try {
      await apiJson(`/api/profiles/${encodeURIComponent(profile.id)}/blocks-reorder`, {
        method: 'POST',
        headers: { 'x-csrf-token': token },
        body: JSON.stringify({ blockIds: ordered.map((block) => block.id) }),
      });
    } catch {
      setMessage('The profile order could not be updated.');
      await load();
    }
  }

  function moveBlock(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= blocks.length) return;
    const ordered = [...blocks];
    [ordered[index], ordered[nextIndex]] = [ordered[nextIndex], ordered[index]];
    void persistOrder(ordered);
  }

  function dropOn(targetId: string) {
    if (!draggedId || draggedId === targetId) { setDraggedId(null); return; }
    const sourceIndex = blocks.findIndex((block) => block.id === draggedId);
    const targetIndex = blocks.findIndex((block) => block.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) { setDraggedId(null); return; }
    const ordered = [...blocks];
    const [moved] = ordered.splice(sourceIndex, 1);
    ordered.splice(targetIndex, 0, moved);
    setDraggedId(null);
    void persistOrder(ordered);
  }

  const completion = useMemo(() => {
    if (!profile) return [] as Array<{ label: string; done: boolean }>;
    const enabled = blocks.filter((block) => block.enabled);
    const social = enabled.some(isSocialBlock);
    const showcase = enabled.some((block) => ['featured_video', 'featured_article', 'featured_image', 'project_card', 'community_card'].includes(block.type));
    const conversion = profile.profile_type === 'creator'
      ? enabled.some((block) => ['work_with_me', 'media_kit'].includes(block.type))
      : enabled.some((block) => block.type === 'team_member' || block.type === 'work_with_me');
    return [
      { label: 'Profile image', done: Boolean(safeHttps(data.avatarUrl)) },
      { label: 'Clear bio', done: data.bio.trim().length >= 20 },
      { label: 'Social identity', done: social },
      { label: profile.profile_type === 'creator' ? 'Featured work' : 'Project showcase', done: showcase },
      { label: profile.profile_type === 'creator' ? 'Media kit or Work With Me' : 'Team or collaboration CTA', done: conversion },
    ];
  }, [profile?.id, profile?.profile_type, data.avatarUrl, data.bio, blocks]);

  const completed = completion.filter((item) => item.done).length;
  const completionPercent = completion.length ? Math.round((completed / completion.length) * 100) : 0;
  const previewBlocks = blocks.filter((block) => block.enabled).slice(0, 8);
  const avatar = safeHttps(data.avatarUrl);
  const featureType = ['featured_video', 'featured_article', 'featured_image'].includes(draft.type);
  const teamType = draft.type === 'team_member';
  const isProject = profile?.profile_type === 'project';

  if (!profile) return null;

  return (
    <ProductWorkspace me={me} status={status} profile={profile as ProductProfile} onProfileChange={changeProfile}>
      <div className="ops-stack profile-beta">
        <div className="ops-heading-row">
          <div>
            <span className="ops-kicker">PUBLIC IDENTITY</span>
            <h1>{isProject ? 'Project profile' : 'Creator profile'}</h1>
            <p>Build the page people use to understand who you are, what you have done and how to work with you.</p>
          </div>
          <div className="profile-beta-head-actions">
            <a className="ops-button secondary" href={`https://linkary.xyz/${profile.username}`} target="_blank" rel="noreferrer">Open public profile ↗</a>
            <button className="ops-button primary" disabled={busy === 'publish'} onClick={() => void publish()}>{busy === 'publish' ? 'Saving...' : data.visibility === 'published' ? 'Move to draft' : 'Publish profile'}</button>
          </div>
        </div>

        {message && <div className="ops-message">{message}</div>}

        <section className="profile-beta-progress">
          <div className="profile-beta-progress-top"><div><span className="ops-kicker">ONBOARDING READINESS</span><strong>{completionPercent}% complete</strong></div><span>{completed}/{completion.length} essentials</span></div>
          <div className="profile-beta-progress-bar"><i style={{ width: `${completionPercent}%` }} /></div>
          <div className="profile-beta-checks">{completion.map((item) => <span className={item.done ? 'done' : ''} key={item.label}>{item.done ? '✓' : '○'} {item.label}</span>)}</div>
        </section>

        <div className="profile-beta-layout">
          <div className="profile-beta-editor-column">
            <section className="ops-section profile-beta-identity">
              <div className="ops-section-title"><div><h2>Identity</h2><p>Your verified X image can be used automatically. You can still override it with another secure image URL.</p></div></div>
              <div className="profile-beta-identity-grid">
                <div className="profile-beta-avatar">{avatar && !avatarFailed ? <img src={avatar} alt="Profile preview" referrerPolicy="no-referrer" onError={() => setAvatarFailed(true)} /> : (data.displayName || profile.display_name).slice(0, 1).toUpperCase()}</div>
                <label>Display name<input value={data.displayName} maxLength={80} onChange={(event) => setData({ ...data, displayName: event.target.value })} /></label>
                <label className="wide">Bio<textarea value={data.bio} maxLength={500} placeholder={isProject ? 'What is this Project building and for whom?' : 'What do you do, what are you known for, and who should contact you?'} onChange={(event) => setData({ ...data, bio: event.target.value })} /></label>
                <label className="wide">{isProject ? 'Project logo URL' : 'Profile image URL'}<input type="url" value={data.avatarUrl || ''} placeholder="https://..." onChange={(event) => { setAvatarFailed(false); setData({ ...data, avatarUrl: event.target.value }); }} /><small>Optional. Leave the verified X image in place unless you want a custom image.</small></label>
              </div>
              <div className="profile-beta-save-row"><span>{clicks.toLocaleString()} measured public link click{clicks === 1 ? '' : 's'}</span><button className="ops-button primary" disabled={busy === 'profile'} onClick={() => void saveProfile()}>{busy === 'profile' ? 'Saving...' : 'Save identity'}</button></div>
            </section>

            <section className="ops-section">
              <div className="ops-section-title"><div><h2>Profile sections</h2><p>Drag items to reorder them. Linkary Proof will be added automatically from verified campaign evidence, not typed metrics.</p></div><button className="ops-button secondary" onClick={() => openNew()}>+ Add section</button></div>
              {!blocks.length ? <div className="ops-empty"><div className="ops-empty-icon">＋</div><h3>Build your public page</h3><p>Add social links, featured work and a clear way for people to work with you.</p><button className="ops-button secondary" onClick={() => openNew(isProject ? 'featured_article' : 'work_with_me')}>Add first section</button></div> : <div className="profile-beta-blocks">{blocks.map((block, index) => <article key={block.id} draggable onDragStart={() => setDraggedId(block.id)} onDragEnd={() => setDraggedId(null)} onDragOver={(event) => event.preventDefault()} onDrop={() => dropOn(block.id)} className={`${block.enabled ? '' : 'disabled'} ${draggedId === block.id ? 'dragging' : ''}`}>
                <button type="button" className="profile-beta-grip" aria-label={`Move ${block.title || blockLabel(block.type)}`}>⋮⋮</button>
                <div className="profile-beta-block-copy"><span>{blockLabel(block.type)}</span><strong>{block.title || 'Untitled'}</strong><small>{block.url || (block.type === 'heading' ? 'Section label' : 'No destination')}</small></div>
                <div className="profile-beta-block-actions"><button disabled={index === 0} onClick={() => moveBlock(index, -1)} aria-label="Move up">↑</button><button disabled={index === blocks.length - 1} onClick={() => moveBlock(index, 1)} aria-label="Move down">↓</button><button onClick={() => void setBlockEnabled(block)}>{block.enabled ? 'Hide' : 'Show'}</button><button onClick={() => openEdit(block)}>Edit</button><button className="danger" onClick={() => void removeBlock(block)}>Remove</button></div>
              </article>)}</div>}
            </section>

            <section className="profile-beta-quick-add">
              <div><span className="ops-kicker">QUICK ADD</span><h3>{isProject ? 'Make the Project easier to evaluate' : 'Make it easier to hire or partner with you'}</h3></div>
              <div>{!isProject && <><button onClick={() => openNew('work_with_me')}>+ Work With Me</button><button onClick={() => openNew('media_kit')}>+ Media Kit</button><button onClick={() => openNew('project_card')}>+ Project</button><button onClick={() => openNew('community_card')}>+ Community</button></>}{isProject && <><button onClick={() => openNew('team_member')}>+ Team member</button><button onClick={() => openNew('work_with_me')}>+ Collaboration CTA</button><button onClick={() => openNew('community_card')}>+ Community</button><button onClick={() => openNew('featured_article')}>+ Featured update</button></>}</div>
            </section>

            <section className="profile-beta-seo">
              <button className="profile-beta-seo-toggle" onClick={() => setShowSeo((value) => !value)}><span><strong>Search & share preview</strong><small>Optional title and description for search engines and social sharing.</small></span><b>{showSeo ? '−' : '+'}</b></button>
              {showSeo && <div className="profile-beta-seo-fields"><label>SEO title<input value={data.seoTitle || ''} maxLength={70} onChange={(event) => setData({ ...data, seoTitle: event.target.value })} /></label><label>SEO description<textarea value={data.seoDescription || ''} maxLength={180} onChange={(event) => setData({ ...data, seoDescription: event.target.value })} /></label><button className="ops-button primary" onClick={() => void saveProfile()}>Save</button></div>}
            </section>
          </div>

          <aside className="profile-beta-preview-column">
            <div className="profile-beta-preview-sticky">
              <div className="profile-beta-preview-heading"><span className="ops-kicker">LIVE MOBILE PREVIEW</span><small>Editor preview</small></div>
              <div className="profile-beta-phone">
                <div className="profile-beta-phone-top"><b>Linkary</b><span>•••</span></div>
                <div className="profile-beta-phone-avatar">{avatar && !avatarFailed ? <img src={avatar} alt="" referrerPolicy="no-referrer" /> : (data.displayName || profile.display_name).slice(0, 1).toUpperCase()}</div>
                <strong className="profile-beta-phone-name">{data.displayName || profile.display_name}</strong>
                <span className="profile-beta-phone-handle">@{profile.username}</span>
                <p>{data.bio || 'Your bio will appear here.'}</p>
                <div className="profile-beta-phone-items">{previewBlocks.map((block) => block.type === 'heading' ? <small className="profile-beta-phone-heading" key={block.id}>{block.title || 'More'}</small> : <div className={`profile-beta-phone-item ${['work_with_me', 'media_kit'].includes(block.type) ? 'cta' : ''}`} key={block.id}><b>{iconFor(block)}</b><span>{block.title || blockLabel(block.type)}</span><i>↗</i></div>)}</div>
                {!previewBlocks.length && <div className="profile-beta-phone-empty">Your public sections will appear here.</div>}
                <div className="profile-beta-phone-proof"><span>LINKARY PROOF</span><small>Verified campaign evidence appears here automatically when available.</small></div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {showEditor && <div className="ops-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) closeEditor(); }}><form className="ops-modal profile-beta-modal" onSubmit={saveBlock}>
        <div className="ops-modal-head"><div><span className="ops-kicker">PROFILE SECTION</span><h2>{editing ? 'Edit section' : 'Add to profile'}</h2></div><button type="button" onClick={closeEditor}>×</button></div>
        <label>Type<select value={draft.type} disabled={Boolean(editing)} onChange={(event) => setDraft({ ...emptyDraft(), type: event.target.value })}>
          <option value="social_link">Social link</option><option value="link">Link</option><option value="featured_video">Featured video</option><option value="featured_article">Featured article</option><option value="featured_image">Featured work</option><option value="heading">Section heading</option>
          {!isProject && <><option value="work_with_me">Work With Me</option><option value="media_kit">Media Kit</option><option value="project_card">Project card</option><option value="community_card">Community card</option></>}
          {isProject && <><option value="team_member">Team member</option><option value="work_with_me">Collaboration CTA</option><option value="community_card">Community card</option></>}
        </select></label>
        <label>Title<input required value={draft.title} placeholder={draft.type === 'work_with_me' ? (isProject ? 'Partner with us' : 'Work with me') : draft.type === 'media_kit' ? 'View my media kit' : 'Title'} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
        {draft.type !== 'heading' && <label>Destination URL<input required type="url" value={draft.url} placeholder="https://..." onChange={(event) => setDraft({ ...draft, url: event.target.value })} /><small>Visitors are sent here after clicking this section.</small></label>}
        {featureType && <label>Preview media URL<input type="url" value={draft.mediaUrl} placeholder="https://... image, video or YouTube URL" onChange={(event) => setDraft({ ...draft, mediaUrl: event.target.value })} /></label>}
        {teamType && <><label>Role<input value={draft.role} placeholder="Founder, Growth Lead, Community..." onChange={(event) => setDraft({ ...draft, role: event.target.value })} /></label><label>Photo URL<input type="url" value={draft.avatarUrl} placeholder="https://..." onChange={(event) => setDraft({ ...draft, avatarUrl: event.target.value })} /></label></>}
        <div className="ops-form-actions"><button type="button" className="ops-button ghost" onClick={closeEditor}>Cancel</button><button className="ops-button primary" disabled={busy === 'block'}>{busy === 'block' ? 'Saving...' : editing ? 'Save section' : 'Add section'}</button></div>
      </form></div>}
    </ProductWorkspace>
  );
}
