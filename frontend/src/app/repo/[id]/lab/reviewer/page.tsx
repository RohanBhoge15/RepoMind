'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { ShieldCheck, AlertTriangle, CheckCircle2, FileWarning } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { DependencyGraph, GraphNode } from '@/lib/types';
import Card from '@/components/ui/Card';
import LabShell from '../_components/LabShell';

type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

interface Review {
  node: GraphNode;
  grade: Grade;
  score: number;
  signals: { label: string; weight: number; tone: 'good' | 'warn' | 'bad' }[];
}

function gradeFor(score: number): Grade {
  if (score >= 90) return 'A';
  if (score >= 78) return 'B';
  if (score >= 65) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}

const GRADE_COLOR: Record<Grade, string> = {
  A: '#34d399',
  B: '#7dd3fc',
  C: '#fbbf24',
  D: '#fb923c',
  F: '#f43f5e',
};

function scoreNode(n: GraphNode): Review {
  let score = 95;
  const signals: Review['signals'] = [];
  const loc = n.loc || 0;
  const cx = n.complexity || 0;
  const vuln = n.vulnerability_count || 0;

  if (loc > 500) { score -= 25; signals.push({ label: `${loc} LoC — long file`, weight: -25, tone: 'bad' }); }
  else if (loc > 250) { score -= 12; signals.push({ label: `${loc} LoC — large file`, weight: -12, tone: 'warn' }); }
  else if (loc > 0) { signals.push({ label: `${loc} LoC — manageable`, weight: 0, tone: 'good' }); }

  if (cx > 8) { score -= 22; signals.push({ label: `complexity ${cx.toFixed(1)} — high branching`, weight: -22, tone: 'bad' }); }
  else if (cx > 4) { score -= 10; signals.push({ label: `complexity ${cx.toFixed(1)} — moderate`, weight: -10, tone: 'warn' }); }
  else if (cx > 0) { signals.push({ label: `complexity ${cx.toFixed(1)} — low`, weight: 0, tone: 'good' }); }

  if (vuln > 0) { score -= 18 * vuln; signals.push({ label: `${vuln} vulnerability finding${vuln > 1 ? 's' : ''}`, weight: -18 * vuln, tone: 'bad' }); }

  if (n.has_explanation) { score += 4; signals.push({ label: 'AI documentation present', weight: 4, tone: 'good' }); }

  score = Math.max(0, Math.min(100, score));
  return { node: n, grade: gradeFor(score), score, signals };
}

export default function ReviewerPage() {
  const params = useParams();
  const repoId = parseInt(params.id as string, 10);
  const [graph, setGraph] = useState<DependencyGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Grade | 'all'>('all');
  const [picked, setPicked] = useState<Review | null>(null);

  useEffect(() => {
    apiClient.getDependencyGraph(repoId).then((g) => {
      setGraph(g);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [repoId]);

  const reviews = useMemo(() => (graph ? graph.nodes.map(scoreNode).sort((a, b) => a.score - b.score) : []), [graph]);
  const counts: Record<Grade, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  reviews.forEach((r) => counts[r.grade]++);
  const filtered = filter === 'all' ? reviews : reviews.filter((r) => r.grade === filter);
  const avg = reviews.length ? reviews.reduce((s, r) => s + r.score, 0) / reviews.length : 0;

  return (
    <LabShell
      title="AI Reviewer"
      subtitle="Every file scored on size, complexity, vulnerabilities, and documentation."
      icon={<ShieldCheck className="h-5 w-5 text-[hsl(var(--accent-pink))]" />}
      accent="hsl(var(--accent-pink))"
    >
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-6">
        <Card padding="md">
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Repo grade</div>
          <div className="mt-1 text-3xl font-bold" style={{ color: GRADE_COLOR[gradeFor(avg)] }}>
            {gradeFor(avg)}
          </div>
          <div className="text-xs text-[var(--text-muted)]">avg {avg.toFixed(0)}</div>
        </Card>
        {(['A', 'B', 'C', 'D', 'F'] as Grade[]).map((g) => (
          <Card key={g} padding="md" onClick={() => setFilter(filter === g ? 'all' : g)} className={filter === g ? 'ring-1 ring-[var(--accent-cyan)]' : ''}>
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{g}-grade</div>
            <div className="mt-1 text-2xl font-bold" style={{ color: GRADE_COLOR[g] }}>{counts[g]}</div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card padding="md">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
                Worst offenders {filter !== 'all' && `· ${filter}-grade only`}
              </div>
              {filter !== 'all' && (
                <button onClick={() => setFilter('all')} className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                  Clear
                </button>
              )}
            </div>
            {loading ? (
              <div className="flex h-40 items-center justify-center">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--accent-pink)] border-t-transparent" />
              </div>
            ) : (
              <ul className="max-h-[60vh] space-y-1 overflow-y-auto pr-2">
                {filtered.slice(0, 80).map((r) => (
                  <motion.li
                    key={r.node.id}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    onClick={() => setPicked(r)}
                    className="flex cursor-pointer items-center gap-3 rounded-md border border-transparent px-2 py-1.5 hover:border-[var(--hairline)] hover:bg-[var(--surface-2)]"
                  >
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded-md font-bold text-xs"
                      style={{ backgroundColor: `${GRADE_COLOR[r.grade]}22`, color: GRADE_COLOR[r.grade] }}
                    >
                      {r.grade}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-xs text-[var(--text-primary)]">{r.node.path}</div>
                      <div className="text-[10px] text-[var(--text-muted)]">
                        {r.node.loc ?? 0} LoC · cx {r.node.complexity?.toFixed(1) ?? '0'} · {r.node.vulnerability_count ?? 0} vulns
                      </div>
                    </div>
                    <div className="flex h-1.5 w-20 overflow-hidden rounded-full bg-[var(--surface-3)]">
                      <div
                        className="h-full"
                        style={{ width: `${r.score}%`, backgroundColor: GRADE_COLOR[r.grade] }}
                      />
                    </div>
                  </motion.li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div>
          <Card padding="lg" className="sticky top-4">
            {picked ? (
              <>
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-lg font-bold"
                    style={{ backgroundColor: `${GRADE_COLOR[picked.grade]}25`, color: GRADE_COLOR[picked.grade], boxShadow: `0 0 18px -6px ${GRADE_COLOR[picked.grade]}` }}
                  >
                    {picked.grade}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-mono text-sm text-[var(--text-primary)]">{picked.node.label}</div>
                    <div className="truncate text-[11px] text-[var(--text-muted)]">{picked.node.path}</div>
                  </div>
                </div>
                <div className="mt-4 text-xs uppercase tracking-wider text-[var(--text-muted)]">Signals</div>
                <ul className="mt-2 space-y-1.5 text-xs">
                  {picked.signals.map((s, i) => {
                    const Icon = s.tone === 'good' ? CheckCircle2 : s.tone === 'warn' ? FileWarning : AlertTriangle;
                    const color = s.tone === 'good' ? 'text-[var(--success)]' : s.tone === 'warn' ? 'text-[var(--warning)]' : 'text-[var(--danger)]';
                    return (
                      <li key={i} className="flex items-start gap-2">
                        <Icon className={`mt-0.5 h-3.5 w-3.5 ${color}`} />
                        <span className="flex-1 text-[var(--text-secondary)]">{s.label}</span>
                        {s.weight !== 0 && (
                          <span className={`font-mono text-[10px] ${color}`}>{s.weight > 0 ? '+' : ''}{s.weight}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-4 border-t border-[var(--hairline)] pt-3 text-xs text-[var(--text-muted)]">
                  Total score: <span className="font-mono text-[var(--text-primary)]">{picked.score}/100</span>
                </div>
              </>
            ) : (
              <div className="text-center text-xs text-[var(--text-muted)]">
                Select a file to see its detailed scorecard.
              </div>
            )}
          </Card>
        </div>
      </div>
    </LabShell>
  );
}
