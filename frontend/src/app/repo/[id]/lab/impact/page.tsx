'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Activity, AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Search } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { DependencyGraph, GraphNode } from '@/lib/types';
import Card from '@/components/ui/Card';
import LabShell from '../_components/LabShell';

function bfs(start: string, adj: Map<string, string[]>, maxDepth = 4) {
  const visited = new Map<string, number>();
  const queue: [string, number][] = [[start, 0]];
  visited.set(start, 0);
  while (queue.length) {
    const [node, depth] = queue.shift()!;
    if (depth >= maxDepth) continue;
    for (const next of adj.get(node) || []) {
      if (!visited.has(next)) {
        visited.set(next, depth + 1);
        queue.push([next, depth + 1]);
      }
    }
  }
  visited.delete(start);
  return visited;
}

export default function ImpactPage() {
  const params = useParams();
  const repoId = parseInt(params.id as string, 10);
  const [graph, setGraph] = useState<DependencyGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<GraphNode | null>(null);

  useEffect(() => {
    apiClient.getDependencyGraph(repoId).then((g) => {
      setGraph(g);
      if (g.nodes[0]) setPicked(g.nodes[0]);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [repoId]);

  const { downstream, upstream, nodeMap } = useMemo(() => {
    if (!graph || !picked) return { downstream: new Map<string, number>(), upstream: new Map<string, number>(), nodeMap: new Map<string, GraphNode>() };
    const nodeMap = new Map<string, GraphNode>();
    graph.nodes.forEach((n) => nodeMap.set(n.id, n));
    const out = new Map<string, string[]>();
    const inb = new Map<string, string[]>();
    graph.edges.forEach((e) => {
      if (!out.has(e.source)) out.set(e.source, []);
      out.get(e.source)!.push(e.target);
      if (!inb.has(e.target)) inb.set(e.target, []);
      inb.get(e.target)!.push(e.source);
    });
    return {
      downstream: bfs(picked.id, out, 4),
      upstream: bfs(picked.id, inb, 4),
      nodeMap,
    };
  }, [graph, picked]);

  const matches = useMemo(() => {
    if (!graph || !query.trim()) return [];
    const q = query.toLowerCase();
    return graph.nodes.filter((n) => n.path.toLowerCase().includes(q)).slice(0, 8);
  }, [graph, query]);

  const totalImpact = downstream.size + upstream.size;
  const blast = totalImpact === 0 ? 'isolated' : totalImpact < 5 ? 'low' : totalImpact < 20 ? 'medium' : 'high';
  const BLAST_COLOR: Record<string, string> = {
    isolated: '#34d399',
    low: '#7dd3fc',
    medium: '#fbbf24',
    high: '#f43f5e',
  };

  const groupedDown = useMemo(() => {
    const grouped = new Map<number, GraphNode[]>();
    downstream.forEach((depth, id) => {
      const n = nodeMap.get(id);
      if (!n) return;
      if (!grouped.has(depth)) grouped.set(depth, []);
      grouped.get(depth)!.push(n);
    });
    return Array.from(grouped.entries()).sort((a, b) => a[0] - b[0]);
  }, [downstream, nodeMap]);

  const groupedUp = useMemo(() => {
    const grouped = new Map<number, GraphNode[]>();
    upstream.forEach((depth, id) => {
      const n = nodeMap.get(id);
      if (!n) return;
      if (!grouped.has(depth)) grouped.set(depth, []);
      grouped.get(depth)!.push(n);
    });
    return Array.from(grouped.entries()).sort((a, b) => a[0] - b[0]);
  }, [upstream, nodeMap]);

  return (
    <LabShell
      title="Change Impact"
      subtitle="Pick a file. See what would feel the ripple if you changed it today."
      icon={<Activity className="h-5 w-5 text-[hsl(var(--accent-blue))]" />}
      accent="hsl(var(--accent-blue))"
    >
      <Card padding="md" className="mb-6">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-[var(--text-muted)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a file to analyze…"
            className="w-full bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          />
        </div>
        {matches.length > 0 && (
          <ul className="mt-2 space-y-1 border-t border-[var(--hairline)] pt-2">
            {matches.map((m) => (
              <li key={m.id}>
                <button
                  onClick={() => { setPicked(m); setQuery(''); }}
                  className="w-full truncate rounded-md px-2 py-1 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-2)]"
                >
                  {m.path}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card padding="lg" className="lg:col-span-1">
          <div className="text-xs uppercase tracking-wider text-[var(--text-muted)]">Target</div>
          <div className="mt-1 truncate font-mono text-sm text-[var(--text-primary)]">{picked?.path || '—'}</div>
          <div className="mt-4 text-xs uppercase tracking-wider text-[var(--text-muted)]">Predicted blast radius</div>
          <div className="mt-1 flex items-baseline gap-2">
            <div className="text-4xl font-bold" style={{ color: BLAST_COLOR[blast] }}>{totalImpact}</div>
            <div className="text-xs uppercase tracking-wider" style={{ color: BLAST_COLOR[blast] }}>{blast}</div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-2)] p-2">
              <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                <ArrowDownToLine className="h-3 w-3" /> downstream
              </div>
              <div className="mt-0.5 font-mono text-[var(--text-primary)]">{downstream.size}</div>
            </div>
            <div className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-2)] p-2">
              <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                <ArrowUpFromLine className="h-3 w-3" /> upstream
              </div>
              <div className="mt-0.5 font-mono text-[var(--text-primary)]">{upstream.size}</div>
            </div>
          </div>
          {blast === 'high' && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/10 p-3 text-xs text-[var(--danger)]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Modifying this file is high-risk. Consider extracting an interface or migrating in stages.
            </div>
          )}
        </Card>

        <Card padding="lg" className="lg:col-span-2">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--text-muted)]">
                <ArrowDownToLine className="h-3 w-3" /> What this file affects
              </div>
              {groupedDown.length === 0 ? (
                <div className="text-xs text-[var(--text-muted)]">Nothing depends on this directly.</div>
              ) : (
                groupedDown.map(([depth, files]) => (
                  <div key={depth} className="mb-3">
                    <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">+{depth} hop{depth > 1 ? 's' : ''}</div>
                    <ul className="mt-1 space-y-1">
                      {files.slice(0, 6).map((f) => (
                        <motion.li key={f.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="truncate font-mono text-[11px] text-[var(--text-secondary)]">
                          {f.path}
                        </motion.li>
                      ))}
                      {files.length > 6 && <li className="text-[10px] text-[var(--text-muted)]">+ {files.length - 6} more</li>}
                    </ul>
                  </div>
                ))
              )}
            </div>

            <div>
              <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--text-muted)]">
                <ArrowUpFromLine className="h-3 w-3" /> What this file depends on
              </div>
              {groupedUp.length === 0 ? (
                <div className="text-xs text-[var(--text-muted)]">This file depends on nothing tracked in the graph.</div>
              ) : (
                groupedUp.map(([depth, files]) => (
                  <div key={depth} className="mb-3">
                    <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">+{depth} hop{depth > 1 ? 's' : ''}</div>
                    <ul className="mt-1 space-y-1">
                      {files.slice(0, 6).map((f) => (
                        <motion.li key={f.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="truncate font-mono text-[11px] text-[var(--text-secondary)]">
                          {f.path}
                        </motion.li>
                      ))}
                      {files.length > 6 && <li className="text-[10px] text-[var(--text-muted)]">+ {files.length - 6} more</li>}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </div>
        </Card>
      </div>
    </LabShell>
  );
}
