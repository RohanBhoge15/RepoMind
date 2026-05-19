'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Activity, AlertTriangle, BookOpenCheck, Bug, Cpu, FileWarning, GaugeCircle, HeartPulse } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { DependencyGraph } from '@/lib/types';
import Card from '@/components/ui/Card';

interface Vital {
  key: string;
  label: string;
  value: number; // 0-100
  unit?: string;
  raw?: string;
  tone: 'good' | 'warn' | 'bad';
  icon: any;
}

function tone(value: number, invert = false): Vital['tone'] {
  const v = invert ? 100 - value : value;
  if (v >= 75) return 'good';
  if (v >= 45) return 'warn';
  return 'bad';
}

const TONE_COLOR: Record<Vital['tone'], string> = {
  good: '#34d399',
  warn: '#fbbf24',
  bad: '#f43f5e',
};

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length === 0) return null;
  const w = 100;
  const h = 28;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1 || 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-7 w-full">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Ring({ value, color, label }: { value: number; color: string; label: string }) {
  const r = 36;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  return (
    <div className="relative flex flex-col items-center">
      <svg viewBox="0 0 100 100" className="h-28 w-28 -rotate-90">
        <circle cx="50" cy="50" r={r} stroke="hsl(var(--hairline))" strokeWidth="8" fill="none" />
        <motion.circle
          cx="50"
          cy="50"
          r={r}
          stroke={color}
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
          style={{ filter: `drop-shadow(0 0 6px ${color}88)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-2xl font-bold text-[var(--text-primary)]">{value}</div>
        <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{label}</div>
      </div>
    </div>
  );
}

export default function HealthPage() {
  const params = useParams();
  const repoId = parseInt(params.id as string, 10);
  const [graph, setGraph] = useState<DependencyGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<number[]>([]);

  useEffect(() => {
    apiClient.getDependencyGraph(repoId).then((g) => {
      setGraph(g);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [repoId]);

  useEffect(() => {
    const seed = Array.from({ length: 30 }, (_, i) => 60 + Math.sin(i / 3) * 12 + Math.random() * 6);
    setHistory(seed);
  }, []);

  const vitals = useMemo<Vital[]>(() => {
    if (!graph) return [];
    const nodes = graph.nodes;
    const totalLoc = nodes.reduce((s, n) => s + (n.loc || 0), 0);
    const avgCx = nodes.length ? nodes.reduce((s, n) => s + (n.complexity || 0), 0) / nodes.length : 0;
    const vulnCount = nodes.reduce((s, n) => s + (n.vulnerability_count || 0), 0);
    const docCoverage = nodes.length ? (nodes.filter((n) => n.has_explanation).length / nodes.length) * 100 : 0;
    const giantFiles = nodes.filter((n) => (n.loc || 0) > 400).length;
    const giantPct = nodes.length ? (giantFiles / nodes.length) * 100 : 0;

    const cxScore = Math.max(0, Math.min(100, 100 - avgCx * 8));
    const vulnScore = Math.max(0, 100 - vulnCount * 15);
    const sizeScore = Math.max(0, 100 - giantPct * 2);

    return [
      { key: 'complexity', label: 'Complexity', value: Math.round(cxScore), raw: avgCx.toFixed(1), tone: tone(cxScore), icon: Cpu },
      { key: 'vulns', label: 'Security', value: Math.round(vulnScore), raw: `${vulnCount} findings`, tone: tone(vulnScore), icon: Bug },
      { key: 'docs', label: 'Documentation', value: Math.round(docCoverage), raw: `${Math.round(docCoverage)}% coverage`, tone: tone(docCoverage), icon: BookOpenCheck },
      { key: 'size', label: 'File size', value: Math.round(sizeScore), raw: `${giantFiles} large files`, tone: tone(sizeScore), icon: FileWarning },
    ];
  }, [graph]);

  const composite = vitals.length ? Math.round(vitals.reduce((s, v) => s + v.value, 0) / vitals.length) : 0;
  const compositeTone = tone(composite);
  const totalLoc = graph?.nodes.reduce((s, n) => s + (n.loc || 0), 0) || 0;
  const fileCount = graph?.nodes.length || 0;
  const edgeCount = graph?.edges.length || 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8 flex items-start gap-4">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--hairline)]"
            style={{ background: `linear-gradient(135deg, ${TONE_COLOR[compositeTone]}25, transparent)`, boxShadow: `0 0 24px -10px ${TONE_COLOR[compositeTone]}` }}
          >
            <HeartPulse className="h-5 w-5" style={{ color: TONE_COLOR[compositeTone] }} />
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Repository vitals</div>
            <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Health Monitor</h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">A real-time view of complexity, security, documentation, and structural strain.</p>
          </div>
        </motion.div>

        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_2fr]">
          <Card padding="lg" className="flex flex-col items-center gap-4">
            <Ring value={composite} color={TONE_COLOR[compositeTone]} label="overall" />
            <div className="text-center text-xs text-[var(--text-secondary)]">
              {compositeTone === 'good' && 'Vitals look strong. Keep doing what you\'re doing.'}
              {compositeTone === 'warn' && 'Some indicators need attention — see breakdown.'}
              {compositeTone === 'bad' && 'Multiple vitals are low. Review the worst offenders first.'}
            </div>
          </Card>

          <Card padding="lg">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs uppercase tracking-wider text-[var(--text-muted)]">Recent health trend</div>
              <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--success)]" /> live
              </div>
            </div>
            <Sparkline values={history} color="hsl(var(--accent-cyan))" />
            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              <Stat label="Files" value={fileCount} />
              <Stat label="LoC" value={totalLoc.toLocaleString()} />
              <Stat label="Edges" value={edgeCount} />
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {vitals.map((v, i) => {
            const Icon = v.icon;
            return (
              <motion.div
                key={v.key}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card padding="lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--text-muted)]">
                      <Icon className="h-3.5 w-3.5" />
                      {v.label}
                    </div>
                    <span className="text-[10px] uppercase tracking-wider" style={{ color: TONE_COLOR[v.tone] }}>
                      {v.tone === 'good' ? 'healthy' : v.tone === 'warn' ? 'monitor' : 'critical'}
                    </span>
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <div className="text-3xl font-bold text-[var(--text-primary)]">{v.value}</div>
                    <div className="text-xs text-[var(--text-muted)]">/100</div>
                  </div>
                  <div className="mt-1 text-xs text-[var(--text-secondary)]">{v.raw}</div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--surface-3)]">
                    <motion.div
                      className="h-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${v.value}%` }}
                      transition={{ duration: 0.9 }}
                      style={{ backgroundColor: TONE_COLOR[v.tone] }}
                    />
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>

        {loading && (
          <div className="mt-8 flex justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--accent-cyan)] border-t-transparent" />
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{label}</div>
      <div className="font-mono text-sm text-[var(--text-primary)]">{value}</div>
    </div>
  );
}
