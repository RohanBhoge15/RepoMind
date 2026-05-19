/**
 * Import repository — by URL or from connected GitHub account.
 */
'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { apiClient } from '@/lib/api';
import { Repository, IndexingStatus } from '@/lib/types';
import {
  GitBranch,
  Search,
  ArrowLeft,
  DownloadCloud,
  RefreshCw,
  AlertCircle,
  Link2,
  Github,
} from 'lucide-react';
import RepoCard from '@/components/ui/RepoCard';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import { RepoCardSkeleton } from '@/components/ui/LoadingSkeleton';
import IndexingProgressModal from '@/components/ui/IndexingProgressModal';
import { useToast } from '@/contexts/ToastContext';

export default function ImportRepoPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [indexingRepos, setIndexingRepos] = useState<Set<string>>(new Set());

  const [importUrl, setImportUrl] = useState('');
  const [importingUrl, setImportingUrl] = useState(false);

  const [showProgressModal, setShowProgressModal] = useState(false);
  const [progressRepoId, setProgressRepoId] = useState<number | null>(null);
  const [progressRepoName, setProgressRepoName] = useState<string>('');

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) {
      router.push('/auth/signin');
      return;
    }
    const backendToken = (session as any).backendToken;
    if (backendToken) {
      if (!apiClient.hasAuthToken()) apiClient.setAuthToken(backendToken);
      loadRepositories();
    }
  }, [session, status]);

  const loadRepositories = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiClient.listRepositories(1, 100);
      setRepositories(data.repositories);
    } catch (err: any) {
      console.error('Failed to load repositories:', err);
      setError('Failed to load repositories from GitHub. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleImportUrl = async () => {
    if (!importUrl) return;
    try {
      setImportingUrl(true);
      const indexedRepo = await apiClient.importRepositoryByUrl(importUrl);
      if (indexedRepo && indexedRepo.id) {
        setProgressRepoId(indexedRepo.id);
        setProgressRepoName(indexedRepo.name);
        setShowProgressModal(true);
      }
      setImportUrl('');
      await loadRepositories();
    } catch (err: any) {
      console.error('Failed to import URL:', err);
      const msg =
        err?.response?.data?.detail ||
        err?.message ||
        'Failed to import repository. Please check the URL and try again.';
      toast.error('Import failed', msg);
    } finally {
      setImportingUrl(false);
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
      else toast.info('Already indexing', 'This repo is already being processed.');
      await loadRepositories();
    } finally {
      setIndexingRepos((p) => {
        const next = new Set(p);
        next.delete(repoId);
        return next;
      });
    }
  };

  const handleProgressComplete = () => {
    setShowProgressModal(false);
    router.push('/dashboard');
  };

  const filteredRepositories = repositories.filter((repo) => {
    const isPending = repo.indexing_status === IndexingStatus.PENDING;
    const matchesSearch = repo.name.toLowerCase().includes(searchQuery.toLowerCase());
    return isPending && matchesSearch;
  });

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

  return (
    <div>
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <Button
          variant="ghost"
          size="sm"
          icon={<ArrowLeft className="w-4 h-4" />}
          onClick={() => router.push('/dashboard')}
          className="mb-4"
        >
          Back to dashboard
        </Button>

        <div className="mb-6">
          <div className="mono text-[10px] uppercase tracking-widest text-[hsl(var(--accent-violet))] mb-2">
            Import
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-[hsl(var(--text-primary))] tracking-tight">
            Add a repository
          </h1>
          <p className="text-[hsl(var(--text-secondary))] mt-1.5">
            Import by URL or pick from your connected GitHub account.
          </p>
        </div>

        <Card variant="glass" padding="lg" className="mb-8">
          <h2 className="text-base font-semibold text-[hsl(var(--text-primary))] mb-4 flex items-center gap-2">
            <Link2 className="w-4 h-4 text-[hsl(var(--accent-cyan))]" />
            Import by URL
          </h2>
          <div className="flex flex-col md:flex-row gap-3 items-end">
            <div className="flex-1 w-full">
              <Input
                placeholder="https://github.com/username/repository"
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                icon={<Github className="w-4 h-4" />}
                label="GitHub repository URL"
              />
            </div>
            <Button
              variant="gradient"
              onClick={handleImportUrl}
              loading={importingUrl}
              disabled={!importUrl || importingUrl}
              icon={<DownloadCloud className="w-4 h-4" />}
              className="w-full md:w-auto"
            >
              Import
            </Button>
          </div>
        </Card>

        <div>
          <h2 className="text-base font-semibold text-[hsl(var(--text-primary))] mb-4 flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-[hsl(var(--accent-cyan))]" />
            Select from GitHub
          </h2>
          <div className="max-w-xl">
            <Input
              placeholder="Search your repositories…"
              icon={<Search className="w-4 h-4" />}
              iconPosition="left"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </motion.div>

      {error && (
        <Card
          variant="default"
          padding="md"
          className="mb-6 border-[hsl(var(--danger)/0.4)] bg-[hsl(var(--danger)/0.05)]"
        >
          <div className="flex items-center gap-3 text-[hsl(var(--danger))]">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <p className="text-[14px] flex-1">{error}</p>
            <Button
              variant="outline"
              size="sm"
              icon={<RefreshCw className="w-3 h-3" />}
              onClick={loadRepositories}
            >
              Retry
            </Button>
          </div>
        </Card>
      )}

      {filteredRepositories.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center bg-[hsl(var(--surface-2))] border border-[hsl(var(--hairline))]">
            <GitBranch className="w-6 h-6 text-[hsl(var(--text-muted))]" />
          </div>
          <h3 className="text-lg font-semibold text-[hsl(var(--text-primary))] mb-2">
            {searchQuery ? 'No matching repositories' : 'Nothing left to import'}
          </h3>
          <p className="text-[hsl(var(--text-secondary))] max-w-md mx-auto">
            {searchQuery
              ? 'Try a different search term.'
              : 'All your GitHub repositories are already imported, or none were found. Try importing by URL.'}
          </p>
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
                indexing={indexingRepos.has(repo.github_repo_id)}
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
