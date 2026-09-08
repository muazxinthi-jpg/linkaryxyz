import { useEffect, useMemo, useState } from 'react';
import './profile-optimization-v1.css';

type ProfileSnapshot = {
  bio: string;
  avatarUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
};

type ProfileBlock = {
  type: string;
  title: string | null;
  url: string | null;
  enabled: boolean;
  config?: { socialPlatform?: string } | null;
};

type OptimizationItem = {
  key: string;
  label: string;
  recommendation: string;
  points: number;
  complete: boolean;
};

function inferSocialPlatform(block: ProfileBlock): string {
  if (block.config?.socialPlatform) return String(block.config.socialPlatform).toLowerCase();
  const value = `${block.title || ''} ${block.url || ''}`.toLowerCase();
  if (value.includes('x.com/') || value.includes('twitter.com/')) return 'x';
  if (value.includes('linkedin.com/')) return 'linkedin';
  if (value.includes('t.me/') || value.includes('telegram')) return 'telegram';
  if (value.includes('youtube.com/') || value.includes('youtu.be/')) return 'youtube';
  if (value.includes('instagram.com/')) return 'instagram';
  if (value.includes('github.com/')) return 'github';
  if (value.includes('warpcast.com/') || value.includes('farcaster')) return 'farcaster';
  return block.type === 'social_link' ? 'other' : '';
}

function scoreLabel(score: number): string {
  if (score >= 90) return 'Optimized';
  if (score >= 75) return 'Strong';
  if (score >= 50) return 'Building';
  return 'Needs attention';
}

function buildOptimization(
  profile: ProfileSnapshot,
  blocks: ProfileBlock[],
  publicRole: string,
  professionalHeadline: string,
): { score: number; level: string; items: OptimizationItem[] } {
  const enabled = blocks.filter((block) => block.enabled);
  const socialBlocks = enabled.filter((block) => block.type === 'social_link' || Boolean(inferSocialPlatform(block)));
  const featuredTypes = new Set(['featured_video', 'featured_article', 'featured_image']);
  const proofTypes = new Set(['project_card', 'community_card']);
  const showcaseTypes = new Set(['nft_item', 'media_kit', 'work_with_me']);
  const featuredCount = enabled.filter((block) => featuredTypes.has(block.type)).length;

  const items: OptimizationItem[] = [
    { key: 'role', label: 'Public identity', recommendation: 'Choose the primary role that best explains what you do.', points: 10, complete: Boolean(publicRole.trim()) },
    { key: 'headline', label: 'Professional headline', recommendation: 'Add a concise professional headline with your role and focus.', points: 15, complete: professionalHeadline.trim().length >= 20 },
    { key: 'bio', label: 'Profile bio', recommendation: 'Add a useful bio that explains your work, expertise and current focus.', points: 15, complete: (profile.bio || '').trim().length >= 80 },
    { key: 'avatar', label: 'Profile image', recommendation: 'Add a recognizable profile image or verified X profile image.', points: 10, complete: Boolean(profile.avatarUrl) },
    { key: 'seo-title', label: 'SEO title', recommendation: 'Add an SEO title so your public profile is easier to understand in search and shares.', points: 5, complete: Boolean((profile.seoTitle || '').trim()) },
    { key: 'seo-description', label: 'SEO description', recommendation: 'Add a concise SEO description for search and social previews.', points: 5, complete: (profile.seoDescription || '').trim().length >= 60 },
    { key: 'social', label: 'Connected social', recommendation: 'Add at least one public social channel.', points: 10, complete: socialBlocks.length >= 1 },
    { key: 'x', label: 'X presence', recommendation: 'Add your X profile so Web3 partners can verify and discover your public identity.', points: 5, complete: socialBlocks.some((block) => inferSocialPlatform(block) === 'x') },
    { key: 'featured', label: 'Featured work', recommendation: 'Show at least one article, image or video that demonstrates your work.', points: 10, complete: featuredCount >= 1 },
    { key: 'proof', label: 'Project or community proof', recommendation: 'Add a Project or Community card that gives context to your experience.', points: 10, complete: enabled.some((block) => proofTypes.has(block.type)) },
    { key: 'showcase', label: 'Profile depth', recommendation: 'Add an NFT showcase, media kit, work-with-me card or another featured work item.', points: 5, complete: enabled.some((block) => showcaseTypes.has(block.type)) || featuredCount >= 2 },
  ];
  const score = items.reduce((sum, item) => sum + (item.complete ? item.points : 0), 0);
  return { score, level: scoreLabel(score), items };
}

export default function PersonalProfileOptimizationPanel({
  profileId,
  publicRole,
  professionalHeadline,
}: {
  profileId: string;
  publicRole: string;
  professionalHeadline: string;
}) {
  const [profile, setProfile] = useState<ProfileSnapshot | null>(null);
  const [blocks, setBlocks] = useState<ProfileBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    void Promise.all([
      fetch(`/api/profiles/${encodeURIComponent(profileId)}`, { credentials: 'same-origin' }),
      fetch(`/api/profiles/${encodeURIComponent(profileId)}/blocks`, { credentials: 'same-origin' }),
    ]).then(async ([profileResponse, blocksResponse]) => {
      if (!profileResponse.ok || !blocksResponse.ok) throw new Error('Profile optimization evidence is temporarily unavailable.');
      const profilePayload = await profileResponse.json() as { profile: ProfileSnapshot };
      const blockPayload = await blocksResponse.json() as { blocks: ProfileBlock[] };
      if (cancelled) return;
      setProfile({
        bio: profilePayload.profile?.bio || '',
        avatarUrl: profilePayload.profile?.avatarUrl || null,
        seoTitle: profilePayload.profile?.seoTitle || null,
        seoDescription: profilePayload.profile?.seoDescription || null,
      });
      setBlocks(Array.isArray(blockPayload.blocks) ? blockPayload.blocks : []);
    }).catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : 'Profile optimization evidence is temporarily unavailable.');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [profileId]);

  const optimization = useMemo(
    () => profile ? buildOptimization(profile, blocks, publicRole, professionalHeadline) : null,
    [profile, blocks, publicRole, professionalHeadline],
  );

  if (loading) return <section className="profile-optimization-v1" data-profile-optimization><div className="profile-optimization-v1-loading">Calculating profile optimization…</div></section>;
  if (error || !optimization) return <section className="profile-optimization-v1" data-profile-optimization><div className="profile-optimization-v1-loading">{error || 'Profile optimization is temporarily unavailable.'}</div></section>;

  const completed = optimization.items.filter((item) => item.complete).length;
  const nextActions = optimization.items.filter((item) => !item.complete).sort((a, b) => b.points - a.points).slice(0, 5);

  return (
    <section className="profile-optimization-v1" data-profile-optimization data-profile-optimization-score={optimization.score}>
      <div className="profile-optimization-v1-head">
        <div>
          <span>PROFILE OPTIMIZATION</span>
          <strong>{optimization.score}% optimized</strong>
          <small>Calculated from your saved Linkary profile evidence. The score itself is deterministic, not AI-generated.</small>
        </div>
        <div className="profile-optimization-v1-score" aria-label={`Profile optimization ${optimization.score} percent`}><b>{optimization.score}</b><small>/100</small></div>
      </div>
      <div className="profile-optimization-v1-track" aria-hidden="true"><span style={{ width: `${optimization.score}%` }} /></div>
      <div className="profile-optimization-v1-summary"><strong>{optimization.level}</strong><span>{completed}/{optimization.items.length} profile signals complete</span></div>
      {nextActions.length > 0 ? (
        <div className="profile-optimization-v1-actions">
          <strong>Next best improvements</strong>
          <ul>{nextActions.map((item) => <li key={item.key}><span>+{item.points}</span><div><b>{item.label}</b><small>{item.recommendation}</small></div></li>)}</ul>
        </div>
      ) : (
        <div className="profile-optimization-v1-complete"><strong>Profile foundation optimized.</strong><small>LinkaryAI can still help polish your headline, bio and SEO wording without changing verified evidence.</small></div>
      )}
      <div className="profile-optimization-v1-rule">Profile optimization measures presentation completeness only. It never changes verification, reputation, permissions, campaign evidence or referral status.</div>
    </section>
  );
}
