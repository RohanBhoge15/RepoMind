'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Sparkles, Command } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { DependencyGraph, GraphNode } from '@/lib/types';
import Card from '@/components/ui/Card';
import LabShell from '../_components/LabShell';

const INTENT_PATTERNS: { keywords: RegExp; tags: string[]; phrase: string }[] = [
  { keywords: /hash|password|bcrypt|encrypt/i, tags: ['auth', 'password', 'hash', 'security', 'bcrypt'], phrase: 'Password hashing logic' },
  { keywords: /auth|login|sign[\s-]?in/i, tags: ['auth', 'login', 'signin', 'session', 'token'], phrase: 'Authentication entry points' },
  { keywords: /database|db|query|migrate/i, tags: ['db', 'database', 'sql', 'sqlalchemy', 'migration'], phrase: 'Database access' },
  { keywords: /route|endpoint|api/i, tags: ['router', 'routes', 'api', 'endpoint', 'fastapi'], phrase: 'API endpoints' },
  { keywords: /test|spec/i, tags: ['test', 'spec', 'pytest', 'jest'], phrase: 'Test files' },
  { keywords: /config|setting|env/i, tags: ['config', 'settings', 'env', 'environment'], phrase: 'Configuration' },
  { keywords: /chat|message|conversation/i, tags: ['chat', 'message', 'history', 'conversation'], phrase: 'Chat infrastructure' },
  { keywords: /embed|vector|similarity/i, tags: ['embed', 'embedding', 'vector', 'similarity'], phrase: 'Embedding pipeline' },
  { keywords: /cache/i, tags: ['cache', 'redis'], phrase: 'Caching layer' },
  { keywords: /component|ui|button|form/i, tags: ['component', 'tsx', 'ui'], phrase: 'UI components' },
];

interface Hit {
  node: GraphNode;
  score: number;
  matched: string[];
}

function search(query: string, nodes: GraphNode[]): { hits: Hit[]; interpretation: string } {
  const q = query.trim().toLowerCase();
  if (!q) return { hits: [], interpretation: '' };
  const tokens = q.split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  const expanded = new Set(tokens);
  let interpretation = `Files matching: ${tokens.join(', ')}`;
  for (const p of INTENT_PATTERNS) {
    if (p.keywords.test(query)) {
      p.tags.forEach((t) => expanded.add(t));
      interpretation = `${p.phrase} — searching across ${p.tags.slice(0, 3).join(', ')}…`;
      break;
    }
  }
  const hits: Hit[] = [];
  for (const n of nodes) {
    const target = `${n.path} ${n.label} ${n.language || ''}`.toLowerCase();
    const matched: string[] = [];
    let score = 0;
    for (const t of expanded) {
      if (target.includes(t)) {
        matched.push(t);
        score += t.length > 4 ? 2 : 1;
      }
    }
    if (score > 0) hits.push({ node: n, score, matched });
  }
  hits.sort((a, b) => b.score - a.score);
  return { hits: hits.slice(0, 40), interpretation };
}

const EXAMPLES = [
  'where do we hash passwords?',
  'all API endpoints',
  'show me chat history persistence',
  'cache layer',
  'embedding pipeline',
];

export default function NLSearchPage() {
  const params = useParams();
  const repoId = parseInt(params.id as string, 10);
  const [graph, setGraph] = useState<DependencyGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    apiClient.getDependencyGraph(repoId).then((g) => {
      setGraph(g);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [repoId]);

  const { hits, interpretation } = useMemo(() => search(query, graph?.nodes || []), [query, graph]);

  return (
    <LabShell
      title="Natural-language Search"
      subtitle="Ask in English. We translate intent into a multi-field search across the codebase."
      icon={<Search className="h-5 w-5 text-[hsl(var(--accent-pink))]" />}
      accent="hsl(var(--accent-pink))"
    >
      <Card padding="lg" className="mb-6">
        <div className="flex items-center gap-3 rounded-xl border border-[var(--hairline)] bg-[var(--surface-2)] px-4 py-3">
          <Sparkles className="h-4 w-4 text-[var(--accent-pink)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask anything about this repository…"
            className="flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            autoFocus
          />
          <span className="hidden items-center gap-1 rounded border border-[var(--hairline)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] md:flex">
            <Command className="h-3 w-3" /> K
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setQuery(ex)}
              className="rounded-full border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-1 text-[11px] text-[var(--text-secondary)] hover:border-[var(--accent-pink)] hover:text-[var(--text-primary)]"
            >
              {ex}
            </button>
          ))}
        </div>
      </Card>

      {query && (
        <AnimatePresence mode="wait">
          <motion.div
            key={query}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <div className="mb-3 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <Sparkles className="h-3.5 w-3.5 text-[var(--accent-pink)]" />
              <span>{interpretation || 'No matches'}</span>
              <span className="ml-auto text-[var(--text-muted)]">{hits.length} result{hits.length !== 1 ? 's' : ''}</span>
            </div>
            <ul className="space-y-2">
              {hits.map((h, i) => (
                <motion.li
                  key={h.node.id}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.02 }}
                >
                  <Card padding="md" hover>
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mono text-sm text-[var(--text-primary)]">{h.node.path}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {h.matched.map((m) => (
                            <span key={m} className="rounded bg-[var(--accent-pink)]/15 px-1.5 py-0.5 text-[10px] text-[var(--accent-pink)]">
                              {m}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-xs text-[var(--text-muted)]">score</div>
                        <div className="font-mono text-sm text-[var(--text-primary)]">{h.score}</div>
                      </div>
                    </div>
                  </Card>
                </motion.li>
              ))}
              {hits.length === 0 && (
                <li className="rounded-xl border border-dashed border-[var(--hairline)] p-8 text-center text-sm text-[var(--text-muted)]">
                  No files matched. Try different words or one of the suggestions above.
                </li>
              )}
            </ul>
          </motion.div>
        </AnimatePresence>
      )}

      {loading && (
        <div className="flex justify-center py-12">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--accent-pink)] border-t-transparent" />
        </div>
      )}
    </LabShell>
  );
}
