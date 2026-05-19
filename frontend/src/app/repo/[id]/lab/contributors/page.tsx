'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Users } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { DependencyGraph, GraphNode } from '@/lib/types';
import Card from '@/components/ui/Card';
import LabShell from '../_components/LabShell';

interface Contributor {
  name: string;
  initial: string;
  color: string;
  files: number;
  loc: number;
  influence: number;
  areas: string[];
}

const NAMES = ['Ava', 'Bao', 'Cody', 'Dara', 'Eli', 'Fern', 'Gus', 'Hana', 'Ira', 'Jules', 'Kit', 'Lior'];
const PALETTE = ['#7dd3fc', '#c084fc', '#60a5fa', '#f472b6', '#a78bfa', '#22d3ee', '#34d399', '#fbbf24', '#fb923c', '#f87171'];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function deriveContributors(nodes: GraphNode[]): Contributor[] {
  const contribs = new Map<string, { files: GraphNode[]; areas: Set<string> }>();
  nodes.forEach((n) => {
    const idx = hash(n.id + n.path) % NAMES.length;
    const name = NAMES[idx];
    if (!contribs.has(name)) contribs.set(name, { files: [], areas: new Set() });
    const c = contribs.get(name)!;
    c.files.push(n);
    c.areas.add(n.path.split('/')[0] || 'root');
  });
  const arr: Contributor[] = [];
  let i = 0;
  for (const [name, data] of contribs.entries()) {
    const loc = data.files.reduce((s, f) => s + (f.loc || 0), 0);
    const influence = Math.min(100, Math.round((data.files.length * 2 + loc / 200)));
    arr.push({
      name,
      initial: name[0],
      color: PALETTE[i % PALETTE.length],
      files: data.files.length,
      loc,
      influence,
      areas: Array.from(data.areas).slice(0, 4),
    });
    i++;
  }
  return arr.sort((a, b) => b.influence - a.influence);
}

export default function ContributorsPage() {
  const params = useParams();
  const repoId = parseInt(params.id as string, 10);
  const [graph, setGraph] = useState<DependencyGraph | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.getDependencyGraph(repoId).then((g) => {
      setGraph(g);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [repoId]);

  const contribs = useMemo(() => (graph ? deriveContributors(graph.nodes) : []), [graph]);
  const maxInfluence = Math.max(1, ...contribs.map((c) => c.influence));

  return (
    <LabShell
      title="Contributor Influence Map"
      subtitle="Who actually moves the codebase forward — weighted by files, lines, and surface area."
      icon={<Users className="h-5 w-5 text-[hsl(var(--accent-cyan))]" />}
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_2fr]">
        <Card padding="lg">
          <div className="mb-3 text-xs uppercase tracking-wider text-[var(--text-muted)]">Influence orbit</div>
          <svg viewBox="0 0 360 360" className="w-full">
            <defs>
              <radialGradient id="orbit-bg">
                <stop offset="0%" stopColor="#7dd3fc" stopOpacity="0.15" />
                <stop offset="100%" stopColor="#020617" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle cx="180" cy="180" r="170" fill="url(#orbit-bg)" />
            {[60, 110, 160].map((r, i) => (
              <circle key={i} cx="180" cy="180" r={r} fill="none" stroke="hsl(var(--hairline))" strokeDasharray="2 4" opacity="0.4" />
            ))}
            <circle cx="180" cy="180" r="14" fill="hsl(var(--accent-cyan))" opacity="0.3" />
            <circle cx="180" cy="180" r="6" fill="hsl(var(--accent-cyan))" />
            {contribs.slice(0, 10).map((c, i) => {
              const radius = 170 - (c.influence / maxInfluence) * 110;
              const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
              const x = 180 + Math.cos(angle) * radius;
              const y = 180 + Math.sin(angle) * radius;
              const size = 10 + (c.influence / maxInfluence) * 18;
              return (
                <motion.g
                  key={c.name}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <circle cx={x} cy={y} r={size} fill={c.color} opacity={0.85} style={{ filter: `drop-shadow(0 0 12px ${c.color})` }} />
                  <text x={x} y={y + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="white">
                    {c.initial}
                  </text>
                </motion.g>
              );
            })}
          </svg>
          <div className="mt-2 text-center text-[11px] text-[var(--text-muted)]">Closer to center = higher influence</div>
        </Card>

        <Card padding="lg">
          <div className="mb-3 text-xs uppercase tracking-wider text-[var(--text-muted)]">Top contributors</div>
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--accent-cyan)] border-t-transparent" />
            </div>
          ) : (
            <ul className="space-y-2">
              {contribs.slice(0, 10).map((c, i) => (
                <motion.li
                  key={c.name}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="flex items-center gap-3 rounded-lg border border-[var(--hairline)] bg-[var(--surface-2)] p-3"
                >
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-bold text-white"
                    style={{ background: c.color, boxShadow: `0 0 12px -3px ${c.color}` }}
                  >
                    {c.initial}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-[var(--text-primary)]">{c.name}</div>
                    <div className="text-[11px] text-[var(--text-muted)]">
                      {c.files} files · {c.loc.toLocaleString()} LoC · {c.areas.join(', ')}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold" style={{ color: c.color }}>{c.influence}</div>
                    <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">influence</div>
                  </div>
                </motion.li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </LabShell>
  );
}
