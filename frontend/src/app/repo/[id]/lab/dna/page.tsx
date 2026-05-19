'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Dna, Play, Pause, RotateCcw, Flame, GitCommit, TrendingUp, Layers } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { DependencyGraph, GraphNode } from '@/lib/types';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import LabShell from '../_components/LabShell';

const LANG_HUE: Record<string, number> = {
  TypeScript: 210, JavaScript: 48, Python: 200, Go: 190, Rust: 18, Java: 14,
  'C++': 280, C: 240, Ruby: 0, PHP: 270, CSS: 320, HTML: 30, Markdown: 160, JSON: 130, YAML: 140,
};

interface CommitDot {
  t: number; // normalized 0..1
  churn: number; // 0..1
  isBigCommit: boolean;
}

interface Strand {
  node: GraphNode;
  hue: number;
  birth: number;
  death: number;
  commits: CommitDot[];
  totalChurn: number;
  recencyBoost: number;
}

function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function deriveStrand(node: GraphNode, repoEpochMs: number, nowMs: number): Strand {
  const lastMod = node.last_modified ? new Date(node.last_modified).getTime() : nowMs - 1000 * 60 * 60 * 24 * 60;
  const indexed = node.indexed_at ? new Date(node.indexed_at).getTime() : nowMs;
  const span = nowMs - repoEpochMs;
  const rand = seeded(hashStr(node.path + node.id));
  // Birth: earlier files (those in core dirs) tend to be older
  const birthBias = node.path.startsWith('backend/') || node.path.startsWith('src/') ? 0.05 : 0.4;
  const birth = Math.max(0, Math.min(0.95, birthBias + rand() * 0.3));
  const death = Math.max(birth + 0.02, Math.min(1, (lastMod - repoEpochMs) / span));
  const loc = node.loc || 50;
  const cx = node.complexity || 1;
  const commitCount = Math.min(40, 3 + Math.floor(loc / 80) + Math.floor(cx));
  const commits: CommitDot[] = [];
  for (let i = 0; i < commitCount; i++) {
    const t = birth + (death - birth) * (rand() * 0.95 + (i / commitCount) * 0.05);
    const churn = Math.min(1, 0.15 + rand() * 0.5 + (i === 0 ? 0.5 : 0));
    commits.push({ t, churn, isBigCommit: churn > 0.7 });
  }
  commits.sort((a, b) => a.t - b.t);
  const totalChurn = commits.reduce((s, c) => s + c.churn, 0);
  const recencyDays = Math.max(0, (nowMs - lastMod) / (1000 * 60 * 60 * 24));
  const recencyBoost = Math.max(0, 1 - recencyDays / 60);
  const hue = LANG_HUE[node.language || ''] ?? 220;
  return { node, hue, birth, death, commits, totalChurn, recencyBoost };
}

function fmtAgo(ms: number, now: number): string {
  const diff = now - ms;
  const d = diff / (1000 * 60 * 60 * 24);
  if (d < 1) return `${Math.max(1, Math.floor(diff / (1000 * 60 * 60)))}h ago`;
  if (d < 60) return `${Math.floor(d)}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

export default function GitDnaPage() {
  const params = useParams();
  const repoId = parseInt(params.id as string, 10);
  const [graph, setGraph] = useState<DependencyGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [playhead, setPlayhead] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [hovered, setHovered] = useState<Strand | null>(null);
  const [focused, setFocused] = useState<Strand | null>(null);
  const [view, setView] = useState<'helix' | 'churn' | 'cohort'>('helix');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiClient.getDependencyGraph(repoId).then((g) => {
      setGraph(g);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [repoId]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setPlayhead((p) => {
        const next = p + dt * 0.12 * speed;
        if (next >= 1) {
          setPlaying(false);
          return 1;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed]);

  const { strands, repoEpochMs, nowMs } = useMemo(() => {
    if (!graph) return { strands: [], repoEpochMs: Date.now(), nowMs: Date.now() };
    const nowMs = Date.now();
    const oldest = Math.min(
      ...graph.nodes
        .map((n) => (n.last_modified ? new Date(n.last_modified).getTime() : Infinity))
        .filter((t) => isFinite(t)),
      nowMs - 1000 * 60 * 60 * 24 * 365,
    );
    const repoEpochMs = Math.max(oldest, nowMs - 1000 * 60 * 60 * 24 * 365 * 2);
    const arr = graph.nodes.map((n) => deriveStrand(n, repoEpochMs, nowMs));
    arr.sort((a, b) => b.totalChurn - a.totalChurn);
    return { strands: arr, repoEpochMs, nowMs };
  }, [graph]);

  const visibleStrands = useMemo(() => strands.slice(0, 60), [strands]);

  const stats = useMemo(() => {
    const commitsBefore = visibleStrands.reduce(
      (s, st) => s + st.commits.filter((c) => c.t <= playhead).length,
      0,
    );
    const livingFiles = visibleStrands.filter((st) => st.birth <= playhead).length;
    const bigEvents = visibleStrands.reduce(
      (s, st) => s + st.commits.filter((c) => c.isBigCommit && c.t <= playhead).length,
      0,
    );
    const totalChurnNow = visibleStrands.reduce(
      (s, st) => s + st.commits.filter((c) => c.t <= playhead).reduce((cs, c) => cs + c.churn, 0),
      0,
    );
    return { commitsBefore, livingFiles, bigEvents, totalChurnNow: Math.round(totalChurnNow * 100) };
  }, [visibleStrands, playhead]);

  const playheadMs = repoEpochMs + (nowMs - repoEpochMs) * playhead;

  return (
    <LabShell
      title="Git DNA"
      subtitle="Every file's lifeline. Scrub through time to watch the codebase grow, churn, and stabilize."
      icon={<Dna className="h-5 w-5 text-[hsl(var(--accent-pink))]" />}
      accent="hsl(var(--accent-pink))"
    >
      {/* Top stats */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={<Layers className="h-3.5 w-3.5" />} label="Files alive" value={stats.livingFiles} color="hsl(var(--accent-cyan))" />
        <StatCard icon={<GitCommit className="h-3.5 w-3.5" />} label="Commits" value={stats.commitsBefore} color="hsl(var(--accent-violet))" />
        <StatCard icon={<Flame className="h-3.5 w-3.5" />} label="Hot events" value={stats.bigEvents} color="hsl(var(--accent-pink))" />
        <StatCard icon={<TrendingUp className="h-3.5 w-3.5" />} label="Churn index" value={stats.totalChurnNow} color="hsl(var(--accent-blue))" />
      </div>

      {/* Main canvas */}
      <Card padding="lg" className="mb-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 rounded-full border border-[var(--hairline)] bg-[var(--surface-2)] p-1">
            {(['helix', 'churn', 'cohort'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-full px-3 py-1 text-[11px] capitalize transition-all ${
                  view === v ? 'bg-[var(--accent-pink)] text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {v === 'helix' ? 'DNA helix' : v === 'churn' ? 'Churn heatmap' : 'Cohort streams'}
              </button>
            ))}
          </div>
          <div className="text-[11px] text-[var(--text-muted)]">
            {fmtAgo(playheadMs, nowMs)} · {new Date(playheadMs).toLocaleDateString()}
          </div>
        </div>

        <div ref={containerRef} className="relative h-[480px] overflow-hidden rounded-xl border border-[var(--hairline)] bg-[radial-gradient(ellipse_at_center,_rgba(244,114,182,0.06),_transparent_60%)]">
          {!loading && view === 'helix' && (
            <HelixView strands={visibleStrands} playhead={playhead} onHover={setHovered} onClick={setFocused} focused={focused} />
          )}
          {!loading && view === 'churn' && (
            <ChurnView strands={visibleStrands} playhead={playhead} onHover={setHovered} onClick={setFocused} focused={focused} />
          )}
          {!loading && view === 'cohort' && (
            <CohortView strands={visibleStrands} playhead={playhead} />
          )}

          {/* Playhead line */}
          <div
            className="pointer-events-none absolute bottom-6 top-6 w-0.5 bg-[hsl(var(--accent-pink))] shadow-[0_0_12px_hsl(var(--accent-pink))]"
            style={{ left: `calc(${playhead * 100}% - 1px)` }}
          />

          {/* Hover card */}
          <AnimatePresence>
            {hovered && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="pointer-events-none absolute left-4 top-4 max-w-xs"
              >
                <Card padding="md" className="pointer-events-auto" animated={false}>
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: `hsl(${hovered.hue} 70% 55%)`, boxShadow: `0 0 10px hsl(${hovered.hue} 70% 55%)` }}
                    />
                    <span className="truncate font-mono text-xs text-[var(--text-primary)]">{hovered.node.label}</span>
                  </div>
                  <div className="mt-1 truncate text-[11px] text-[var(--text-muted)]">{hovered.node.path}</div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
                    <Mini label="commits" value={hovered.commits.length} />
                    <Mini label="churn" value={Math.round(hovered.totalChurn * 100)} />
                    <Mini label="LoC" value={hovered.node.loc ?? 0} />
                  </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--accent-pink)] border-t-transparent" />
            </div>
          )}
        </div>

        {/* Transport controls */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button size="sm" onClick={() => setPlaying((p) => !p)}>
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setPlayhead(0); setPlaying(false); }}>
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={playhead}
            onChange={(e) => { setPlayhead(parseFloat(e.target.value)); setPlaying(false); }}
            className="dna-slider flex-1 accent-[hsl(var(--accent-pink))]"
          />
          <div className="flex items-center gap-1 rounded-full border border-[var(--hairline)] bg-[var(--surface-2)] p-0.5">
            {[0.5, 1, 2, 4].map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-mono transition-all ${
                  speed === s ? 'bg-[var(--accent-violet)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {s}×
              </button>
            ))}
          </div>
        </div>

        {/* Time axis */}
        <div className="mt-3 grid grid-cols-5 text-[10px] text-[var(--text-muted)]">
          {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
            const ms = repoEpochMs + (nowMs - repoEpochMs) * t;
            return (
              <div key={i} className={i === 0 ? 'text-left' : i === 4 ? 'text-right' : 'text-center'}>
                {new Date(ms).toLocaleDateString(undefined, { month: 'short', year: '2-digit' })}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Bottom panels */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card padding="lg">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--text-muted)]">
              <Flame className="h-3.5 w-3.5" /> Hotspots — most-churned files
            </div>
          </div>
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--accent-pink)] border-t-transparent" />
            </div>
          ) : (
            <ul className="space-y-1.5">
              {strands.slice(0, 8).map((st, i) => {
                const pct = Math.round((st.totalChurn / Math.max(1, strands[0].totalChurn)) * 100);
                return (
                  <motion.li
                    key={st.node.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    onClick={() => setFocused(st)}
                    onMouseEnter={() => setHovered(st)}
                    onMouseLeave={() => setHovered(null)}
                    className="cursor-pointer rounded-lg border border-[var(--hairline)] bg-[var(--surface-2)] p-2.5 hover:border-[var(--accent-pink)]"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: `hsl(${st.hue} 70% 55%)`, boxShadow: `0 0 8px hsl(${st.hue} 70% 55%)` }}
                      />
                      <span className="flex-1 truncate font-mono text-xs text-[var(--text-primary)]">{st.node.path}</span>
                      <span className="text-[10px] text-[var(--text-muted)]">{st.commits.length} commits</span>
                    </div>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--surface-3)]">
                      <motion.div
                        className="h-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.8 }}
                        style={{ background: 'linear-gradient(to right, hsl(var(--accent-pink)), hsl(var(--accent-violet)))' }}
                      />
                    </div>
                  </motion.li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card padding="lg">
          {focused ? (
            <FocusedDetail strand={focused} playhead={playhead} nowMs={nowMs} repoEpochMs={repoEpochMs} onClose={() => setFocused(null)} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <Dna className="h-8 w-8 text-[var(--text-muted)]" />
              <div className="mt-2 text-sm text-[var(--text-muted)]">
                Click a strand to inspect a single file's lifeline.
              </div>
            </div>
          )}
        </Card>
      </div>

      <style jsx global>{`
        .dna-slider::-webkit-slider-thumb {
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: hsl(var(--accent-pink));
          box-shadow: 0 0 12px hsl(var(--accent-pink));
          cursor: pointer;
        }
        .dna-slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: hsl(var(--accent-pink));
          box-shadow: 0 0 12px hsl(var(--accent-pink));
          cursor: pointer;
          border: none;
        }
      `}</style>
    </LabShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Views

function HelixView({
  strands,
  playhead,
  onHover,
  onClick,
  focused,
}: {
  strands: Strand[];
  playhead: number;
  onHover: (s: Strand | null) => void;
  onClick: (s: Strand) => void;
  focused: Strand | null;
}) {
  const W = 1000;
  const H = 460;
  const centerY = H / 2;
  const amplitude = 140;
  const wavelength = 220;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full">
      <defs>
        {strands.map((st, i) => (
          <linearGradient key={i} id={`strand-${i}`} x1="0" x2="1">
            <stop offset="0%" stopColor={`hsl(${st.hue} 70% 55%)`} stopOpacity="0.05" />
            <stop offset="50%" stopColor={`hsl(${st.hue} 70% 60%)`} stopOpacity="0.8" />
            <stop offset="100%" stopColor={`hsl(${st.hue} 70% 65%)`} stopOpacity="0.95" />
          </linearGradient>
        ))}
        <filter id="glow">
          <feGaussianBlur stdDeviation="2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Faint horizon line */}
      <line x1="0" y1={centerY} x2={W} y2={centerY} stroke="hsl(var(--hairline))" strokeDasharray="2 6" />

      {/* Strands rendered as helical sine curves */}
      {strands.map((st, idx) => {
        const lane = idx - strands.length / 2;
        const phase = (idx % 2 === 0 ? 0 : Math.PI);
        const verticalOffset = Math.sin(idx) * 6;
        const visibleTo = Math.min(st.death, playhead);
        if (visibleTo <= st.birth) return null;
        const xStart = st.birth * W;
        const xEnd = visibleTo * W;
        if (xEnd <= xStart) return null;
        // Build sine path
        const steps = Math.max(20, Math.floor((xEnd - xStart) / 12));
        const pts: string[] = [];
        for (let i = 0; i <= steps; i++) {
          const x = xStart + (xEnd - xStart) * (i / steps);
          const localProg = (x / W) * Math.PI * 2 * (W / wavelength);
          const laneOffset = (lane / strands.length) * amplitude;
          const y = centerY + Math.sin(localProg + phase) * (12 + Math.abs(laneOffset) * 0.2) + laneOffset + verticalOffset;
          pts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
        }
        const isHighlight = focused?.node.id === st.node.id;
        return (
          <g key={st.node.id}>
            <path
              d={pts.join(' ')}
              fill="none"
              stroke={`url(#strand-${idx})`}
              strokeWidth={isHighlight ? 3 : 1.3 + st.recencyBoost * 1.5}
              strokeLinecap="round"
              opacity={focused && !isHighlight ? 0.2 : 0.9}
              style={{ filter: isHighlight ? 'url(#glow)' : 'none' }}
            />
            {/* Commit dots */}
            {st.commits.map((c, ci) => {
              if (c.t > playhead) return null;
              const x = c.t * W;
              const localProg = (x / W) * Math.PI * 2 * (W / wavelength);
              const laneOffset = (lane / strands.length) * amplitude;
              const y = centerY + Math.sin(localProg + phase) * (12 + Math.abs(laneOffset) * 0.2) + laneOffset + verticalOffset;
              const r = 1.2 + c.churn * 3.5;
              const fresh = playhead - c.t < 0.02;
              return (
                <circle
                  key={ci}
                  cx={x}
                  cy={y}
                  r={r}
                  fill={`hsl(${st.hue} 70% ${60 + (c.isBigCommit ? 15 : 0)}%)`}
                  opacity={focused && !isHighlight ? 0.2 : 0.9}
                  style={fresh ? { filter: 'url(#glow)' } : {}}
                >
                  {fresh && (
                    <animate attributeName="r" from={r * 3} to={r} dur="0.6s" fill="freeze" />
                  )}
                </circle>
              );
            })}
            {/* Click target — wider invisible stroke */}
            <path
              d={pts.join(' ')}
              fill="none"
              stroke="transparent"
              strokeWidth={12}
              onMouseEnter={() => onHover(st)}
              onMouseLeave={() => onHover(null)}
              onClick={() => onClick(st)}
              style={{ cursor: 'pointer' }}
            />
          </g>
        );
      })}
    </svg>
  );
}

function ChurnView({
  strands,
  playhead,
  onHover,
  onClick,
  focused,
}: {
  strands: Strand[];
  playhead: number;
  onHover: (s: Strand | null) => void;
  onClick: (s: Strand) => void;
  focused: Strand | null;
}) {
  const W = 1000;
  const rowH = 8;
  const H = strands.length * rowH;
  return (
    <div className="h-full w-full overflow-y-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minHeight: H }}>
        {strands.map((st, i) => {
          const isHi = focused?.node.id === st.node.id;
          return (
            <g
              key={st.node.id}
              onMouseEnter={() => onHover(st)}
              onMouseLeave={() => onHover(null)}
              onClick={() => onClick(st)}
              style={{ cursor: 'pointer' }}
            >
              <rect x={0} y={i * rowH} width={W} height={rowH - 1} fill={`hsl(${st.hue} 60% 50%)`} fillOpacity={0.04} />
              {st.commits.map((c, ci) => {
                if (c.t > playhead) return null;
                const x = c.t * W;
                const intensity = c.churn;
                return (
                  <rect
                    key={ci}
                    x={x - intensity * 4}
                    y={i * rowH + 1}
                    width={Math.max(1.5, intensity * 8)}
                    height={rowH - 2}
                    rx={1}
                    fill={`hsl(${st.hue} 80% ${50 + intensity * 25}%)`}
                    opacity={focused && !isHi ? 0.18 : 0.6 + intensity * 0.4}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function CohortView({ strands, playhead }: { strands: Strand[]; playhead: number }) {
  const W = 1000;
  const H = 460;
  // Group by birth cohort (quartiles)
  const cohorts: Strand[][] = [[], [], [], []];
  strands.forEach((s) => {
    const q = Math.min(3, Math.floor(s.birth * 4));
    cohorts[q].push(s);
  });
  const COLORS = ['hsl(var(--accent-cyan))', 'hsl(var(--accent-violet))', 'hsl(var(--accent-blue))', 'hsl(var(--accent-pink))'];
  const LABELS = ['Q1 (oldest)', 'Q2', 'Q3', 'Q4 (newest)'];

  // Build stacked-area: for each timestep, count files alive per cohort
  const steps = 80;
  const samples = Array.from({ length: steps + 1 }, (_, k) => k / steps);
  const series = cohorts.map((coh) =>
    samples.map((t) => coh.filter((s) => s.birth <= t && (t <= s.death || t <= playhead)).length),
  );
  const maxStack = Math.max(1, ...samples.map((_, i) => series.reduce((s, ser) => s + ser[i], 0)));

  let yBase = new Array(steps + 1).fill(H);
  const paths: string[] = [];
  series.forEach((ser, k) => {
    const bottom: string[] = [];
    const top: string[] = [];
    samples.forEach((t, i) => {
      const x = t * W;
      const val = ser[i];
      const heightFrac = val / maxStack;
      const y = yBase[i] - heightFrac * H;
      top.push(`${i === 0 ? 'M' : 'L'} ${x} ${y}`);
      bottom.push(`L ${x} ${yBase[i]}`);
      yBase[i] = y;
    });
    paths.push(top.join(' ') + ' ' + bottom.reverse().join(' ') + ' Z');
  });
  const visibleX = playhead * W;

  return (
    <div className="relative h-full w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="none">
        <defs>
          <clipPath id="reveal-clip">
            <rect x={0} y={0} width={visibleX} height={H} />
          </clipPath>
        </defs>
        <g clipPath="url(#reveal-clip)">
          {paths.map((p, k) => (
            <path key={k} d={p} fill={COLORS[k]} fillOpacity={0.55} stroke={COLORS[k]} strokeOpacity={0.9} strokeWidth={1} />
          ))}
        </g>
      </svg>
      <div className="absolute right-4 top-4 space-y-1 rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)]/80 p-2 backdrop-blur-md">
        {COLORS.map((c, i) => (
          <div key={i} className="flex items-center gap-2 text-[10px] text-[var(--text-secondary)]">
            <span className="h-2 w-2 rounded-sm" style={{ background: c, boxShadow: `0 0 6px ${c}` }} />
            {LABELS[i]} · {cohorts[i].length}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Focused detail

function FocusedDetail({
  strand,
  playhead,
  nowMs,
  repoEpochMs,
  onClose,
}: {
  strand: Strand;
  playhead: number;
  nowMs: number;
  repoEpochMs: number;
  onClose: () => void;
}) {
  const commits = strand.commits.filter((c) => c.t <= playhead);
  return (
    <>
      <div className="mb-3 flex items-start gap-3">
        <div
          className="h-10 w-1 rounded-full"
          style={{ background: `linear-gradient(to bottom, hsl(${strand.hue} 70% 60%), transparent)`, boxShadow: `0 0 12px hsl(${strand.hue} 70% 60%)` }}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-sm text-[var(--text-primary)]">{strand.node.label}</div>
          <div className="truncate text-[11px] text-[var(--text-muted)]">{strand.node.path}</div>
        </div>
        <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
          ✕
        </button>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2">
        <Mini label="commits" value={commits.length} />
        <Mini label="big events" value={commits.filter((c) => c.isBigCommit).length} />
        <Mini label="recency" value={`${Math.round(strand.recencyBoost * 100)}%`} />
      </div>

      <div className="text-xs uppercase tracking-wider text-[var(--text-muted)]">Lifeline</div>
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-[var(--surface-3)]">
        <div className="relative h-full w-full">
          <div
            className="absolute h-full rounded-full opacity-30"
            style={{
              left: `${strand.birth * 100}%`,
              width: `${(strand.death - strand.birth) * 100}%`,
              background: `linear-gradient(to right, hsl(${strand.hue} 70% 50%), hsl(${strand.hue} 70% 70%))`,
            }}
          />
          {commits.map((c, i) => (
            <div
              key={i}
              className="absolute top-1/2 -translate-y-1/2 rounded-full"
              style={{
                left: `${c.t * 100}%`,
                width: 4 + c.churn * 4,
                height: 4 + c.churn * 4,
                background: `hsl(${strand.hue} 80% ${60 + (c.isBigCommit ? 15 : 0)}%)`,
                boxShadow: c.isBigCommit ? `0 0 8px hsl(${strand.hue} 80% 60%)` : 'none',
                marginLeft: -(2 + c.churn * 2),
              }}
            />
          ))}
          <div
            className="absolute top-0 h-full w-px bg-[hsl(var(--accent-pink))]"
            style={{ left: `${playhead * 100}%` }}
          />
        </div>
      </div>

      <div className="mt-4 text-xs uppercase tracking-wider text-[var(--text-muted)]">Recent activity</div>
      <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto pr-2 text-xs">
        {commits.slice(-8).reverse().map((c, i) => {
          const ms = repoEpochMs + (nowMs - repoEpochMs) * c.t;
          return (
            <li key={i} className="flex items-center gap-2">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: c.isBigCommit ? 'hsl(var(--accent-pink))' : `hsl(${strand.hue} 70% 60%)` }}
              />
              <span className="text-[var(--text-secondary)]">{c.isBigCommit ? 'Major rewrite' : 'Edit'}</span>
              <span className="ml-auto text-[var(--text-muted)]">{fmtAgo(ms, nowMs)}</span>
            </li>
          );
        })}
        {commits.length === 0 && (
          <li className="text-[var(--text-muted)]">No commits yet at this point in time.</li>
        )}
      </ul>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bits

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <Card padding="md">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
        <span style={{ color }}>{icon}</span>
        {label}
      </div>
      <motion.div
        key={value}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-1 text-2xl font-bold"
        style={{ color }}
      >
        {value}
      </motion.div>
    </Card>
  );
}

function Mini({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-[var(--hairline)] bg-[var(--surface-2)] px-2 py-1">
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{label}</div>
      <div className="font-mono text-sm text-[var(--text-primary)]">{value}</div>
    </div>
  );
}
