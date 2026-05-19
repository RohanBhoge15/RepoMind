'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileCode,
  GitBranch,
  Star,
  GitFork,
  Calendar,
  Activity,
  AlertTriangle,
  BookOpen,
  Cpu,
  Layers,
  TrendingUp,
  Code2,
  Folder,
  Flame,
  Clock,
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import { DependencyGraph, GraphNode, Repository } from '@/lib/types';
import Card from '@/components/ui/Card';
import IndexDiffBanner from '@/components/ui/IndexDiffBanner';

const LANG_COLOR: Record<string, string> = {
  TypeScript: '#7dd3fc',
  JavaScript: '#fbbf24',
  Python: '#38bdf8',
  Go: '#22d3ee',
  Rust: '#fb923c',
  Java: '#f97316',
  'C++': '#a855f7',
  C: '#6366f1',
  Ruby: '#ef4444',
  PHP: '#8b5cf6',
  CSS: '#ec4899',
  HTML: '#f59e0b',
  Markdown: '#10b981',
  JSON: '#84cc16',
  YAML: '#22c55e',
  Other: '#64748b',
};

function colorForLang(lang: string) {
  return LANG_COLOR[lang] || LANG_COLOR.Other;
}

function shortNumber(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

function timeAgo(iso?: string) {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (!isFinite(ms) || ms < 0) return '—';
  const days = ms / (1000 * 60 * 60 * 24);
  if (days < 1) return `${Math.max(1, Math.floor(ms / (1000 * 60 * 60)))}h ago`;
  if (days < 60) return `${Math.floor(days)}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export default function OverviewPage({ params }: { params: { id: string } }) {
  const { data: session } = useSession();
  const repoId = parseInt(params.id);

  const [repository, setRepository] = useState<Repository | null>(null);
  const [graph, setGraph] = useState<DependencyGraph | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) return;
    const backendToken = (session as any).backendToken;
    if (backendToken) apiClient.setAuthToken(backendToken);
    (async () => {
      try {
        const data = await apiClient.listRepositories();
        const repo = data.repositories.find((r) => r.id === repoId);
        if (repo) setRepository(repo);
        const g = await apiClient.getDependencyGraph(repoId);
        setGraph(g);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [session, repoId]);

  // ─── Derived stats ────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const nodes = graph?.nodes || [];
    const totalFiles = nodes.length || repository?.total_files || 0;
    const totalLoc = nodes.reduce((s, n) => s + (n.loc || 0), 0) || repository?.total_lines || 0;
    const avgLoc = totalFiles ? Math.round(totalLoc / totalFiles) : 0;
    const docCount = nodes.filter((n) => n.has_explanation).length;
    const docPct = totalFiles ? (docCount / totalFiles) * 100 : 0;
    const vulnCount = nodes.reduce((s, n) => s + (n.vulnerability_count || 0), 0);
    const avgCx = totalFiles ? nodes.reduce((s, n) => s + (n.complexity || 0), 0) / totalFiles : 0;
    const edges = graph?.edges.length || 0;
    return { totalFiles, totalLoc, avgLoc, docCount, docPct, vulnCount, avgCx, edges };
  }, [graph, repository]);

  // Language distribution
  const langDist = useMemo(() => {
    if (!graph) return { byFiles: [], byLoc: [], totalLoc: 0, totalFiles: 0 };
    const files = new Map<string, number>();
    const loc = new Map<string, number>();
    graph.nodes.forEach((n) => {
      const k = n.language || 'Other';
      files.set(k, (files.get(k) || 0) + 1);
      loc.set(k, (loc.get(k) || 0) + (n.loc || 0));
    });
    const totalFiles = graph.nodes.length;
    const totalLoc = Array.from(loc.values()).reduce((a, b) => a + b, 0);
    const byFiles = Array.from(files.entries()).sort((a, b) => b[1] - a[1]).map(([name, n]) => ({
      name,
      value: n,
      pct: totalFiles ? (n / totalFiles) * 100 : 0,
      color: colorForLang(name),
    }));
    const byLoc = Array.from(loc.entries()).sort((a, b) => b[1] - a[1]).map(([name, n]) => ({
      name,
      value: n,
      pct: totalLoc ? (n / totalLoc) * 100 : 0,
      color: colorForLang(name),
    }));
    return { byFiles, byLoc, totalLoc, totalFiles };
  }, [graph]);

  // Largest files
  const largestFiles = useMemo(() => {
    if (!graph) return [];
    return [...graph.nodes].sort((a, b) => (b.loc || 0) - (a.loc || 0)).slice(0, 10);
  }, [graph]);

  // LoC histogram
  const locBuckets = useMemo(() => {
    if (!graph) return [];
    const buckets = [
      { label: '0-50', max: 50, count: 0 },
      { label: '51-150', max: 150, count: 0 },
      { label: '151-300', max: 300, count: 0 },
      { label: '301-500', max: 500, count: 0 },
      { label: '501-1k', max: 1000, count: 0 },
      { label: '1k+', max: Infinity, count: 0 },
    ];
    graph.nodes.forEach((n) => {
      const loc = n.loc || 0;
      const b = buckets.find((b) => loc <= b.max);
      if (b) b.count++;
    });
    return buckets;
  }, [graph]);

  // Complexity distribution
  const cxBuckets = useMemo(() => {
    if (!graph) return { low: 0, mid: 0, high: 0 };
    let low = 0, mid = 0, high = 0;
    graph.nodes.forEach((n) => {
      const cx = n.complexity || 0;
      if (cx <= 2) low++;
      else if (cx <= 5) mid++;
      else high++;
    });
    return { low, mid, high };
  }, [graph]);

  // Folder breakdown
  const folderBreakdown = useMemo(() => {
    if (!graph) return [];
    const map = new Map<string, { files: number; loc: number }>();
    graph.nodes.forEach((n) => {
      const top = n.path.split('/')[0] || 'root';
      const cur = map.get(top) || { files: 0, loc: 0 };
      cur.files++;
      cur.loc += n.loc || 0;
      map.set(top, cur);
    });
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.loc - a.loc)
      .slice(0, 8);
  }, [graph]);

  // Recency distribution
  const recencyBuckets = useMemo(() => {
    if (!graph) return { d7: 0, d30: 0, d90: 0, older: 0 };
    const now = Date.now();
    let d7 = 0, d30 = 0, d90 = 0, older = 0;
    graph.nodes.forEach((n) => {
      const ts = n.last_modified ? new Date(n.last_modified).getTime() : 0;
      if (!ts) { older++; return; }
      const days = (now - ts) / (1000 * 60 * 60 * 24);
      if (days <= 7) d7++;
      else if (days <= 30) d30++;
      else if (days <= 90) d90++;
      else older++;
    });
    return { d7, d30, d90, older };
  }, [graph]);

  // Activity sparkline — group last_modified into weekly buckets
  const activitySpark = useMemo(() => {
    if (!graph) return [];
    const now = Date.now();
    const weeks = 24;
    const buckets = new Array(weeks).fill(0);
    graph.nodes.forEach((n) => {
      const ts = n.last_modified ? new Date(n.last_modified).getTime() : 0;
      if (!ts) return;
      const wk = Math.floor((now - ts) / (1000 * 60 * 60 * 24 * 7));
      if (wk >= 0 && wk < weeks) buckets[weeks - 1 - wk]++;
    });
    return buckets;
  }, [graph]);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Repository overview</div>
            <h1 className="mt-1 truncate text-2xl font-semibold text-[var(--text-primary)]">
              {repository?.full_name || repository?.name || 'Loading…'}
            </h1>
            {repository?.description && (
              <p className="mt-2 max-w-3xl text-sm text-[var(--text-secondary)]">{repository.description}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-[var(--text-muted)]">
            {repository?.default_branch && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--hairline)] bg-[var(--surface-1)] px-2.5 py-1">
                <GitBranch className="h-3 w-3" /> {repository.default_branch}
              </span>
            )}
            {repository?.language && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--hairline)] bg-[var(--surface-1)] px-2.5 py-1">
                <Code2 className="h-3 w-3" /> {repository.language}
              </span>
            )}
            {repository?.indexed_at && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--hairline)] bg-[var(--surface-1)] px-2.5 py-1">
                <Clock className="h-3 w-3" /> indexed {timeAgo(repository.indexed_at)}
              </span>
            )}
          </div>
        </motion.div>

        {/* Diff banner: changes since the last index */}
        {graph?.nodes && repository?.indexed_at && (
          <IndexDiffBanner
            repoId={repoId}
            nodes={graph.nodes}
            indexedAt={repository.indexed_at}
          />
        )}

        {/* Hero stats */}
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <HeroStat icon={FileCode} label="Files" value={shortNumber(stats.totalFiles)} accent="hsl(var(--accent-cyan))" />
          <HeroStat icon={Code2} label="Lines of code" value={shortNumber(stats.totalLoc)} accent="hsl(var(--accent-violet))" />
          <HeroStat icon={TrendingUp} label="Avg LoC / file" value={shortNumber(stats.avgLoc)} accent="hsl(var(--accent-blue))" />
          <HeroStat icon={Star} label="Stars" value={shortNumber(repository?.stars_count || 0)} accent="#fbbf24" />
          <HeroStat icon={GitFork} label="Forks" value={shortNumber(repository?.forks_count || 0)} accent="#34d399" />
          <HeroStat icon={Layers} label="Edges" value={shortNumber(stats.edges)} accent="hsl(var(--accent-pink))" />
        </div>

        {/* Bento grid */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-6">
          {/* Language donut (large) */}
          <BentoCard className="lg:col-span-3" delay={0.05}>
            <LanguageDonut langDist={langDist} loading={loading} />
          </BentoCard>

          {/* Doc coverage + vulns + complexity gauges */}
          <BentoCard className="lg:col-span-3" delay={0.1}>
            <GaugeStrip
              docPct={stats.docPct}
              docCount={stats.docCount}
              total={stats.totalFiles}
              avgCx={stats.avgCx}
              vulnCount={stats.vulnCount}
            />
          </BentoCard>

          {/* Activity sparkline strip */}
          <BentoCard className="lg:col-span-6" delay={0.15}>
            <ActivityStrip buckets={activitySpark} />
          </BentoCard>

          {/* Largest files (left) */}
          <BentoCard className="lg:col-span-3" delay={0.2}>
            <LargestFiles files={largestFiles} />
          </BentoCard>

          {/* LoC histogram (right) */}
          <BentoCard className="lg:col-span-3" delay={0.25}>
            <LocHistogram buckets={locBuckets} />
          </BentoCard>

          {/* Folder treemap */}
          <BentoCard className="lg:col-span-4" delay={0.3}>
            <FolderTreemap folders={folderBreakdown} />
          </BentoCard>

          {/* Complexity */}
          <BentoCard className="lg:col-span-2" delay={0.35}>
            <ComplexitySplit buckets={cxBuckets} />
          </BentoCard>

          {/* Recency */}
          <BentoCard className="lg:col-span-6" delay={0.4}>
            <RecencyDistribution buckets={recencyBuckets} total={stats.totalFiles} />
          </BentoCard>
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

// ─────────────────────────────────────────────────────────────────────────────
// Building blocks
// ─────────────────────────────────────────────────────────────────────────────

function BentoCard({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      <Card padding="lg" animated={false} className="h-full">
        {children}
      </Card>
    </motion.div>
  );
}

function HeroStat({ icon: Icon, label, value, accent }: { icon: any; label: string; value: React.ReactNode; accent: string }) {
  return (
    <motion.div whileHover={{ y: -2 }}>
      <Card padding="md" animated={false} className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{ background: `linear-gradient(to right, transparent, ${accent}, transparent)` }}
        />
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
          <Icon className="h-3.5 w-3.5" style={{ color: accent }} />
          {label}
        </div>
        <motion.div
          key={String(value)}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-1.5 text-2xl font-bold text-[var(--text-primary)]"
        >
          {value}
        </motion.div>
      </Card>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Language donut

function LanguageDonut({ langDist, loading }: { langDist: any; loading: boolean }) {
  const [mode, setMode] = useState<'files' | 'loc'>('loc');
  const [hovered, setHovered] = useState<number | null>(null);
  const series = mode === 'files' ? langDist.byFiles : langDist.byLoc;
  const radius = 90;
  const innerRadius = 60;
  const cx = 110, cy = 110;
  let acc = 0;
  const total = series.reduce((s: number, r: any) => s + r.value, 0) || 1;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--text-muted)]">
          <Layers className="h-3.5 w-3.5" /> Language distribution
        </div>
        <div className="flex items-center gap-1 rounded-full border border-[var(--hairline)] bg-[var(--surface-2)] p-1">
          {(['loc', 'files'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] transition-all ${
                mode === m ? 'bg-[var(--accent-cyan)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              by {m === 'loc' ? 'LoC' : 'files'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-6">
        <div className="relative">
          <svg viewBox="0 0 220 220" className="h-52 w-52">
            <circle cx={cx} cy={cy} r={radius} fill="none" stroke="hsl(var(--hairline))" strokeWidth="2" opacity="0.3" />
            {series.map((s: any, i: number) => {
              const startAngle = (acc / total) * Math.PI * 2 - Math.PI / 2;
              acc += s.value;
              const endAngle = (acc / total) * Math.PI * 2 - Math.PI / 2;
              const large = endAngle - startAngle > Math.PI ? 1 : 0;
              const x1 = cx + Math.cos(startAngle) * radius;
              const y1 = cy + Math.sin(startAngle) * radius;
              const x2 = cx + Math.cos(endAngle) * radius;
              const y2 = cy + Math.sin(endAngle) * radius;
              const x1i = cx + Math.cos(startAngle) * innerRadius;
              const y1i = cy + Math.sin(startAngle) * innerRadius;
              const x2i = cx + Math.cos(endAngle) * innerRadius;
              const y2i = cy + Math.sin(endAngle) * innerRadius;
              const path = `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} L ${x2i} ${y2i} A ${innerRadius} ${innerRadius} 0 ${large} 0 ${x1i} ${y1i} Z`;
              return (
                <motion.path
                  key={`${mode}-${s.name}`}
                  d={path}
                  fill={s.color}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: hovered === null || hovered === i ? 0.92 : 0.35 }}
                  transition={{ duration: 0.4, delay: i * 0.03 }}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  style={{ cursor: 'pointer', filter: hovered === i ? `drop-shadow(0 0 8px ${s.color})` : 'none' }}
                />
              );
            })}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
              {hovered !== null ? series[hovered].name : 'Total'}
            </div>
            <div className="text-2xl font-bold text-[var(--text-primary)]">
              {hovered !== null
                ? `${series[hovered].pct.toFixed(1)}%`
                : mode === 'loc' ? shortNumber(langDist.totalLoc) : shortNumber(langDist.totalFiles)}
            </div>
            <div className="text-[10px] text-[var(--text-muted)]">
              {hovered !== null
                ? `${shortNumber(series[hovered].value)} ${mode === 'loc' ? 'LoC' : 'files'}`
                : mode === 'loc' ? 'lines' : 'files'}
            </div>
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          {series.slice(0, 8).map((s: any, i: number) => (
            <motion.div
              key={s.name}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: hovered === null || hovered === i ? 1 : 0.4, x: 0 }}
              transition={{ delay: i * 0.03 }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              className="cursor-pointer"
            >
              <div className="flex items-center gap-2 text-xs">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: s.color, boxShadow: `0 0 6px ${s.color}` }} />
                <span className="flex-1 truncate text-[var(--text-secondary)]">{s.name}</span>
                <span className="font-mono text-[var(--text-primary)]">{s.pct.toFixed(1)}%</span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--surface-3)]">
                <motion.div
                  className="h-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${s.pct}%` }}
                  transition={{ duration: 0.8, delay: i * 0.04 }}
                  style={{ background: s.color }}
                />
              </div>
            </motion.div>
          ))}
          {series.length === 0 && !loading && (
            <div className="text-xs text-[var(--text-muted)]">No language data yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Gauges strip

function GaugeStrip({ docPct, docCount, total, avgCx, vulnCount }: any) {
  const cxScore = Math.max(0, Math.min(100, 100 - avgCx * 8));
  const vulnScore = Math.max(0, 100 - vulnCount * 15);
  return (
    <div>
      <div className="mb-4 flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--text-muted)]">
        <Activity className="h-3.5 w-3.5" /> Vital signs
      </div>
      <div className="grid grid-cols-3 gap-3">
        <RadialGauge
          icon={<BookOpen className="h-3.5 w-3.5" />}
          label="Documentation"
          value={docPct}
          accent="hsl(var(--accent-cyan))"
          caption={`${docCount}/${total} files`}
        />
        <RadialGauge
          icon={<Cpu className="h-3.5 w-3.5" />}
          label="Complexity"
          value={cxScore}
          accent="hsl(var(--accent-violet))"
          caption={`avg ${avgCx.toFixed(1)}`}
        />
        <RadialGauge
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          label="Security"
          value={vulnScore}
          accent={vulnCount > 0 ? 'hsl(var(--danger))' : 'hsl(var(--success))'}
          caption={`${vulnCount} finding${vulnCount === 1 ? '' : 's'}`}
        />
      </div>
    </div>
  );
}

function RadialGauge({ icon, label, value, accent, caption }: any) {
  const r = 38;
  const c = 2 * Math.PI * r;
  return (
    <div className="rounded-xl border border-[var(--hairline)] bg-[var(--surface-2)] p-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
        <span style={{ color: accent }}>{icon}</span> {label}
      </div>
      <div className="mt-2 flex items-center gap-3">
        <div className="relative h-20 w-20">
          <svg viewBox="0 0 100 100" className="h-20 w-20 -rotate-90">
            <circle cx="50" cy="50" r={r} fill="none" stroke="hsl(var(--hairline))" strokeWidth="6" />
            <motion.circle
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke={accent}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={c}
              initial={{ strokeDashoffset: c }}
              animate={{ strokeDashoffset: c - (Math.max(0, Math.min(100, value)) / 100) * c }}
              transition={{ duration: 1, ease: 'easeOut' }}
              style={{ filter: `drop-shadow(0 0 4px ${accent}88)` }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-[var(--text-primary)]">
            {Math.round(value)}
          </div>
        </div>
        <div className="text-[10px] text-[var(--text-muted)]">{caption}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Activity strip

function ActivityStrip({ buckets }: { buckets: number[] }) {
  const max = Math.max(1, ...buckets);
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--text-muted)]">
          <Flame className="h-3.5 w-3.5" /> Recent activity — files modified per week
        </div>
        <div className="text-[10px] text-[var(--text-muted)]">last 24 weeks</div>
      </div>
      <div className="flex h-24 items-end gap-1">
        {buckets.map((v, i) => {
          const h = (v / max) * 100;
          const recency = i / buckets.length;
          return (
            <motion.div
              key={i}
              initial={{ height: 0 }}
              animate={{ height: `${Math.max(2, h)}%` }}
              transition={{ delay: i * 0.015, duration: 0.4 }}
              className="flex-1 rounded-t-sm"
              style={{
                background: `linear-gradient(to top, hsl(${190 + recency * 80} 80% ${40 + recency * 25}%), hsl(${190 + recency * 80} 90% ${60 + recency * 10}%))`,
                boxShadow: v === max ? `0 0 8px hsl(${190 + recency * 80} 80% 60%)` : 'none',
              }}
              title={`${v} files`}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Largest files

function LargestFiles({ files }: { files: GraphNode[] }) {
  const max = Math.max(1, ...files.map((f) => f.loc || 0));
  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--text-muted)]">
        <FileCode className="h-3.5 w-3.5" /> Largest files
      </div>
      {files.length === 0 ? (
        <div className="text-xs text-[var(--text-muted)]">No files yet.</div>
      ) : (
        <ul className="space-y-1.5">
          {files.map((f, i) => {
            const pct = ((f.loc || 0) / max) * 100;
            const color = colorForLang(f.language || 'Other');
            return (
              <motion.li
                key={f.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="font-mono text-[var(--text-muted)] w-4">{i + 1}</span>
                  <span className="truncate font-mono text-[var(--text-secondary)] flex-1">{f.path}</span>
                  <span className="font-mono text-[var(--text-primary)]">{shortNumber(f.loc || 0)}</span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--surface-3)]">
                  <motion.div
                    className="h-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ delay: i * 0.05, duration: 0.7 }}
                    style={{ background: color }}
                  />
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LoC histogram

function LocHistogram({ buckets }: { buckets: { label: string; count: number }[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--text-muted)]">
        <TrendingUp className="h-3.5 w-3.5" /> File size distribution
      </div>
      <div className="flex h-44 items-end gap-2">
        {buckets.map((b, i) => {
          const h = (b.count / max) * 100;
          const hue = 200 + i * 20;
          return (
            <div key={b.label} className="flex flex-1 flex-col items-center gap-2">
              <div className="text-[10px] font-mono text-[var(--text-primary)]">{b.count}</div>
              <div className="relative flex w-full flex-1 items-end">
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max(3, h)}%` }}
                  transition={{ delay: i * 0.05, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  className="w-full rounded-t-md"
                  style={{
                    background: `linear-gradient(to top, hsl(${hue} 70% 35%), hsl(${hue} 80% 60%))`,
                    boxShadow: `0 0 14px -6px hsl(${hue} 80% 60%)`,
                  }}
                />
              </div>
              <div className="text-[10px] text-[var(--text-muted)]">{b.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Folder treemap

function FolderTreemap({ folders }: { folders: { name: string; files: number; loc: number }[] }) {
  // Sliced layout
  const W = 600, H = 220;
  const total = folders.reduce((s, f) => s + f.loc, 0) || 1;
  const cols: { f: any; x: number; y: number; w: number; h: number }[] = [];
  let x = 0;
  let row: { f: any; share: number }[] = [];
  let rowShare = 0;
  const colWidth = W / Math.ceil(Math.sqrt(folders.length));
  folders.forEach((f, i) => {
    const share = f.loc / total;
    row.push({ f, share });
    rowShare += share;
    if (rowShare >= 1 / Math.ceil(Math.sqrt(folders.length)) || i === folders.length - 1) {
      const yShares = row.map((r) => r.share / rowShare);
      let y = 0;
      row.forEach((r, j) => {
        const h = yShares[j] * H;
        cols.push({ f: r.f, x, y, w: colWidth, h });
        y += h;
      });
      x += colWidth;
      row = [];
      rowShare = 0;
    }
  });

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--text-muted)]">
        <Folder className="h-3.5 w-3.5" /> Folder breakdown by LoC
      </div>
      {folders.length === 0 ? (
        <div className="text-xs text-[var(--text-muted)]">No folder data.</div>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
          {cols.map((c, i) => {
            const hue = (i * 47) % 360;
            const small = c.w < 90 || c.h < 30;
            return (
              <g key={c.f.name}>
                <motion.rect
                  x={c.x + 2}
                  y={c.y + 2}
                  width={Math.max(0, c.w - 4)}
                  height={Math.max(0, c.h - 4)}
                  rx={8}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.04, duration: 0.4 }}
                  fill={`hsl(${hue} 70% 50%)`}
                  fillOpacity={0.18}
                  stroke={`hsl(${hue} 80% 60%)`}
                  strokeOpacity={0.7}
                  strokeWidth={1.2}
                  style={{ filter: `drop-shadow(0 0 12px hsl(${hue} 80% 60% / 0.2))` }}
                />
                {!small && (
                  <>
                    <text x={c.x + 12} y={c.y + 22} fontSize="13" fontWeight="700" fill="white" fillOpacity={0.95}>
                      {c.f.name}
                    </text>
                    <text x={c.x + 12} y={c.y + 38} fontSize="10" fill="white" fillOpacity={0.6}>
                      {shortNumber(c.f.loc)} LoC · {c.f.files} files
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Complexity split

function ComplexitySplit({ buckets }: { buckets: { low: number; mid: number; high: number } }) {
  const total = buckets.low + buckets.mid + buckets.high || 1;
  const items = [
    { label: 'Simple', value: buckets.low, color: 'hsl(var(--success))', desc: '≤ 2' },
    { label: 'Moderate', value: buckets.mid, color: 'hsl(var(--warning))', desc: '3-5' },
    { label: 'Complex', value: buckets.high, color: 'hsl(var(--danger))', desc: '> 5' },
  ];
  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--text-muted)]">
        <Cpu className="h-3.5 w-3.5" /> Complexity split
      </div>
      <div className="flex h-3 overflow-hidden rounded-full bg-[var(--surface-3)]">
        {items.map((it, i) => (
          <motion.div
            key={it.label}
            initial={{ width: 0 }}
            animate={{ width: `${(it.value / total) * 100}%` }}
            transition={{ delay: i * 0.1, duration: 0.7 }}
            style={{ background: it.color }}
            title={`${it.label}: ${it.value}`}
          />
        ))}
      </div>
      <ul className="mt-3 space-y-2 text-xs">
        {items.map((it) => (
          <li key={it.label} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: it.color, boxShadow: `0 0 6px ${it.color}` }} />
            <span className="text-[var(--text-secondary)]">{it.label}</span>
            <span className="text-[var(--text-muted)]">({it.desc})</span>
            <span className="ml-auto font-mono text-[var(--text-primary)]">{it.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Recency timeline

function RecencyDistribution({ buckets, total }: { buckets: { d7: number; d30: number; d90: number; older: number }; total: number }) {
  const items = [
    { label: 'Last week', value: buckets.d7, color: 'hsl(var(--success))' },
    { label: 'Last 30 days', value: buckets.d30, color: 'hsl(var(--accent-cyan))' },
    { label: 'Last 90 days', value: buckets.d90, color: 'hsl(var(--accent-violet))' },
    { label: 'Older', value: buckets.older, color: 'hsl(var(--text-muted))' },
  ];
  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--text-muted)]">
        <Calendar className="h-3.5 w-3.5" /> Recency — when files were last touched
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {items.map((it, i) => (
          <motion.div
            key={it.label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="rounded-xl border border-[var(--hairline)] bg-[var(--surface-2)] p-3"
          >
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{it.label}</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <div className="text-2xl font-bold" style={{ color: it.color }}>{it.value}</div>
              <div className="text-[10px] text-[var(--text-muted)]">
                {total ? `${Math.round((it.value / total) * 100)}%` : '0%'}
              </div>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--surface-3)]">
              <motion.div
                className="h-full"
                initial={{ width: 0 }}
                animate={{ width: total ? `${(it.value / total) * 100}%` : '0%' }}
                transition={{ delay: i * 0.08, duration: 0.6 }}
                style={{ background: it.color, boxShadow: `0 0 8px ${it.color}` }}
              />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
