'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, Search, Baby, GraduationCap, Briefcase, Cpu } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { Documentation } from '@/lib/types';
import Card from '@/components/ui/Card';
import LabShell from '../_components/LabShell';

const LEVELS = [
  { id: 5, label: 'Age 5', icon: Baby, accent: 'hsl(var(--accent-pink))' },
  { id: 15, label: 'Curious teen', icon: GraduationCap, accent: 'hsl(var(--accent-cyan))' },
  { id: 25, label: 'New engineer', icon: Briefcase, accent: 'hsl(var(--accent-blue))' },
  { id: 99, label: 'Staff engineer', icon: Cpu, accent: 'hsl(var(--accent-violet))' },
];

function adaptText(raw: string, level: number): string {
  if (!raw) return '';
  if (level === 99) return raw;
  // Strip code blocks for younger levels
  let txt = raw.replace(/```[\s\S]*?```/g, level >= 25 ? '$&' : '');
  // Remove headings deeper than h2 for kids
  if (level <= 15) txt = txt.replace(/^#{3,}\s.*$/gm, '');
  // Simplify paragraphs
  const paragraphs = txt.split(/\n\n+/).filter(Boolean).slice(0, level <= 5 ? 2 : level <= 15 ? 4 : 12);
  let simplified = paragraphs.join('\n\n');
  if (level <= 5) {
    simplified = simplified
      .replace(/\b(repository|codebase)\b/gi, 'pile of computer instructions')
      .replace(/\b(authentication|authorization)\b/gi, 'checking who you are')
      .replace(/\b(API|endpoint)\b/gi, 'a way for two apps to talk')
      .replace(/\b(database)\b/gi, 'a big notebook for the computer')
      .replace(/\b(dependency|dependencies)\b/gi, 'other tools it uses')
      .replace(/\b(function|method)\b/gi, 'recipe step');
  } else if (level <= 15) {
    simplified = simplified
      .replace(/\b(orchestration|abstraction)\b/gi, 'organization')
      .replace(/\b(asynchronous)\b/gi, 'happens in the background');
  }
  return simplified;
}

export default function EliPage() {
  const params = useParams();
  const repoId = parseInt(params.id as string, 10);
  const [docs, setDocs] = useState<Documentation | null>(null);
  const [loading, setLoading] = useState(true);
  const [level, setLevel] = useState(15);
  const [query, setQuery] = useState('');
  const [activeSection, setActiveSection] = useState<number | null>(null);

  useEffect(() => {
    apiClient.getDocumentation(repoId).then((d) => {
      setDocs(d);
      if (d.sections.length) setActiveSection(d.sections[0].id);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [repoId]);

  const filteredSections = useMemo(() => {
    if (!docs) return [];
    if (!query.trim()) return docs.sections;
    const q = query.toLowerCase();
    return docs.sections.filter((s) => s.section_name.toLowerCase().includes(q) || s.content.toLowerCase().includes(q));
  }, [docs, query]);

  const current = docs?.sections.find((s) => s.id === activeSection);
  const adapted = current ? adaptText(current.content, level) : '';

  return (
    <LabShell
      title="ELI-N Adaptive Docs"
      subtitle="Slide the audience — same documentation, four reading levels."
      icon={<BookOpen className="h-5 w-5 text-[hsl(var(--accent-cyan))]" />}
    >
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-[var(--hairline)] bg-[var(--surface-1)] px-3 py-2">
          <Search className="h-4 w-4 text-[var(--text-muted)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sections…"
            className="w-full bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          />
        </div>
      </div>

      <div className="mb-6">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {LEVELS.map((l) => {
            const Icon = l.icon;
            const active = level === l.id;
            return (
              <motion.button
                key={l.id}
                onClick={() => setLevel(l.id)}
                whileHover={{ y: -2 }}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs transition-all ${
                  active ? 'border-transparent text-[var(--text-primary)]' : 'border-[var(--hairline)] text-[var(--text-secondary)] hover:border-[var(--hairline-strong)]'
                }`}
                style={
                  active
                    ? { background: `linear-gradient(135deg, ${l.accent}25, transparent)`, boxShadow: `0 0 18px -8px ${l.accent}` }
                    : {}
                }
              >
                <Icon className="h-4 w-4" style={{ color: l.accent }} />
                <div>
                  <div className="font-medium">{l.label}</div>
                  <div className="text-[10px] text-[var(--text-muted)]">level {l.id}</div>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <Card padding="md" className="lg:col-span-1">
          <div className="mb-2 text-xs uppercase tracking-wider text-[var(--text-muted)]">Sections</div>
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--accent-cyan)] border-t-transparent" />
            </div>
          ) : (
            <ul className="space-y-1 max-h-[60vh] overflow-y-auto">
              {filteredSections.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => setActiveSection(s.id)}
                    className={`w-full truncate rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                      activeSection === s.id ? 'bg-[var(--surface-2)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-2)]'
                    }`}
                  >
                    {s.section_name}
                  </button>
                </li>
              ))}
              {filteredSections.length === 0 && !loading && (
                <li className="px-2 py-3 text-xs text-[var(--text-muted)]">No matches.</li>
              )}
            </ul>
          )}
        </Card>

        <Card padding="lg" className="lg:col-span-3">
          {current ? (
            <AnimatePresence mode="wait">
              <motion.div
                key={`${current.id}-${level}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
              >
                <div className="mb-3 flex items-center gap-2">
                  <span className="rounded-full border border-[var(--hairline)] bg-[var(--surface-2)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                    {LEVELS.find((l) => l.id === level)?.label}
                  </span>
                  <h2 className="font-semibold text-[var(--text-primary)]">{current.section_name}</h2>
                </div>
                <div className="prose prose-invert max-w-none whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-secondary)]">
                  {adapted || 'No content for this section yet.'}
                </div>
              </motion.div>
            </AnimatePresence>
          ) : (
            <div className="text-sm text-[var(--text-muted)]">Pick a section to start reading.</div>
          )}
        </Card>
      </div>
    </LabShell>
  );
}
