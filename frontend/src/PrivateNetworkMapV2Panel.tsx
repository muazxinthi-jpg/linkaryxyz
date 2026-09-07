import { useEffect, useRef, useState } from 'react';
import InteractiveNetworkMapV2 from './InteractiveNetworkMapV3';
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

type NetworkGraphNode = NetworkMember & {
  id: string;
  parentId: string | null;
};

type NetworkGraph = {
  nodes: NetworkGraphNode[];
  truncated: boolean;
  maxNodes: number;
};

type NetworkPayload = {
  available: boolean;
  summary: {
    directInvites: number;
    totalNetwork: number;
    creators: number;
    projects: number;
  };
  graph?: NetworkGraph | null;
};

type IdentityNetworkResponse = { network?: NetworkPayload };

export default function PrivateNetworkMapV2Panel({ profileId }: { profileId: string }) {
  const [network, setNetwork] = useState<NetworkPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const mapHostRef = useRef<HTMLDivElement | null>(null);
  const rootAvatarRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;
    setLoading(true);
    setMessage('');
    const params = new URLSearchParams({
      networkDepth: '1',
      networkOffset: '0',
      networkLimit: '1',
      networkGraph: '1',
      networkGraphLimit: '160',
    });
    void fetch(`/api/profiles/${encodeURIComponent(profileId)}/identity?${params.toString()}`, { credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Your network map could not be loaded.');
        return response.json() as Promise<IdentityNetworkResponse>;
      })
      .then((result) => {
        if (cancelled) return;
        setNetwork(result.network || null);
        if (!result.network?.available) setMessage('Your Linkary network is being activated.');
      })
      .catch(() => {
        if (!cancelled) setMessage('Your Linkary network map is temporarily unavailable.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [profileId]);

  const summary = network?.summary || { directInvites: 0, totalNetwork: 0, creators: 0, projects: 0 };
  const rootAvatarUrl = network?.graph?.nodes.find((node) => node.id === 'self')?.avatarUrl || null;

  useEffect(() => {
    const host = mapHostRef.current;
    const avatar = rootAvatarRef.current;
    if (!host || !avatar || !rootAvatarUrl) return;

    let animationFrame = 0;
    const syncAvatar = () => {
      animationFrame = 0;
      const rootCircle = host.querySelector<SVGGraphicsElement>('.network-map-v2-node.root .network-map-v2-node-bg');
      if (!rootCircle) {
        avatar.style.opacity = '0';
        return;
      }
      const targetRect = rootCircle.getBoundingClientRect();
      const hostRect = host.getBoundingClientRect();
      if (!targetRect.width || !targetRect.height) {
        avatar.style.opacity = '0';
        return;
      }
      avatar.style.left = `${targetRect.left - hostRect.left}px`;
      avatar.style.top = `${targetRect.top - hostRect.top}px`;
      avatar.style.width = `${targetRect.width}px`;
      avatar.style.height = `${targetRect.height}px`;
      avatar.style.opacity = '1';
    };
    const scheduleSync = () => {
      if (animationFrame) return;
      animationFrame = requestAnimationFrame(syncAvatar);
    };

    scheduleSync();

    const mutationObserver = new MutationObserver(scheduleSync);
    mutationObserver.observe(host, {
      subtree: true,
      attributes: true,
      attributeFilter: ['transform', 'class'],
    });

    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleSync) : null;
    resizeObserver?.observe(host);
    const svg = host.querySelector('svg');
    if (svg) resizeObserver?.observe(svg);

    host.addEventListener('pointermove', scheduleSync, { passive: true });
    host.addEventListener('wheel', scheduleSync, { passive: true });
    window.addEventListener('resize', scheduleSync);

    return () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
      host.removeEventListener('pointermove', scheduleSync);
      host.removeEventListener('wheel', scheduleSync);
      window.removeEventListener('resize', scheduleSync);
    };
  }, [rootAvatarUrl]);

  return (
    <section className="wide personal-network network-map-view" data-private-network-map-v2 aria-labelledby="network-map-v2-title">
      <div className="personal-network-heading">
        <div>
          <span className="personal-network-kicker">RELATIONSHIP MAP</span>
          <h2 id="network-map-v2-title">How your network connects</h2>
          <p>Explore, search and trace the invitation lineage that connects you to people and Projects across up to seven generations.</p>
        </div>
        <div className="network-map-count">
          <span>Visible network</span>
          <strong>{summary.totalNetwork.toLocaleString()}</strong>
          <small>members across seven generations</small>
        </div>
      </div>

      <div className="personal-network-stats" aria-label="Network summary">
        <div><span>Direct invites</span><strong>{summary.directInvites.toLocaleString()}</strong></div>
        <div><span>Total network</span><strong>{summary.totalNetwork.toLocaleString()}</strong></div>
        <div><span>People / Creators</span><strong>{summary.creators.toLocaleString()}</strong></div>
        <div><span>Projects</span><strong>{summary.projects.toLocaleString()}</strong></div>
      </div>

      {message && <div className="personal-network-message" role="status">{message}</div>}
      {loading && <div className="personal-network-message" role="status">Building your interactive network map...</div>}
      {!loading && network?.available && network.graph && (
        <div ref={mapHostRef} style={{ position: 'relative' }} data-network-root-avatar-host>
          <InteractiveNetworkMapV2 graph={network.graph} />
          {rootAvatarUrl && (
            <img
              ref={rootAvatarRef}
              src={rootAvatarUrl}
              alt=""
              aria-hidden="true"
              data-network-root-avatar-overlay
              onError={(event) => { event.currentTarget.style.display = 'none'; }}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: 0,
                height: 0,
                opacity: 0,
                borderRadius: '50%',
                objectFit: 'cover',
                pointerEvents: 'none',
                zIndex: 8,
                boxSizing: 'border-box',
                border: '2px solid #f26419',
                boxShadow: '0 2px 6px rgba(31,24,18,.16)',
              }}
            />
          )}
        </div>
      )}
    </section>
  );
}
