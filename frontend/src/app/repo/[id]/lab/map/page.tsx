'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Map as MapIcon, ZoomIn, ZoomOut } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { DependencyGraph, GraphNode } from '@/lib/types';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import LabShell from '../_components/LabShell';

interface Region {
  name: string;
  nodes: GraphNode[];
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  hue: number;
}

const PALETTE = ['#7dd3fc', '#c084fc', '#60a5fa', '#f472b6', '#a78bfa', '#22d3ee', '#34d399', '#fbbf24'];

function topLevel(path: string): string {
  return path.split('/')[0] || 'root';
}

function squarify(items: { key: string; weight: number; nodes: GraphNode[] }[], W: number, H: number): Region[] {
  const total = items.reduce((s, i) => s + i.weight, 0) || 1;
  // Simple slice-and-dice: sort by weight desc, alternate horizontal/vertical splits
  const out: Region[] = [];
  function recurse(list: typeof items, x: number, y: number, w: number, h: number, horiz: boolean, depth: number) {
    if (list.length === 0) return;
    if (list.length === 1) {
      out.push({
        name: list[0].key,
        nodes: list[0].nodes,
        x, y, w, h,
        color: PALETTE[out.length % PALETTE.length],
        hue: out.length,
      });
      return;
    }
    const sum = list.reduce((s, i) => s + i.weight, 0);
    const half = sum / 2;
    let acc = 0;
    let split = 1;
    for (let i = 0; i < list.length; i++) {
      acc += list[i].weight;
      if (acc >= half) { split = Math.max(1, i + 1); break; }
    }
    const a = list.slice(0, split);
    const b = list.slice(split);
    const aw = a.reduce((s, i) => s + i.weight, 0);
    const ratio = aw / sum;
    if (horiz) {
      recurse(a, x, y, w * ratio, h, !horiz, depth + 1);
      recurse(b, x + w * ratio, y, w * (1 - ratio), h, !horiz, depth + 1);
    } else {
      recurse(a, x, y, w, h * ratio, !horiz, depth + 1);
      recurse(b, x, y + h * ratio, w, h * (1 - ratio), !horiz, depth + 1);
    }
  }
  const sorted = [...items].sort((a, b) => b.weight - a.weight);
  recurse(sorted, 0, 0, W, H, true, 0);
  return out;
}

export default function MapPage() {
  const params = useParams();
  const repoId = parseInt(params.id as string, 10);
  const [graph, setGraph] = useState<DependencyGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selected, setSelected] = useState<Region | null>(null);
  const dragging = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    apiClient.getDependencyGraph(repoId).then((g) => {
      setGraph(g);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [repoId]);

  const regions = useMemo<Region[]>(() => {
    if (!graph) return [];
    const groups = new Map<string, GraphNode[]>();
    graph.nodes.forEach((n) => {
      const k = topLevel(n.path);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(n);
    });
    const items = Array.from(groups.entries()).map(([key, ns]) => ({
      key,
      nodes: ns,
      weight: ns.reduce((s, n) => s + (n.loc || 1), 0),
    }));
    return squarify(items, 1000, 600);
  }, [graph]);

  const semanticLevel = zoom < 1.3 ? 'continent' : zoom < 2.5 ? 'country' : zoom < 4 ? 'city' : 'street';

  return (
    <LabShell
      title="Semantic Map"
      subtitle="Zoom from continents (top-level folders) all the way down to street view (individual files)."
      icon={<MapIcon className="h-5 w-5 text-[hsl(var(--accent-blue))]" />}
      accent="hsl(var(--accent-blue))"
      scroll={false}
    >
      <div className="relative h-[calc(100vh-220px)] overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[#020617]">
        <div
          className="absolute inset-0 cursor-grab active:cursor-grabbing"
          onMouseDown={(e) => {
            dragging.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
          }}
          onMouseMove={(e) => {
            if (dragging.current) {
              setPan({ x: e.clientX - dragging.current.x, y: e.clientY - dragging.current.y });
            }
          }}
          onMouseUp={() => (dragging.current = null)}
          onMouseLeave={() => (dragging.current = null)}
          onWheel={(e) => {
            const next = Math.max(0.5, Math.min(8, zoom * (e.deltaY > 0 ? 0.92 : 1.08)));
            setZoom(next);
          }}
        >
          <svg
            viewBox="0 0 1000 600"
            className="h-full w-full"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: 'center' }}
          >
            <defs>
              <pattern id="contour" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#1e293b" strokeWidth="0.5" opacity="0.4" />
              </pattern>
            </defs>
            <rect width="1000" height="600" fill="url(#contour)" />
            {regions.map((r) => (
              <g key={r.name} onClick={() => setSelected(r)} style={{ cursor: 'pointer' }}>
                <motion.rect
                  x={r.x}
                  y={r.y}
                  width={r.w}
                  height={r.h}
                  fill={r.color}
                  fillOpacity={0.16}
                  stroke={r.color}
                  strokeWidth={1.2}
                  strokeOpacity={0.6}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: r.hue * 0.04 }}
                />
                {semanticLevel === 'continent' && (
                  <text
                    x={r.x + r.w / 2}
                    y={r.y + r.h / 2}
                    textAnchor="middle"
                    fontSize={Math.min(28, Math.max(11, Math.sqrt(r.w * r.h) / 12))}
                    fontWeight="700"
                    fill="white"
                    fillOpacity={0.85}
                    style={{ pointerEvents: 'none' }}
                  >
                    {r.name}
                  </text>
                )}
                {(semanticLevel === 'country' || semanticLevel === 'city') && r.w > 60 && r.h > 40 && (
                  <>
                    <text x={r.x + 6} y={r.y + 16} fontSize="10" fontWeight="600" fill="white" fillOpacity={0.8}>
                      {r.name}
                    </text>
                    <text x={r.x + 6} y={r.y + 30} fontSize="9" fill="white" fillOpacity={0.55}>
                      {r.nodes.length} files
                    </text>
                  </>
                )}
                {semanticLevel === 'street' && r.nodes.slice(0, Math.min(r.nodes.length, 30)).map((n, i) => {
                  const cols = Math.ceil(Math.sqrt(r.nodes.length));
                  const cw = r.w / cols;
                  const rows = Math.ceil(r.nodes.length / cols);
                  const ch = r.h / rows;
                  const c = i % cols;
                  const rw = Math.floor(i / cols);
                  return (
                    <rect
                      key={n.id}
                      x={r.x + c * cw + 2}
                      y={r.y + rw * ch + 2}
                      width={Math.max(2, cw - 4)}
                      height={Math.max(2, ch - 4)}
                      fill={r.color}
                      fillOpacity={0.4 + Math.min(0.5, (n.loc || 1) / 500)}
                      rx={1}
                    />
                  );
                })}
              </g>
            ))}
          </svg>
        </div>

        <div className="absolute right-4 top-4 flex flex-col gap-2">
          <Button size="sm" variant="ghost" onClick={() => setZoom((z) => Math.min(8, z * 1.3))}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setZoom((z) => Math.max(0.5, z / 1.3))}>
            <ZoomOut className="h-4 w-4" />
          </Button>
        </div>

        <div className="pointer-events-none absolute left-4 top-4">
          <Card padding="sm" className="pointer-events-auto text-[11px]">
            <div className="text-[var(--text-muted)]">Zoom level</div>
            <div className="font-mono text-[var(--accent-blue)] capitalize">{semanticLevel}</div>
          </Card>
        </div>

        <AnimatePresence>
          {selected && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="absolute bottom-4 right-4 w-80"
            >
              <Card padding="lg">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-[var(--text-muted)]">Region</div>
                    <div className="font-mono text-[var(--text-primary)]">{selected.name}</div>
                  </div>
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: selected.color, boxShadow: `0 0 10px ${selected.color}` }}
                  />
                </div>
                <div className="mt-3 text-xs text-[var(--text-secondary)]">
                  {selected.nodes.length} files · {selected.nodes.reduce((s, n) => s + (n.loc || 0), 0)} LoC
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="mt-3 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  Dismiss
                </button>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--accent-blue)] border-t-transparent" />
          </div>
        )}
      </div>
    </LabShell>
  );
}
