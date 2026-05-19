'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Gauge, AlertCircle, ThumbsUp } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { DependencyGraph, GraphNode } from '@/lib/types';
import Card from '@/components/ui/Card';
import LabShell from '../_components/LabShell';

interface ConfidenceCell {
  node: GraphNode;
  confidence: number;
  reasons: { label: string; impact: number }[];
}

function score(n: GraphNode, edgeDegree: number, indexed: boolean): ConfidenceCell {
  let conf = 60;
  const reasons: ConfidenceCell['reasons'] = [];
  if (n.has_explanation) { conf += 20; reasons.push({ label: 'AI explanation generated', impact: 20 }); }
  else { conf -= 10; reasons.push({ label: 'No AI explanation yet', impact: -10 }); }
  if (edgeDegree > 0) { conf += Math.min(15, edgeDegree); reasons.push({ label: `${edgeDegree} graph connection(s)`, impact: Math.min(15, edgeDegree) }); }
  else { conf -= 8; reasons.push({ label: 'Isolated in dependency graph', impact: -8 }); }
  if ((n.loc || 0) > 0) { conf += 5; reasons.push({ label: 'Lines-of-code metric available', impact: 5 }); }
  if (n.language) { conf += 5; reasons.push({ label: `Language detected (${n.language})`, impact: 5 }); }
  if ((n.complexity || 0) > 0) { conf += 3; reasons.push({ label: 'Complexity measured', impact: 3 }); }
  if (!indexed) { conf -= 12; reasons.push({ label: 'No recent index timestamp', impact: -12 }); }
  conf = Math.max(0, Math.min(100, conf));
  return { node: n, confidence: conf, reasons };
}

export default function ConfidencePage() {
  const params = useParams();
  const repoId = parseInt(params.id as string, 10);
  const [graph, setGraph] = useState<DependencyGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<ConfidenceCell | null>(null);

  useEffect(() => {
    apiClient.getDependencyGraph(repoId).then((g) => {
      setGraph(g);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [repoId]);

  const cells = useMemo<ConfidenceCell[]>(() => {
    if (!graph) return [];
    const degree = new Map<string, number>();
    graph.edges.forEach((e) => {
      degree.set(e.source, (degree.get(e.source) || 0) + 1);
      degree.set(e.target, (degree.get(e.target) || 0) + 1);
    });
    return graph.nodes.map((n) => score(n, degree.get(n.id) || 0, Boolean(n.indexed_at)));
  }, [graph]);

  const avg = cells.length ? Math.round(cells.reduce((s, c) => s + c.confidence, 0) / cells.length) : 0;
  const buckets = { high: 0, mid: 0, low: 0 };
  cells.forEach((c) => {
    if (c.confidence >= 75) buckets.high++;
    else if (c.confidence >= 50) buckets.mid++;
    else buckets.low++;
  });

  function colorFor(c: number) {
    if (c >= 75) return '#34d399';
    if (c >= 50) return '#fbbf24';
    return '#f43f5e';
  }

  const cols = 28;
  const cellSize = 16;

  return (
    <LabShell
      title="Confidence Map"
      subtitle="Where our analysis is sure — and where it's still guessing. Greener = more trustworthy answers."
      icon={<Gauge className="h-5 w-5 text-[hsl(var(--accent-violet))]" />}
      accent="hsl(var(--accent-violet))"
    >
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card padding="md">
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Overall</div>
          <div className="mt-1 text-3xl font-bold" style={{ color: colorFor(avg) }}>{avg}%</div>
        </Card>
        <Card padding="md">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
            <ThumbsUp className="h-3 w-3 text-[var(--success)]" /> High confidence
          </div>
          <div className="mt-1 text-2xl font-bold text-[var(--success)]">{buckets.high}</div>
        </Card>
        <Card padding="md">
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Medium</div>
          <div className="mt-1 text-2xl font-bold text-[var(--warning)]">{buckets.mid}</div>
        </Card>
        <Card padding="md">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
            <AlertCircle className="h-3 w-3 text-[var(--danger)]" /> Low
          </div>
          <div className="mt-1 text-2xl font-bold text-[var(--danger)]">{buckets.low}</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <Card padding="lg">
          <div className="mb-3 text-xs uppercase tracking-wider text-[var(--text-muted)]">Heatmap</div>
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--accent-violet)] border-t-transparent" />
            </div>
          ) : (
            <div className="flex flex-wrap gap-1">
              {cells.map((c, i) => (
                <motion.button
                  key={c.node.id}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: Math.min(i * 0.003, 1) }}
                  whileHover={{ scale: 1.4, zIndex: 10 }}
                  onClick={() => setPicked(c)}
                  title={`${c.node.path} — ${c.confidence}%`}
                  className="rounded-sm transition-all"
                  style={{
                    width: cellSize,
                    height: cellSize,
                    background: colorFor(c.confidence),
                    opacity: 0.3 + (c.confidence / 100) * 0.7,
                    boxShadow: picked === c ? `0 0 12px ${colorFor(c.confidence)}` : 'none',
                  }}
                />
              ))}
            </div>
          )}
          <div className="mt-4 flex items-center gap-3 text-[11px] text-[var(--text-muted)]">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: '#34d399' }} /> high
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: '#fbbf24' }} /> medium
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: '#f43f5e' }} /> low
            </div>
          </div>
        </Card>

        <Card padding="lg">
          {picked ? (
            <>
              <div className="mb-1 truncate font-mono text-sm text-[var(--text-primary)]">{picked.node.path}</div>
              <div className="text-xs text-[var(--text-muted)]">
                Confidence: <span className="font-bold" style={{ color: colorFor(picked.confidence) }}>{picked.confidence}%</span>
              </div>
              <div className="mt-4 text-xs uppercase tracking-wider text-[var(--text-muted)]">Why this score</div>
              <ul className="mt-2 space-y-1.5 text-xs">
                {picked.reasons.map((r, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className={`font-mono text-[10px] ${r.impact >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                      {r.impact > 0 ? `+${r.impact}` : r.impact}
                    </span>
                    <span className="text-[var(--text-secondary)]">{r.label}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="flex h-40 items-center justify-center text-center text-sm text-[var(--text-muted)]">
              Hover a cell to inspect.
            </div>
          )}
        </Card>
      </div>
    </LabShell>
  );
}
