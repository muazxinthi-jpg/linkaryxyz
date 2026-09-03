import { useEffect, useState } from "react";
import {
  ProductWorkspace,
  type ProductMe,
  type ProductProfile,
  type ProductStatus,
} from "./ProductWorkspace";

type ProfileData = {
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  visibility: string;
};
type Block = {
  id: string;
  type: string;
  title: string | null;
  url: string | null;
  enabled: boolean;
  config: { mediaUrl?: string; role?: string; avatarUrl?: string; chain?: string; socialPlatform?: string; sectionTitle?: string };
};
class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("content-type"))
    headers.set("content-type", "application/json");
  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "same-origin",
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
  } & T;
  if (!response.ok)
    throw new ApiError(
      payload.error || "request_failed",
      payload.message || "Request failed",
    );
  return payload;
}
function cookie(name: string) {
  const match = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}
function safeError(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return fallback;
  if (error.code === "verification_required")
    return "Verify the X identity for this profile before publishing.";
  if (error.code === "forbidden")
    return "Your current role cannot edit this profile.";
  if (error.code === "invalid_url") return "Enter a valid HTTPS image or link URL.";
  return fallback;
}
function blockLabel(type: string) {
  const labels: Record<string, string> = {
    link: "Link",
    social_link: "Social",
    featured_video: "Featured video",
    featured_article: "Featured article",
    featured_image: "Featured work",
    product_feature: "Product feature",
    nft_item: "NFT collectible",
    team_member: "Team member",
  };
  return labels[type] || type.replace(/_/g, " ");
}
function safeHttpsPreview(value: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
function youtubePreview(value: string): string | null {
  const safe = safeHttpsPreview(value);
  if (!safe) return null;
  try {
    const url = new URL(safe);
    const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
    let id: string | null = null;
    if (host === "youtu.be") {
      id = url.pathname.split("/").filter(Boolean)[0] || null;
    } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
      if (url.pathname === "/watch") id = url.searchParams.get("v");
      if (!id) {
        const parts = url.pathname.split("/").filter(Boolean);
        if (["shorts", "embed", "live"].includes(parts[0] || "")) id = parts[1] || null;
      }
    }
    return id && /^[a-zA-Z0-9_-]{6,20}$/.test(id)
      ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
      : null;
  } catch {
    return null;
  }
}
function directVideoPreview(value: string): string | null {
  const safe = safeHttpsPreview(value);
  if (!safe) return null;
  try {
    return /\.(mp4|webm|ogg)$/i.test(new URL(safe).pathname) ? safe : null;
  } catch {
    return null;
  }
}

export default function ProfileExperience({
  me,
  status,
}: {
  me: ProductMe;
  status: ProductStatus;
}) {
  const creatorFirst =
    status.profiles.find((p) => p.profile_type === "creator") ||
    status.profiles[0];
  const stored = window.localStorage.getItem("linkary.active.profile");
  const [profileId, setProfileId] = useState(
    stored && status.profiles.some((p) => p.id === stored)
      ? stored
      : creatorFirst?.id || "",
  );
  const profile =
    status.profiles.find((p) => p.id === profileId) || creatorFirst;
  const [data, setData] = useState<ProfileData>({
    displayName: "",
    bio: "",
    avatarUrl: "",
    seoTitle: "",
    seoDescription: "",
    visibility: "private",
  });
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [clicks, setClicks] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [showSeo, setShowSeo] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Block | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [avatarPreviewFailed, setAvatarPreviewFailed] = useState(false);
  const [newBlock, setNewBlock] = useState({
    type: "link",
    title: "",
    url: "",
    mediaUrl: "",
    role: "Team member",
    avatarUrl: "",
    chain: "Ethereum",
    socialPlatform: "",
    sectionTitle: "",
  });
  function resetBlock() {
    setNewBlock({
      type: "link",
      title: "",
      url: "",
      mediaUrl: "",
      role: "Team member",
      avatarUrl: "",
      chain: "Ethereum",
      socialPlatform: "",
      sectionTitle: "",
    });
    setPreviewFailed(false);
  }
  function closeBlockEditor() {
    setShowAdd(false);
    setEditing(null);
    resetBlock();
  }
  function changeProfile(id: string) {
    setProfileId(id);
    window.localStorage.setItem("linkary.active.profile", id);
  }
  async function load() {
    if (!profile) return;
    setMessage("");
    try {
      const [p, b, a] = await Promise.all([
        apiJson<{ profile: ProfileData }>(
          `/api/profiles/${encodeURIComponent(profile.id)}`,
        ),
        apiJson<{ blocks: Block[] }>(
          `/api/profiles/${encodeURIComponent(profile.id)}/blocks`,
        ),
        apiJson<{ linkClicks: number }>(
          `/api/profiles/${encodeURIComponent(profile.id)}/analytics`,
        ).catch(() => ({ linkClicks: 0 })),
      ]);
      setData({
        ...p.profile,
        bio: p.profile.bio || "",
        avatarUrl: p.profile.avatarUrl || "",
        seoTitle: p.profile.seoTitle || "",
        seoDescription: p.profile.seoDescription || "",
      });
      setAvatarPreviewFailed(false);
      setBlocks(b.blocks);
      setClicks(a.linkClicks);
    } catch {
      setMessage(
        "Profile settings are temporarily unavailable. Please try again shortly.",
      );
    }
  }
  useEffect(() => {
    void load();
  }, [profileId]);
  async function save() {
    if (!profile) return;
    const csrf = cookie("__Host-linkary_csrf");
    if (!csrf) return;
    setBusy("save");
    setMessage("");
    try {
      await apiJson(`/api/profiles/${encodeURIComponent(profile.id)}`, {
        method: "PATCH",
        headers: { "x-csrf-token": csrf },
        body: JSON.stringify({
          displayName: data.displayName,
          bio: data.bio,
          avatarUrl: data.avatarUrl || "",
          seoTitle: data.seoTitle,
          seoDescription: data.seoDescription,
        }),
      });
      setMessage("Profile saved.");
      await load();
    } catch (error) {
      setMessage(safeError(error, "The profile could not be saved."));
    } finally {
      setBusy("");
    }
  }
  async function publish() {
    if (!profile) return;
    const csrf = cookie("__Host-linkary_csrf");
    if (!csrf) return;
    setBusy("publish");
    try {
      const path = data.visibility === "published" ? "unpublish" : "publish";
      await apiJson(`/api/profiles/${encodeURIComponent(profile.id)}/${path}`, {
        method: "POST",
        headers: { "x-csrf-token": csrf },
      });
      setMessage(
        data.visibility === "published"
          ? "Profile moved back to draft."
          : "Profile published.",
      );
      await load();
    } catch (error) {
      setMessage(
        safeError(error, "The profile visibility could not be changed."),
      );
    } finally {
      setBusy("");
    }
  }
  function blockConfig() {
    return {
      ...(newBlock.type === "team_member"
        ? {
            role: newBlock.role,
            ...(newBlock.avatarUrl ? { avatarUrl: newBlock.avatarUrl } : {}),
          }
        : {}),
      ...(newBlock.mediaUrl ? { mediaUrl: newBlock.mediaUrl } : {}),
      ...(newBlock.type === "nft_item" ? { chain: newBlock.chain } : {}),
      ...(newBlock.type === "social_link" && newBlock.socialPlatform ? { socialPlatform: newBlock.socialPlatform } : {}),
      ...(featuredType && newBlock.sectionTitle ? { sectionTitle: newBlock.sectionTitle } : {}),
    };
  }
  function exceedsNftNetworkLimit() {
    if (newBlock.type !== "nft_item") return false;
    const networks = new Set(
      blocks
        .filter((block) => block.type === "nft_item" && block.id !== editing?.id)
        .map((block) => block.config?.chain)
        .filter((chain): chain is string => Boolean(chain)),
    );
    networks.add(newBlock.chain);
    return networks.size > 3;
  }
  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!profile) return;
    if (exceedsNftNetworkLimit()) {
      setMessage("NFT showcases support up to three selected networks. Choose one already in use or remove an NFT first.");
      return;
    }
    const csrf = cookie("__Host-linkary_csrf");
    if (!csrf) return;
    setBusy("add");
    try {
      await apiJson(`/api/profiles/${encodeURIComponent(profile.id)}/blocks`, {
        method: "POST",
        headers: { "x-csrf-token": csrf },
        body: JSON.stringify({
          type: newBlock.type,
          title: newBlock.title,
          url: newBlock.type === "heading" ? "" : newBlock.url,
          config: blockConfig(),
        }),
      });
      closeBlockEditor();
      await load();
    } catch (error) {
      setMessage(safeError(error, "This profile item could not be added."));
    } finally {
      setBusy("");
    }
  }
  async function toggle(block: Block) {
    if (!profile) return;
    const csrf = cookie("__Host-linkary_csrf");
    if (!csrf) return;
    try {
      await apiJson(
        `/api/profiles/${encodeURIComponent(profile.id)}/blocks/${encodeURIComponent(block.id)}`,
        {
          method: "PATCH",
          headers: { "x-csrf-token": csrf },
          body: JSON.stringify({ enabled: !block.enabled }),
        },
      );
      await load();
    } catch {
      setMessage("This profile item could not be updated.");
    }
  }
  function openEdit(block: Block) {
    setNewBlock({
      type: block.type,
      title: block.title || "",
      url: block.url || "",
      mediaUrl: block.config?.mediaUrl || "",
      role: block.config?.role || "Team member",
      avatarUrl: block.config?.avatarUrl || "",
      chain: block.config?.chain || "Ethereum",
      socialPlatform: block.config?.socialPlatform || "",
      sectionTitle: block.config?.sectionTitle || "",
    });
    setPreviewFailed(false);
    setEditing(block);
    setShowAdd(true);
  }
  async function saveBlock(event: React.FormEvent) {
    event.preventDefault();
    if (!profile) return;
    if (!editing) return add(event);
    if (exceedsNftNetworkLimit()) {
      setMessage("NFT showcases support up to three selected networks. Choose one already in use or remove an NFT first.");
      return;
    }
    const csrf = cookie("__Host-linkary_csrf");
    if (!csrf) return;
    setBusy("add");
    try {
      await apiJson(
        `/api/profiles/${encodeURIComponent(profile.id)}/blocks/${encodeURIComponent(editing.id)}`,
        {
          method: "PATCH",
          headers: { "x-csrf-token": csrf },
          body: JSON.stringify({
            title: newBlock.title,
            url: newBlock.type === "heading" ? "" : newBlock.url,
            config: blockConfig(),
          }),
        },
      );
      closeBlockEditor();
      await load();
      setMessage("Profile item updated.");
    } catch (error) {
      setMessage(safeError(error, "This profile item could not be updated."));
    } finally {
      setBusy("");
    }
  }
  async function remove(block: Block) {
    if (!profile || !window.confirm("Remove this item from the profile?"))
      return;
    const csrf = cookie("__Host-linkary_csrf");
    if (!csrf) return;
    try {
      await fetch(
        `/api/profiles/${encodeURIComponent(profile.id)}/blocks/${encodeURIComponent(block.id)}`,
        {
          method: "DELETE",
          headers: { "x-csrf-token": csrf },
          credentials: "same-origin",
        },
      );
      await load();
    } catch {
      setMessage("This profile item could not be removed.");
    }
  }
  async function move(index: number, by: -1 | 1) {
    if (!profile) return;
    const next = index + by;
    if (next < 0 || next >= blocks.length) return;
    const ordered = [...blocks];
    [ordered[index], ordered[next]] = [ordered[next], ordered[index]];
    const csrf = cookie("__Host-linkary_csrf");
    if (!csrf) return;
    try {
      await apiJson(
        `/api/profiles/${encodeURIComponent(profile.id)}/blocks-reorder`,
        {
          method: "POST",
          headers: { "x-csrf-token": csrf },
          body: JSON.stringify({ blockIds: ordered.map((b) => b.id) }),
        },
      );
      setBlocks(ordered);
    } catch {
      setMessage("The profile order could not be updated.");
    }
  }
  if (!profile) return null;

  const featuredType = ["featured_video", "featured_image", "featured_article", "product_feature", "nft_item"].includes(
    newBlock.type,
  );
  const previewUrl = safeHttpsPreview(newBlock.mediaUrl);
  const previewVideo = previewUrl ? directVideoPreview(previewUrl) : null;
  const previewImage = previewUrl ? youtubePreview(previewUrl) || previewUrl : null;
  const teamAvatarPreview = safeHttpsPreview(newBlock.avatarUrl);
  const profileAvatarPreview = safeHttpsPreview(data.avatarUrl || "");

  return (
    <ProductWorkspace
      me={me}
      status={status}
      profile={profile as ProductProfile}
      onProfileChange={changeProfile}
    >
      <div className="ops-stack profile-next">
        <div className="ops-heading-row">
          <div>
            <span className="ops-kicker">PUBLIC IDENTITY</span>
            <h1>Profile</h1>
            <p>Keep the page people see simple, credible and useful.</p>
          </div>
          <div className="profile-next-head-actions">
            <a
              className="ops-button secondary"
              href={`https://linkary.xyz/${profile.username}`}
              target="_blank"
              rel="noreferrer"
            >
              Preview ↗
            </a>
            <button
              className="ops-button primary"
              onClick={() => void publish()}
              disabled={busy === "publish"}
            >
              {busy === "publish"
                ? "Saving..."
                : data.visibility === "published"
                  ? "Move to draft"
                  : "Publish"}
            </button>
          </div>
        </div>
        {message && <div className="ops-message">{message}</div>}
        <section className="profile-next-grid">
          <article className="profile-identity-card">
            <div className="profile-avatar-next">
              {profileAvatarPreview && !avatarPreviewFailed ? (
                <img
                  src={profileAvatarPreview}
                  alt="Profile preview"
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarPreviewFailed(true)}
                />
              ) : (
                (data.displayName || profile.display_name).slice(0, 1).toUpperCase()
              )}
            </div>
            <label>
              Display name
              <input
                value={data.displayName}
                onChange={(e) =>
                  setData({ ...data, displayName: e.target.value })
                }
              />
            </label>
            <label>
              Bio
              <textarea
                value={data.bio}
                onChange={(e) => setData({ ...data, bio: e.target.value })}
                maxLength={500}
                placeholder="What should people know about you?"
              />
            </label>
            <label className="profile-avatar-url-field">
              {profile.profile_type === "project" ? "Project logo" : "Profile image"}
              <input
                type="url"
                value={data.avatarUrl || ""}
                onChange={(e) => {
                  setAvatarPreviewFailed(false);
                  setData({ ...data, avatarUrl: e.target.value });
                }}
                placeholder="https://..."
              />
              <small>Use a secure HTTPS image URL. Leave blank to use your initial.</small>
            </label>
            <div className="profile-save-row">
              <span>
                {clicks ?? 0} measured link click{clicks === 1 ? "" : "s"}
              </span>
              <button
                className="ops-button primary"
                onClick={() => void save()}
                disabled={busy === "save"}
              >
                {busy === "save" ? "Saving..." : "Save profile"}
              </button>
            </div>
          </article>
          <article className="profile-preview-card">
            <span className="ops-kicker">PUBLIC URL</span>
            <strong>linkary.xyz/{profile.username}</strong>
            <p>{data.bio || "Your bio will appear here."}</p>
            <div>
              <span className={`profile-live-state ${data.visibility}`}>
                {data.visibility === "published" ? "Live" : "Private draft"}
              </span>
            </div>
          </article>
        </section>
        <section className="ops-section">
          <div className="ops-section-title">
            <div>
              <h2>Links & showcase</h2>
              <p>Add the places, work and proof that matter most.</p>
            </div>
            <button
              className="ops-button secondary"
              onClick={() => {
                resetBlock();
                setEditing(null);
                setShowAdd(true);
              }}
            >
              + Add item
            </button>
          </div>
          {!blocks.length ? (
            <div className="ops-empty">
              <div className="ops-empty-icon">＋</div>
              <h3>No profile items yet</h3>
              <p>
                Add your X profile, website, featured work, articles or videos.
              </p>
              <button
                className="ops-button secondary"
                onClick={() => {
                  resetBlock();
                  setEditing(null);
                  setShowAdd(true);
                }}
              >
                Add first item
              </button>
            </div>
          ) : (
            <div className="profile-block-list">
              {blocks.map((block, index) => (
                <article
                  key={block.id}
                  className={!block.enabled ? "disabled" : ""}
                >
                  <div>
                    <span>{blockLabel(block.type)}</span>
                    <strong>{block.title || "Untitled"}</strong>
                    <small>{block.url}</small>
                  </div>
                  <div className="profile-block-actions">
                    <button
                      disabled={index === 0}
                      onClick={() => void move(index, -1)}
                    >
                      ↑
                    </button>
                    <button
                      disabled={index === blocks.length - 1}
                      onClick={() => void move(index, 1)}
                    >
                      ↓
                    </button>
                    <button onClick={() => void toggle(block)}>
                      {block.enabled ? "Hide" : "Show"}
                    </button>
                    <button onClick={() => openEdit(block)}>Edit</button>
                    <button
                      className="danger"
                      onClick={() => void remove(block)}
                    >
                      Remove
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
        <section className="profile-seo-card">
          <button
            className="profile-seo-toggle"
            onClick={() => setShowSeo((v) => !v)}
          >
            <span>
              <strong>Search & share preview</strong>
              <small>
                Optional title and description used when this profile is shared.
              </small>
            </span>
            <b>{showSeo ? "−" : "+"}</b>
          </button>
          {showSeo && (
            <div className="profile-seo-fields">
              <label>
                SEO title
                <input
                  value={data.seoTitle || ""}
                  onChange={(e) =>
                    setData({ ...data, seoTitle: e.target.value })
                  }
                  maxLength={70}
                />
              </label>
              <label>
                SEO description
                <textarea
                  value={data.seoDescription || ""}
                  onChange={(e) =>
                    setData({ ...data, seoDescription: e.target.value })
                  }
                  maxLength={180}
                />
              </label>
              <button
                className="ops-button primary"
                onClick={() => void save()}
              >
                Save
              </button>
            </div>
          )}
        </section>
      </div>
      {showAdd && (
        <div
          className="ops-modal-backdrop"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) closeBlockEditor();
          }}
        >
          <form className="ops-modal" onSubmit={saveBlock}>
            <div className="ops-modal-head">
              <div>
                <span className="ops-kicker">PROFILE ITEM</span>
                <h2>{editing ? "Edit profile item" : "Add to profile"}</h2>
              </div>
              <button type="button" onClick={closeBlockEditor}>
                ×
              </button>
            </div>
            <label>
              Type
              <select
                value={newBlock.type}
                disabled={Boolean(editing)}
                onChange={(e) => {
                  setPreviewFailed(false);
                  setNewBlock({ ...newBlock, type: e.target.value });
                }}
              >
                <option value="social_link">Social link</option>
                <option value="link">Link</option>
                <option value="featured_video">Featured video</option>
                <option value="featured_article">Featured article</option>
                <option value="featured_image">Featured image</option>
                {profile.profile_type === "project" && (
                  <option value="product_feature">Product feature</option>
                )}
                <option value="nft_item">NFT collectible</option>
                <option value="heading">Section heading</option>
                {profile.profile_type === "project" && (
                  <option value="team_member">Team member</option>
                )}
              </select>
            </label>
            <label>
              Title
              <input
                value={newBlock.title}
                onChange={(e) =>
                  setNewBlock({ ...newBlock, title: e.target.value })
                }
                placeholder={
                  newBlock.type === "heading"
                    ? "Official links, Community, Featured work..."
                    : "X, Website, Launch thread..."
                }
                required
              />
            </label>
            {newBlock.type !== "heading" && (
              <label>
                Destination URL
                <input
                  type="url"
                  value={newBlock.url}
                  onChange={(e) =>
                    setNewBlock({ ...newBlock, url: e.target.value })
                  }
                  placeholder={
                    newBlock.type === "team_member"
                      ? "https://linkary.xyz/username or social profile"
                      : "https://..."
                  }
                  required
                />
                <small>This is where visitors go after clicking the card.</small>
              </label>
            )}
            {newBlock.type === "social_link" && (
              <label>
                Social network
                <select
                  value={newBlock.socialPlatform}
                  onChange={(e) => setNewBlock({ ...newBlock, socialPlatform: e.target.value })}
                >
                  <option value="">Choose from URL automatically</option>
                  <option value="x">X</option>
                  <option value="instagram">Instagram</option>
                  <option value="youtube">YouTube</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="telegram">Telegram</option>
                  <option value="facebook">Facebook</option>
                  <option value="reddit">Reddit</option>
                  <option value="tiktok">TikTok</option>
                  <option value="discord">Discord</option>
                  <option value="github">GitHub</option>
                  <option value="website">Website</option>
                </select>
                <small>Use the matching network so the public profile always shows the correct icon.</small>
              </label>
            )}
            {featuredType && (
              <label>
                {newBlock.type === "nft_item" ? "NFT image" : "Preview media"}
                <input
                  type="url"
                  value={newBlock.mediaUrl}
                  onChange={(e) => {
                    setPreviewFailed(false);
                    setNewBlock({ ...newBlock, mediaUrl: e.target.value });
                  }}
                  placeholder="https://..."
                />
                <small>
                  Add a direct image, direct video, or YouTube URL. CDN image URLs without a file extension are supported.
                </small>
              </label>
            )}
            {featuredType && (
              <label>
                Section title <small>(optional)</small>
                <input
                  value={newBlock.sectionTitle}
                  onChange={(e) => setNewBlock({ ...newBlock, sectionTitle: e.target.value })}
                  placeholder={newBlock.type === "nft_item" ? "Collected identity" : newBlock.type === "featured_image" ? "Selected work" : "Watch now"}
                />
                <small>Use the same title on related items to create a named public section.</small>
              </label>
            )}
            {newBlock.type === "nft_item" && (
              <label>
                Network
                <select
                  value={newBlock.chain}
                  onChange={(e) => setNewBlock({ ...newBlock, chain: e.target.value })}
                >
                  <option>Ethereum</option>
                  <option>Solana</option>
                  <option>Base</option>
                  <option>Robinhood Chain</option>
                </select>
                <small>Add an NFT you own or represent. Verified wallet selection will appear here when the onchain collection connection is enabled.</small>
              </label>
            )}
            {featuredType && newBlock.mediaUrl && (
              <div className="profile-media-preview-wrap">
                <span className="ops-kicker">PREVIEW</span>
                {previewFailed || !previewUrl ? (
                  <div className="profile-media-preview-fallback">
                    Preview unavailable. The destination link will still work.
                  </div>
                ) : previewVideo ? (
                  <video
                    className="profile-media-preview"
                    src={previewVideo}
                    muted
                    playsInline
                    loop
                    autoPlay
                    onError={() => setPreviewFailed(true)}
                  />
                ) : previewImage ? (
                  <img
                    className="profile-media-preview"
                    src={previewImage}
                    alt="Featured preview"
                    referrerPolicy="no-referrer"
                    onError={() => setPreviewFailed(true)}
                  />
                ) : (
                  <div className="profile-media-preview-fallback">
                    Preview unavailable. The destination link will still work.
                  </div>
                )}
              </div>
            )}
            {newBlock.type === "team_member" && (
              <>
                <label>
                  Role on this Project
                  <input
                    value={newBlock.role}
                    onChange={(e) =>
                      setNewBlock({ ...newBlock, role: e.target.value })
                    }
                    placeholder="Founder, Community lead, Growth..."
                  />
                </label>
                <label>
                  Team member photo
                  <input
                    type="url"
                    value={newBlock.avatarUrl}
                    onChange={(e) => {
                      setPreviewFailed(false);
                      setNewBlock({ ...newBlock, avatarUrl: e.target.value });
                    }}
                    placeholder="https://..."
                  />
                  <small>Optional HTTPS image URL. Initials are used when no photo is provided.</small>
                </label>
                {newBlock.avatarUrl && (
                  <div className="profile-team-avatar-preview">
                    {previewFailed || !teamAvatarPreview ? (
                      <span>{(newBlock.title || "?").slice(0, 1).toUpperCase()}</span>
                    ) : (
                      <img
                        src={teamAvatarPreview}
                        alt="Team member preview"
                        referrerPolicy="no-referrer"
                        onError={() => setPreviewFailed(true)}
                      />
                    )}
                  </div>
                )}
              </>
            )}
            <div className="ops-form-actions">
              <button
                type="button"
                className="ops-button ghost"
                onClick={closeBlockEditor}
              >
                Cancel
              </button>
              <button className="ops-button primary" disabled={busy === "add"}>
                {busy === "add" ? "Saving..." : editing ? "Save item" : "Add item"}
              </button>
            </div>
          </form>
        </div>
      )}
    </ProductWorkspace>
  );
}
