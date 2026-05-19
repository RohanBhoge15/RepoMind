/**
 * Global command palette — Cmd/Ctrl+K opens it from anywhere.
 * Searchable jump-to for: repos, lab features, repo tabs, top actions.
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Search,
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
  Command as CommandIcon,
  GitBranch,
  FlaskConical,
  LayoutDashboard,
  FileText,
  MessageSquare,
  Network,
  HeartPulse,
  Building2,
  Map,
  Dna,
  ShieldCheck,
  BookOpen,
  FlaskRound,
  Brain,
  Scale,
  Users,
  Radar,
  Activity,
  Beaker,
  StickyNote,
  KeyRound,
  PackageSearch,
  Copy,
  Gauge,
  CircuitBoard,
  Plus,
  LogOut,
  Settings,
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import { Repository } from '@/lib/types';
import { useSession, signOut } from 'next-auth/react';

interface Cmd {
  id: string;
  title: string;
  hint?: string;
  group: string;
  keywords?: string;
  icon: typeof Search;
  accent?: string;
  action: () => void;
}

const LAB_FEATURES: Array<{ slug: string; title: string; icon: typeof Search; accent: string }> = [
  { slug: 'city', title: 'Code City', icon: Building2, accent: 'cyan' },
  { slug: 'sankey', title: 'Flow Sankey', icon: GitBranch, accent: 'violet' },
  { slug: 'map', title: 'Semantic Map', icon: Map, accent: 'blue' },
  { slug: 'dna', title: 'Git DNA', icon: Dna, accent: 'pink' },
  { slug: 'chord', title: 'Chord Map', icon: CircuitBoard, accent: 'violet' },
  { slug: 'reviewer', title: 'AI Reviewer', icon: ShieldCheck, accent: 'pink' },
  { slug: 'eli5', title: 'ELI-N Docs', icon: BookOpen, accent: 'cyan' },
  { slug: 'tests', title: 'AI Tests', icon: FlaskRound, accent: 'violet' },
  { slug: 'plan', title: 'Intent Chat', icon: Brain, accent: 'blue' },
  { slug: 'debate', title: 'LLM Debate', icon: Scale, accent: 'pink' },
  { slug: 'contributors', title: 'Influence Map', icon: Users, accent: 'cyan' },
  { slug: 'radar', title: 'Tech Radar', icon: Radar, accent: 'violet' },
  { slug: 'impact', title: 'Change Impact', icon: Activity, accent: 'blue' },
  { slug: 'search', title: 'NL Search', icon: Search, accent: 'pink' },
  { slug: 'sandbox', title: 'What-If Sandbox', icon: Beaker, accent: 'cyan' },
  { slug: 'annotations', title: 'Annotations', icon: StickyNote, accent: 'violet' },
  { slug: 'secrets', title: 'Secret Radar', icon: KeyRound, accent: 'pink' },
  { slug: 'sbom', title: 'SBOM + CVE', icon: PackageSearch, accent: 'blue' },
  { slug: 'clones', title: 'Clone Detection', icon: Copy, accent: 'cyan' },
  { slug: 'confidence', title: 'Confidence Map', icon: Gauge, accent: 'violet' },
];

const REPO_TABS: Array<{ slug: string; title: string; icon: typeof Search }> = [
  { slug: 'overview', title: 'Overview', icon: LayoutDashboard },
  { slug: 'constellation', title: 'Constellation', icon: Network },
  { slug: 'health', title: 'Health', icon: HeartPulse },
  { slug: 'lab', title: 'Lab', icon: FlaskConical },
  { slug: 'docs', title: 'Docs', icon: FileText },
  { slug: 'chat', title: 'Chat', icon: MessageSquare },
];

export default function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = useSession();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [repos, setRepos] = useState<Repository[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // current repo id (if we are inside /repo/[id]/…)
  const currentRepoId = useMemo(() => {
    const m = pathname?.match(/^\/repo\/([^/]+)/);
    return m?.[1];
  }, [pathname]);

  // global hotkey
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes('mac');
      if ((isMac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  // reset on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // fetch repos when palette opens (only if authed)
  useEffect(() => {
    if (!open || !session) return;
    if (repos.length > 0) return;
    (async () => {
      try {
        const data = await apiClient.listRepositories(1, 50);
        setRepos(data.repositories);
      } catch {
        /* silent — palette still works for nav */
      }
    })();
  }, [open, session, repos.length]);

  const commands = useMemo<Cmd[]>(() => {
    const list: Cmd[] = [];

    // Top actions
    list.push({
      id: 'go-dashboard',
      title: 'Go to dashboard',
      hint: 'View all repositories',
      group: 'Navigate',
      icon: LayoutDashboard,
      action: () => router.push('/dashboard'),
    });
    list.push({
      id: 'import-repo',
      title: 'Import a repository',
      hint: 'Add a new GitHub repo',
      group: 'Navigate',
      icon: Plus,
      accent: 'cyan',
      action: () => router.push('/dashboard/import'),
    });

    // Repo tabs (only when inside a repo)
    if (currentRepoId) {
      REPO_TABS.forEach((tab) => {
        list.push({
          id: `tab-${tab.slug}`,
          title: `Open ${tab.title}`,
          hint: 'Current repository',
          group: 'This Repo',
          icon: tab.icon,
          action: () => router.push(`/repo/${currentRepoId}/${tab.slug}`),
        });
      });

      LAB_FEATURES.forEach((f) => {
        list.push({
          id: `lab-${f.slug}`,
          title: f.title,
          hint: 'Lab experiment',
          group: 'Lab',
          icon: f.icon,
          accent: f.accent,
          keywords: 'lab experiment',
          action: () => router.push(`/repo/${currentRepoId}/lab/${f.slug}`),
        });
      });
    }

    // Repos
    repos.forEach((r) => {
      list.push({
        id: `repo-${r.id}`,
        title: r.name,
        hint: r.description || 'Open repository',
        group: 'Repositories',
        icon: GitBranch,
        keywords: r.full_name || r.name,
        action: () => router.push(`/repo/${r.id}/overview`),
      });
    });

    // Account
    list.push({
      id: 'settings',
      title: 'Settings',
      hint: 'Theme, account, manage repos',
      group: 'Account',
      icon: Settings,
      action: () => router.push('/dashboard/settings'),
    });
    if (session) {
      list.push({
        id: 'sign-out',
        title: 'Sign out',
        hint: 'End your session',
        group: 'Account',
        icon: LogOut,
        action: () => signOut({ callbackUrl: '/auth/signin' }),
      });
    }
    return list;
  }, [currentRepoId, repos, router, session]);

  // simple fuzzy: every token in query must appear in title/keywords/group
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    const tokens = q.split(/\s+/).filter(Boolean);
    return commands.filter((c) => {
      const hay = `${c.title} ${c.group} ${c.keywords || ''} ${c.hint || ''}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [commands, query]);

  // group preserving insertion order
  const grouped = useMemo<Array<[string, Cmd[]]>>(() => {
    const out: Array<[string, Cmd[]]> = [];
    const idx: Record<string, Cmd[]> = {};
    filtered.forEach((c) => {
      if (!idx[c.group]) {
        idx[c.group] = [];
        out.push([c.group, idx[c.group]]);
      }
      idx[c.group].push(c);
    });
    return out;
  }, [filtered]);

  useEffect(() => setSelected(0), [query]);

  // keep selected in view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-cmd-idx="${selected}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = filtered[selected];
        if (cmd) {
          cmd.action();
          setOpen(false);
        }
      }
    },
    [filtered, selected],
  );

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90]"
            style={{
              background: 'radial-gradient(ellipse at center, hsl(var(--accent-violet) / 0.18) 0%, hsl(var(--bg-base) / 0.85) 60%)',
              backdropFilter: 'blur(8px)',
            }}
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-0 z-[91] flex items-start justify-center pt-[12vh] px-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, y: -16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              onKeyDown={onKeyDown}
              role="dialog"
              aria-label="Command palette"
              className="w-full max-w-xl pointer-events-auto rounded-2xl overflow-hidden"
              style={{
                background: 'linear-gradient(180deg, hsl(var(--surface-1) / 0.98), hsl(var(--surface-1) / 0.94))',
                border: '1px solid hsl(var(--hairline-strong))',
                boxShadow: '0 30px 80px hsl(0 0% 0% / 0.55), 0 0 0 1px hsl(var(--accent-violet) / 0.15)',
              }}
            >
              {/* input */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-[hsl(var(--hairline))]">
                <Search className="w-4 h-4 text-[hsl(var(--text-muted))] flex-shrink-0" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search repos, lab features, actions…"
                  aria-label="Search commands"
                  className="flex-1 bg-transparent text-[14px] text-[hsl(var(--text-primary))] placeholder:text-[hsl(var(--text-muted))] focus:outline-none"
                />
                <kbd className="mono text-[10px] uppercase tracking-widest text-[hsl(var(--text-muted))] px-1.5 py-0.5 rounded border border-[hsl(var(--hairline))]">
                  Esc
                </kbd>
              </div>

              {/* results */}
              <div ref={listRef} className="max-h-[55vh] overflow-y-auto p-2">
                {filtered.length === 0 ? (
                  <div className="text-center py-10 text-[hsl(var(--text-muted))] text-sm">
                    No results. Try a different query.
                  </div>
                ) : (
                  grouped.map(([group, items]) => (
                    <div key={group} className="mb-2 last:mb-0">
                      <div className="mono text-[9px] uppercase tracking-widest text-[hsl(var(--text-muted))] px-2 py-1.5">
                        {group}
                      </div>
                      <div className="space-y-0.5">
                        {items.map((cmd) => {
                          const idx = filtered.indexOf(cmd);
                          const isSelected = idx === selected;
                          const Icon = cmd.icon;
                          return (
                            <button
                              key={cmd.id}
                              data-cmd-idx={idx}
                              onMouseEnter={() => setSelected(idx)}
                              onClick={() => {
                                cmd.action();
                                setOpen(false);
                              }}
                              className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left transition-colors"
                              style={{
                                background: isSelected ? 'hsl(var(--surface-2) / 0.8)' : 'transparent',
                                boxShadow: isSelected ? `inset 0 0 0 1px hsl(var(--accent-cyan) / 0.4)` : 'none',
                              }}
                            >
                              <div
                                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                                style={{
                                  background: cmd.accent
                                    ? `hsl(var(--accent-${cmd.accent}) / 0.15)`
                                    : 'hsl(var(--surface-2))',
                                  color: cmd.accent
                                    ? `hsl(var(--accent-${cmd.accent}))`
                                    : 'hsl(var(--text-secondary))',
                                  border: '1px solid hsl(var(--hairline))',
                                }}
                              >
                                <Icon className="w-3.5 h-3.5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-[13px] font-medium text-[hsl(var(--text-primary))] truncate">
                                  {cmd.title}
                                </div>
                                {cmd.hint && (
                                  <div className="text-[11px] text-[hsl(var(--text-muted))] truncate">
                                    {cmd.hint}
                                  </div>
                                )}
                              </div>
                              {isSelected && (
                                <CornerDownLeft className="w-3.5 h-3.5 text-[hsl(var(--accent-cyan))] flex-shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* footer */}
              <div className="flex items-center justify-between px-4 py-2 border-t border-[hsl(var(--hairline))] bg-[hsl(var(--surface-2)/0.4)]">
                <div className="flex items-center gap-3 mono text-[10px] uppercase tracking-widest text-[hsl(var(--text-muted))]">
                  <span className="inline-flex items-center gap-1">
                    <ArrowUp className="w-2.5 h-2.5" />
                    <ArrowDown className="w-2.5 h-2.5" />
                    Navigate
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <CornerDownLeft className="w-2.5 h-2.5" /> Select
                  </span>
                </div>
                <div className="mono text-[10px] uppercase tracking-widest text-[hsl(var(--text-muted))] inline-flex items-center gap-1">
                  <CommandIcon className="w-2.5 h-2.5" /> + K
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
