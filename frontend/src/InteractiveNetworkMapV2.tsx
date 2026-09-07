import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
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
type GraphTypeFilter = 'all' | 'people' | 'projects';
type CanvasDrag = { x: number; y: number; panX: number; panY: number };
type NodeDrag = { id: string; x: number; y: number; offsetX: number; offsetY: number };

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
        const radius = 74 + child.depth * 46;
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

function matchesTypeFilter(node: NetworkGraphNode, filter: GraphTypeFilter, verifiedOnly: boolean): boolean {
  if (node.id === 'self') return true;
  if (verifiedOnly && !node.verified) return false;
  if (filter === 'projects') return memberType(node) === 'Project';
  if (filter === 'people') return memberType(node) !== 'Project';
  return true;
}

export default function InteractiveNetworkMapV2({ graph }: { graph: NetworkGraph }) {
  const [maxDepth, setMaxDepth] = useState(7);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [canvasDrag, setCanvasDrag] = useState<CanvasDrag | null>(null);
  const [nodeDrag, setNodeDrag] = useState<NodeDrag | null>(null);
  const [nodeOffsets, setNodeOffsets] = useState<Record<string, GraphPosition>>({});
  const [selectedId, setSelectedId] = useState('self');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<GraphTypeFilter>('all');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [expanded, setExpanded] = useState(false);

  const byId = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);
  const childrenById = useMemo(() => {
    const map = new Map<string, string[]>();
    graph.nodes.forEach((node) => {
      if (!node.parentId) return;
      const existing = map.get(node.parentId) || [];
      existing.push(node.id);
      map.set(node.parentId, existing);
    });
    return map;
  }, [graph.nodes]);

  const basePositions = useMemo(() => layoutNetworkGraph(graph.nodes, maxDepth), [graph.nodes, maxDepth]);

  function positionFor(id: string): GraphPosition | undefined {
    const base = basePositions.get(id);
    if (!base) return undefined;
    const offset = nodeOffsets[id];
    return offset ? { x: base.x + offset.x, y: base.y + offset.y } : base;
  }

  const depthNodes = useMemo(() => graph.nodes.filter((node) => node.depth <= maxDepth), [graph.nodes, maxDepth]);

  const visibleNodes = useMemo(() => {
    const depthIds = new Set(depthNodes.map((node) => node.id));
    const afterCollapse = depthNodes.filter((node) => {
      let parentId = node.parentId;
      while (parentId) {
        if (collapsed.has(parentId)) return false;
        const parent = byId.get(parentId);
        parentId = parent?.parentId || null;
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
  const selected = visibleNodes.find((node) => node.id === selectedId) || byId.get('self') || graph.nodes[0];

  const lineageIds = useMemo(() => {
    const ids = new Set<string>();
    let current = selected;
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

  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [expanded]);

  useEffect(() => {
    if (!visibleIds.has(selectedId)) setSelectedId('self');
  }, [visibleIds, selectedId]);

  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setNodeOffsets({});
    setSelectedId('self');
  }

  function fitView() {
    const points = visibleNodes.map((node) => positionFor(node.id)).filter((point): point is GraphPosition => Boolean(point));
    if (!points.length) return resetView();
    const minX = Math.min(...points.map((point) => point.x));
    const maxX = Math.max(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxY = Math.max(...points.map((point) => point.y));
    const width = Math.max(180, maxX - minX + 150);
    const height = Math.max(160, maxY - minY + 150);
    const nextZoom = Math.max(.55, Math.min(1.35, 900 / width, 680 / height));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    setZoom(nextZoom);
    setPan({ x: nextZoom * (500 - centerX), y: nextZoom * (400 - centerY) });
  }

  function focusNode(id: string) {
    const position = positionFor(id);
    if (!position) return;
    setSelectedId(id);
    setPan({ x: zoom * (500 - position.x), y: zoom * (400 - position.y) });
    setSearch('');
  }

  function toggleBranch(id: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleWheel(event: ReactWheelEvent<SVGSVGElement>) {
    event.preventDefault();
    setZoom((value) => Math.max(.55, Math.min(2.2, value + (event.deltaY < 0 ? .08 : -.08))));
  }

  function handleCanvasPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || nodeDrag) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setCanvasDrag({ x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y });
  }

  function handleNodePointerDown(event: ReactPointerEvent<SVGGElement>, node: NetworkGraphNode) {
    if (event.button !== 0 || node.id === 'self') return;
    event.stopPropagation();
    const current = nodeOffsets[node.id] || { x: 0, y: 0 };
    event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId);
    setNodeDrag({ id: node.id, x: event.clientX, y: event.clientY, offsetX: current.x, offsetY: current.y });
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const unitX = rect.width ? 1000 / rect.width : 1;
    const unitY = rect.height ? 800 / rect.height : 1;

    if (nodeDrag) {
      const deltaX = (event.clientX - nodeDrag.x) * unitX / zoom;
      const deltaY = (event.clientY - nodeDrag.y) * unitY / zoom;
      setNodeOffsets((current) => ({
        ...current,
        [nodeDrag.id]: { x: nodeDrag.offsetX + deltaX, y: nodeDrag.offsetY + deltaY },
      }));
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
    setCanvasDrag(null);
    setNodeDrag(null);
  }

  return (
    <div className={`relationship-map-shell network-map-v2-shell${expanded ? ' is-expanded' : ''}`}>
      <div className="network-map-v2-toolbar">
        <div className="network-map-v2-filters">
          <label>
            Show through
            <select value={maxDepth} onChange={(event) => { setMaxDepth(Number(event.target.value)); setSelectedId('self'); }}>
              {Array.from({ length: 7 }, (_, index) => <option key={index + 1} value={index + 1}>Generation {index + 1}</option>)}
            </select>
          </label>
          <label>
            Show
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as GraphTypeFilter)}>
              <option value="all">Everyone</option>
              <option value="people">People / Creators</option>
              <option value="projects">Projects</option>
            </select>
          </label>
          <label className="network-map-v2-check">
            <input type="checkbox" checked={verifiedOnly} onChange={(event) => setVerifiedOnly(event.target.checked)} />
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
                  <small>{memberType(node)} · G{node.depth}</small>
                </button>
              )) : <div>No visible match</div>}
            </div>
          )}
        </div>

        <div className="relationship-map-controls network-map-v2-controls" aria-label="Network map controls">
          <button type="button" onClick={() => setZoom((value) => Math.min(2.2, value + .12))} aria-label="Zoom in">+</button>
          <button type="button" onClick={() => setZoom((value) => Math.max(.55, value - .12))} aria-label="Zoom out">−</button>
          <button type="button" onClick={fitView}>Fit</button>
          <button type="button" onClick={resetView}>Reset</button>
          <button type="button" className="network-map-expand" aria-pressed={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? 'Exit' : 'Expand'}</button>
        </div>
      </div>

      <div className="network-map-v2-hint" role="note">
        Drag the canvas to explore. Drag individual nodes to rearrange your view. Click any member to trace their connection back to you.
      </div>

      <div className="relationship-map-canvas network-map-v2-canvas" data-network-map-v2>
        <svg
          viewBox="0 0 1000 800"
          role="img"
          aria-label="Interactive map of your Linkary network across seven generations"
          onWheel={handleWheel}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
        >
          <g transform={`translate(${pan.x} ${pan.y}) translate(500 400) scale(${zoom}) translate(-500 -400)`}>
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
              const searchNeedle = search.trim().toLowerCase();
              const searchMatch = Boolean(searchNeedle && (node.displayName.toLowerCase().includes(searchNeedle) || (node.username || '').toLowerCase().includes(searchNeedle)));
              const showLabel = root || node.depth === 1 || selectedId === node.id || hoveredId === node.id || searchMatch;
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
                  onDoubleClick={(event) => { event.stopPropagation(); if (!root && directChildren > 0) toggleBranch(node.id); }}
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
                  <circle className="network-map-v2-node-bg" r={root ? 26 : 19} />
                  <text className="network-map-v2-initials" textAnchor="middle" dominantBaseline="central">{root ? 'YOU' : initials(node.displayName)}</text>
                  {directChildren > 0 && !root && (
                    <g className="network-map-child-count" transform="translate(16 -15)">
                      <circle r="8" />
                      <text textAnchor="middle" dominantBaseline="central">{directChildren > 99 ? '99+' : directChildren}</text>
                    </g>
                  )}
                  {showLabel && <text className="network-map-label" textAnchor="middle" y={root ? 44 : 36}>{node.displayName}</text>}
                  {!root && showLabel && <text className="network-map-generation" textAnchor="middle" y={root ? 57 : 50}>G{node.depth}</text>}
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
          <small>{selected?.id === 'self' ? 'Every visible branch below starts from a Linkary invitation lineage.' : `${memberType(selected)}${selected?.username ? ` · @${selected.username}` : ''}${formatJoined(selected?.joinedAt || '') ? ` · Joined ${formatJoined(selected?.joinedAt || '')}` : ''}`}</small>
          {selected?.id !== 'self' && <small>Connected through {selectedParent?.displayName || 'your network'}.</small>}
        </div>
        <div className="network-map-v2-detail-metrics">
          <div><span>Visible children</span><strong>{selectedDirectChildren}</strong></div>
          <div><span>Visible downstream</span><strong>{selectedVisibleDownstream}</strong></div>
        </div>
        <div className="network-map-v2-detail-actions">
          {selected?.id !== 'self' && (childrenById.get(selected.id)?.length || 0) > 0 && (
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
