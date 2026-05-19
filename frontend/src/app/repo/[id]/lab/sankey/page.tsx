'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { GitBranch } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { DependencyGraph, GraphNode } from '@/lib/types';
import Card from '@/components/ui/Card';
import LabShell from '../_components/LabShell';

interface Layer {
  name: string;
  nodes: GraphNode[];
}

function classifyLayer(path: string): string {
  const p = path.toLowerCase();
  if (/(routes?|controller|handler|endpoint)/.test(p)) return 'Routes';
  if (/(service|usecase|domain)/.test(p)) return 'Services';
  if (/(model|schema|entity|dto)/.test(p)) return 'Models';
  if (/(repo|database|db|storage|dao)/.test(p)) return 'Data';
  if (/(component|page|view|ui)/.test(p)) return 'UI';
  if (/(util|helper|lib|common)/.test(p)) return 'Utils';
  if (/(test|spec)/.test(p)) return 'Tests';
  if (/(config|env)/.test(p)) return 'Config';
  return 'Other';
}

const LAYER_ORDER = ['UI', 'Routes', 'Services', 'Models', 'Data', 'Utils', 'Config', 'Tests', 'Other'];

export default function SankeyPage() {
  const params = useParams();
  const repoId = parseInt(params.id as string, 10);
  const [graph, setGraph] = useState<DependencyGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoveredLayer, setHoveredLayer] = useState<string | null>(null);

  useEffect(() => {
    apiClient.getDependencyGraph(repoId).then((g) => {
      setGraph(g);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [repoId]);

  const layers = useMemo<Layer[]>(() => {
    if (!graph) return [];
    const map = new Map<string, GraphNode[]>();
    graph.nodes.forEach((n) => {
      const layer = classifyLayer(n.path);
      if (!map.has(layer)) map.set(layer, []);
      map.get(layer)!.push(n);
    });
    return LAYER_ORDER
      .filter((l) => map.has(l))
      .map((name) => ({ name, nodes: map.get(name)! }));
  }, [graph]);

  const flows = useMemo(() => {
    if (!graph) return new Map<string, number>();
    const layerOf = new Map<string, string>();
    graph.nodes.forEach((n) => layerOf.set(n.id, classifyLayer(n.path)));
    const flows = new Map<string, number>();
    graph.edges.forEach((e) => {
      const s = layerOf.get(e.source);
      const t = layerOf.get(e.target);
      if (!s || !t || s === t) return;
      const key = `${s}→${t}`;
      flows.set(key, (flows.get(key) || 0) + 1);
    });
    return flows;
  }, [graph]);

  const width = 1100;
  const height = 560;
  const colWidth = layers.length > 0 ? width / layers.length : 0;
  const barWidth = 24;
  const maxNodes = Math.max(1, ...layers.map((l) => l.nodes.length));
  const HUES = ['#7dd3fc', '#c084fc', '#60a5fa', '#f472b6', '#a78bfa', '#22d3ee', '#34d399', '#fbbf24', '#94a3b8'];

  const layerY = (idx: number, count: number) => {
    const colHeight = (count / maxNodes) * (height - 80);
    return (height - colHeight) / 2;
  };

  const links = useMemo(() => {
    const arr: { from: string; to: string; weight: number; x1: number; x2: number; y1: number; y2: number; color: string }[] = [];
    layers.forEach((src, i) => {
      layers.forEach((tgt, j) => {
        if (j <= i) return;
        const key = `${src.name}→${tgt.name}`;
        const w = flows.get(key) || 0;
        if (w === 0) return;
        const x1 = i * colWidth + colWidth / 2 + barWidth / 2;
        const x2 = j * colWidth + colWidth / 2 - barWidth / 2;
        const y1 = layerY(i, src.nodes.length) + (src.nodes.length / maxNodes) * (height - 80) / 2;
        const y2 = layerY(j, tgt.nodes.length) + (tgt.nodes.length / maxNodes) * (height - 80) / 2;
        arr.push({ from: src.name, to: tgt.name, weight: w, x1, x2, y1, y2, color: HUES[i % HUES.length] });
      });
    });
    return arr;
  }, [layers, flows, colWidth, height]);

  const maxFlow = Math.max(1, ...links.map((l) => l.weight));

  return (
    <LabShell
      title="Flow Sankey"
      subtitle="Data and control flow between architectural layers. Thicker streams mean more dependencies."
      icon={<GitBranch className="h-5 w-5 text-[hsl(var(--accent-violet))]" />}
      accent="hsl(var(--accent-violet))"
    >
      <div className="rounded-2xl border border-[var(--hairline)] bg-[var(--surface-1)]/40 p-6">
        {loading ? (
          <div className="flex h-96 items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--accent-violet)] border-t-transparent" />
          </div>
        ) : (
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
            <defs>
              {HUES.map((c, i) => (
                <linearGradient key={i} id={`flow-${i}`} x1="0" x2="1">
                  <stop offset="0%" stopColor={c} stopOpacity="0.6" />
                  <stop offset="100%" stopColor={c} stopOpacity="0.15" />
                </linearGradient>
              ))}
            </defs>
            {links.map((l, i) => {
              const sw = 4 + (l.weight / maxFlow) * 36;
              const cx1 = (l.x1 + l.x2) / 2;
              const path = `M ${l.x1} ${l.y1} C ${cx1} ${l.y1}, ${cx1} ${l.y2}, ${l.x2} ${l.y2}`;
              const hi = hoveredLayer && (hoveredLayer === l.from || hoveredLayer === l.to);
              const opacity = !hoveredLayer ? 0.4 : hi ? 0.85 : 0.08;
              const colorIdx = HUES.indexOf(l.color);
              return (
                <motion.path
                  key={i}
                  d={path}
                  stroke={`url(#flow-${colorIdx})`}
                  strokeWidth={sw}
                  fill="none"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity }}
                  transition={{ duration: 1, delay: i * 0.04 }}
                  strokeLinecap="round"
                />
              );
            })}
            {layers.map((l, i) => {
              const colHeight = (l.nodes.length / maxNodes) * (height - 80);
              const y = layerY(i, l.nodes.length);
              const x = i * colWidth + colWidth / 2 - barWidth / 2;
              const isHi = hoveredLayer === l.name;
              return (
                <g
                  key={l.name}
                  onMouseEnter={() => setHoveredLayer(l.name)}
                  onMouseLeave={() => setHoveredLayer(null)}
                  style={{ cursor: 'pointer' }}
                >
                  <motion.rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={colHeight}
                    rx={6}
                    fill={HUES[i % HUES.length]}
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ delay: 0.2 + i * 0.05 }}
                    style={{ transformOrigin: `${x + barWidth / 2}px ${y + colHeight / 2}px`, filter: isHi ? `drop-shadow(0 0 12px ${HUES[i % HUES.length]})` : 'none' }}
                  />
                  <text
                    x={x + barWidth / 2}
                    y={y - 12}
                    textAnchor="middle"
                    fontSize="12"
                    fontWeight="600"
                    fill="hsl(var(--text-primary))"
                  >
                    {l.name}
                  </text>
                  <text
                    x={x + barWidth / 2}
                    y={y + colHeight + 22}
                    textAnchor="middle"
                    fontSize="11"
                    fill="hsl(var(--text-muted))"
                  >
                    {l.nodes.length} files
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card padding="lg">
          <div className="mb-3 text-xs uppercase tracking-wider text-[var(--text-muted)]">Top flows</div>
          <ul className="space-y-2 text-sm">
            {Array.from(flows.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => (
              <li key={k} className="flex items-center justify-between border-b border-[var(--hairline)] pb-1.5">
                <span className="font-mono text-[var(--text-secondary)]">{k}</span>
                <span className="text-[var(--accent-cyan)]">{v}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card padding="lg">
          <div className="mb-3 text-xs uppercase tracking-wider text-[var(--text-muted)]">How to read it</div>
          <ul className="space-y-2 text-xs leading-relaxed text-[var(--text-secondary)]">
            <li>Each column is an architectural layer auto-classified from file paths.</li>
            <li>Stream thickness = number of import/dependency edges between layers.</li>
            <li>Hover a column to isolate its inflows and outflows.</li>
          </ul>
        </Card>
      </div>
    </LabShell>
  );
}
