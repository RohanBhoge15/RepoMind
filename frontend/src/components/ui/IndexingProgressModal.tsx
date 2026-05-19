/**
 * Indexing Progress Modal — Mission-control style live pipeline.
 * Five-stage pipeline strip, radial progress, live file feed with synthetic
 * code preview that visibly chunks and emits embedding vectors.
 */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  CheckCircle2,
  AlertCircle,
  GitBranch,
  Scissors,
  Zap,
  FileText,
  FileCode,
  Activity,
  Cpu,
  Database,
  Sparkles,
  Hash,
} from 'lucide-react';
import { apiClient } from '@/lib/api';

export interface IndexingProgress {
  status: 'pending' | 'cloning' | 'analyzing' | 'chunking' | 'embedding' | 'generating_docs' | 'completed' | 'failed';
  progress: number;
  message?: string;
  current_file?: string;
  total_files?: number;
  processed_files?: number;
  current_step?: string;
  error?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  repositoryName: string;
  repositoryId: number;
  onComplete?: () => void;
}

type StageKey = 'cloning' | 'analyzing' | 'chunking' | 'embedding' | 'generating_docs';

const STAGES: Array<{
  key: StageKey;
  label: string;
  sub: string;
  icon: typeof GitBranch;
  accent: string;
}> = [
  { key: 'cloning', label: 'Clone', sub: 'Pulling source from origin', icon: GitBranch, accent: 'cyan' },
  { key: 'analyzing', label: 'Parse', sub: 'Reading file tree', icon: FileCode, accent: 'blue' },
  { key: 'chunking', label: 'Chunk', sub: 'Slicing into token windows', icon: Scissors, accent: 'violet' },
  { key: 'embedding', label: 'Embed', sub: 'Encoding semantic vectors', icon: Zap, accent: 'pink' },
  { key: 'generating_docs', label: 'Docs', sub: 'Drafting documentation', icon: FileText, accent: 'cyan' },
];

const STAGE_INDEX: Record<StageKey, number> = {
  cloning: 0,
  analyzing: 1,
  chunking: 2,
  embedding: 3,
  generating_docs: 4,
};

// Lightweight per-language preview generator — purely cosmetic stand-in for
// real file contents so the live feed looks like real code without a backend
// round-trip per file.
const LANG_BY_EXT: Record<string, { lang: string; tokens: string[] }> = {
  ts: { lang: 'TypeScript', tokens: ['export', 'const', 'function', 'await', 'async', 'return', 'interface', 'type'] },
  tsx: { lang: 'TSX', tokens: ['export', 'function', 'return', 'const', '<div>', 'useState', 'useEffect'] },
  js: { lang: 'JavaScript', tokens: ['const', 'function', 'return', 'await', 'module.exports', 'require'] },
  jsx: { lang: 'JSX', tokens: ['function', 'return', 'const', '<div>', 'useState'] },
  py: { lang: 'Python', tokens: ['def', 'class', 'import', 'return', 'async', 'await', 'self'] },
  rs: { lang: 'Rust', tokens: ['pub', 'fn', 'let', 'mut', 'impl', 'struct', 'match'] },
  go: { lang: 'Go', tokens: ['func', 'package', 'import', 'return', 'var', 'struct'] },
  java: { lang: 'Java', tokens: ['public', 'class', 'private', 'void', 'return', 'static'] },
  cpp: { lang: 'C++', tokens: ['#include', 'class', 'void', 'return', 'auto', 'const'] },
  c: { lang: 'C', tokens: ['#include', 'int', 'void', 'return', 'static', 'const'] },
  rb: { lang: 'Ruby', tokens: ['def', 'end', 'class', 'require', 'return'] },
  md: { lang: 'Markdown', tokens: ['#', '##', '-', '```', '**'] },
  json: { lang: 'JSON', tokens: ['{', '}', '"key"', ':', '[', ']'] },
  yml: { lang: 'YAML', tokens: ['name:', 'on:', 'jobs:', 'steps:', '-'] },
  yaml: { lang: 'YAML', tokens: ['name:', 'on:', 'jobs:', 'steps:', '-'] },
  html: { lang: 'HTML', tokens: ['<div>', '<span>', '</div>', 'class=', 'id='] },
  css: { lang: 'CSS', tokens: ['.class', '#id', 'color:', 'display:', 'flex'] },
};

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h >>> 0;
}

function seeded(seed: number) {
  let s = seed || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

function detectLang(path: string) {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  return LANG_BY_EXT[ext] || { lang: 'Text', tokens: ['const', 'let', 'function', 'return'] };
}

function makePreview(path: string): { lines: string[]; lang: string } {
  const meta = detectLang(path);
  const rand = seeded(hashStr(path));
  const lineCount = 12 + Math.floor(rand() * 6);
  const indentPool = ['', '  ', '    ', '      ', '  '];
  const lines: string[] = [];
  for (let i = 0; i < lineCount; i++) {
    const indent = indentPool[Math.floor(rand() * indentPool.length)];
    const wordCount = 2 + Math.floor(rand() * 5);
    const words: string[] = [];
    for (let w = 0; w < wordCount; w++) {
      words.push(meta.tokens[Math.floor(rand() * meta.tokens.length)]);
    }
    lines.push(indent + words.join(' '));
  }
  return { lines, lang: meta.lang };
}

function shortPath(p?: string) {
  if (!p) return '';
  const parts = p.split('/');
  if (parts.length <= 2) return p;
  return `…/${parts.slice(-2).join('/')}`;
}

function stageLabel(s: string) {
  return STAGES.find((x) => x.key === s)?.label ?? s;
}

// ─── Subcomponents ────────────────────────────────────────────────────────

function PipelineStrip({ activeIdx, terminal }: { activeIdx: number; terminal: 'completed' | 'failed' | null }) {
  return (
    <div className="relative px-6 py-5 border-b border-[hsl(var(--hairline))]">
      <div className="flex items-center justify-between gap-2">
        {STAGES.map((stage, i) => {
          const Icon = stage.icon;
          const isPast = i < activeIdx || terminal === 'completed';
          const isActive = i === activeIdx && !terminal;
          const isFuture = i > activeIdx && !terminal;
          return (
            <div key={stage.key} className="flex items-center gap-2 flex-1">
              <div className="flex flex-col items-center gap-1.5 flex-1">
                <div className="relative">
                  {isActive && (
                    <motion.div
                      className="absolute inset-0 rounded-full"
                      style={{ boxShadow: `0 0 24px hsl(var(--accent-${stage.accent}) / 0.6)` }}
                      animate={{ opacity: [0.6, 1, 0.6], scale: [1, 1.15, 1] }}
                      transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  )}
                  <div
                    className="relative w-10 h-10 rounded-full flex items-center justify-center border transition-all"
                    style={{
                      background: isActive
                        ? `linear-gradient(135deg, hsl(var(--accent-${stage.accent}) / 0.25), hsl(var(--accent-${stage.accent}) / 0.08))`
                        : isPast
                        ? `hsl(var(--accent-${stage.accent}) / 0.12)`
                        : 'hsl(var(--surface-2))',
                      borderColor: isActive || isPast ? `hsl(var(--accent-${stage.accent}) / 0.6)` : 'hsl(var(--hairline))',
                      color: isActive || isPast ? `hsl(var(--accent-${stage.accent}))` : 'hsl(var(--text-muted))',
                    }}
                  >
                    {isPast && terminal !== 'failed' ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <Icon className={`w-4 h-4 ${isActive ? 'animate-pulse' : ''}`} />
                    )}
                  </div>
                </div>
                <div className="text-center">
                  <div
                    className="mono text-[10px] uppercase tracking-widest font-semibold"
                    style={{ color: isActive || isPast ? `hsl(var(--accent-${stage.accent}))` : 'hsl(var(--text-muted))' }}
                  >
                    {stage.label}
                  </div>
                  <div
                    className="text-[10px] mt-0.5 max-w-[100px] leading-tight"
                    style={{ color: isFuture ? 'hsl(var(--text-muted))' : 'hsl(var(--text-secondary))' }}
                  >
                    {stage.sub}
                  </div>
                </div>
              </div>
              {i < STAGES.length - 1 && (
                <div className="flex-1 h-px relative -mt-7 mx-1">
                  <div className="absolute inset-0 bg-[hsl(var(--hairline))]" />
                  <motion.div
                    className="absolute inset-y-0 left-0"
                    style={{
                      background: `linear-gradient(90deg, hsl(var(--accent-${stage.accent})), hsl(var(--accent-${STAGES[i + 1].accent})))`,
                    }}
                    initial={{ width: '0%' }}
                    animate={{ width: i < activeIdx || terminal === 'completed' ? '100%' : i === activeIdx ? '50%' : '0%' }}
                    transition={{ duration: 0.8, ease: 'easeInOut' }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RadialProgress({ value, status }: { value: number; status: IndexingProgress['status'] }) {
  const size = 168;
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(100, Math.max(0, value)) / 100);

  const accentByStatus: Record<string, string> = {
    cloning: 'cyan',
    indexing: 'blue',
    chunking: 'violet',
    embedding: 'pink',
    generating_docs: 'cyan',
    completed: 'cyan',
    failed: 'pink',
  };
  const accent = accentByStatus[status] || 'cyan';

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="radialGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={`hsl(var(--accent-${accent}))`} />
            <stop offset="100%" stopColor="hsl(var(--accent-violet))" />
          </linearGradient>
          <filter id="radialGlow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="hsl(var(--surface-3))" strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#radialGrad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          filter="url(#radialGlow)"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.div
          key={Math.round(value)}
          initial={{ opacity: 0.4, y: -2 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl font-bold tabular-nums text-[hsl(var(--text-primary))] tracking-tight"
        >
          {Math.round(value)}
          <span className="text-xl text-[hsl(var(--text-muted))]">%</span>
        </motion.div>
        <div className="mono text-[10px] uppercase tracking-widest text-[hsl(var(--text-muted))] mt-1">
          {status === 'failed' ? 'Failed' : status === 'completed' ? 'Complete' : 'Processing'}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, sub, accent = 'cyan' }: { icon: typeof Cpu; label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div
      className="relative overflow-hidden rounded-xl border bg-[hsl(var(--surface-1)/0.6)] p-3"
      style={{ borderColor: 'hsl(var(--hairline))' }}
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-3.5 h-3.5" style={{ color: `hsl(var(--accent-${accent}))` }} />
        <div className="mono text-[9px] uppercase tracking-widest text-[hsl(var(--text-muted))]">{label}</div>
      </div>
      <div className="text-xl font-bold tabular-nums text-[hsl(var(--text-primary))] leading-none">{value}</div>
      {sub && <div className="text-[10px] text-[hsl(var(--text-muted))] mt-1">{sub}</div>}
      <div
        className="absolute top-0 right-0 w-12 h-12 rounded-full -mr-6 -mt-6 blur-2xl"
        style={{ background: `hsl(var(--accent-${accent}) / 0.18)` }}
      />
    </div>
  );
}

function ChunkBar({ chunkCount, activeChunk }: { chunkCount: number; activeChunk: number }) {
  return (
    <div className="flex gap-0.5 mt-2">
      {Array.from({ length: chunkCount }).map((_, i) => (
        <motion.div
          key={i}
          className="h-1.5 flex-1 rounded-full"
          initial={{ opacity: 0.2, scaleY: 0.5 }}
          animate={{
            opacity: i <= activeChunk ? 1 : 0.2,
            scaleY: i === activeChunk ? 1.4 : 1,
            background:
              i <= activeChunk
                ? `linear-gradient(90deg, hsl(var(--accent-violet)), hsl(var(--accent-pink)))`
                : 'hsl(var(--surface-3))',
          }}
          transition={{ duration: 0.3 }}
        />
      ))}
    </div>
  );
}

function EmbeddingGrid({ active }: { active: boolean }) {
  const dots = 8 * 16;
  return (
    <div className="grid grid-cols-16 gap-[2px] mt-2" style={{ gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }}>
      {Array.from({ length: dots }).map((_, i) => (
        <motion.div
          key={i}
          className="aspect-square rounded-[1px]"
          initial={{ opacity: 0.2 }}
          animate={{
            opacity: active ? [0.2, 0.9, 0.4] : 0.2,
            background: active ? `hsl(${(i * 7) % 360 + 180} 80% 60%)` : 'hsl(var(--surface-3))',
          }}
          transition={{ duration: 1.6, delay: (i % 16) * 0.04, repeat: active ? Infinity : 0, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

function LiveFileCard({ path, status }: { path: string; status: IndexingProgress['status'] }) {
  const { lines, lang } = useMemo(() => makePreview(path), [path]);
  const chunkCount = Math.max(3, Math.min(8, Math.ceil(lines.length / 3)));
  const chunkSize = Math.ceil(lines.length / chunkCount);

  const [activeChunk, setActiveChunk] = useState(0);

  useEffect(() => {
    if (status !== 'chunking' && status !== 'embedding') {
      setActiveChunk(chunkCount - 1);
      return;
    }
    setActiveChunk(0);
    const id = setInterval(() => {
      setActiveChunk((c) => (c + 1) % chunkCount);
    }, 380);
    return () => clearInterval(id);
  }, [path, status, chunkCount]);

  return (
    <motion.div
      key={path}
      initial={{ opacity: 0, x: 24, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -24, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 360, damping: 28 }}
      className="rounded-xl border bg-[hsl(var(--surface-1)/0.7)] overflow-hidden"
      style={{ borderColor: 'hsl(var(--hairline))' }}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-[hsl(var(--hairline))] bg-[hsl(var(--surface-2)/0.5)]">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex gap-1">
            <div className="w-2.5 h-2.5 rounded-full bg-[hsl(var(--danger)/0.6)]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[hsl(var(--warning)/0.6)]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[hsl(var(--success)/0.6)]" />
          </div>
          <FileCode className="w-3.5 h-3.5 text-[hsl(var(--accent-cyan))] flex-shrink-0 ml-1" />
          <span className="mono text-[11px] text-[hsl(var(--text-primary))] truncate">{path}</span>
        </div>
        <span className="mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded bg-[hsl(var(--accent-violet)/0.15)] text-[hsl(var(--accent-violet))] flex-shrink-0">
          {lang}
        </span>
      </div>

      <div className="p-3 font-mono text-[11px] leading-[1.55] relative">
        {lines.map((line, i) => {
          const chunkIdx = Math.floor(i / chunkSize);
          const isActiveChunk = chunkIdx === activeChunk && (status === 'chunking' || status === 'embedding');
          const isFirstOfChunk = i % chunkSize === 0 && i > 0;
          return (
            <div key={i} className="relative">
              {isFirstOfChunk && (
                <motion.div
                  initial={{ scaleX: 0, opacity: 0 }}
                  animate={{ scaleX: 1, opacity: 1 }}
                  transition={{ duration: 0.4, delay: chunkIdx * 0.05 }}
                  className="my-1 h-px relative origin-left"
                  style={{
                    background: `linear-gradient(90deg, transparent, hsl(var(--accent-violet) / 0.6), transparent)`,
                  }}
                >
                  <span
                    className="absolute -top-[7px] left-2 mono text-[8px] uppercase tracking-widest px-1 rounded"
                    style={{ background: 'hsl(var(--surface-1))', color: 'hsl(var(--accent-violet))' }}
                  >
                    chunk {chunkIdx}
                  </span>
                </motion.div>
              )}
              <motion.div
                animate={{
                  opacity: isActiveChunk ? 1 : 0.55,
                  x: isActiveChunk ? 2 : 0,
                  color: isActiveChunk ? 'hsl(var(--accent-pink))' : 'hsl(var(--text-secondary))',
                }}
                transition={{ duration: 0.3 }}
                className="whitespace-pre"
              >
                <span className="mr-2 text-[hsl(var(--text-muted))] select-none">{String(i + 1).padStart(2, ' ')}</span>
                {line}
              </motion.div>
            </div>
          );
        })}

        <ChunkBar chunkCount={chunkCount} activeChunk={activeChunk} />
        {status === 'embedding' && (
          <div className="mt-3 pt-2 border-t border-[hsl(var(--hairline))]">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-3 h-3 text-[hsl(var(--accent-pink))]" />
              <span className="mono text-[9px] uppercase tracking-widest text-[hsl(var(--text-muted))]">
                Vector → Qdrant
              </span>
            </div>
            <EmbeddingGrid active />
          </div>
        )}
      </div>
    </motion.div>
  );
}

function FileStream({ recent }: { recent: string[] }) {
  return (
    <div className="rounded-xl border bg-[hsl(var(--surface-1)/0.5)] overflow-hidden" style={{ borderColor: 'hsl(var(--hairline))' }}>
      <div className="px-3 py-2 border-b border-[hsl(var(--hairline))] flex items-center gap-2">
        <Activity className="w-3 h-3 text-[hsl(var(--accent-cyan))]" />
        <span className="mono text-[9px] uppercase tracking-widest text-[hsl(var(--text-muted))]">Stream</span>
      </div>
      <div className="p-2 space-y-1 max-h-[260px] overflow-hidden">
        <AnimatePresence initial={false}>
          {recent.slice(0, 10).map((p, i) => (
            <motion.div
              key={p + i}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1 - i * 0.08, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="flex items-center gap-2 mono text-[10px] truncate"
              style={{ color: i === 0 ? 'hsl(var(--accent-cyan))' : 'hsl(var(--text-secondary))' }}
            >
              <Hash className="w-2.5 h-2.5 flex-shrink-0" />
              <span className="truncate">{shortPath(p)}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────

export default function IndexingProgressModal({
  isOpen,
  onClose,
  repositoryName,
  repositoryId,
  onComplete,
}: Props) {
  const [progress, setProgress] = useState<IndexingProgress>({
    status: 'cloning',
    progress: 0,
    message: 'Initializing pipeline…',
  });
  const [recentFiles, setRecentFiles] = useState<string[]>([]);
  const [completeCalled, setCompleteCalled] = useState(false);
  const startedAt = useRef<number>(Date.now());
  const [tick, setTick] = useState(0); // forces elapsed re-render

  useEffect(() => {
    if (!isOpen) return;
    startedAt.current = Date.now();
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let pollInterval: ReturnType<typeof setInterval>;
    let errorCount = 0;
    let isMounted = true;
    const seenFiles = new Set<string>();

    const pollProgress = async () => {
      if (!isMounted) return;
      try {
        const data = await apiClient.getIndexingStatus(repositoryId);
        errorCount = 0;
        if (!isMounted) return;

        setProgress({
          status: data.status,
          progress: data.progress || 0,
          message: data.message,
          current_file: data.current_file,
          total_files: data.total_files,
          processed_files: data.processed_files,
          current_step: data.current_step,
          error: data.error,
        });

        if (data.current_file && !seenFiles.has(data.current_file)) {
          seenFiles.add(data.current_file);
          setRecentFiles((prev) => [data.current_file!, ...prev].slice(0, 20));
        }

        if (data.status === 'completed' || data.status === 'failed') {
          clearInterval(pollInterval);
          if (data.status === 'completed' && onComplete && !completeCalled) {
            setCompleteCalled(true);
            setTimeout(() => isMounted && onComplete(), 1800);
          }
        }
      } catch (e) {
        errorCount++;
        if (errorCount >= 3 && isMounted) {
          clearInterval(pollInterval);
          setProgress((p) => ({ ...p, status: 'failed', error: 'Lost connection to backend.' }));
        }
      }
    };

    pollProgress();
    pollInterval = setInterval(pollProgress, 800);
    return () => {
      isMounted = false;
      clearInterval(pollInterval);
    };
  }, [isOpen, repositoryId]);

  const activeIdx = useMemo(() => {
    if (progress.status === 'completed') return STAGES.length;
    if (progress.status === 'failed') return -1;
    return STAGE_INDEX[progress.status as StageKey] ?? 0;
  }, [progress.status]);

  const terminal = progress.status === 'completed' ? 'completed' : progress.status === 'failed' ? 'failed' : null;

  const elapsed = Math.max(0, Math.floor((Date.now() - startedAt.current) / 1000));
  const elapsedStr = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;

  const throughput = progress.processed_files && elapsed > 0 ? (progress.processed_files / elapsed).toFixed(1) : '0.0';
  const eta =
    progress.total_files && progress.processed_files && progress.processed_files > 0
      ? Math.max(0, Math.round(((progress.total_files - progress.processed_files) * elapsed) / progress.processed_files))
      : null;
  const etaStr = eta != null ? `${Math.floor(eta / 60)}:${String(eta % 60).padStart(2, '0')}` : '—:—';

  // estimate chunks/embeddings for cinematic counters (no backend change)
  const estChunks = progress.processed_files ? progress.processed_files * 6 : 0;
  const estEmbeddings = progress.status === 'embedding' || progress.status === 'generating_docs' || progress.status === 'completed' ? estChunks : 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50"
            style={{
              background:
                'radial-gradient(ellipse at center, hsl(var(--accent-violet) / 0.15) 0%, hsl(var(--bg-base) / 0.95) 60%)',
              backdropFilter: 'blur(12px)',
            }}
            onClick={terminal ? onClose : undefined}
          />

          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 20 }}
              transition={{ type: 'spring', stiffness: 280, damping: 28 }}
              className="relative w-full max-w-5xl max-h-[92vh] overflow-hidden pointer-events-auto"
              style={{
                background: 'linear-gradient(180deg, hsl(var(--surface-1) / 0.98), hsl(var(--surface-1) / 0.92))',
                border: '1px solid hsl(var(--hairline))',
                borderRadius: 20,
                boxShadow:
                  '0 30px 80px hsl(0 0% 0% / 0.5), 0 0 0 1px hsl(var(--accent-violet) / 0.15), inset 0 1px 0 hsl(var(--surface-3) / 0.6)',
              }}
            >
              {/* Ambient grid backdrop */}
              <div
                className="absolute inset-0 opacity-30 pointer-events-none"
                style={{
                  backgroundImage:
                    'linear-gradient(to right, hsl(var(--hairline) / 0.3) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--hairline) / 0.3) 1px, transparent 1px)',
                  backgroundSize: '40px 40px',
                  maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
                }}
              />

              {/* Header */}
              <div className="relative px-6 py-4 border-b border-[hsl(var(--hairline))] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center relative overflow-hidden"
                    style={{
                      background: 'linear-gradient(135deg, hsl(var(--accent-cyan) / 0.25), hsl(var(--accent-violet) / 0.25))',
                      border: '1px solid hsl(var(--accent-violet) / 0.4)',
                    }}
                  >
                    <Cpu className="w-4 h-4 text-[hsl(var(--accent-cyan))]" />
                    <motion.div
                      className="absolute inset-0"
                      style={{ background: 'linear-gradient(120deg, transparent, hsl(var(--accent-cyan) / 0.3), transparent)' }}
                      animate={{ x: ['-100%', '200%'] }}
                      transition={{ duration: 2.4, repeat: Infinity, ease: 'linear' }}
                    />
                  </div>
                  <div>
                    <div className="mono text-[10px] uppercase tracking-widest text-[hsl(var(--accent-cyan))]">Indexing Pipeline</div>
                    <h2 className="text-base font-semibold text-[hsl(var(--text-primary))] leading-tight">{repositoryName}</h2>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-full border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-2)/0.6)]">
                    <div
                      className={`w-1.5 h-1.5 rounded-full ${terminal === 'failed' ? 'bg-[hsl(var(--danger))]' : 'bg-[hsl(var(--success))]'} ${!terminal ? 'animate-pulse' : ''}`}
                    />
                    <span className="mono text-[10px] uppercase tracking-widest text-[hsl(var(--text-secondary))]">
                      {terminal === 'completed' ? 'Done' : terminal === 'failed' ? 'Error' : 'Live'}
                    </span>
                  </div>
                  {terminal && (
                    <button
                      onClick={onClose}
                      className="p-1.5 rounded-lg hover:bg-[hsl(var(--surface-2))] transition-colors"
                    >
                      <X className="w-4 h-4 text-[hsl(var(--text-secondary))]" />
                    </button>
                  )}
                </div>
              </div>

              <PipelineStrip activeIdx={activeIdx} terminal={terminal} />

              {/* Body */}
              <div className="relative grid grid-cols-1 lg:grid-cols-[280px_1fr_240px] gap-4 p-5 overflow-y-auto" style={{ maxHeight: 'calc(92vh - 220px)' }}>
                {/* Left: radial + metrics */}
                <div className="space-y-3">
                  <div className="rounded-xl border bg-[hsl(var(--surface-1)/0.5)] p-4 flex flex-col items-center" style={{ borderColor: 'hsl(var(--hairline))' }}>
                    <RadialProgress value={progress.progress || 0} status={progress.status} />
                    <div className="mt-3 text-center">
                      <div className="mono text-[10px] uppercase tracking-widest text-[hsl(var(--text-muted))]">Stage</div>
                      <div className="text-sm font-semibold text-[hsl(var(--text-primary))] mt-0.5">
                        {progress.current_step || stageLabel(progress.status)}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <MetricCard icon={FileCode} label="Files" value={`${progress.processed_files ?? 0}/${progress.total_files ?? 0}`} accent="cyan" />
                    <MetricCard icon={Scissors} label="Chunks" value={estChunks.toLocaleString()} accent="violet" />
                    <MetricCard icon={Database} label="Vectors" value={estEmbeddings.toLocaleString()} accent="pink" />
                    <MetricCard icon={Activity} label="files/s" value={throughput} accent="blue" />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <MetricCard icon={Cpu} label="Elapsed" value={elapsedStr} accent="cyan" />
                    <MetricCard icon={Sparkles} label="ETA" value={etaStr} accent="violet" />
                  </div>
                </div>

                {/* Center: live file */}
                <div className="min-w-0 space-y-3">
                  <div className="rounded-xl border bg-[hsl(var(--surface-1)/0.4)] p-3" style={{ borderColor: 'hsl(var(--hairline))' }}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Activity className="w-3.5 h-3.5 text-[hsl(var(--accent-cyan))]" />
                        <span className="mono text-[10px] uppercase tracking-widest text-[hsl(var(--text-muted))]">
                          Now processing
                        </span>
                      </div>
                      {progress.current_file && (
                        <span className="mono text-[10px] text-[hsl(var(--text-secondary))] truncate max-w-[60%]">
                          {shortPath(progress.current_file)}
                        </span>
                      )}
                    </div>

                    <AnimatePresence mode="wait">
                      {progress.current_file ? (
                        <LiveFileCard path={progress.current_file} status={progress.status} />
                      ) : (
                        <motion.div
                          key="idle"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="rounded-xl border border-dashed border-[hsl(var(--hairline))] p-8 text-center"
                        >
                          <div className="mono text-[11px] uppercase tracking-widest text-[hsl(var(--text-muted))]">
                            {progress.status === 'cloning' ? 'Pulling repository…' : 'Awaiting first file…'}
                          </div>
                          <motion.div
                            className="mt-3 mx-auto h-0.5 w-32 rounded-full overflow-hidden"
                            style={{ background: 'hsl(var(--surface-3))' }}
                          >
                            <motion.div
                              className="h-full"
                              style={{
                                background: 'linear-gradient(90deg, transparent, hsl(var(--accent-cyan)), transparent)',
                                width: '40%',
                              }}
                              animate={{ x: ['-100%', '250%'] }}
                              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                            />
                          </motion.div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Message ticker */}
                  <div className="rounded-xl border bg-[hsl(var(--surface-1)/0.4)] px-3 py-2.5 flex items-center gap-2" style={{ borderColor: 'hsl(var(--hairline))' }}>
                    <div className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--accent-cyan))] animate-pulse flex-shrink-0" />
                    <AnimatePresence mode="wait">
                      <motion.span
                        key={progress.message}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.25 }}
                        className="mono text-[11px] text-[hsl(var(--text-secondary))] truncate"
                      >
                        {progress.message || 'Waiting for update…'}
                      </motion.span>
                    </AnimatePresence>
                  </div>

                  {progress.error && (
                    <div className="rounded-xl border border-[hsl(var(--danger)/0.4)] bg-[hsl(var(--danger)/0.08)] p-3 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-[hsl(var(--danger))] flex-shrink-0 mt-0.5" />
                      <span className="text-[12px] text-[hsl(var(--danger))]">{progress.error}</span>
                    </div>
                  )}
                </div>

                {/* Right: file stream */}
                <div>
                  <FileStream recent={recentFiles} />
                </div>
              </div>

              {/* Footer */}
              <div className="relative px-6 py-3 border-t border-[hsl(var(--hairline))] flex items-center justify-between bg-[hsl(var(--surface-2)/0.4)]">
                <div className="flex items-center gap-2">
                  {terminal === 'completed' ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-[hsl(var(--success))]" />
                      <span className="text-[12px] text-[hsl(var(--text-secondary))]">
                        Ready in <span className="mono text-[hsl(var(--text-primary))]">{elapsedStr}</span> ·{' '}
                        <span className="mono text-[hsl(var(--text-primary))]">{progress.total_files ?? 0}</span> files indexed
                      </span>
                    </>
                  ) : terminal === 'failed' ? (
                    <>
                      <AlertCircle className="w-4 h-4 text-[hsl(var(--danger))]" />
                      <span className="text-[12px] text-[hsl(var(--danger))]">Indexing failed — see message above.</span>
                    </>
                  ) : (
                    <span className="text-[12px] text-[hsl(var(--text-muted))]">
                      You can close this and the pipeline keeps running in the background.
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!terminal && (
                    <button
                      onClick={onClose}
                      className="text-[12px] mono uppercase tracking-widest text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--text-primary))] px-3 py-1.5 rounded-lg border border-[hsl(var(--hairline))] hover:border-[hsl(var(--hairline-strong))] transition-colors"
                    >
                      Run in background
                    </button>
                  )}
                  {terminal && (
                    <button
                      onClick={onClose}
                      className="text-[12px] mono uppercase tracking-widest px-3 py-1.5 rounded-lg"
                      style={{
                        background:
                          terminal === 'completed'
                            ? 'linear-gradient(135deg, hsl(var(--accent-cyan) / 0.2), hsl(var(--accent-violet) / 0.2))'
                            : 'hsl(var(--surface-2))',
                        border: `1px solid ${terminal === 'completed' ? 'hsl(var(--accent-cyan) / 0.5)' : 'hsl(var(--hairline))'}`,
                        color: terminal === 'completed' ? 'hsl(var(--accent-cyan))' : 'hsl(var(--text-primary))',
                      }}
                    >
                      {terminal === 'completed' ? 'Enter repo' : 'Close'}
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
