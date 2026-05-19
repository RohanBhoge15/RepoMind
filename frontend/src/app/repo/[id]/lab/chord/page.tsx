/**
 * Chord Map — interactive circular dependency diagram.
 *
 * Bezier-curved chords through the centre, cluster arcs grouped by top-level
 * folder, hover-fade non-related edges, weighted edge thickness, rich
 * tooltip, click-to-focus mode, search spotlight, cycle detection, cluster
 * filter, density mini-ring, reduced-motion-aware auto-rotation.
 */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import { CircuitBoard, Search, Pause, Play, RotateCcw, AlertTriangle, X, Filter, Layers } from 'lucide-react';
import LabShell from '../_components/LabShell';
import { apiClient } from '@/lib/api';
import { DependencyGraph, GraphNode, GraphEdge } from '@/lib/types';

// ──────────────────────────────────────────────────────────────────────────
// Layout constants
// ──────────────────────────────────────────────────────────────────────────
const VIEW = 900;            // svg viewBox size
const CX = VIEW / 2;
const CY = VIEW / 2;
const OUTER_R = 360;         // node ring
const ARC_INNER = 380;       // cluster arc inner radius
const ARC_OUTER = 405;       // cluster arc outer radius
const DENSITY_INNER = 415;
const DENSITY_OUTER = 432;
const LABEL_R = 445;         // label text radius

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────
function polar(angle: number, r: number) {
  return { x: CX + r * Math.cos(angle), y: CY + r * Math.sin(angle) };
}

function topFolder(path: string): string {
  const seg = path.split('/').filter(Boolean);
  if (seg.length <= 1) return '(root)';
  return seg[0];
}

const CLUSTER_PALETTE = [
  'hsl(187 100% 56%)',  // cyan
  'hsl(262 83% 68%)',   // violet
  'hsl(217 91% 60%)',   // blue
  'hsl(326 95% 65%)',   // pink
  'hsl(48 96% 60%)',    // amber
  'hsl(160 84% 55%)',   // emerald
  'hsl(280 80% 65%)',   // purple
  'hsl(20 90% 60%)',    // orange
  'hsl(140 70% 55%)',   // green
  'hsl(0 80% 65%)',     // red
];

function shortPath(p: string) {
  const segs = p.split('/');
  if (segs.length <= 3) return p;
  return `…/${segs.slice(-2).join('/')}`;
}

/**
 * Pick a text colour (near-black or near-white) that reads against a given
 * fill. Parses CSS `hsl(H S% L%)` strings — that's what CLUSTER_PALETTE uses
 * here. Falls back to white for anything we can't parse, since the canvas is
 * dark and any unparseable value is presumed to be a saturated accent.
 */
function readableTextOn(fill: string): string {
  const m = /hsl\(\s*[\d.]+\s+[\d.]+%\s+([\d.]+)%/i.exec(fill);
  if (!m) return '#0b0b10';
  const lightness = parseFloat(m[1]);
  // Lightness above ~58% reads better with dark text; below, with light text.
  return lightness >= 58 ? '#0b0b10' : '#f5f5f7';
}

// ──────────────────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────────────────
export default function ChordMapPage() {
  const params = useParams();
  const repoId = parseInt(params.id as string);
  const { data: session } = useSession();

  const [graph, setGraph] = useState<DependencyGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [rotation, setRotation] = useState(0);
  const [paused, setPaused] = useState(false);
  const [search, setSearch] = useState('');
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [focusNode, setFocusNode] = useState<string | null>(null);
  const [hiddenClusters, setHiddenClusters] = useState<Set<string>>(new Set());
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const mouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  // Respect reduced-motion
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(m.matches);
    const h = () => setPrefersReducedMotion(m.matches);
    m.addEventListener('change', h);
    return () => m.removeEventListener('change', h);
  }, []);

  // Auto-rotate
  useEffect(() => {
    if (paused || prefersReducedMotion || hoverNode || focusNode) return;
    let id: number;
    const tick = () => {
      setRotation((r) => (r + 0.0015) % (Math.PI * 2));
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [paused, prefersReducedMotion, hoverNode, focusNode]);

  // Fetch graph
  useEffect(() => {
    if (!session) return;
    const token = (session as any).backendToken;
    if (token && !apiClient.hasAuthToken()) apiClient.setAuthToken(token);
    (async () => {
      try {
        const g = await apiClient.getDependencyGraph(repoId);
        setGraph(g);
      } catch (e: any) {
        setError(e?.message || 'Failed to load dependency graph');
      } finally {
        setLoading(false);
      }
    })();
  }, [repoId, session]);

  // ─── Derived layout ────────────────────────────────────────────────────
  const layout = useMemo(() => {
    if (!graph) return null;
    const nodes = graph.nodes;
    const edges = graph.edges;

    // Build folder clusters → sorted by size desc, then nodes sorted inside
    const folderMap = new Map<string, GraphNode[]>();
    nodes.forEach((n) => {
      const f = topFolder(n.path);
      if (!folderMap.has(f)) folderMap.set(f, []);
      folderMap.get(f)!.push(n);
    });
    const folders = Array.from(folderMap.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .map(([name, list], i) => ({
        name,
        nodes: list.sort((a, b) => a.path.localeCompare(b.path)),
        color: CLUSTER_PALETTE[i % CLUSTER_PALETTE.length],
      }));

    // Flatten preserving cluster grouping for angle assignment
    const ordered = folders.flatMap((f) => f.nodes);
    const N = ordered.length;
    const step = (Math.PI * 2) / Math.max(N, 1);
    const angleById = new Map<string, number>();
    const clusterById = new Map<string, string>();
    ordered.forEach((n, i) => {
      angleById.set(n.id, i * step - Math.PI / 2); // start at top
      clusterById.set(n.id, topFolder(n.path));
    });

    // In/out degrees + weighted edges aggregated by pair (source,target)
    const inDeg = new Map<string, number>();
    const outDeg = new Map<string, number>();
    const edgeWeight = new Map<string, number>();
    edges.forEach((e) => {
      if (!angleById.has(e.source) || !angleById.has(e.target)) return;
      outDeg.set(e.source, (outDeg.get(e.source) || 0) + 1);
      inDeg.set(e.target, (inDeg.get(e.target) || 0) + 1);
      const k = `${e.source}→${e.target}`;
      edgeWeight.set(k, (edgeWeight.get(k) || 0) + 1);
    });

    const maxWeight = Math.max(1, ...Array.from(edgeWeight.values()));

    // Bidirectional cycle detection: A→B and B→A both exist
    const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    const directedSet = new Set(Array.from(edgeWeight.keys()));
    const cyclePairs = new Set<string>();
    edges.forEach((e) => {
      if (directedSet.has(`${e.target}→${e.source}`) && e.source !== e.target) {
        cyclePairs.add(pairKey(e.source, e.target));
      }
    });

    // Neighborhood: out & in adjacency
    const outAdj = new Map<string, Set<string>>();
    const inAdj = new Map<string, Set<string>>();
    edges.forEach((e) => {
      if (!angleById.has(e.source) || !angleById.has(e.target)) return;
      if (!outAdj.has(e.source)) outAdj.set(e.source, new Set());
      outAdj.get(e.source)!.add(e.target);
      if (!inAdj.has(e.target)) inAdj.set(e.target, new Set());
      inAdj.get(e.target)!.add(e.source);
    });

    // Folder arc ranges
    const arcs = folders.map((f) => {
      const first = ordered.findIndex((n) => topFolder(n.path) === f.name);
      const last = first + f.nodes.length - 1;
      const startA = first * step - Math.PI / 2 - step * 0.45;
      const endA = last * step - Math.PI / 2 + step * 0.45;
      return { ...f, startAngle: startA, endAngle: endA };
    });

    // Density bins per cluster (edges that touch each cluster)
    const densityByCluster = new Map<string, number>();
    edges.forEach((e) => {
      const cs = clusterById.get(e.source);
      const ct = clusterById.get(e.target);
      if (cs) densityByCluster.set(cs, (densityByCluster.get(cs) || 0) + 1);
      if (ct && cs !== ct) densityByCluster.set(ct, (densityByCluster.get(ct) || 0) + 1);
    });
    const maxDensity = Math.max(1, ...Array.from(densityByCluster.values()));

    return {
      ordered,
      angleById,
      clusterById,
      inDeg,
      outDeg,
      edges,
      edgeWeight,
      maxWeight,
      cyclePairs,
      pairKey,
      outAdj,
      inAdj,
      arcs,
      folders,
      densityByCluster,
      maxDensity,
      step,
    };
  }, [graph]);

  // Visible nodes set after cluster filter + search
  const visibleNodeIds = useMemo(() => {
    if (!layout) return new Set<string>();
    const q = search.trim().toLowerCase();
    const out = new Set<string>();
    layout.ordered.forEach((n) => {
      if (hiddenClusters.has(topFolder(n.path))) return;
      if (q && !(n.label.toLowerCase().includes(q) || n.path.toLowerCase().includes(q))) return;
      out.add(n.id);
    });
    return out;
  }, [layout, search, hiddenClusters]);

  // Spotlight neighborhood (1-hop)
  const spotlight = useMemo(() => {
    if (!layout) return null;
    const active = focusNode || hoverNode;
    if (!active) return null;
    const out = layout.outAdj.get(active) || new Set();
    const inc = layout.inAdj.get(active) || new Set();
    return { active, out: out as Set<string>, inc: inc as Set<string> };
  }, [layout, hoverNode, focusNode]);

  if (loading)
    return (
      <LabShell title="Chord Map" subtitle="Loading dependency graph…" icon={<CircuitBoard className="h-5 w-5" />} accent="hsl(var(--accent-violet))" scroll={false}>
        <div className="h-[560px] rounded-2xl border border-[var(--hairline)] bg-[var(--surface-1)]/40 skeleton" />
      </LabShell>
    );

  if (error || !graph || !layout)
    return (
      <LabShell title="Chord Map" subtitle="Dependency analysis" icon={<CircuitBoard className="h-5 w-5" />} accent="hsl(var(--accent-violet))">
        <div className="rounded-2xl border border-[hsl(var(--danger)/0.3)] bg-[hsl(var(--danger)/0.05)] p-6 text-sm text-[hsl(var(--danger))]">
          {error || 'No graph data available.'}
        </div>
      </LabShell>
    );

  const hovered = hoverNode ? graph.nodes.find((n) => n.id === hoverNode) : null;
  const focused = focusNode ? graph.nodes.find((n) => n.id === focusNode) : null;
  const detailNode = focused || hovered;

  // ─── Render ────────────────────────────────────────────────────────────
  const renderNode = (n: GraphNode) => {
    const a = layout.angleById.get(n.id)! + rotation;
    const p = polar(a, OUTER_R);
    const cluster = layout.clusterById.get(n.id) || '';
    const arc = layout.arcs.find((x) => x.name === cluster)!;
    const isVisible = visibleNodeIds.has(n.id);
    const inSpotlight =
      !spotlight ||
      n.id === spotlight.active ||
      spotlight.out.has(n.id) ||
      spotlight.inc.has(n.id);
    const dim = !isVisible || (spotlight && !inSpotlight);
    const deg = (layout.outDeg.get(n.id) || 0) + (layout.inDeg.get(n.id) || 0);
    const r = 2.2 + Math.min(6, Math.sqrt(deg) * 0.9);
    const isActive = n.id === (focusNode || hoverNode);
    const effectiveR = r + (isActive ? 3 : 0);

    // ─── In-circle label ────────────────────────────────────────────────
    // Use just the basename (no path), strip extension so short names fit.
    // SVG text scales ~ char width ≈ 0.55 × fontSize for a monospace font.
    // Pick the largest font that lets `name` fit inside diameter (with 1px pad),
    // then truncate with an ellipsis if it still doesn't fit at the floor.
    const basename = (n.label || n.path || '').split(/[\\/]/).pop() || '';
    const nameNoExt = basename.replace(/\.[^./]+$/, '') || basename;
    const innerDia = (effectiveR - 1) * 2;
    // Try fonts 9 → 5 px; the smallest legibility is ~5 px.
    let fontSize = 0;
    let displayName = '';
    for (const fs of [9, 8, 7, 6, 5]) {
      const maxChars = Math.floor(innerDia / (fs * 0.6));
      if (maxChars >= 2) {
        fontSize = fs;
        if (nameNoExt.length <= maxChars) displayName = nameNoExt;
        else if (maxChars >= 4) displayName = nameNoExt.slice(0, maxChars - 1) + '…';
        else displayName = nameNoExt.slice(0, maxChars);
        break;
      }
    }
    // Active node always gets its label, even if it has to extend outside the circle.
    if (!fontSize && isActive) {
      fontSize = 9;
      displayName = nameNoExt.length <= 14 ? nameNoExt : nameNoExt.slice(0, 13) + '…';
    }

    // Pick a text colour that reads on the fill (light fills → dark text, dark fills → light text).
    const txtColour = readableTextOn(arc.color);

    return (
      <g key={n.id} style={{ pointerEvents: 'all' }}>
        <circle
          cx={p.x}
          cy={p.y}
          r={effectiveR}
          fill={arc.color}
          opacity={dim ? 0.12 : 1}
          style={{ transition: 'opacity 0.2s' }}
          filter={isActive ? 'url(#nodeGlow)' : undefined}
        />
        {displayName && !dim && (
          <text
            x={p.x}
            y={p.y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={fontSize}
            fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
            fontWeight={isActive ? 600 : 500}
            fill={txtColour}
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {displayName}
          </text>
        )}
        <circle
          cx={p.x}
          cy={p.y}
          r={r + 8}
          fill="transparent"
          onMouseEnter={(e) => {
            setHoverNode(n.id);
            setTooltipPos({ x: e.clientX, y: e.clientY });
          }}
          onMouseMove={(e) => setTooltipPos({ x: e.clientX, y: e.clientY })}
          onMouseLeave={() => {
            setHoverNode(null);
            setTooltipPos(null);
          }}
          onClick={() => setFocusNode(focusNode === n.id ? null : n.id)}
          style={{ cursor: 'pointer' }}
        />
      </g>
    );
  };

  const renderEdge = (e: GraphEdge, idx: number) => {
    const a1 = layout.angleById.get(e.source);
    const a2 = layout.angleById.get(e.target);
    if (a1 == null || a2 == null) return null;
    if (!visibleNodeIds.has(e.source) || !visibleNodeIds.has(e.target)) return null;

    const p1 = polar(a1 + rotation, OUTER_R - 2);
    const p2 = polar(a2 + rotation, OUTER_R - 2);
    const path = `M ${p1.x} ${p1.y} Q ${CX} ${CY} ${p2.x} ${p2.y}`;

    const weight = layout.edgeWeight.get(`${e.source}→${e.target}`) || 1;
    const isCycle = layout.cyclePairs.has(layout.pairKey(e.source, e.target));

    let opacity = 0.18;
    let stroke = 'hsl(var(--accent-cyan) / 0.4)';
    if (spotlight) {
      const involved = e.source === spotlight.active || e.target === spotlight.active;
      if (involved) {
        opacity = 0.95;
        stroke =
          e.source === spotlight.active
            ? 'hsl(var(--accent-pink))' // outgoing
            : 'hsl(var(--accent-cyan))'; // incoming
      } else {
        opacity = 0.04;
      }
    } else if (isCycle) {
      stroke = 'hsl(var(--danger))';
      opacity = 0.55;
    } else {
      const cs = layout.clusterById.get(e.source);
      const ct = layout.clusterById.get(e.target);
      // intra-cluster edges fade more
      if (cs === ct) opacity = 0.1;
    }

    const sw = 0.4 + (weight / layout.maxWeight) * 2.2;

    return (
      <path
        key={idx}
        d={path}
        stroke={stroke}
        strokeWidth={sw}
        fill="none"
        opacity={opacity}
        style={{ transition: 'opacity 0.2s, stroke 0.2s' }}
        filter={spotlight && (e.source === spotlight.active || e.target === spotlight.active) ? 'url(#edgeGlow)' : undefined}
      />
    );
  };

  return (
    <LabShell
      title="Chord Map"
      subtitle="Bezier dependency chords with cluster arcs. Hover a file to spotlight its imports; click to lock focus."
      icon={<CircuitBoard className="h-5 w-5" />}
      accent="hsl(var(--accent-violet))"
      scroll={false}
    >
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[hsl(var(--text-muted))]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files…"
            aria-label="Filter chord by file name"
            className="pl-8 pr-3 py-1.5 text-[12px] bg-[hsl(var(--surface-1)/0.7)] border border-[hsl(var(--hairline))] rounded-lg text-[hsl(var(--text-primary))] placeholder:text-[hsl(var(--text-muted))] focus:outline-none focus:border-[hsl(var(--accent-violet)/0.5)] w-56"
          />
        </div>
        <button
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? 'Resume rotation' : 'Pause rotation'}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-1)/0.7)] text-[11px] text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--surface-2))]"
        >
          {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
          {paused ? 'Play' : 'Pause'}
        </button>
        <button
          onClick={() => {
            setFocusNode(null);
            setSearch('');
            setHiddenClusters(new Set());
          }}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-1)/0.7)] text-[11px] text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--surface-2))]"
        >
          <RotateCcw className="h-3 w-3" /> Reset
        </button>
        <div className="ml-auto flex items-center gap-3 text-[11px] text-[hsl(var(--text-secondary))]">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[hsl(var(--accent-pink))]" /> Outgoing
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[hsl(var(--accent-cyan))]" /> Incoming
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[hsl(var(--danger))]" /> Cycle
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4" style={{ height: 'calc(100vh - 280px)' }}>
        {/* Chord canvas */}
        <div className="relative rounded-2xl border border-[hsl(var(--hairline))] bg-[radial-gradient(ellipse_at_center,hsl(var(--surface-1)/0.9),hsl(var(--bg-base))_70%)] overflow-hidden">
          <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className="absolute inset-0 w-full h-full">
            <defs>
              <filter id="nodeGlow">
                <feGaussianBlur stdDeviation="4" />
                <feMerge>
                  <feMergeNode />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="edgeGlow">
                <feGaussianBlur stdDeviation="2" />
                <feMerge>
                  <feMergeNode />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="hsl(var(--accent-violet))" stopOpacity="0.15" />
                <stop offset="100%" stopColor="hsl(var(--accent-violet))" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Centre glow */}
            <circle cx={CX} cy={CY} r={OUTER_R * 0.8} fill="url(#centerGlow)" />

            {/* Cluster arcs */}
            {layout.arcs.map((a) => {
              const s = polar(a.startAngle + rotation, ARC_INNER);
              const e = polar(a.endAngle + rotation, ARC_INNER);
              const so = polar(a.startAngle + rotation, ARC_OUTER);
              const eo = polar(a.endAngle + rotation, ARC_OUTER);
              const large = a.endAngle - a.startAngle > Math.PI ? 1 : 0;
              const path = `M ${s.x} ${s.y} A ${ARC_INNER} ${ARC_INNER} 0 ${large} 1 ${e.x} ${e.y} L ${eo.x} ${eo.y} A ${ARC_OUTER} ${ARC_OUTER} 0 ${large} 0 ${so.x} ${so.y} Z`;
              const isHidden = hiddenClusters.has(a.name);
              return (
                <g key={a.name} style={{ cursor: 'pointer' }}>
                  <path
                    d={path}
                    fill={a.color}
                    opacity={isHidden ? 0.08 : 0.55}
                    onClick={() => {
                      const next = new Set(hiddenClusters);
                      if (next.has(a.name)) next.delete(a.name);
                      else next.add(a.name);
                      setHiddenClusters(next);
                    }}
                  />
                </g>
              );
            })}

            {/* Density mini-ring */}
            {layout.arcs.map((a) => {
              const d = layout.densityByCluster.get(a.name) || 0;
              const ratio = d / layout.maxDensity;
              const innerR = DENSITY_INNER;
              const outerR = DENSITY_INNER + (DENSITY_OUTER - DENSITY_INNER) * ratio;
              const s = polar(a.startAngle + rotation, innerR);
              const e = polar(a.endAngle + rotation, innerR);
              const so = polar(a.startAngle + rotation, outerR);
              const eo = polar(a.endAngle + rotation, outerR);
              const large = a.endAngle - a.startAngle > Math.PI ? 1 : 0;
              const path = `M ${s.x} ${s.y} A ${innerR} ${innerR} 0 ${large} 1 ${e.x} ${e.y} L ${eo.x} ${eo.y} A ${outerR} ${outerR} 0 ${large} 0 ${so.x} ${so.y} Z`;
              return <path key={a.name + 'd'} d={path} fill={a.color} opacity={hiddenClusters.has(a.name) ? 0.05 : 0.32} />;
            })}

            {/* Cluster labels */}
            {layout.arcs.map((a) => {
              const mid = (a.startAngle + a.endAngle) / 2 + rotation;
              const p = polar(mid, LABEL_R);
              const flip = Math.cos(mid) < 0;
              return (
                <text
                  key={a.name + 'l'}
                  x={p.x}
                  y={p.y}
                  fontSize={11}
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                  textAnchor="middle"
                  fill={a.color}
                  opacity={hiddenClusters.has(a.name) ? 0.3 : 0.85}
                  transform={`rotate(${((mid * 180) / Math.PI) + (flip ? 90 : -90)}, ${p.x}, ${p.y})`}
                  style={{ letterSpacing: 1 }}
                >
                  {a.name.toUpperCase()}
                </text>
              );
            })}

            {/* Edges */}
            <g>{graph.edges.map((e, i) => renderEdge(e, i))}</g>

            {/* Nodes */}
            <g>{graph.nodes.map(renderNode)}</g>

            {/* Centre badge */}
            <g style={{ pointerEvents: 'none' }}>
              <circle cx={CX} cy={CY} r={56} fill="hsl(var(--surface-1))" stroke="hsl(var(--hairline))" strokeWidth={1} opacity={0.95} />
              <text x={CX} y={CY - 6} textAnchor="middle" fontSize={11} fill="hsl(var(--text-muted))" fontFamily="ui-monospace, monospace" style={{ letterSpacing: 1 }}>
                {graph.nodes.length} files
              </text>
              <text x={CX} y={CY + 12} textAnchor="middle" fontSize={11} fill="hsl(var(--text-muted))" fontFamily="ui-monospace, monospace" style={{ letterSpacing: 1 }}>
                {graph.edges.length} edges
              </text>
              <text x={CX} y={CY + 28} textAnchor="middle" fontSize={10} fill="hsl(var(--danger))" fontFamily="ui-monospace, monospace" style={{ letterSpacing: 1 }}>
                {layout.cyclePairs.size} cycles
              </text>
            </g>
          </svg>

          {/* Focus-mode pill */}
          {focusNode && (
            <button
              onClick={() => setFocusNode(null)}
              className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[hsl(var(--surface-1)/0.9)] border border-[hsl(var(--accent-violet)/0.4)] text-[11px] text-[hsl(var(--accent-violet))]"
            >
              <X className="h-3 w-3" /> Exit focus
            </button>
          )}
        </div>

        {/* Side panel */}
        <div className="flex flex-col gap-3 overflow-y-auto">
          {/* Cluster filter */}
          <div className="rounded-xl border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-1)/0.6)] p-3">
            <div className="flex items-center gap-1.5 mb-2 mono text-[10px] uppercase tracking-widest text-[hsl(var(--text-muted))]">
              <Filter className="h-3 w-3" /> Clusters
            </div>
            <div className="flex flex-wrap gap-1.5">
              {layout.arcs.map((a) => {
                const hidden = hiddenClusters.has(a.name);
                return (
                  <button
                    key={a.name}
                    onClick={() => {
                      const next = new Set(hiddenClusters);
                      if (next.has(a.name)) next.delete(a.name);
                      else next.add(a.name);
                      setHiddenClusters(next);
                    }}
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] mono border"
                    style={{
                      background: hidden ? 'transparent' : `${a.color}22`,
                      borderColor: hidden ? 'hsl(var(--hairline))' : `${a.color}80`,
                      color: hidden ? 'hsl(var(--text-muted))' : a.color,
                      opacity: hidden ? 0.45 : 1,
                    }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: a.color }} />
                    {a.name} · {a.nodes.length}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Detail panel */}
          <AnimatePresence mode="wait">
            {detailNode ? (
              <motion.div
                key={detailNode.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="rounded-xl border border-[hsl(var(--accent-violet)/0.3)] bg-[hsl(var(--surface-1)/0.8)] p-3"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Layers className="h-3.5 w-3.5 text-[hsl(var(--accent-violet))]" />
                  <span className="mono text-[10px] uppercase tracking-widest text-[hsl(var(--accent-violet))]">
                    {focusNode ? 'Focused' : 'Hover'}
                  </span>
                </div>
                <div className="text-sm font-semibold text-[hsl(var(--text-primary))] break-all">
                  {detailNode.label}
                </div>
                <div className="mono text-[10px] text-[hsl(var(--text-muted))] mb-2 break-all">
                  {detailNode.path}
                </div>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <Metric label="In" value={layout.inDeg.get(detailNode.id) || 0} accent="cyan" />
                  <Metric label="Out" value={layout.outDeg.get(detailNode.id) || 0} accent="pink" />
                  <Metric
                    label="LoC"
                    value={detailNode.loc ?? '—'}
                    accent="violet"
                  />
                </div>
                <NeighborList
                  title="Imports (out)"
                  ids={Array.from(layout.outAdj.get(detailNode.id) || [])}
                  graph={graph}
                  layout={layout}
                  onPick={(id) => setFocusNode(id)}
                  accent="hsl(var(--accent-pink))"
                />
                <NeighborList
                  title="Imported by (in)"
                  ids={Array.from(layout.inAdj.get(detailNode.id) || [])}
                  graph={graph}
                  layout={layout}
                  onPick={(id) => setFocusNode(id)}
                  accent="hsl(var(--accent-cyan))"
                />
              </motion.div>
            ) : (
              <div className="rounded-xl border border-dashed border-[hsl(var(--hairline))] p-4 text-center text-[11px] text-[hsl(var(--text-muted))]">
                Hover a file on the ring to inspect its dependencies. Click to lock focus.
              </div>
            )}
          </AnimatePresence>

          {/* Cycle list */}
          {layout.cyclePairs.size > 0 && (
            <div className="rounded-xl border border-[hsl(var(--danger)/0.3)] bg-[hsl(var(--danger)/0.06)] p-3">
              <div className="flex items-center gap-1.5 mb-2 mono text-[10px] uppercase tracking-widest text-[hsl(var(--danger))]">
                <AlertTriangle className="h-3 w-3" /> Circular dependencies · {layout.cyclePairs.size}
              </div>
              <ul className="space-y-1 max-h-32 overflow-y-auto">
                {Array.from(layout.cyclePairs)
                  .slice(0, 20)
                  .map((pair) => {
                    const [a, b] = pair.split('|');
                    const an = graph.nodes.find((n) => n.id === a);
                    const bn = graph.nodes.find((n) => n.id === b);
                    if (!an || !bn) return null;
                    return (
                      <li key={pair} className="mono text-[10.5px] text-[hsl(var(--text-secondary))] truncate">
                        <button
                          onClick={() => setFocusNode(a)}
                          className="hover:text-[hsl(var(--danger))]"
                        >
                          {shortPath(an.path)}
                        </button>{' '}
                        ⇄{' '}
                        <button
                          onClick={() => setFocusNode(b)}
                          className="hover:text-[hsl(var(--danger))]"
                        >
                          {shortPath(bn.path)}
                        </button>
                      </li>
                    );
                  })}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Floating tooltip */}
      {hovered && tooltipPos && !focusNode && (
        <div
          className="fixed z-50 pointer-events-none rounded-lg border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-1)/0.95)] backdrop-blur-md px-2.5 py-1.5 shadow-[0_8px_24px_hsl(0_0%_0%/0.5)]"
          style={{ left: tooltipPos.x + 12, top: tooltipPos.y + 12, maxWidth: 280 }}
        >
          <div className="text-[12px] font-semibold text-[hsl(var(--text-primary))] truncate">
            {hovered.label}
          </div>
          <div className="mono text-[10px] text-[hsl(var(--text-muted))] truncate">{hovered.path}</div>
          <div className="mt-1 flex items-center gap-2 mono text-[10px]">
            <span className="text-[hsl(var(--accent-cyan))]">in {layout.inDeg.get(hovered.id) || 0}</span>
            <span className="text-[hsl(var(--accent-pink))]">out {layout.outDeg.get(hovered.id) || 0}</span>
            {hovered.loc != null && <span className="text-[hsl(var(--text-secondary))]">{hovered.loc} loc</span>}
          </div>
        </div>
      )}
    </LabShell>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────────────────
function Metric({ label, value, accent }: { label: string; value: number | string; accent: string }) {
  return (
    <div className="rounded-md border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-2)/0.5)] p-2">
      <div className="mono text-[9px] uppercase tracking-widest" style={{ color: `hsl(var(--accent-${accent}))` }}>
        {label}
      </div>
      <div className="text-base font-bold tabular-nums text-[hsl(var(--text-primary))]">{value}</div>
    </div>
  );
}

function NeighborList({
  title,
  ids,
  graph,
  layout,
  onPick,
  accent,
}: {
  title: string;
  ids: string[];
  graph: DependencyGraph;
  layout: NonNullable<ReturnType<typeof useDerivedLayout>>;
  onPick: (id: string) => void;
  accent: string;
}) {
  if (ids.length === 0) return null;
  return (
    <div className="mt-2">
      <div className="mono text-[9px] uppercase tracking-widest mb-1" style={{ color: accent }}>
        {title} · {ids.length}
      </div>
      <ul className="space-y-0.5 max-h-32 overflow-y-auto pr-1">
        {ids.slice(0, 8).map((id) => {
          const n = graph.nodes.find((x) => x.id === id);
          if (!n) return null;
          return (
            <li key={id}>
              <button
                onClick={() => onPick(id)}
                className="w-full text-left mono text-[10.5px] text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--text-primary))] truncate"
                title={n.path}
              >
                {shortPath(n.path)}
              </button>
            </li>
          );
        })}
        {ids.length > 8 && (
          <li className="mono text-[9.5px] text-[hsl(var(--text-muted))] pt-0.5">
            … and {ids.length - 8} more
          </li>
        )}
      </ul>
    </div>
  );
}

// dummy helper to satisfy the NonNullable<ReturnType<typeof useDerivedLayout>> annotation above
function useDerivedLayout() {
  return null as null | {
    ordered: GraphNode[];
    angleById: Map<string, number>;
    clusterById: Map<string, string>;
    inDeg: Map<string, number>;
    outDeg: Map<string, number>;
    edges: GraphEdge[];
    edgeWeight: Map<string, number>;
    maxWeight: number;
    cyclePairs: Set<string>;
    pairKey: (a: string, b: string) => string;
    outAdj: Map<string, Set<string>>;
    inAdj: Map<string, Set<string>>;
    arcs: Array<{ name: string; nodes: GraphNode[]; color: string; startAngle: number; endAngle: number }>;
    folders: Array<{ name: string; nodes: GraphNode[]; color: string }>;
    densityByCluster: Map<string, number>;
    maxDensity: number;
    step: number;
  };
}
