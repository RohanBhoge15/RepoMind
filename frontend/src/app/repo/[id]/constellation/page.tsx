'use client';

/**
 * 2D Radial Dependency Wireframe.
 *
 * Replaces the previous 3D chord constellation. Files are arranged around the rim of a
 * circle, labels rotated tangentially. Edges are drawn as quadratic-bezier chords through
 * the centre.
 *
 * Selection semantics (from GraphEdge: `source` imports `target`):
 *   - RED  ribbons : edges where source === selected  → files this file IMPORTS FROM
 *   - BLUE ribbons : edges where target === selected  → files that IMPORT this file (exports)
 *
 * When no file is selected every edge renders as a faint grey tracery so the structure of
 * the repo is still visible. Hovering a label promotes that file to selected state.
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Download, X, Pause, Play, ZoomIn, ZoomOut, Search } from 'lucide-react';

import { apiClient } from '@/lib/api';
import { DependencyGraph, GraphNode, GraphEdge } from '@/lib/types';

// ─── Design tokens ───────────────────────────────────────────────────────────
// Dark dev-tool palette. Kept inline so the SVG can reference them without a
// CSS-vars-vs-attribute mismatch (SVG `stroke` etc. don't read var() reliably
// across browsers when used with opacity-only animations).
const C = {
  bg: '#0a0a0c',
  surface: '#111114',
  hairline: '#1f1f24',
  textPrimary: '#e5e7eb',
  textSecondary: '#9ca3af',
  textMuted: '#5b5d66',
  caret: '#a78bfa',            // violet caret in `> wireframe`
  importRed: '#ef4444',        // imports-from
  importRedSoft: '#fca5a5',
  exportBlue: '#3b82f6',       // imported-by (exports)
  exportBlueSoft: '#93c5fd',
  ambient: '#2a2a32',          // faint grey tracery for unselected edges
};

// ─── Geometry ────────────────────────────────────────────────────────────────
// Viewbox is a fixed square; the actual SVG scales to fill its container.
const VB = 1000;
const CENTER = VB / 2;
const RIM_RADIUS = 360;       // rim where labels are seated
const NODE_RADIUS_BASE = 3;
const LABEL_OFFSET = 14;      // distance from rim to label baseline

// Chord control point: pulled toward origin so curves dip through the centre.
// 0 = straight line, 1 = passes exactly through origin. 0.18 reads as classic
// chord-diagram curvature without crowding the middle.
const CHORD_PULL = 0.18;

// ─── Layout ──────────────────────────────────────────────────────────────────
interface RimNode extends GraphNode {
  angle: number;           // radians, 0 = +x axis (3-o'clock), grows clockwise visually
  x: number;
  y: number;
  /** unit vector pointing OUT from centre — useful for label placement */
  ux: number;
  uy: number;
  rotationDeg: number;     // tangential rotation for the label
  flip: boolean;           // true on the left half: rotate 180 so text reads upright
  cluster: string;
}

function topLevelFolder(path: string): string {
  if (!path) return '·root';
  const norm = path.replace(/^\.?\/?/, '');
  const seg = norm.split('/')[0];
  if (!seg || seg === norm) return '·root';
  return seg;
}

/**
 * Lay nodes around the rim, grouped by top-level folder so related files are
 * adjacent. Within a cluster, sort by path so the layout is deterministic
 * across re-fetches.
 */
function buildLayout(nodes: GraphNode[]): RimNode[] {
  if (nodes.length === 0) return [];

  const clusters = new Map<string, GraphNode[]>();
  for (const n of nodes) {
    const k = topLevelFolder(n.path);
    const list = clusters.get(k) || [];
    list.push(n);
    clusters.set(k, list);
  }

  // Largest clusters first; alphabetical tiebreak. Within a cluster, sort by path.
  const ordered: { cluster: string; files: GraphNode[] }[] = Array.from(clusters.entries())
    .sort((a, b) => (b[1].length !== a[1].length ? b[1].length - a[1].length : a[0].localeCompare(b[0])))
    .map(([cluster, files]) => ({
      cluster,
      files: [...files].sort((a, b) => a.path.localeCompare(b.path)),
    }));

  const total = nodes.length;
  // Small inter-cluster gap so the eye can pick out groupings on the rim.
  const clusterGap = Math.min(0.05, (Math.PI * 2 * 0.1) / Math.max(ordered.length, 1));
  const usable = Math.PI * 2 - clusterGap * ordered.length;
  const perNode = usable / Math.max(total, 1);

  const out: RimNode[] = [];
  // Start at -PI/2 (top of the circle) and go clockwise.
  let cursor = -Math.PI / 2;

  for (const { cluster, files } of ordered) {
    for (let i = 0; i < files.length; i++) {
      const angle = cursor + perNode * (i + 0.5);
      const x = CENTER + Math.cos(angle) * RIM_RADIUS;
      const y = CENTER + Math.sin(angle) * RIM_RADIUS;
      const ux = Math.cos(angle);
      const uy = Math.sin(angle);

      // Tangential rotation: text runs along the rim. Files on the left half
      // get flipped 180° so they read left-to-right rather than upside down.
      const deg = (angle * 180) / Math.PI;
      const flip = deg > 90 || deg < -90;
      const rotationDeg = flip ? deg + 180 : deg;

      out.push({
        ...files[i],
        angle,
        x,
        y,
        ux,
        uy,
        rotationDeg,
        flip,
        cluster,
      });
    }
    cursor += perNode * files.length + clusterGap;
  }
  return out;
}

// ─── Chord path ──────────────────────────────────────────────────────────────
/** Quadratic-bezier chord between two rim points, with control pulled toward origin. */
function chordPath(ax: number, ay: number, bx: number, by: number): string {
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  // Pull the midpoint toward the centre. The further apart on the rim, the
  // closer the midpoint already is to the centre — so this naturally produces
  // deep curves for far-apart pairs and shallow curves for neighbours.
  const cx = CENTER + (mx - CENTER) * (1 - CHORD_PULL * 5);
  const cy = CENTER + (my - CENTER) * (1 - CHORD_PULL * 5);
  return `M ${ax.toFixed(2)} ${ay.toFixed(2)} Q ${cx.toFixed(2)} ${cy.toFixed(2)} ${bx.toFixed(2)} ${by.toFixed(2)}`;
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function ConstellationPage() {
  const params = useParams();
  const repoId = parseInt(params.id as string, 10);

  const [graph, setGraph] = useState<DependencyGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [paused, setPaused] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [mode, setMode] = useState<'wireframe' | 'summary'>('wireframe');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiClient
      .getDependencyGraph(repoId)
      .then((g) => {
        if (!cancelled) {
          setGraph(g);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e?.message || 'Failed to load graph');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [repoId]);

  const nodes = useMemo(() => buildLayout(graph?.nodes || []), [graph]);
  const edges = graph?.edges || [];

  const nodeMap = useMemo(() => {
    const m = new Map<string, RimNode>();
    nodes.forEach((n) => m.set(n.id, n));
    return m;
  }, [nodes]);

  // The currently-focused file: explicit click selection beats transient hover.
  const focusId = selectedId || hoveredId;

  // Partition valid edges into three buckets based on the focused file. We do
  // this once per focus change rather than per-edge inside render.
  const { imports, exports, ambient } = useMemo(() => {
    const imp: GraphEdge[] = [];
    const exp: GraphEdge[] = [];
    const amb: GraphEdge[] = [];
    for (const e of edges) {
      if (!nodeMap.has(e.source) || !nodeMap.has(e.target)) continue;
      if (focusId && e.source === focusId) imp.push(e);
      else if (focusId && e.target === focusId) exp.push(e);
      else amb.push(e);
    }
    return { imports: imp, exports: exp, ambient: amb };
  }, [edges, nodeMap, focusId]);

  // Neighbour set for label highlighting: includes the focused node itself.
  const neighbourIds = useMemo(() => {
    if (!focusId) return null;
    const s = new Set<string>([focusId]);
    imports.forEach((e) => s.add(e.target));
    exports.forEach((e) => s.add(e.source));
    return s;
  }, [focusId, imports, exports]);

  // Per-neighbour role (so we can colour the label red or blue).
  const neighbourRole = useMemo(() => {
    const m = new Map<string, 'import' | 'export'>();
    if (!focusId) return m;
    imports.forEach((e) => m.set(e.target, 'import'));
    exports.forEach((e) => m.set(e.source, 'export'));
    return m;
  }, [focusId, imports, exports]);

  // Search results — small list shown inline under the search box.
  const filtered = useMemo(() => {
    if (!query.trim()) return [] as RimNode[];
    const q = query.toLowerCase();
    return nodes
      .filter((n) => n.path.toLowerCase().includes(q) || n.label.toLowerCase().includes(q))
      .slice(0, 6);
  }, [query, nodes]);

  const downloadSvg = useCallback(() => {
    const svg = document.getElementById('wireframe-svg');
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([xml], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wireframe-repo-${repoId}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }, [repoId]);

  const counts = {
    files: nodes.length,
    edges: edges.length,
    imports: imports.length,
    exports: exports.length,
  };

  return (
    <div
      className="relative h-[calc(100vh-4rem)] w-full overflow-hidden"
      style={{ background: C.bg }}
    >
      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <div className="absolute left-6 top-6 z-20 flex items-center gap-3">
        <div
          className="font-mono text-[13px] tracking-tight"
          style={{ color: C.textPrimary }}
        >
          <span style={{ color: C.caret }}>{'>'}</span>{' '}
          <span>wireframe</span>
          <span className="ml-3" style={{ color: C.textMuted }}>
            {counts.files} files · {counts.edges} edges
          </span>
        </div>
      </div>

      {/* ─── Top-right cluster: mode pill + ghost icon buttons ──────────── */}
      <div className="absolute right-6 top-6 z-20 flex items-center gap-2">
        {/* Summary / Wireframe toggle pill */}
        <div
          className="flex items-center rounded-full p-0.5"
          style={{ background: C.surface, border: `1px solid ${C.hairline}` }}
        >
          {(['summary', 'wireframe'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="rounded-full px-3 py-1 font-mono text-[11px] capitalize transition-colors"
              style={{
                background: mode === m ? C.hairline : 'transparent',
                color: mode === m ? C.textPrimary : C.textMuted,
              }}
            >
              {m}
            </button>
          ))}
        </div>

        <IconBtn title="Download SVG" onClick={downloadSvg}>
          <Download className="h-3.5 w-3.5" />
        </IconBtn>
        <IconBtn
          title={paused ? 'Resume animations' : 'Pause animations'}
          onClick={() => setPaused((p) => !p)}
        >
          {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
        </IconBtn>
        <IconBtn title="Zoom out" onClick={() => setZoom((z) => Math.max(0.6, z - 0.1))}>
          <ZoomOut className="h-3.5 w-3.5" />
        </IconBtn>
        <IconBtn title="Zoom in" onClick={() => setZoom((z) => Math.min(1.6, z + 0.1))}>
          <ZoomIn className="h-3.5 w-3.5" />
        </IconBtn>
        <IconBtn
          title="Clear selection"
          onClick={() => {
            setSelectedId(null);
            setHoveredId(null);
          }}
        >
          <X className="h-3.5 w-3.5" />
        </IconBtn>
      </div>

      {/* ─── Legend ─────────────────────────────────────────────────────── */}
      <div className="absolute left-6 top-16 z-20 flex items-center gap-4 font-mono text-[11px]">
        <span className="flex items-center gap-1.5" style={{ color: C.textSecondary }}>
          <span
            className="h-2.5 w-2.5"
            style={{ background: C.importRed, boxShadow: `0 0 6px ${C.importRed}` }}
          />
          imports
        </span>
        <span className="flex items-center gap-1.5" style={{ color: C.textSecondary }}>
          <span
            className="h-2.5 w-2.5"
            style={{ background: C.exportBlue, boxShadow: `0 0 6px ${C.exportBlue}` }}
          />
          exports
        </span>
        {focusId && (
          <span style={{ color: C.textMuted }}>
            {counts.imports} from · {counts.exports} to
          </span>
        )}
      </div>

      {/* ─── Search (bottom-left) ───────────────────────────────────────── */}
      <div className="absolute bottom-6 left-6 z-20 w-72">
        <div
          className="space-y-2 rounded-xl p-3 backdrop-blur-md"
          style={{
            background: `${C.surface}cc`,
            border: `1px solid ${C.hairline}`,
          }}
        >
          <div
            className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider"
            style={{ color: C.textMuted }}
          >
            <Search className="h-3 w-3" /> search
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="path or filename…"
            className="w-full rounded-md px-2 py-1.5 font-mono text-[11px] outline-none"
            style={{
              background: C.bg,
              border: `1px solid ${C.hairline}`,
              color: C.textPrimary,
            }}
          />
          {filtered.length > 0 && (
            <ul className="max-h-44 space-y-0.5 overflow-y-auto">
              {filtered.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => setSelectedId(n.id)}
                    className="flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 text-left font-mono text-[10px] hover:bg-white/5"
                    style={{ color: C.textSecondary }}
                  >
                    <span className="truncate">{n.path}</span>
                    <span style={{ color: C.textMuted }}>{n.language || ''}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ─── Selection card (bottom-right) ──────────────────────────────── */}
      {focusId && nodeMap.get(focusId) && (
        <div className="absolute bottom-6 right-6 z-20 w-80">
          <div
            className="space-y-2 rounded-xl p-3 backdrop-blur-md"
            style={{
              background: `${C.surface}cc`,
              border: `1px solid ${C.hairline}`,
            }}
          >
            <div className="min-w-0">
              <div
                className="truncate font-mono text-[12px]"
                style={{ color: C.textPrimary }}
              >
                {nodeMap.get(focusId)!.label}
              </div>
              <div
                className="truncate font-mono text-[10px]"
                style={{ color: C.textMuted }}
              >
                {nodeMap.get(focusId)!.path}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[10px]">
              <Stat label="imports" value={counts.imports} tint={C.importRed} />
              <Stat label="imported by" value={counts.exports} tint={C.exportBlue} />
              <Stat label="loc" value={nodeMap.get(focusId)!.loc ?? '—'} />
              <Stat
                label="lang"
                value={nodeMap.get(focusId)!.language ?? '—'}
              />
            </div>
          </div>
        </div>
      )}

      {/* ─── SVG canvas ─────────────────────────────────────────────────── */}
      <div className="absolute inset-0 flex items-center justify-center">
        {loading && (
          <div
            className="font-mono text-[11px]"
            style={{ color: C.textMuted }}
          >
            mapping the wireframe…
          </div>
        )}
        {error && !loading && (
          <div className="font-mono text-[11px]" style={{ color: '#f87171' }}>
            {error}
          </div>
        )}
        {!loading && !error && nodes.length === 0 && (
          <div className="font-mono text-[11px]" style={{ color: C.textMuted }}>
            no files indexed yet
          </div>
        )}
        {!loading && nodes.length > 0 && (
          <svg
            id="wireframe-svg"
            viewBox={`0 0 ${VB} ${VB}`}
            preserveAspectRatio="xMidYMid meet"
            className="h-full w-full"
            style={{ transform: `scale(${zoom})`, transition: 'transform 220ms ease-out' }}
            onClick={() => {
              // Click on empty SVG canvas releases selection.
              setSelectedId(null);
            }}
          >
            <defs>
              {/* Soft outer halo on the rim, suggests "horizon" */}
              <radialGradient id="rim-glow" cx="50%" cy="50%" r="50%">
                <stop offset="80%" stopColor={C.bg} stopOpacity="0" />
                <stop offset="100%" stopColor={C.caret} stopOpacity="0.04" />
              </radialGradient>

              {/* Drop-glow filters for the active chord ribbons */}
              <filter id="glow-red" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2.2" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="glow-blue" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2.2" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <circle cx={CENTER} cy={CENTER} r={RIM_RADIUS + 60} fill="url(#rim-glow)" />

            {/* ── Ambient edges: faint grey tracery for unselected state ── */}
            <g style={{ pointerEvents: 'none' }}>
              {ambient.map((e, i) => {
                const a = nodeMap.get(e.source)!;
                const b = nodeMap.get(e.target)!;
                // When something IS selected, push ambient edges almost invisible
                // so the spotlighted chords pop. Otherwise keep them faintly alive.
                const baseOpacity = focusId ? 0.04 : 0.12;
                return (
                  <path
                    key={`amb-${i}`}
                    d={chordPath(a.x, a.y, b.x, b.y)}
                    stroke={C.ambient}
                    strokeWidth={0.6}
                    fill="none"
                    opacity={baseOpacity}
                    className={!focusId && !paused ? 'wf-flicker' : ''}
                    style={{ animationDelay: `${(i % 11) * 0.21}s` }}
                  />
                );
              })}
            </g>

            {/* ── Rim circle ── */}
            <circle
              cx={CENTER}
              cy={CENTER}
              r={RIM_RADIUS}
              fill="none"
              stroke={C.hairline}
              strokeWidth={0.5}
              strokeDasharray="1 3"
              opacity={0.5}
            />

            {/* ── Active blue chords: files that IMPORT the focused file ── */}
            <g filter="url(#glow-blue)">
              {exports.map((e, i) => {
                const a = nodeMap.get(e.source)!;
                const b = nodeMap.get(e.target)!;
                return (
                  <path
                    key={`exp-${i}`}
                    d={chordPath(a.x, a.y, b.x, b.y)}
                    stroke={C.exportBlue}
                    strokeWidth={1.4}
                    fill="none"
                    opacity={0.85}
                    style={{ transition: 'opacity 280ms ease-out' }}
                  />
                );
              })}
            </g>

            {/* ── Active red chords: files the focused file IMPORTS FROM ── */}
            <g filter="url(#glow-red)">
              {imports.map((e, i) => {
                const a = nodeMap.get(e.source)!;
                const b = nodeMap.get(e.target)!;
                return (
                  <path
                    key={`imp-${i}`}
                    d={chordPath(a.x, a.y, b.x, b.y)}
                    stroke={C.importRed}
                    strokeWidth={1.4}
                    fill="none"
                    opacity={0.9}
                    style={{ transition: 'opacity 280ms ease-out' }}
                  />
                );
              })}
            </g>

            {/* ── Tracer dots: travel along active chords (skipped when paused) ── */}
            {!paused &&
              imports.map((e, i) => {
                const a = nodeMap.get(e.source)!;
                const b = nodeMap.get(e.target)!;
                const d = chordPath(a.x, a.y, b.x, b.y);
                return (
                  <circle key={`tr-imp-${i}`} r={1.8} fill={C.importRedSoft}>
                    <animateMotion
                      dur="1.8s"
                      repeatCount="indefinite"
                      path={d}
                      begin={`${(i * 0.13) % 1.8}s`}
                    />
                  </circle>
                );
              })}
            {!paused &&
              exports.map((e, i) => {
                const a = nodeMap.get(e.source)!;
                const b = nodeMap.get(e.target)!;
                const d = chordPath(a.x, a.y, b.x, b.y);
                return (
                  <circle key={`tr-exp-${i}`} r={1.8} fill={C.exportBlueSoft}>
                    <animateMotion
                      dur="1.8s"
                      repeatCount="indefinite"
                      path={d}
                      begin={`${(i * 0.13) % 1.8}s`}
                    />
                  </circle>
                );
              })}

            {/* ── Rim nodes + labels ── */}
            {nodes.map((n) => {
              const isFocus = focusId === n.id;
              const role = neighbourRole.get(n.id);
              const isNeighbour = !!neighbourIds && neighbourIds.has(n.id);
              const isDimmed = !!focusId && !isNeighbour;

              // Split label into base name + extension so the eye lands on the
              // name part. The extension is dimmed so the file is still
              // identifiable but the name visually dominates.
              const rawName =
                (n.label || n.path || '').split(/[\\/]/).pop() || n.label || '';
              const dotIdx = rawName.lastIndexOf('.');
              const baseName = dotIdx > 0 ? rawName.slice(0, dotIdx) : rawName;
              const extName = dotIdx > 0 ? rawName.slice(dotIdx) : '';

              // Label colour ladder:
              //  - focused: bright white
              //  - import-neighbour: red, export-neighbour: blue
              //  - dimmed (other neighbour-less file when something is selected): muted
              //  - default (nothing selected, or this is a non-spotlight rim file): primary
              let labelColour: string = C.textPrimary;
              if (isFocus) labelColour = C.textPrimary;
              else if (role === 'import') labelColour = C.importRed;
              else if (role === 'export') labelColour = C.exportBlue;
              else if (isDimmed) labelColour = C.textMuted;

              const dotColour = isFocus
                ? C.textPrimary
                : role === 'import'
                  ? C.importRed
                  : role === 'export'
                    ? C.exportBlue
                    : isDimmed
                      ? C.textMuted
                      : C.textSecondary;

              const dotR = isFocus ? NODE_RADIUS_BASE + 1.4 : NODE_RADIUS_BASE;

              // Place label just OUTSIDE the rim, rotated tangentially.
              const lx = CENTER + n.ux * (RIM_RADIUS + LABEL_OFFSET);
              const ly = CENTER + n.uy * (RIM_RADIUS + LABEL_OFFSET);
              // When flipped, anchor end so the text grows inward to its anchor.
              const textAnchor = n.flip ? 'end' : 'start';

              return (
                <g
                  key={n.id}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    setSelectedId((s) => (s === n.id ? null : n.id));
                  }}
                  onMouseEnter={() => setHoveredId(n.id)}
                  onMouseLeave={() => setHoveredId((h) => (h === n.id ? null : h))}
                  style={{ cursor: 'pointer' }}
                >
                  {/* Wider invisible hitbox so labels are easy to grab */}
                  <circle cx={n.x} cy={n.y} r={10} fill="transparent" />

                  {/* Visible rim dot */}
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={dotR}
                    fill={dotColour}
                    opacity={isDimmed ? 0.35 : 1}
                    style={{ transition: 'r 240ms ease-out, opacity 240ms ease-out' }}
                  />
                  {isFocus && (
                    <circle
                      cx={n.x}
                      cy={n.y}
                      r={dotR + 3}
                      fill="none"
                      stroke={C.textPrimary}
                      strokeWidth={0.6}
                      opacity={0.6}
                    />
                  )}

                  <text
                    x={lx}
                    y={ly}
                    transform={`rotate(${n.rotationDeg} ${lx} ${ly})`}
                    textAnchor={textAnchor}
                    dominantBaseline="central"
                    className={
                      !paused && (isFocus || role)
                        ? 'wf-label-pulse'
                        : ''
                    }
                    style={{
                      fontFamily:
                        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                      fontSize: isFocus ? 13.5 : 11,
                      fontWeight: isFocus ? 700 : 500,
                      letterSpacing: '0.02em',
                      opacity: isDimmed ? 0.45 : 1,
                      transition:
                        'opacity 240ms ease-out, font-size 240ms ease-out',
                      paintOrder: 'stroke fill',
                      // Thin dark halo so labels stay legible when they
                      // overlap a coloured chord. Tuned to be invisible on
                      // the dark canvas itself.
                      stroke: C.bg,
                      strokeWidth: 2.2,
                      strokeLinejoin: 'round',
                    }}
                  >
                    <tspan fill={labelColour}>{baseName}</tspan>
                    {extName && (
                      <tspan
                        fill={isDimmed ? C.textMuted : C.textSecondary}
                        opacity={0.7}
                      >
                        {extName}
                      </tspan>
                    )}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>

      {/* ─── Animation keyframes (scoped via styled-jsx-style global block) ── */}
      <style jsx global>{`
        @keyframes wf-flicker {
          0%, 100% { opacity: 0.08; }
          50% { opacity: 0.16; }
        }
        .wf-flicker {
          animation: wf-flicker 2.4s ease-in-out infinite;
        }
        @keyframes wf-label-pulse {
          0%, 100% { opacity: 0.82; }
          50% { opacity: 1; }
        }
        .wf-label-pulse {
          animation: wf-label-pulse 2.6s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .wf-flicker, .wf-label-pulse { animation: none !important; }
        }
      `}</style>
    </div>
  );
}

// ─── Small UI bits ───────────────────────────────────────────────────────────
function IconBtn({
  children,
  title,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      className="grid h-7 w-7 place-items-center rounded-md transition-colors"
      style={{
        background: C.surface,
        border: `1px solid ${C.hairline}`,
        color: C.textSecondary,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = C.textPrimary;
        (e.currentTarget as HTMLButtonElement).style.background = C.hairline;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = C.textSecondary;
        (e.currentTarget as HTMLButtonElement).style.background = C.surface;
      }}
    >
      {children}
    </button>
  );
}

function Stat({
  label,
  value,
  tint,
}: {
  label: string;
  value: React.ReactNode;
  tint?: string;
}) {
  return (
    <div
      className="rounded-md px-2 py-1.5"
      style={{ background: C.bg, border: `1px solid ${C.hairline}` }}
    >
      <div
        className="text-[9px] uppercase tracking-wider"
        style={{ color: C.textMuted }}
      >
        {label}
      </div>
      <div
        className="mt-0.5 truncate"
        style={{ color: tint || C.textPrimary, fontWeight: 500 }}
      >
        {value}
      </div>
    </div>
  );
}
