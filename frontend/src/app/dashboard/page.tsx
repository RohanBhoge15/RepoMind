/**
 * Dashboard — repository list with search/filter and indexing controls.
 */
'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { apiClient } from '@/lib/api';
import { Repository, IndexingStatus } from '@/lib/types';
import {
  GitBranch,
  AlertCircle,
  CheckCircle2,
  Clock,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Globe,
} from 'lucide-react';
import RepoCard from '@/components/ui/RepoCard';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import { RepoCardSkeleton } from '@/components/ui/LoadingSkeleton';
import IndexingProgressModal from '@/components/ui/IndexingProgressModal';
import EmptyDashboard from '@/components/ui/EmptyDashboard';
import { useToast } from '@/contexts/ToastContext';

export default function Dashboard() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [indexingRepos, setIndexingRepos] = useState<Set<string>>(new Set());
  const [reindexingRepos, setReindexingRepos] = useState<Set<string>>(new Set());
  const [retryCount, setRetryCount] = useState(0);
  const [pollingEnabled, setPollingEnabled] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [progressRepoId, setProgressRepoId] = useState<number | null>(null);
  const [progressRepoName, setProgressRepoName] = useState<string>('');

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<
    'all' | 'completed' | 'pending' | 'failed' | 'imported'
  >('all');
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const filteredRepositories = repositories.filter((repo) => {
    const matchesSearch = repo.name.toLowerCase().includes(searchQuery.toLowerCase());
    let matchesFilter = true;
    if (filterStatus === 'imported') matchesFilter = !!repo.is_imported;
    else if (filterStatus !== 'all') matchesFilter = repo.indexing_status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('#filter-dropdown') && !target.closest('#filter-button')) {
        setIsFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) {
      router.push('/auth/signin');
      return;
    }
    const backendToken = (session as any).backendToken;
    if (backendToken) {
      if (!apiClient.hasAuthToken()) apiClient.setAuthToken(backendToken);
      if (repositories.length === 0 && !error) loadRepositories();
    } else {
      if (retryCount < 8) {
        const delay = Math.min(500 * Math.pow(1.5, retryCount), 3000);
        const retryTimeout = setTimeout(async () => {
          setRetryCount((p) => p + 1);
          try {
            await update();
          } catch (err) {
            console.error('Session update failed:', err);
          }
        }, delay);
        return () => clearTimeout(retryTimeout);
      } else {
        setError('Authentication failed. The backend may be unavailable. Please sign in again.');
        setLoading(false);
      }
    }
  }, [session, status, retryCount, update]);

  useEffect(() => {
    const hasActiveIndexing = repositories.some(
      (repo) =>
        repo.indexing_status !== IndexingStatus.PENDING &&
        repo.indexing_status !== IndexingStatus.COMPLETED &&
        repo.indexing_status !== IndexingStatus.FAILED,
    );
    if (hasActiveIndexing && !loading) {
      setPollingEnabled(true);
      const pollInterval = setInterval(async () => {
        try {
          const data = await apiClient.listRepositories();
          setRepositories(data.repositories);
        } catch (err) {
          console.error('Polling error:', err);
        }
      }, 2000);
      return () => {
        clearInterval(pollInterval);
        setPollingEnabled(false);
      };
    }
  }, [repositories, loading]);

  const loadRepositories = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiClient.listRepositories();
      setRepositories(data.repositories);
      setRetryCount(0);
    } catch (err: any) {
      console.error('Failed to load repositories:', err);
      if (err.response?.status === 401 || err.response?.status === 403) {
        setError('Authentication failed. Please sign out and sign in again.');
      } else {
        setError('Failed to load repositories. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleIndexRepository = async (repoId: string) => {
    try {
      setIndexingRepos((p) => new Set(p).add(repoId));
      const indexedRepo = await apiClient.triggerIndexing(repoId);
      if (indexedRepo && indexedRepo.id) {
        setProgressRepoId(indexedRepo.id);
        setProgressRepoName(indexedRepo.name);
        setShowProgressModal(true);
      }
      await loadRepositories();
    } catch (err: any) {
      console.error('Failed to trigger indexing:', err);
      const msg = err?.response?.data?.detail || err?.message || 'Failed to start indexing';
      if (!msg.includes('already being indexed')) toast.error('Indexing failed', msg);
      await loadRepositories();
    } finally {
      setIndexingRepos((p) => {
        const next = new Set(p);
        next.delete(repoId);
        return next;
      });
    }
  };

  const handleReindexRepository = async (repoId: string) => {
    try {
      setReindexingRepos((p) => new Set(p).add(repoId));
      const indexedRepo = await apiClient.triggerIndexing(repoId);
      if (indexedRepo && indexedRepo.id) {
        setProgressRepoId(indexedRepo.id);
        setProgressRepoName(indexedRepo.name);
        setShowProgressModal(true);
      }
      await loadRepositories();
    } catch (err: any) {
      console.error('Failed to trigger re-indexing:', err);
      const msg = err?.response?.data?.detail || err?.message || 'Failed to start re-indexing';
      if (!msg.includes('already being indexed')) toast.error('Indexing failed', msg);
      await loadRepositories();
    } finally {
      setReindexingRepos((p) => {
        const next = new Set(p);
        next.delete(repoId);
        return next;
      });
    }
  };

  const handleProgressComplete = () => {
    setShowProgressModal(false);
    setProgressRepoId(null);
    setProgressRepoName('');
    setTimeout(() => loadRepositories(), 500);
  };

  if (loading) {
    return (
      <div>
        <div className="mb-8 space-y-3">
          <div className="h-9 w-64 skeleton rounded-lg" />
          <div className="h-5 w-96 skeleton rounded-md" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <RepoCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (error && !loading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl mx-auto py-12"
      >
        <Card variant="glass" padding="lg" className="border-[hsl(var(--danger)/0.4)]">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-[hsl(var(--danger)/0.1)] border border-[hsl(var(--danger)/0.3)]">
              <AlertCircle className="w-5 h-5 text-[hsl(var(--danger))]" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-[hsl(var(--text-primary))] mb-1.5">
                Authentication error
              </h3>
              <p className="text-[14px] text-[hsl(var(--text-secondary))] mb-5 leading-relaxed">
                {error}
              </p>
              <Button
                variant="danger"
                size="md"
                icon={<RefreshCw className="w-4 h-4" />}
                onClick={() => {
                  setError(null);
                  setRetryCount(0);
                  router.refresh();
                }}
              >
                Retry
              </Button>
            </div>
          </div>
        </Card>
      </motion.div>
    );
  }

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-8"
      >
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
          <div>
            <div className="mono text-[10px] uppercase tracking-widest text-[hsl(var(--accent-cyan))] mb-2">
              Workspace
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-[hsl(var(--text-primary))] tracking-tight">
              Your repositories
            </h1>
            <p className="text-[hsl(var(--text-secondary))] mt-1.5">
              Index, search, and chat with any GitHub repo.
            </p>
          </div>

          <AnimatePresence>
            {pollingEnabled && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-medium glass border-[hsl(var(--accent-cyan)/0.3)] text-[hsl(var(--accent-cyan))]"
              >
                <span className="relative flex w-2 h-2">
                  <span className="absolute inline-flex w-full h-full rounded-full bg-[hsl(var(--accent-cyan))] opacity-60 animate-ping" />
                  <span className="relative inline-flex w-2 h-2 rounded-full bg-[hsl(var(--accent-cyan))]" />
                </span>
                Live updates
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 relative z-20">
          <div className="flex-1">
            <Input
              placeholder="Search repositories…"
              icon={<Search className="w-4 h-4" />}
              iconPosition="left"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="relative">
            <Button
              id="filter-button"
              variant={filterStatus === 'all' ? 'outline' : 'primary'}
              size="md"
              icon={<Filter className="w-4 h-4" />}
              onClick={() => setIsFilterOpen(!isFilterOpen)}
            >
              {filterStatus === 'all' ? 'Filter' : `Filter · ${filterStatus}`}
            </Button>

            <AnimatePresence>
              {isFilterOpen && (
                <motion.div
                  id="filter-dropdown"
                  initial={{ opacity: 0, y: 4, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-52 rounded-xl overflow-hidden z-50 glass-strong border border-[hsl(var(--hairline))] shadow-[0_8px_24px_-8px_rgb(0_0_0/0.6)]"
                >
                  <div className="p-1">
                    {[
                      { value: 'all', label: 'All repositories', icon: null },
                      { value: 'imported', label: 'Imported', icon: Globe },
                      { value: 'completed', label: 'Indexed', icon: CheckCircle2 },
                      { value: 'pending', label: 'Pending', icon: Clock },
                      { value: 'failed', label: 'Failed', icon: AlertCircle },
                    ].map((option) => (
                      <button
                        key={option.value}
                        onClick={() => {
                          setFilterStatus(option.value as any);
                          setIsFilterOpen(false);
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-[13px] rounded-lg transition-colors ${
                          filterStatus === option.value
                            ? 'bg-[hsl(var(--accent-cyan)/0.12)] text-[hsl(var(--accent-cyan))] font-medium'
                            : 'text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--surface-2)/0.6)] hover:text-[hsl(var(--text-primary))]'
                        }`}
                      >
                        {option.icon ? <option.icon className="w-4 h-4" /> : <span className="w-4" />}
                        {option.label}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <Button
            variant="gradient"
            size="md"
            icon={<Plus className="w-4 h-4" />}
            onClick={() => router.push('/dashboard/import')}
          >
            Import repo
          </Button>
        </div>
      </motion.div>

      {repositories.length === 0 ? (
        <EmptyDashboard onImport={() => router.push('/dashboard/import')} />
      ) : filteredRepositories.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-20"
        >
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl flex items-center justify-center bg-[hsl(var(--surface-2))] border border-[hsl(var(--hairline))]">
            <Search className="w-7 h-7 text-[hsl(var(--text-muted))]" />
          </div>
          <h3 className="text-xl font-semibold text-[hsl(var(--text-primary))] mb-2">
            No matches
          </h3>
          <p className="text-[hsl(var(--text-secondary))] mb-6 max-w-md mx-auto">
            Try adjusting your search or filters.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setSearchQuery('');
              setFilterStatus('all');
            }}
          >
            Clear filters
          </Button>
        </motion.div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {filteredRepositories.map((repo, index) => (
            <motion.div
              key={repo.github_repo_id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.04 }}
            >
              <RepoCard
                repository={repo}
                onIndex={handleIndexRepository}
                onReindex={handleReindexRepository}
                onDeleted={(id) => setRepositories((p) => p.filter((r) => r.id !== id))}
                indexing={indexingRepos.has(repo.github_repo_id)}
                reindexing={reindexingRepos.has(repo.github_repo_id)}
              />
            </motion.div>
          ))}
        </div>
      )}

      {showProgressModal && progressRepoId && (
        <IndexingProgressModal
          isOpen={showProgressModal}
          onClose={() => setShowProgressModal(false)}
          repositoryName={progressRepoName}
          repositoryId={progressRepoId}
          onComplete={handleProgressComplete}
        />
      )}
    </div>
  );
}
