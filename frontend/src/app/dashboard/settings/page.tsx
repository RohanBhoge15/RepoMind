/**
 * Settings — account, theme, cache, repositories.
 */
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  User as UserIcon,
  Sun,
  Moon,
  Trash2,
  LogOut,
  GitBranch,
  Eraser,
  ShieldAlert,
  Palette,
  Github,
  Database,
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import { Repository } from '@/lib/types';
import { useTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';

export default function SettingsPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { theme, toggleTheme } = useTheme();
  const toast = useToast();

  const [repos, setRepos] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [clearing, setClearing] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  useEffect(() => {
    if (!session) return;
    const token = (session as any).backendToken;
    if (token && !apiClient.hasAuthToken()) apiClient.setAuthToken(token);
    (async () => {
      try {
        const data = await apiClient.listRepositories(1, 100);
        setRepos(data.repositories.filter((r) => !!r.id));
      } catch (e: any) {
        toast.error('Failed to load repositories', e?.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [session]);

  const handleDelete = async (repo: Repository) => {
    if (!repo.id) return;
    setDeleting(repo.id);
    try {
      await apiClient.deleteRepository(repo.id);
      setRepos((r) => r.filter((x) => x.id !== repo.id));
      toast.success('Repository deleted', `${repo.name} and its data have been removed.`);
    } catch (e: any) {
      toast.error('Delete failed', e?.response?.data?.detail || e?.message);
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  };

  const handleClearCache = async (repo: Repository) => {
    if (!repo.id) return;
    setClearing(repo.id);
    try {
      await apiClient.invalidateCache(repo.id);
      toast.success('Cache cleared', `${repo.name}'s cached responses were invalidated.`);
    } catch (e: any) {
      toast.error('Clear cache failed', e?.response?.data?.detail || e?.message);
    } finally {
      setClearing(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <button
          onClick={() => router.push('/dashboard')}
          className="inline-flex items-center gap-1.5 text-sm text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--text-primary))] transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Back to dashboard
        </button>
        <div className="mono text-[10px] uppercase tracking-widest text-[hsl(var(--accent-violet))] mb-2">
          Preferences
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-[hsl(var(--text-primary))] tracking-tight">
          Settings
        </h1>
        <p className="text-[hsl(var(--text-secondary))] mt-1.5">
          Account, appearance, and repository management.
        </p>
      </motion.div>

      {/* Account */}
      <Section icon={UserIcon} title="Account" accent="cyan">
        <Row label="Signed in as">
          <div className="flex items-center gap-2.5">
            {session?.user?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={session.user.image}
                alt=""
                className="w-8 h-8 rounded-full border border-[hsl(var(--hairline))]"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-[hsl(var(--surface-3))] flex items-center justify-center">
                <UserIcon className="w-4 h-4 text-[hsl(var(--text-muted))]" />
              </div>
            )}
            <div>
              <div className="text-sm font-medium text-[hsl(var(--text-primary))]">
                {session?.user?.name || 'Unknown'}
              </div>
              <div className="text-xs text-[hsl(var(--text-muted))] mono">
                {session?.user?.email || ''}
              </div>
            </div>
          </div>
        </Row>
        <Row label="Connected via">
          <span className="inline-flex items-center gap-1.5 text-[12px] text-[hsl(var(--text-secondary))]">
            <Github className="w-3.5 h-3.5" /> GitHub OAuth
          </span>
        </Row>
        <Row label="Sign out">
          <button
            onClick={() => signOut({ callbackUrl: '/auth/signin' })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[hsl(var(--danger))] border border-[hsl(var(--danger)/0.4)] hover:bg-[hsl(var(--danger)/0.08)] transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </Row>
      </Section>

      {/* Appearance */}
      <Section icon={Palette} title="Appearance" accent="violet">
        <Row label="Theme">
          <button
            onClick={toggleTheme}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border border-[hsl(var(--hairline))] hover:bg-[hsl(var(--surface-2))] transition-colors"
          >
            {theme === 'dark' ? (
              <>
                <Moon className="w-3.5 h-3.5 text-[hsl(var(--accent-violet))]" /> Dark
              </>
            ) : (
              <>
                <Sun className="w-3.5 h-3.5 text-[hsl(var(--warning))]" /> Light
              </>
            )}
            <span className="text-[10px] uppercase tracking-widest mono text-[hsl(var(--text-muted))] ml-1">
              click to toggle
            </span>
          </button>
        </Row>
      </Section>

      {/* Repositories */}
      <Section icon={Database} title="Repositories" accent="pink">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 rounded-lg skeleton" />
            ))}
          </div>
        ) : repos.length === 0 ? (
          <div className="text-center py-8 text-sm text-[hsl(var(--text-muted))]">
            No indexed repositories yet.
          </div>
        ) : (
          <div className="space-y-2">
            {repos.map((repo) => (
              <div
                key={repo.id}
                className="flex items-center justify-between gap-3 p-3 rounded-lg border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-1)/0.6)]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-[hsl(var(--accent-cyan)/0.12)] text-[hsl(var(--accent-cyan))] flex items-center justify-center flex-shrink-0">
                    <GitBranch className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-[hsl(var(--text-primary))] truncate">
                      {repo.name}
                    </div>
                    <div className="text-[11px] mono text-[hsl(var(--text-muted))] truncate">
                      {repo.full_name || repo.indexing_status}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => handleClearCache(repo)}
                    disabled={clearing === repo.id}
                    title="Clear cached responses"
                    aria-label={`Clear cache for ${repo.name}`}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-[hsl(var(--text-secondary))] border border-[hsl(var(--hairline))] hover:bg-[hsl(var(--surface-2))] disabled:opacity-50 transition-colors"
                  >
                    <Eraser className="w-3 h-3" />
                    {clearing === repo.id ? 'Clearing…' : 'Clear cache'}
                  </button>
                  {confirmDelete === repo.id ? (
                    <>
                      <button
                        onClick={() => handleDelete(repo)}
                        disabled={deleting === repo.id}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-[hsl(var(--text-inverse))] bg-[hsl(var(--danger))] hover:opacity-90 disabled:opacity-60"
                      >
                        <ShieldAlert className="w-3 h-3" />
                        {deleting === repo.id ? 'Deleting…' : 'Confirm'}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="px-2 py-1 rounded-md text-[11px] text-[hsl(var(--text-muted))] hover:text-[hsl(var(--text-primary))]"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(repo.id!)}
                      title="Delete repository"
                      aria-label={`Delete ${repo.name}`}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-[hsl(var(--danger))] border border-[hsl(var(--danger)/0.3)] hover:bg-[hsl(var(--danger)/0.08)] transition-colors"
                    >
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="text-[11px] text-[hsl(var(--text-muted))] mt-3">
          Deleting a repository removes its files, embeddings, chat history, and cache.
          This cannot be undone.
        </div>
      </Section>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  accent,
  children,
}: {
  icon: typeof UserIcon;
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-2xl border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-1)/0.7)] overflow-hidden mb-5"
    >
      <div className="px-5 py-3 border-b border-[hsl(var(--hairline))] flex items-center gap-2">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{
            background: `hsl(var(--accent-${accent}) / 0.15)`,
            color: `hsl(var(--accent-${accent}))`,
          }}
        >
          <Icon className="w-3.5 h-3.5" />
        </div>
        <h2 className="text-sm font-semibold text-[hsl(var(--text-primary))]">{title}</h2>
      </div>
      <div className="p-5 space-y-3">{children}</div>
    </motion.section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="text-[12px] mono uppercase tracking-widest text-[hsl(var(--text-muted))]">
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}
