import { useEffect, useState } from 'react';
import InteractiveNetworkMapV3 from './InteractiveNetworkMapV3';
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
      {!loading && network?.available && network.graph && <InteractiveNetworkMapV3 graph={network.graph} />}
    </section>
  );
}
