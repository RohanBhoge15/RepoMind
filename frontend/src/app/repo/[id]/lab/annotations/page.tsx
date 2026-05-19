'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { StickyNote, Plus, Trash2, Tag, Search, Filter } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { DependencyGraph } from '@/lib/types';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import LabShell from '../_components/LabShell';

interface Annotation {
  id: string;
  filePath: string;
  body: string;
  tags: string[];
  createdAt: string;
}

const STORAGE_KEY = (repoId: number) => `repomind:annotations:${repoId}`;

const TAG_OPTIONS = ['gotcha', 'decision', 'todo', 'wip', 'question', 'context'];

const TAG_COLOR: Record<string, string> = {
  gotcha: '#f43f5e',
  decision: '#c084fc',
  todo: '#fbbf24',
  wip: '#7dd3fc',
  question: '#60a5fa',
  context: '#34d399',
};

export default function AnnotationsPage() {
  const params = useParams();
  const repoId = parseInt(params.id as string, 10);
  const [graph, setGraph] = useState<DependencyGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [activeFile, setActiveFile] = useState<string>('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  useEffect(() => {
    apiClient.getDependencyGraph(repoId).then((g) => {
      setGraph(g);
      setLoading(false);
    }).catch(() => setLoading(false));
    try {
      const raw = localStorage.getItem(STORAGE_KEY(repoId));
      if (raw) setAnnotations(JSON.parse(raw));
    } catch {}
  }, [repoId]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY(repoId), JSON.stringify(annotations));
    } catch {}
  }, [annotations, repoId]);

  const fileSuggestions = useMemo(() => {
    if (!graph || !activeFile.trim()) return [];
    const q = activeFile.toLowerCase();
    return graph.nodes.filter((n) => n.path.toLowerCase().includes(q)).slice(0, 5);
  }, [activeFile, graph]);

  const addAnnotation = () => {
    if (!activeFile.trim() || !body.trim()) return;
    setAnnotations((prev) => [
      {
        id: `${Date.now()}`,
        filePath: activeFile.trim(),
        body: body.trim(),
        tags: [...tags],
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);
    setBody('');
    setTags([]);
  };

  const remove = (id: string) => setAnnotations((prev) => prev.filter((a) => a.id !== id));
  const toggleTag = (t: string) => setTags((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);

  const filtered = useMemo(() => {
    return annotations.filter((a) => {
      if (tagFilter && !a.tags.includes(tagFilter)) return false;
      if (query && !(a.filePath.toLowerCase().includes(query.toLowerCase()) || a.body.toLowerCase().includes(query.toLowerCase()))) return false;
      return true;
    });
  }, [annotations, query, tagFilter]);

  return (
    <LabShell
      title="Annotations"
      subtitle="Pin notes, decisions, and gotchas onto files. They persist in your browser."
      icon={<StickyNote className="h-5 w-5 text-[hsl(var(--accent-violet))]" />}
      accent="hsl(var(--accent-violet))"
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.5fr]">
        <Card padding="lg">
          <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--text-muted)]">
            <Plus className="h-3.5 w-3.5" /> New annotation
          </div>
          <input
            value={activeFile}
            onChange={(e) => setActiveFile(e.target.value)}
            placeholder="File path…"
            className="w-full rounded-lg border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-violet)]"
          />
          {fileSuggestions.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {fileSuggestions.map((f) => (
                <li key={f.id}>
                  <button
                    onClick={() => setActiveFile(f.path)}
                    className="w-full truncate rounded-md px-2 py-1 text-left font-mono text-[11px] text-[var(--text-secondary)] hover:bg-[var(--surface-2)]"
                  >
                    {f.path}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What should the next person know?"
            className="mt-2 min-h-[100px] w-full resize-y rounded-lg border border-[var(--hairline)] bg-[var(--surface-2)] p-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-violet)]"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {TAG_OPTIONS.map((t) => {
              const on = tags.includes(t);
              return (
                <button
                  key={t}
                  onClick={() => toggleTag(t)}
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-all ${
                    on ? 'border-transparent text-white' : 'border-[var(--hairline)] text-[var(--text-secondary)] hover:border-[var(--hairline-strong)]'
                  }`}
                  style={on ? { background: TAG_COLOR[t], boxShadow: `0 0 10px -3px ${TAG_COLOR[t]}` } : {}}
                >
                  {t}
                </button>
              );
            })}
          </div>
          <Button onClick={addAnnotation} disabled={!activeFile.trim() || !body.trim()} className="mt-3 w-full">
            Pin annotation
          </Button>
        </Card>

        <div>
          <Card padding="md" className="mb-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-1 items-center gap-2">
                <Search className="h-4 w-4 text-[var(--text-muted)]" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search notes…"
                  className="w-full bg-transparent text-sm text-[var(--text-primary)] outline-none"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <Filter className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                {TAG_OPTIONS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTagFilter(tagFilter === t ? null : t)}
                    className="h-3 w-3 rounded-full transition-transform hover:scale-125"
                    style={{ backgroundColor: TAG_COLOR[t], opacity: tagFilter && tagFilter !== t ? 0.3 : 1 }}
                    title={t}
                  />
                ))}
              </div>
            </div>
          </Card>

          {filtered.length === 0 ? (
            <Card padding="lg" className="text-center">
              <StickyNote className="mx-auto h-8 w-8 text-[var(--text-muted)]" />
              <div className="mt-2 text-sm text-[var(--text-muted)]">No annotations yet.</div>
            </Card>
          ) : (
            <ul className="space-y-2">
              <AnimatePresence>
                {filtered.map((a) => (
                  <motion.li
                    key={a.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    layout
                  >
                    <Card padding="md">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-mono text-xs text-[var(--text-primary)]">{a.filePath}</div>
                          <p className="mt-1.5 whitespace-pre-wrap text-sm text-[var(--text-secondary)]">{a.body}</p>
                          {a.tags.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {a.tags.map((t) => (
                                <span
                                  key={t}
                                  className="rounded-full px-2 py-0.5 text-[10px] text-white"
                                  style={{ background: TAG_COLOR[t] }}
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="mt-2 text-[10px] text-[var(--text-muted)]">
                            {new Date(a.createdAt).toLocaleString()}
                          </div>
                        </div>
                        <button
                          onClick={() => remove(a.id)}
                          className="text-[var(--text-muted)] hover:text-[var(--danger)]"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </Card>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </div>
    </LabShell>
  );
}
