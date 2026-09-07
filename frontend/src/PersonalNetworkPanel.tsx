import { useEffect, useMemo, useState } from 'react';
import './personal-network.css';

type NetworkMember = {
  depth: number;
  accountType: 'creator' | 'project' | null;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  profileType: 'creator' | 'project' | null;
  verified: boolean;
  joinedAt: string;
};

type NetworkPayload = {
  available: boolean;
  summary: {
    directInvites: number;
    totalNetwork: number;
    creators: number;
    projects: number;
  };
  generations: Array<{ depth: number; members: number }>;
  selectedGeneration: number;
  members: NetworkMember[];
  pagination: {
    offset: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
};

type IdentityNetworkResponse = {
  network?: NetworkPayload;
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'L';
}

function memberType(member: NetworkMember): string {
  if (member.profileType === 'project' || member.accountType === 'project') return 'Project';
  if (member.profileType === 'creator' || member.accountType === 'creator') return 'Personal';
  return 'Member';
}

function formatJoined(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' }).format(date);
}

export default function PersonalNetworkPanel({ profileId }: { profileId: string }) {
  const [generation, setGeneration] = useState(1);
  const [offset, setOffset] = useState(0);
  const [network, setNetwork] = useState<NetworkPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const currentGeneration = useMemo(
    () => network?.generations.find((item) => item.depth === generation),
    [network, generation],
  );

  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;
    setLoading(true);
    setMessage('');
    const params = new URLSearchParams({
      networkDepth: String(generation),
      networkOffset: String(offset),
      networkLimit: '20',
    });
    void fetch(`/api/profiles/${encodeURIComponent(profileId)}/identity?${params.toString()}`, { credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Your network could not be loaded.');
        return response.json() as Promise<IdentityNetworkResponse>;
      })
      .then((result) => {
        if (cancelled) return;
        setNetwork(result.network || null);
        if (!result.network?.available) setMessage('Your Linkary network is being activated.');
      })
      .catch(() => {
        if (!cancelled) setMessage('Your Linkary network is temporarily unavailable.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [profileId, generation, offset]);

  function selectGeneration(depth: number) {
    setGeneration(depth);
    setOffset(0);
  }

  const summary = network?.summary || { directInvites: 0, totalNetwork: 0, creators: 0, projects: 0 };
  const members = network?.members || [];
  const pagination = network?.pagination || { offset: 0, limit: 20, total: 0, hasMore: false };

  return (
    <section className="wide personal-network" data-personal-network aria-labelledby="personal-network-title">
      <div className="personal-network-heading">
        <div>
          <span className="personal-network-kicker">MY NETWORK</span>
          <h2 id="personal-network-title">Your Linkary network</h2>
          <p>Built through the people and Projects you introduced. Linkary follows your network for up to seven generations.</p>
        </div>
        <div className="ink-building" aria-label="INK Points status Building">
          <span>INK Points</span>
          <strong>Building</strong>
          <small>Reputation activates as verified network and contribution evidence grows.</small>
        </div>
      </div>

      <div className="personal-network-stats" aria-label="Network summary">
        <div><span>Direct invites</span><strong>{summary.directInvites.toLocaleString()}</strong></div>
        <div><span>Total network</span><strong>{summary.totalNetwork.toLocaleString()}</strong></div>
        <div><span>People / Creators</span><strong>{summary.creators.toLocaleString()}</strong></div>
        <div><span>Projects</span><strong>{summary.projects.toLocaleString()}</strong></div>
      </div>

      <div className="personal-network-generation-head">
        <div>
          <h3>Network generations</h3>
          <p>Generation 1 is directly invited by you. Later generations are introduced by people already in your network.</p>
        </div>
        {currentGeneration && <span>{currentGeneration.members.toLocaleString()} in Gen {generation}</span>}
      </div>

      <div className="generation-tabs" role="tablist" aria-label="Network generations">
        {(network?.generations || Array.from({ length: 7 }, (_, index) => ({ depth: index + 1, members: 0 }))).map((item) => (
          <button
            type="button"
            key={item.depth}
            role="tab"
            aria-selected={generation === item.depth}
            className={generation === item.depth ? 'active' : ''}
            onClick={() => selectGeneration(item.depth)}
          >
            <span>Gen {item.depth}</span>
            <strong>{item.members.toLocaleString()}</strong>
          </button>
        ))}
      </div>

      {message && <div className="personal-network-message" role="status">{message}</div>}
      {loading && <div className="personal-network-message" role="status">Loading your network...</div>}

      {!loading && network?.available && members.length === 0 && (
        <div className="personal-network-empty">
          <strong>{generation === 1 ? 'Your direct network starts with your invitations.' : `No Generation ${generation} members yet.`}</strong>
          <p>{generation === 1 ? 'Share a Linkary network invitation. When it is redeemed, the member will appear here automatically.' : 'As your network invites more people and Projects, Linkary will build this generation automatically.'}</p>
          {generation === 1 && <a href="/invites" className="ops-button secondary">Open invitations</a>}
        </div>
      )}

      {!loading && members.length > 0 && (
        <div className="personal-network-members" role="list">
          {members.map((member, index) => {
            const profileUrl = member.username ? `https://linkary.xyz/${encodeURIComponent(member.username)}` : null;
            return (
              <article className="personal-network-member" role="listitem" key={`${member.username || member.displayName}-${member.joinedAt}-${index}`}>
                {member.avatarUrl ? (
                  <img src={member.avatarUrl} alt="" loading="lazy" />
                ) : (
                  <div className="member-initials" aria-hidden="true">{initials(member.displayName)}</div>
                )}
                <div className="member-main">
                  <div className="member-name-row">
                    <strong>{member.displayName}</strong>
                    {member.verified && <span className="member-verified" title="Verified Linkary identity">Verified</span>}
                  </div>
                  <span>{memberType(member)}{member.username ? ` · @${member.username}` : ''}{formatJoined(member.joinedAt) ? ` · Joined ${formatJoined(member.joinedAt)}` : ''}</span>
                </div>
                <span className="member-generation">Gen {member.depth}</span>
                {profileUrl ? <a href={profileUrl} target="_blank" rel="noreferrer" aria-label={`Open ${member.displayName} public profile`}>Open ↗</a> : <span className="member-private">Private</span>}
              </article>
            );
          })}
        </div>
      )}

      {!loading && network?.available && pagination.total > pagination.limit && (
        <div className="personal-network-pagination">
          <button type="button" className="ops-button secondary" disabled={pagination.offset <= 0} onClick={() => setOffset(Math.max(0, pagination.offset - pagination.limit))}>Previous</button>
          <span>{pagination.offset + 1}-{Math.min(pagination.offset + members.length, pagination.total)} of {pagination.total}</span>
          <button type="button" className="ops-button secondary" disabled={!pagination.hasMore} onClick={() => setOffset(pagination.offset + pagination.limit)}>Next</button>
        </div>
      )}

      <div className="personal-network-footnote">
        <strong>Referral rewards are separate from network reputation.</strong>
        <span>The existing direct referral reward remains the active economic rule. Downstream network rewards are not active in this build.</span>
      </div>
    </section>
  );
}
