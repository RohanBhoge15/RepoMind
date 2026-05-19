'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { FlaskRound, Wand2, Play, Bug, ShieldX, Check } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { DependencyGraph, GraphNode } from '@/lib/types';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import LabShell from '../_components/LabShell';

interface TestCase {
  name: string;
  kind: 'happy' | 'edge' | 'error';
  description: string;
}

interface MutationResult {
  mutation: string;
  killed: boolean;
}

function suggestTests(n: GraphNode): TestCase[] {
  const name = n.label.replace(/\.\w+$/, '');
  const base: TestCase[] = [
    { name: `${name} — returns expected output for valid input`, kind: 'happy', description: `Invoke the primary export of ${n.label} with a representative happy-path payload and assert the response shape.` },
    { name: `${name} — handles empty input`, kind: 'edge', description: 'Pass empty / null / undefined values and verify a sane default or explicit rejection.' },
    { name: `${name} — boundary values`, kind: 'edge', description: 'Test minimum, maximum, and one-past-each boundary to lock off-by-one errors.' },
    { name: `${name} — surfaces upstream failure`, kind: 'error', description: 'Force a dependency to throw and assert the error propagates with original context preserved.' },
  ];
  if ((n.complexity || 0) > 5) {
    base.push({ name: `${name} — exercises every branch`, kind: 'edge', description: `Complexity is ${n.complexity?.toFixed(1)} — generate inputs to cover each conditional.` });
  }
  if ((n.vulnerability_count || 0) > 0) {
    base.push({ name: `${name} — adversarial inputs`, kind: 'error', description: 'Fuzz with injection-shaped payloads to validate prior vulnerability fixes hold.' });
  }
  return base;
}

function mockMutations(n: GraphNode): MutationResult[] {
  const seed = (n.id || '').split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  const muts = [
    'replace `==` with `!=`',
    'invert boolean return',
    'replace `+` with `-`',
    'skip null check',
    'short-circuit early return',
  ];
  return muts.map((m, i) => ({ mutation: m, killed: ((seed + i) % 3) !== 0 }));
}

export default function TestsPage() {
  const params = useParams();
  const repoId = parseInt(params.id as string, 10);
  const [graph, setGraph] = useState<DependencyGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<GraphNode | null>(null);
  const [generated, setGenerated] = useState(false);

  useEffect(() => {
    apiClient.getDependencyGraph(repoId).then((g) => {
      setGraph(g);
      if (g.nodes[0]) setPicked(g.nodes[0]);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [repoId]);

  const candidates = useMemo(() => {
    if (!graph) return [];
    return [...graph.nodes]
      .filter((n) => !/test|spec/i.test(n.path))
      .sort((a, b) => (b.complexity || 0) - (a.complexity || 0))
      .slice(0, 30);
  }, [graph]);

  const suggested = picked ? suggestTests(picked) : [];
  const mutations = picked ? mockMutations(picked) : [];
  const killRate = mutations.length ? Math.round((mutations.filter((m) => m.killed).length / mutations.length) * 100) : 0;

  return (
    <LabShell
      title="AI-Generated Tests"
      subtitle="Synthesize tests for risky files. Mutation-test them to estimate effectiveness."
      icon={<FlaskRound className="h-5 w-5 text-[hsl(var(--accent-violet))]" />}
      accent="hsl(var(--accent-violet))"
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card padding="md" className="lg:col-span-1">
          <div className="mb-2 text-xs uppercase tracking-wider text-[var(--text-muted)]">High-risk files</div>
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--accent-violet)] border-t-transparent" />
            </div>
          ) : (
            <ul className="max-h-[65vh] space-y-1 overflow-y-auto pr-1">
              {candidates.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => { setPicked(n); setGenerated(false); }}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                      picked?.id === n.id ? 'bg-[var(--surface-2)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-2)]'
                    }`}
                  >
                    <span className="truncate font-mono">{n.label}</span>
                    <span className="text-[10px] text-[var(--text-muted)]">cx {n.complexity?.toFixed(1) ?? '0'}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card padding="lg">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-wider text-[var(--text-muted)]">Target</div>
                <div className="truncate font-mono text-sm text-[var(--text-primary)]">{picked?.path || '—'}</div>
              </div>
              <Button onClick={() => setGenerated(true)} disabled={!picked}>
                <Wand2 className="mr-2 h-4 w-4" /> Generate tests
              </Button>
            </div>

            <AnimatePresence>
              {generated && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-5 space-y-2">
                  {suggested.map((t, i) => {
                    const Icon = t.kind === 'happy' ? Check : t.kind === 'edge' ? Bug : ShieldX;
                    const tone =
                      t.kind === 'happy'
                        ? 'text-[var(--success)]'
                        : t.kind === 'edge'
                          ? 'text-[var(--warning)]'
                          : 'text-[var(--danger)]';
                    return (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className="flex gap-3 rounded-lg border border-[var(--hairline)] bg-[var(--surface-2)] p-3"
                      >
                        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} />
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-[var(--text-primary)]">{t.name}</div>
                          <div className="mt-0.5 text-xs leading-relaxed text-[var(--text-secondary)]">{t.description}</div>
                        </div>
                      </motion.div>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </Card>

          {generated && (
            <Card padding="lg">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-wider text-[var(--text-muted)]">Mutation analysis</div>
                  <div className="text-sm text-[var(--text-secondary)]">
                    Tweaked the source in {mutations.length} small ways. Tests that catch the change "kill" the mutation.
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-[var(--accent-cyan)]">{killRate}%</div>
                  <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">kill rate</div>
                </div>
              </div>
              <ul className="space-y-1.5 text-xs">
                {mutations.map((m, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full ${
                        m.killed ? 'bg-[var(--success)]/20 text-[var(--success)]' : 'bg-[var(--danger)]/20 text-[var(--danger)]'
                      }`}
                    >
                      {m.killed ? <Check className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                    </span>
                    <span className="font-mono text-[var(--text-secondary)]">{m.mutation}</span>
                    <span className="ml-auto text-[10px] text-[var(--text-muted)]">{m.killed ? 'killed' : 'survived'}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </LabShell>
  );
}
