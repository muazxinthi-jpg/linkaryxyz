import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import './network-map-v2.css';

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

type GraphPosition = { x: number; y: number };
type Particle = GraphPosition & { vx: number; vy: number };
type GraphTypeFilter = 'all' | 'people' | 'projects';
type CanvasDrag = { x: number; y: number; panX: number; panY: number };
type NodeDrag = { id: string; x: number; y: number; startX: number; startY: number };

const GRAPH_WIDTH = 1000;
const GRAPH_HEIGHT = 800;
const GRAPH_CENTER = { x: GRAPH_WIDTH / 2, y: GRAPH_HEIGHT / 2 };

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

function shortLabel(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 18 ? `${trimmed.slice(0, 17)}…` : trimmed;
}

function seededPositions(nodes: NetworkGraphNode[]): Map<string, GraphPosition> {
  const positions = new Map<string, GraphPosition>();
  const byDepth = new Map<number, NetworkGraphNode[]>();
  nodes.forEach((node) => {
    if (node.id === 'self') return;
    const group = byDepth.get(node.depth) || [];
    group.push(node);
    byDepth.set(node.depth, group);
  });
  positions.set('self', GRAPH_CENTER);
  for (const [depth, group] of byDepth) {
    const radius = 105 + depth * 72;
    group.forEach((node, index) => {
      const angle = -Math.PI / 2 + (index / Math.max(1, group.length)) * Math.PI * 2 + depth * .17;
      positions.set(node.id, {
        x: GRAPH_CENTER.x + Math.cos(angle) * radius,
        y: GRAPH_CENTER.y + Math.sin(angle) * radius,
      });
    });
  }
  return positions;
}

function matchesTypeFilter(node: NetworkGraphNode, filter: GraphTypeFilter, verifiedOnly: boolean): boolean {
  if (node.id === 'self') return true;
  if (verifiedOnly && !node.verified) return false;
  if (filter === 'projects') return memberType(node) === 'Project';
  if (filter === 'people') return memberType(node) !== 'Project';
  return true;
}

function snapshot(particles: Map<string, Particle>): Record<string, GraphPosition> {
  const next: Record<string, GraphPosition> = {};
  particles.forEach((particle, id) => { next[id] = { x: particle.x, y: particle.y }; });
  return next;
}

export default function InteractiveNetworkMapV3({ graph }: { graph: NetworkGraph }) {
  const [maxDepth, setMaxDepth] = useState(7);
  const [typeFilter, setTypeFilter] = useState<GraphTypeFilter>('all');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [canvasDrag, setCanvasDrag] = useState<CanvasDrag | null>(null);
  const [nodeDrag, setNodeDrag] = useState<NodeDrag | null>(null);
  const [positions, setPositions] = useState<Record<string, GraphPosition>>({});
  const [simulationVersion, setSimulationVersion] = useState(0);
  const [selectedId, setSelectedId] = useState('self');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [expanded, setExpanded] = useState(false);
  const particlesRef = useRef<Map<string, Particle>>(new Map());
  const nodeDragRef = useRef<NodeDrag | null>(null);

  nodeDragRef.current = nodeDrag;

  const byId = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);
  const childrenById = useMemo(() => {
    const map = new Map<string, string[]>();
    graph.nodes.forEach((node) => {
      if (!node.parentId) return;
      const children = map.get(node.parentId) || [];
      children.push(node.id);
      map.set(node.parentId, children);
    });
    return map;
  }, [graph.nodes]);

  const depthNodes = useMemo(() => graph.nodes.filter((node) => node.depth <= maxDepth), [graph.nodes, maxDepth]);
  const seed = useMemo(() => seededPositions(depthNodes), [depthNodes]);

  const visibleNodes = useMemo(() => {
    const depthIds = new Set(depthNodes.map((node) => node.id));
    const afterCollapse = depthNodes.filter((node) => {
      let parentId = node.parentId;
      while (parentId) {
        if (collapsed.has(parentId)) return false;
        parentId = byId.get(parentId)?.parentId || null;
      }
      return true;
    });
    if (typeFilter === 'all' && !verifiedOnly) return afterCollapse;

    const required = new Set<string>(['self']);
    afterCollapse.forEach((node) => {
      if (!matchesTypeFilter(node, typeFilter, verifiedOnly)) return;
      let current: NetworkGraphNode | undefined = node;
      while (current && depthIds.has(current.id)) {
        required.add(current.id);
        current = current.parentId ? byId.get(current.parentId) : undefined;
      }
    });
    return afterCollapse.filter((node) => required.has(node.id));
  }, [depthNodes, collapsed, byId, typeFilter, verifiedOnly]);

  const visibleIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);
  const visibleSignature = useMemo(() => visibleNodes.map((node) => node.id).join('|'), [visibleNodes]);
  const selected = visibleNodes.find((node) => node.id === selectedId) || byId.get('self') || graph.nodes[0];

  const lineageIds = useMemo(() => {
    const ids = new Set<string>();
    let current: NetworkGraphNode | undefined = selected;
    while (current) {
      ids.add(current.id);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return ids;
  }, [selected, byId]);

  const searchMatches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return [];
    return visibleNodes
      .filter((node) => node.id !== 'self')
      .filter((node) => node.displayName.toLowerCase().includes(needle) || (node.username || '').toLowerCase().includes(needle))
      .slice(0, 6);
  }, [search, visibleNodes]);

  const selectedParent = selected?.parentId ? byId.get(selected.parentId) : null;
  const selectedDirectChildren = selected ? (childrenById.get(selected.id) || []).filter((id) => visibleIds.has(id)).length : 0;
  const selectedVisibleDownstream = useMemo(() => {
    if (!selected) return 0;
    let count = 0;
    const queue = [...(childrenById.get(selected.id) || [])];
    const visited = new Set<string>();
    while (queue.length) {
      const id = queue.shift();
      if (!id || visited.has(id) || !visibleIds.has(id)) continue;
      visited.add(id);
      count += 1;
      queue.push(...(childrenById.get(id) || []));
    }
    return count;
  }, [selected, childrenById, visibleIds]);

  function positionFor(id: string): GraphPosition | undefined {
    return positions[id] || seed.get(id);
  }

  function reheat() {
    setSimulationVersion((value) => value + 1);
  }

  useEffect(() => {
    const particles = particlesRef.current;
    const active = new Set(visibleNodes.map((node) => node.id));
    Array.from(particles.keys()).forEach((id) => { if (!active.has(id)) particles.delete(id); });
    visibleNodes.forEach((node) => {
      if (particles.has(node.id)) return;
      const point = seed.get(node.id) || GRAPH_CENTER;
      particles.set(node.id, { x: point.x, y: point.y, vx: 0, vy: 0 });
    });

    const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setPositions(snapshot(particles));
      return;
    }

    const links = visibleNodes
      .filter((node) => node.id !== 'self' && node.parentId && active.has(node.parentId))
      .map((node) => ({ source: node.parentId as string, target: node.id, depth: node.depth }));

    let frame = 0;
    let alpha = .9;
    let lastPaint = 0;
    let stableFrames = 0;

    const tick = (time: number) => {
      const drag = nodeDragRef.current;
      const root = particles.get('self');
      const list = visibleNodes
        .map((node) => ({ node, particle: particles.get(node.id) }))
        .filter((entry): entry is { node: NetworkGraphNode; particle: Particle } => Boolean(entry.particle));

      links.forEach((link) => {
        const source = particles.get(link.source);
        const target = particles.get(link.target);
        if (!source || !target) return;
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const desired = 96 + Math.min(42, link.depth * 8);
        const force = (distance - desired) * .017 * alpha;
        const fx = force * dx / distance;
        const fy = force * dy / distance;
        if (link.target !== drag?.id) {
          target.vx -= fx;
          target.vy -= fy;
        }
        if (link.source !== 'self' && link.source !== drag?.id) {
          source.vx += fx * .62;
          source.vy += fy * .62;
        }
      });

      for (let i = 0; i < list.length; i += 1) {
        for (let j = i + 1; j < list.length; j += 1) {
          const first = list[i];
          const second = list[j];
          let dx = second.particle.x - first.particle.x;
          let dy = second.particle.y - first.particle.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 1) { dx = .7; dy = .4; d2 = dx * dx + dy * dy; }
          const distance = Math.sqrt(d2);
          const minDistance = first.node.id === 'self' || second.node.id === 'self' ? 78 : 60;
          const repulsion = Math.min(1.7, 3600 / Math.max(900, d2)) * alpha;
          const collision = distance < minDistance ? (minDistance - distance) * .05 * alpha : 0;
          const force = repulsion + collision;
          const fx = force * dx / distance;
          const fy = force * dy / distance;
          if (first.node.id !== 'self' && first.node.id !== drag?.id) {
            first.particle.vx -= fx;
            first.particle.vy -= fy;
          }
          if (second.node.id !== 'self' && second.node.id !== drag?.id) {
            second.particle.vx += fx;
            second.particle.vy += fy;
          }
        }
      }

      list.forEach(({ node, particle }) => {
        if (node.id === 'self') {
          particle.vx = 0;
          particle.vy = 0;
          return;
        }
        if (node.id === drag?.id) {
          particle.vx = 0;
          particle.vy = 0;
          return;
        }

        if (root) {
          let dx = particle.x - root.x;
          let dy = particle.y - root.y;
          let distance = Math.max(1, Math.hypot(dx, dy));
          if (distance < 2) { dx = 1; dy = 1; distance = Math.SQRT2; }
          const targetRadius = 94 + node.depth * 72;
          const radialForce = (targetRadius - distance) * .012 * alpha;
          particle.vx += radialForce * dx / distance;
          particle.vy += radialForce * dy / distance;
        }

        particle.vx *= .86;
        particle.vy *= .86;
        particle.vx = Math.max(-9, Math.min(9, particle.vx));
        particle.vy = Math.max(-9, Math.min(9, particle.vy));
        particle.x = Math.max(55, Math.min(GRAPH_WIDTH - 55, particle.x + particle.vx));
        particle.y = Math.max(55, Math.min(GRAPH_HEIGHT - 55, particle.y + particle.vy));
      });

      const speed = list.length ? list.reduce((sum, entry) => sum + Math.hypot(entry.particle.vx, entry.particle.vy), 0) / list.length : 0;
      alpha *= .981;
      stableFrames = alpha < .035 && speed < .08 ? stableFrames + 1 : 0;
      if (time - lastPaint > 25) {
        setPositions(snapshot(particles));
        lastPaint = time;
      }
      if (stableFrames < 18 && alpha > .007) frame = requestAnimationFrame(tick);
      else setPositions(snapshot(particles));
    };

    setPositions(snapshot(particles));
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [visibleSignature, simulationVersion, seed, visibleNodes]);

  useEffect(() => {
    if (!expanded) return;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpanded(false); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = oldOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [expanded]);

  useEffect(() => {
    if (!visibleIds.has(selectedId)) setSelectedId('self');
  }, [visibleIds, selectedId]);

  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    particlesRef.current.clear();
    setPositions({});
    setSelectedId('self');
    reheat();
  }

  function fitView() {
    const points = visibleNodes.map((node) => positionFor(node.id)).filter((point): point is GraphPosition => Boolean(point));
    if (!points.length) return;
    const minX = Math.min(...points.map((point) => point.x));
    const maxX = Math.max(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxY = Math.max(...points.map((point) => point.y));
    const width = Math.max(180, maxX - minX + 170);
    const height = Math.max(160, maxY - minY + 170);
    const nextZoom = Math.max(.5, Math.min(1.35, 900 / width, 680 / height));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    setZoom(nextZoom);
    setPan({ x: nextZoom * (GRAPH_CENTER.x - centerX), y: nextZoom * (GRAPH_CENTER.y - centerY) });
  }

  function focusNode(id: string) {
    const position = positionFor(id);
    if (!position) return;
    setSelectedId(id);
    setPan({ x: zoom * (GRAPH_CENTER.x - position.x), y: zoom * (GRAPH_CENTER.y - position.y) });
    setSearch('');
  }

  function toggleBranch(id: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    reheat();
  }

  function handleWheel(event: ReactWheelEvent<SVGSVGElement>) {
    event.preventDefault();
    setZoom((value) => Math.max(.5, Math.min(2.4, value + (event.deltaY < 0 ? .08 : -.08))));
  }

  function handleCanvasPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || nodeDrag) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setCanvasDrag({ x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y });
  }

  function handleNodePointerDown(event: ReactPointerEvent<SVGGElement>, node: NetworkGraphNode) {
    if (event.button !== 0) return;
    event.stopPropagation();
    const particle = particlesRef.current.get(node.id);
    const current = particle || positionFor(node.id) || GRAPH_CENTER;
    event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId);
    setSelectedId(node.id);
    setNodeDrag({ id: node.id, x: event.clientX, y: event.clientY, startX: current.x, startY: current.y });
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const unitX = rect.width ? GRAPH_WIDTH / rect.width : 1;
    const unitY = rect.height ? GRAPH_HEIGHT / rect.height : 1;

    if (nodeDrag) {
      const particle = particlesRef.current.get(nodeDrag.id);
      if (!particle) return;
      const nextX = Math.max(45, Math.min(GRAPH_WIDTH - 45, nodeDrag.startX + (event.clientX - nodeDrag.x) * unitX / zoom));
      const nextY = Math.max(45, Math.min(GRAPH_HEIGHT - 45, nodeDrag.startY + (event.clientY - nodeDrag.y) * unitY / zoom));
      particle.x = nextX;
      particle.y = nextY;
      particle.vx = 0;
      particle.vy = 0;
      setPositions(snapshot(particlesRef.current));
      return;
    }

    if (!canvasDrag) return;
    setPan({
      x: canvasDrag.panX + (event.clientX - canvasDrag.x) * unitX,
      y: canvasDrag.panY + (event.clientY - canvasDrag.y) * unitY,
    });
  }

  function handlePointerEnd(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const movedNode = Boolean(nodeDrag);
    setCanvasDrag(null);
    setNodeDrag(null);
    if (movedNode) reheat();
  }

  const showAllLabels = visibleNodes.length <= 55;

  return (
    <div className={`relationship-map-shell network-map-v2-shell network-map-fluid${expanded ? ' is-expanded' : ''}`} data-network-map-v3>
      <div className="network-map-v2-toolbar">
        <div className="network-map-v2-filters">
          <label>
            Show through
            <select value={maxDepth} onChange={(event) => { setMaxDepth(Number(event.target.value)); setSelectedId('self'); reheat(); }}>
              {Array.from({ length: 7 }, (_, index) => <option key={index + 1} value={index + 1}>Generation {index + 1}</option>)}
            </select>
          </label>
          <label>
            Show
            <select value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value as GraphTypeFilter); reheat(); }}>
              <option value="all">Everyone</option>
              <option value="people">People / Creators</option>
              <option value="projects">Projects</option>
            </select>
          </label>
          <label className="network-map-v2-check">
            <input type="checkbox" checked={verifiedOnly} onChange={(event) => { setVerifiedOnly(event.target.checked); reheat(); }} />
            Verified only
          </label>
        </div>

        <div className="network-map-v2-search">
          <label htmlFor="network-map-search">Find in network</label>
          <input
            id="network-map-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && searchMatches[0]) {
                event.preventDefault();
                focusNode(searchMatches[0].id);
              }
            }}
            placeholder="Search name or @handle"
            autoComplete="off"
          />
          {search.trim() && (
            <div className="network-map-v2-search-results" role="listbox" aria-label="Network search results">
              {searchMatches.length ? searchMatches.map((node) => (
                <button type="button" key={node.id} onClick={() => focusNode(node.id)} role="option">
                  <span>{node.avatarUrl ? <img src={node.avatarUrl} alt="" /> : initials(node.displayName)}</span>
                  <strong>{node.displayName}</strong>
                  <small>{node.username ? `@${node.username} · ` : ''}{memberType(node)} · G{node.depth}</small>
                </button>
              )) : <div>No visible match</div>}
            </div>
          )}
        </div>

        <div className="relationship-map-controls network-map-v2-controls" aria-label="Network map controls">
          <button type="button" onClick={() => setZoom((value) => Math.min(2.4, value + .12))} aria-label="Zoom in">+</button>
          <button type="button" onClick={() => setZoom((value) => Math.max(.5, value - .12))} aria-label="Zoom out">−</button>
          <button type="button" onClick={fitView}>Fit</button>
          <button type="button" onClick={resetView}>Reset</button>
          <button type="button" className="network-map-expand" aria-pressed={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? 'Exit' : 'Expand'}</button>
        </div>
      </div>

      <div className="network-map-v2-hint" role="note">
        Fluid network view. Drag any node, including your center profile, and the connected branches will naturally reflow. Drag the canvas to explore.
      </div>

      <div className="relationship-map-canvas network-map-v2-canvas" data-network-map-fluid>
        <svg
          viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
          role="img"
          aria-label="Interactive fluid map of your Linkary network across seven generations"
          onWheel={handleWheel}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
        >
          <g transform={`translate(${pan.x} ${pan.y}) translate(${GRAPH_CENTER.x} ${GRAPH_CENTER.y}) scale(${zoom}) translate(${-GRAPH_CENTER.x} ${-GRAPH_CENTER.y})`}>
            {visibleNodes.filter((node) => node.id !== 'self' && node.parentId && visibleIds.has(node.parentId)).map((node) => {
              const from = positionFor(node.parentId || '');
              const to = positionFor(node.id);
              if (!from || !to) return null;
              const onLineage = lineageIds.has(node.id) && lineageIds.has(node.parentId || '');
              return <line key={`edge-${node.id}`} className={onLineage ? 'network-map-edge lineage' : 'network-map-edge'} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />;
            })}

            {visibleNodes.map((node) => {
              const position = positionFor(node.id);
              if (!position) return null;
              const root = node.id === 'self';
              const project = memberType(node) === 'Project';
              const directChildren = (childrenById.get(node.id) || []).filter((id) => visibleIds.has(id)).length;
              const contextOnly = node.id !== 'self' && !matchesTypeFilter(node, typeFilter, verifiedOnly);
              const needle = search.trim().toLowerCase();
              const searchMatch = Boolean(needle && (node.displayName.toLowerCase().includes(needle) || (node.username || '').toLowerCase().includes(needle)));
              const showLabel = showAllLabels || root || node.depth === 1 || selectedId === node.id || hoveredId === node.id || searchMatch;
              const radius = root ? 29 : node.depth === 1 ? 22 : 19;
              return (
                <g
                  key={node.id}
                  className={`network-map-node network-map-v2-node${root ? ' root' : ''}${project ? ' project' : ''}${selectedId === node.id ? ' selected' : ''}${lineageIds.has(node.id) ? ' lineage' : ''}${contextOnly ? ' context-only' : ''}${searchMatch ? ' search-match' : ''}${nodeDrag?.id === node.id ? ' dragging' : ''}`}
                  transform={`translate(${position.x} ${position.y})`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${node.displayName}, ${root ? 'you' : `Generation ${node.depth}`}`}
                  onPointerDown={(event) => handleNodePointerDown(event, node)}
                  onClick={(event) => { event.stopPropagation(); setSelectedId(node.id); }}
                  onDoubleClick={(event) => { event.stopPropagation(); if (directChildren > 0) toggleBranch(node.id); }}
                  onMouseEnter={() => setHoveredId(node.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedId(node.id);
                    }
                  }}
                >
                  <title>{node.displayName}{node.username ? ` (@${node.username})` : ''} · {root ? 'You' : `Generation ${node.depth}`}</title>
                  <circle className="network-map-v2-node-bg" r={radius} />
                  <text className="network-map-v2-initials" textAnchor="middle" dominantBaseline="central">{root ? 'YOU' : initials(node.displayName)}</text>
                  {node.avatarUrl && (
                    <foreignObject x={-radius} y={-radius} width={radius * 2} height={radius * 2} style={{ pointerEvents: 'none', overflow: 'visible' }}>
                      <div style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', background: '#fff' }}>
                        <img
                          src={node.avatarUrl}
                          alt=""
                          referrerPolicy="no-referrer"
                          onError={(event) => { event.currentTarget.style.display = 'none'; }}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                      </div>
                    </foreignObject>
                  )}
                  <circle className="network-map-v2-avatar-ring" r={radius} />
                  {directChildren > 0 && !root && (
                    <g className="network-map-child-count" transform={`translate(${radius - 2} ${-radius + 2})`}>
                      <circle r="8" />
                      <text textAnchor="middle" dominantBaseline="central">{directChildren > 99 ? '99+' : directChildren}</text>
                    </g>
                  )}
                  {showLabel && <text className="network-map-label" textAnchor="middle" y={radius + 17}>{shortLabel(node.displayName)}</text>}
                  {!root && showLabel && <text className="network-map-generation" textAnchor="middle" y={radius + 30}>{node.username ? `@${shortLabel(node.username)}` : `G${node.depth}`}</text>}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <div className="relationship-map-detail network-map-v2-detail" aria-live="polite">
        {selected?.avatarUrl ? <img src={selected.avatarUrl} alt="" /> : <div className="member-initials" aria-hidden="true">{initials(selected?.displayName || 'You')}</div>}
        <div className="network-map-v2-detail-main">
          <span>{selected?.id === 'self' ? 'Your network origin' : `Generation ${selected?.depth || 1}`}</span>
          <strong>{selected?.displayName || 'You'}{selected?.verified ? ' · Verified' : ''}</strong>
          <small>{selected?.id === 'self' ? 'Your center profile is draggable. Every visible branch below follows the same invitation lineage.' : `${selected ? memberType(selected) : 'Member'}${selected?.username ? ` · @${selected.username}` : ''}${formatJoined(selected?.joinedAt || '') ? ` · Joined ${formatJoined(selected?.joinedAt || '')}` : ''}`}</small>
          {selected && selected.id !== 'self' && <small>Connected through {selectedParent?.displayName || 'your network'}.</small>}
        </div>
        <div className="network-map-v2-detail-metrics">
          <div><span>Visible children</span><strong>{selectedDirectChildren}</strong></div>
          <div><span>Visible downstream</span><strong>{selectedVisibleDownstream}</strong></div>
        </div>
        <div className="network-map-v2-detail-actions">
          {selected && (childrenById.get(selected.id)?.length || 0) > 0 && (
            <button type="button" onClick={() => toggleBranch(selected.id)}>{collapsed.has(selected.id) ? 'Expand branch' : 'Collapse branch'}</button>
          )}
          {selected?.username && <a href={`https://linkary.xyz/${encodeURIComponent(selected.username)}`} target="_blank" rel="noreferrer">Open profile ↗</a>}
        </div>
      </div>

      {graph.truncated && (
        <div className="personal-network-message" role="status">
          This visual map shows the first {graph.maxNodes.toLocaleString()} members for performance. Generation counts and member lists remain complete and paginated.
        </div>
      )}
    </div>
  );
}
