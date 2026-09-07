import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
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
  generations: Array<{ depth: number; members: number }>;
  selectedGeneration: number;
  members: NetworkMember[];
  pagination: {
    offset: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
  graph?: NetworkGraph | null;
};

type InkComponent = {
  key: 'network_strength' | 'verified_contribution' | 'trust_votes' | 'network_economic_footprint' | 'integrity_reliability';
  label: string;
  score: number | null;
  maxScore: number;
  status: 'building' | 'active';
  evidenceSummary: string[];
};

type InkPayload = {
  version: string;
  status: 'building' | 'active';
  totalScore: number | null;
  maxScore: number;
  methodology: 'evidence_first';
  scoringActivated: boolean;
  explanation: string;
  components: InkComponent[];
};

type IdentityNetworkResponse = {
  network?: NetworkPayload;
  ink?: InkPayload;
};

type NetworkView = 'network' | 'map';

type GraphPosition = { x: number; y: number };

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
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' }).format(date);
}

function layoutNetworkGraph(nodes: NetworkGraphNode[], maxDepth: number): Map<string, GraphPosition> {
  const visible = nodes.filter((node) => node.depth <= maxDepth);
  const byId = new Map(visible.map((node) => [node.id, node]));
  const children = new Map<string, string[]>();
  visible.forEach((node) => {
    if (!node.parentId || !byId.has(node.parentId)) return;
    const existing = children.get(node.parentId) || [];
    existing.push(node.id);
    children.set(node.parentId, existing);
  });

  const weightCache = new Map<string, number>();
  function subtreeWeight(id: string): number {
    const cached = weightCache.get(id);
    if (cached !== undefined) return cached;
    const childIds = children.get(id) || [];
    const value = childIds.length === 0 ? 1 : childIds.reduce((sum, childId) => sum + subtreeWeight(childId), 0);
    weightCache.set(id, value);
    return value;
  }

  const positions = new Map<string, GraphPosition>();
  const center = { x: 500, y: 400 };
  positions.set('self', center);

  function placeChildren(parentId: string, startAngle: number, endAngle: number) {
    const childIds = children.get(parentId) || [];
    if (childIds.length === 0) return;
    const totalWeight = childIds.reduce((sum, childId) => sum + subtreeWeight(childId), 0) || 1;
    let cursor = startAngle;
    childIds.forEach((childId) => {
      const childWeight = subtreeWeight(childId);
      const span = (endAngle - startAngle) * (childWeight / totalWeight);
      const childStart = cursor;
      const childEnd = cursor + span;
      const angle = childStart + span / 2;
      const child = byId.get(childId);
      if (child) {
        const radius = 72 + child.depth * 43;
        positions.set(childId, {
          x: center.x + Math.cos(angle) * radius,
          y: center.y + Math.sin(angle) * radius,
        });
      }
      placeChildren(childId, childStart, childEnd);
      cursor = childEnd;
    });
  }

  placeChildren('self', -Math.PI / 2, Math.PI * 1.5);
  return positions;
}

function RelationshipMap({ graph }: { graph: NetworkGraph }) {
  const [maxDepth, setMaxDepth] = useState(7);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [selectedId, setSelectedId] = useState('self');

  const visibleNodes = useMemo(() => graph.nodes.filter((node) => node.depth <= maxDepth), [graph.nodes, maxDepth]);
  const positions = useMemo(() => layoutNetworkGraph(graph.nodes, maxDepth), [graph.nodes, maxDepth]);
  const selected = visibleNodes.find((node) => node.id === selectedId) || visibleNodes[0] || graph.nodes[0];

  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function handleWheel(event: ReactWheelEvent<SVGSVGElement>) {
    event.preventDefault();
    setZoom((value) => Math.max(.65, Math.min(1.8, value + (event.deltaY < 0 ? .08 : -.08))));
  }

  function handlePointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y });
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (!drag) return;
    setPan({ x: drag.panX + event.clientX - drag.x, y: drag.panY + event.clientY - drag.y });
  }

  function handlePointerEnd(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDrag(null);
  }

  return (
    <div className="relationship-map-shell">
      <div className="relationship-map-toolbar">
        <label>
          Show through
          <select value={maxDepth} onChange={(event) => { setMaxDepth(Number(event.target.value)); setSelectedId('self'); }}>
            {Array.from({ length: 7 }, (_, index) => <option key={index + 1} value={index + 1}>Generation {index + 1}</option>)}
          </select>
        </label>
        <div className="relationship-map-controls" aria-label="Network map controls">
          <button type="button" onClick={() => setZoom((value) => Math.min(1.8, value + .12))} aria-label="Zoom in">+</button>
          <button type="button" onClick={() => setZoom((value) => Math.max(.65, value - .12))} aria-label="Zoom out">−</button>
          <button type="button" onClick={resetView}>Reset</button>
        </div>
      </div>

      <div className="relationship-map-canvas" data-network-map>
        <svg
          viewBox="0 0 1000 800"
          role="img"
          aria-label="Interactive map of your Linkary network across seven generations"
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
        >
          <g transform={`translate(${pan.x} ${pan.y}) translate(500 400) scale(${zoom}) translate(-500 -400)`}>
            {visibleNodes.filter((node) => node.id !== 'self' && node.parentId).map((node) => {
              const from = positions.get(node.parentId || '');
              const to = positions.get(node.id);
              if (!from || !to) return null;
              const selectedEdge = selectedId === node.id || selectedId === node.parentId;
              return <line key={`edge-${node.id}`} className={selectedEdge ? 'network-map-edge selected' : 'network-map-edge'} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />;
            })}

            {visibleNodes.map((node) => {
              const position = positions.get(node.id);
              if (!position) return null;
              const root = node.id === 'self';
              const project = memberType(node) === 'Project';
              return (
                <g
                  key={node.id}
                  className={`network-map-node${root ? ' root' : ''}${project ? ' project' : ''}${selectedId === node.id ? ' selected' : ''}`}
                  transform={`translate(${position.x} ${position.y})`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${node.displayName}, ${root ? 'you' : `Generation ${node.depth}`}`}
                  onClick={(event) => { event.stopPropagation(); setSelectedId(node.id); }}
                  onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(node.id); } }}
                >
                  <circle r={root ? 25 : 18} />
                  <text textAnchor="middle" dominantBaseline="central">{root ? 'YOU' : initials(node.displayName)}</text>
                  {(root || node.depth === 1 || selectedId === node.id) && <text className="network-map-label" textAnchor="middle" y={root ? 42 : 34}>{node.displayName}</text>}
                  {!root && <text className="network-map-generation" textAnchor="middle" y={root ? 55 : 48}>G{node.depth}</text>}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <div className="relationship-map-detail" aria-live="polite">
        {selected?.avatarUrl ? <img src={selected.avatarUrl} alt="" /> : <div className="member-initials" aria-hidden="true">{initials(selected?.displayName || 'You')}</div>}
        <div>
          <span>{selected?.id === 'self' ? 'Your network origin' : `Generation ${selected?.depth || 1}`}</span>
          <strong>{selected?.displayName || 'You'}{selected?.verified ? ' · Verified' : ''}</strong>
          <small>{selected?.id === 'self' ? 'Every visible branch below starts from a Linkary invitation lineage.' : `${memberType(selected)}${selected?.username ? ` · @${selected.username}` : ''}${formatJoined(selected?.joinedAt || '') ? ` · Joined ${formatJoined(selected?.joinedAt || '')}` : ''}`}</small>
        </div>
        {selected?.username && <a href={`https://linkary.xyz/${encodeURIComponent(selected.username)}`} target="_blank" rel="noreferrer">Open profile ↗</a>}
      </div>

      {graph.truncated && (
        <div className="personal-network-message" role="status">
          This visual map shows the first {graph.maxNodes.toLocaleString()} members for performance. Generation counts and member lists remain complete and paginated.
        </div>
      )}
    </div>
  );
}

export default function PersonalNetworkPanel({ profileId, view = 'network' }: { profileId: string; view?: NetworkView }) {
  const [generation, setGeneration] = useState(1);
  const [offset, setOffset] = useState(0);
  const [network, setNetwork] = useState<NetworkPayload | null>(null);
  const [ink, setInk] = useState<InkPayload | null>(null);
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
    if (view === 'map') {
      params.set('networkGraph', '1');
      params.set('networkGraphLimit', '120');
    }
    void fetch(`/api/profiles/${encodeURIComponent(profileId)}/identity?${params.toString()}`, { credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Your network could not be loaded.');
        return response.json() as Promise<IdentityNetworkResponse>;
      })
      .then((result) => {
        if (cancelled) return;
        setNetwork(result.network || null);
        setInk(result.ink || null);
        if (!result.network?.available) setMessage('Your Linkary network is being activated.');
      })
      .catch(() => {
        if (!cancelled) setMessage('Your Linkary network is temporarily unavailable.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [profileId, generation, offset, view]);

  function selectGeneration(depth: number) {
    setGeneration(depth);
    setOffset(0);
  }

  const summary = network?.summary || { directInvites: 0, totalNetwork: 0, creators: 0, projects: 0 };
  const members = network?.members || [];
  const pagination = network?.pagination || { offset: 0, limit: 20, total: 0, hasMore: false };

  if (view === 'map') {
    return (
      <section className="wide personal-network network-map-view" data-personal-network aria-labelledby="network-map-title">
        <div className="personal-network-heading">
          <div>
            <span className="personal-network-kicker">RELATIONSHIP MAP</span>
            <h2 id="network-map-title">How your network connects</h2>
            <p>Explore the invitation lineage that connects you to people and Projects across up to seven generations.</p>
          </div>
          <div className="network-map-count"><span>Visible network</span><strong>{summary.totalNetwork.toLocaleString()}</strong><small>members across seven generations</small></div>
        </div>
        <div className="personal-network-stats" aria-label="Network summary">
          <div><span>Direct invites</span><strong>{summary.directInvites.toLocaleString()}</strong></div>
          <div><span>Total network</span><strong>{summary.totalNetwork.toLocaleString()}</strong></div>
          <div><span>People / Creators</span><strong>{summary.creators.toLocaleString()}</strong></div>
          <div><span>Projects</span><strong>{summary.projects.toLocaleString()}</strong></div>
        </div>
        {message && <div className="personal-network-message" role="status">{message}</div>}
        {loading && <div className="personal-network-message" role="status">Building your network map...</div>}
        {!loading && network?.available && network.graph && <RelationshipMap graph={network.graph} />}
      </section>
    );
  }

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
          <strong>{ink?.totalScore === null || ink?.totalScore === undefined ? 'Building' : ink.totalScore.toLocaleString()}</strong>
          <small>{ink?.scoringActivated ? `${ink.maxScore.toLocaleString()} point scale` : 'Evidence is being collected before numeric scoring activates.'}</small>
        </div>
      </div>

      <div className="personal-network-stats" aria-label="Network summary">
        <div><span>Direct invites</span><strong>{summary.directInvites.toLocaleString()}</strong></div>
        <div><span>Total network</span><strong>{summary.totalNetwork.toLocaleString()}</strong></div>
        <div><span>People / Creators</span><strong>{summary.creators.toLocaleString()}</strong></div>
        <div><span>Projects</span><strong>{summary.projects.toLocaleString()}</strong></div>
      </div>

      {ink && (
        <div className="ink-breakdown" aria-label="INK V1 reputation breakdown">
          <div className="ink-breakdown-head">
            <div>
              <span>INK V1</span>
              <h3>Reputation breakdown</h3>
            </div>
            <strong>{ink.totalScore === null ? 'Building' : `${ink.totalScore.toLocaleString()} / ${ink.maxScore.toLocaleString()}`}</strong>
          </div>

          <div className="ink-components">
            {ink.components.map((component) => (
              <div className="ink-component" key={component.key}>
                <div>
                  <strong>{component.label}</strong>
                  <span>{component.maxScore.toLocaleString()} max</span>
                </div>
                <b>{component.score === null ? 'Building' : component.score.toLocaleString()}</b>
              </div>
            ))}
          </div>

          <details className="ink-why">
            <summary>Why this score?</summary>
            <p>{ink.explanation}</p>
            {ink.components.map((component) => (
              <div className="ink-evidence" key={`${component.key}-evidence`}>
                <strong>{component.label}</strong>
                <ul>
                  {component.evidenceSummary.map((item, index) => <li key={`${component.key}-${index}`}>{item}</li>)}
                </ul>
              </div>
            ))}
          </details>
        </div>
      )}

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
          <p>{generation === 1 ? 'Create and share a Linkary invitation. When it is redeemed, the member will appear here automatically.' : 'As your network invites more people and Projects, Linkary will build this generation automatically.'}</p>
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
        <strong>Private network intelligence.</strong>
        <span>Your network view is available only inside your authenticated Linkary account and contributes evidence to Linkary reputation.</span>
      </div>
    </section>
  );
}
