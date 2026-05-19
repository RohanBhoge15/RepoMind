/**
 * Diff banner — shows files added / removed / changed since the previous
 * indexing run. Snapshot is kept in localStorage keyed by repo id.
 *
 * "Changed" is approximated by last_modified shift, since we don't have a
 * file-content hash. This is intentionally cheap and best-effort.
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GitCommit, FilePlus2, FileX2, FileCog, ChevronDown, ChevronUp, X } from 'lucide-react';
import type { GraphNode } from '@/lib/types';

interface FileEntry {
  path: string;
  last_modified?: string;
}

interface Snapshot {
  indexed_at?: string;
  files: FileEntry[];
}

interface Props {
  repoId: number;
  nodes: GraphNode[];
  indexedAt?: string | null;
}

export default function IndexDiffBanner({ repoId, nodes, indexedAt }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const currentFiles = useMemo<FileEntry[]>(
    () =>
      nodes
        .filter((n) => n.path)
        .map((n) => ({ path: n.path, last_modified: n.last_modified })),
    [nodes],
  );

  const key = `index_snapshot_${repoId}`;
  const previous = useMemo<Snapshot | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as Snapshot) : null;
    } catch {
      return null;
    }
  }, [key, indexedAt]);

  // Compute diff against snapshot
  const diff = useMemo(() => {
    if (!previous) return null;
    if (previous.indexed_at === indexedAt) return null; // same run, nothing to compare
    const prevByPath = new Map(previous.files.map((f) => [f.path, f]));
    const currByPath = new Map(currentFiles.map((f) => [f.path, f]));
    const added: FileEntry[] = [];
    const removed: FileEntry[] = [];
    const changed: FileEntry[] = [];
    currentFiles.forEach((f) => {
      const p = prevByPath.get(f.path);
      if (!p) added.push(f);
      else if (p.last_modified && f.last_modified && p.last_modified !== f.last_modified) changed.push(f);
    });
    previous.files.forEach((f) => {
      if (!currByPath.has(f.path)) removed.push(f);
    });
    return { added, removed, changed };
  }, [previous, currentFiles, indexedAt]);

  // Persist the new snapshot whenever indexedAt changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!indexedAt || currentFiles.length === 0) return;
    try {
      localStorage.setItem(key, JSON.stringify({ indexed_at: indexedAt, files: currentFiles }));
    } catch {}
  }, [indexedAt, currentFiles, key]);

  if (dismissed) return null;
  if (!diff) return null;
  const total = diff.added.length + diff.removed.length + diff.changed.length;
  if (total === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border bg-[hsl(var(--surface-1)/0.7)] overflow-hidden mb-6"
      style={{
        borderColor: 'hsl(var(--accent-violet) / 0.4)',
        boxShadow: '0 8px 24px -8px hsl(var(--accent-violet) / 0.3)',
      }}
    >
      <div className="flex items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: 'hsl(var(--accent-violet) / 0.15)',
              color: 'hsl(var(--accent-violet))',
              border: '1px solid hsl(var(--accent-violet) / 0.4)',
            }}
          >
            <GitCommit className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="mono text-[10px] uppercase tracking-widest text-[hsl(var(--accent-violet))]">
              Since last index
            </div>
            <div className="text-sm font-semibold text-[hsl(var(--text-primary))] truncate">
              {total} file{total === 1 ? '' : 's'} changed
            </div>
          </div>
          <div className="flex items-center gap-3 ml-2">
            <Stat icon={FilePlus2} label="added" value={diff.added.length} accent="success" />
            <Stat icon={FileCog} label="changed" value={diff.changed.length} accent="accent-cyan" />
            <Stat icon={FileX2} label="removed" value={diff.removed.length} accent="danger" />
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setExpanded((e) => !e)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--surface-2))]"
            aria-label={expanded ? 'Collapse diff' : 'Expand diff'}
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {expanded ? 'Hide' : 'Show files'}
          </button>
          <button
            onClick={() => setDismissed(true)}
            aria-label="Dismiss diff banner"
            className="p-1 rounded-md text-[hsl(var(--text-muted))] hover:text-[hsl(var(--text-primary))] hover:bg-[hsl(var(--surface-2))]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="border-t border-[hsl(var(--hairline))]"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-0 divide-x divide-[hsl(var(--hairline))]">
              <DiffList
                icon={FilePlus2}
                title="Added"
                accent="success"
                files={diff.added}
              />
              <DiffList
                icon={FileCog}
                title="Changed"
                accent="accent-cyan"
                files={diff.changed}
              />
              <DiffList
                icon={FileX2}
                title="Removed"
                accent="danger"
                files={diff.removed}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Stat({ icon: Icon, label, value, accent }: { icon: typeof FilePlus2; label: string; value: number; accent: string }) {
  return (
    <div className="hidden sm:flex items-center gap-1.5">
      <Icon className="w-3 h-3" style={{ color: `hsl(var(--${accent}))` }} />
      <span className="mono text-[11px] tabular-nums" style={{ color: `hsl(var(--${accent}))` }}>
        {value}
      </span>
      <span className="mono text-[10px] uppercase tracking-widest text-[hsl(var(--text-muted))]">
        {label}
      </span>
    </div>
  );
}

function DiffList({
  icon: Icon,
  title,
  accent,
  files,
}: {
  icon: typeof FilePlus2;
  title: string;
  accent: string;
  files: FileEntry[];
}) {
  return (
    <div className="p-3">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5" style={{ color: `hsl(var(--${accent}))` }} />
        <span className="mono text-[10px] uppercase tracking-widest" style={{ color: `hsl(var(--${accent}))` }}>
          {title} · {files.length}
        </span>
      </div>
      {files.length === 0 ? (
        <p className="text-[11px] text-[hsl(var(--text-muted))]">— none —</p>
      ) : (
        <ul className="space-y-0.5 max-h-40 overflow-y-auto pr-1">
          {files.slice(0, 30).map((f) => (
            <li
              key={f.path}
              className="mono text-[11px] text-[hsl(var(--text-secondary))] truncate"
              title={f.path}
            >
              {f.path}
            </li>
          ))}
          {files.length > 30 && (
            <li className="mono text-[10px] text-[hsl(var(--text-muted))] pt-1">
              … and {files.length - 30} more
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
