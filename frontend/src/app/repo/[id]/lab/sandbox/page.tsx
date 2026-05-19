'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Beaker, Play, RotateCcw, FileEdit, FileMinus, FilePlus, Zap } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { DependencyGraph, GraphNode } from '@/lib/types';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import LabShell from '../_components/LabShell';

type Op = 'delete' | 'split' | 'rename';

interface Sim {
  op: Op;
  affected: GraphNode[];
  newFiles: number;
  estimatedHours: number;
  ripples: { file: GraphNode; severity: 'low' | 'medium' | 'high' }[];
}

function simulate(target: GraphNode, op: Op, graph: DependencyGraph): Sim {
  const inboundIds = new Set(graph.edges.filter((e) => e.target === target.id).map((e) => e.source));
  const outboundIds = new Set(graph.edges.filter((e) => e.source === target.id).map((e) => e.target));
  const affected = graph.nodes.filter((n) => inboundIds.has(n.id) || outboundIds.has(n.id));

  const ripples = affected.map((f) => {
    const callerCount = graph.edges.filter((e) => e.target === f.id).length;
    const severity = callerCount > 5 ? 'high' : callerCount > 2 ? 'medium' : 'low';
    return { file: f, severity: severity as 'low' | 'medium' | 'high' };
  });

  let newFiles = 0;
  let hours = 0;
  switch (op) {
    case 'delete':
      hours = affected.length * 0.5 + 1;
      break;
    case 'split':
      newFiles = 2;
      hours = (target.loc || 100) / 60 + affected.length * 0.2;
      break;
    case 'rename':
      hours = affected.length * 0.1 + 0.25;
      break;
  }
  return { op, affected, newFiles, estimatedHours: Math.max(0.25, Math.round(hours * 4) / 4), ripples };
}

export default function SandboxPage() {
  const params = useParams();
  const repoId = parseInt(params.id as string, 10);
  const [graph, setGraph] = useState<DependencyGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<GraphNode | null>(null);
  const [op, setOp] = useState<Op>('split');
  const [sim, setSim] = useState<Sim | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    apiClient.getDependencyGraph(repoId).then((g) => {
      setGraph(g);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [repoId]);

  const matches = useMemo(() => {
    if (!graph || !query.trim()) return [];
    const q = query.toLowerCase();
    return graph.nodes.filter((n) => n.path.toLowerCase().includes(q)).slice(0, 6);
  }, [graph, query]);

  const run = () => {
    if (!graph || !picked) return;
    setSim(simulate(picked, op, graph));
  };

  const reset = () => {
    setSim(null);
    setPicked(null);
  };

  const SEV_COLOR = { low: '#34d399', medium: '#fbbf24', high: '#f43f5e' };
  const OP_LABELS: Record<Op, { title: string; desc: string; icon: any }> = {
    delete: { title: 'Delete file', desc: 'See what stops compiling if this file disappears.', icon: FileMinus },
    split: { title: 'Split file', desc: 'Estimate cost of splitting this into two cohesive pieces.', icon: FilePlus },
    rename: { title: 'Rename file', desc: 'Find every reference that would need updating.', icon: FileEdit },
  };

  return (
    <LabShell
      title="What-If Sandbox"
      subtitle="Try a refactor without writing a single line of code. See the ripple before you commit."
      icon={<Beaker className="h-5 w-5 text-[hsl(var(--accent-cyan))]" />}
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_2fr]">
        <Card padding="lg">
          <div className="text-xs uppercase tracking-wider text-[var(--text-muted)]">1. Pick a file</div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="mt-2 w-full rounded-lg border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-cyan)]"
          />
          {matches.length > 0 && (
            <ul className="mt-2 space-y-1">
              {matches.map((m) => (
                <li key={m.id}>
                  <button
                    onClick={() => { setPicked(m); setQuery(''); setSim(null); }}
                    className="w-full truncate rounded-md px-2 py-1 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-2)]"
                  >
                    {m.path}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {picked && (
            <div className="mt-3 rounded-lg border border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/10 p-2 text-xs">
              <div className="text-[var(--text-muted)]">Selected</div>
              <div className="truncate font-mono text-[var(--text-primary)]">{picked.path}</div>
            </div>
          )}

          <div className="mt-6 text-xs uppercase tracking-wider text-[var(--text-muted)]">2. Choose an operation</div>
          <div className="mt-2 space-y-2">
            {(['delete', 'split', 'rename'] as Op[]).map((o) => {
              const meta = OP_LABELS[o];
              const Icon = meta.icon;
              const active = op === o;
              return (
                <button
                  key={o}
                  onClick={() => { setOp(o); setSim(null); }}
                  className={`flex w-full items-start gap-2 rounded-lg border p-2.5 text-left transition-all ${
                    active ? 'border-[var(--accent-cyan)] bg-[var(--accent-cyan)]/10' : 'border-[var(--hairline)] hover:border-[var(--hairline-strong)]'
                  }`}
                >
                  <Icon className="mt-0.5 h-4 w-4 text-[var(--accent-cyan)]" />
                  <div className="min-w-0">
                    <div className="text-sm text-[var(--text-primary)]">{meta.title}</div>
                    <div className="text-[11px] text-[var(--text-muted)]">{meta.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex gap-2">
            <Button onClick={run} disabled={!picked}>
              <Play className="mr-2 h-4 w-4" /> Run simulation
            </Button>
            <Button variant="ghost" onClick={reset}>
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </Card>

        <Card padding="lg">
          <AnimatePresence mode="wait">
            {!sim ? (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex h-64 flex-col items-center justify-center text-center">
                <Beaker className="h-10 w-10 text-[var(--text-muted)]" />
                <div className="mt-3 text-sm text-[var(--text-muted)]">Pick a file and an operation, then hit Run.</div>
              </motion.div>
            ) : (
              <motion.div key="result" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <div className="grid grid-cols-3 gap-3">
                  <Metric label="Files touched" value={sim.affected.length} accent="#7dd3fc" />
                  <Metric label="New files" value={sim.newFiles} accent="#34d399" />
                  <Metric label="Est. effort" value={`${sim.estimatedHours}h`} accent="#c084fc" />
                </div>

                <div className="mt-5">
                  <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--text-muted)]">
                    <Zap className="h-3.5 w-3.5" /> Ripple
                  </div>
                  {sim.ripples.length === 0 ? (
                    <div className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-2)] p-3 text-xs text-[var(--text-muted)]">
                      No downstream callers — this change is contained.
                    </div>
                  ) : (
                    <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-2">
                      {sim.ripples.map((r, i) => (
                        <motion.li
                          key={r.file.id}
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.02 }}
                          className="flex items-center gap-3 rounded-lg border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2 text-xs"
                        >
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: SEV_COLOR[r.severity], boxShadow: `0 0 8px ${SEV_COLOR[r.severity]}` }}
                          />
                          <span className="flex-1 truncate font-mono text-[var(--text-secondary)]">{r.file.path}</span>
                          <span className="text-[10px] uppercase tracking-wide" style={{ color: SEV_COLOR[r.severity] }}>
                            {r.severity}
                          </span>
                        </motion.li>
                      ))}
                    </ul>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      </div>
    </LabShell>
  );
}

function Metric({ label, value, accent }: { label: string; value: React.ReactNode; accent: string }) {
  return (
    <div className="rounded-xl border border-[var(--hairline)] bg-[var(--surface-2)] p-3">
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 text-2xl font-bold" style={{ color: accent }}>{value}</div>
    </div>
  );
}
