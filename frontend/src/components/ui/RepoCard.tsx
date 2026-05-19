'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Repository, IndexingStatus } from '@/lib/types';
import {
  FileCode,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Star,
  GitFork,
  ArrowUpRight,
  RefreshCw,
  Globe,
  MoreHorizontal,
  Trash2,
  Eraser,
} from 'lucide-react';
import Card from './Card';
import Button from './Button';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

export interface RepoCardProps {
  repository: Repository;
  onIndex?: (repoId: string) => void;
  onReindex?: (repoId: string) => void;
  onDeleted?: (repoId: number) => void;
  indexing?: boolean;
  reindexing?: boolean;
}

type StatusToken = {
  icon: typeof Clock;
  label: string;
  dot: string;
  text: string;
  bg: string;
  border: string;
  animate?: boolean;
};

function statusFor(status: IndexingStatus): StatusToken {
  switch (status) {
    case IndexingStatus.COMPLETED:
      return {
        icon: CheckCircle2,
        label: 'Ready',
        dot: 'bg-[hsl(var(--success))]',
        text: 'text-[hsl(var(--success))]',
        bg: 'bg-[hsl(var(--success)/0.08)]',
        border: 'border-[hsl(var(--success)/0.3)]',
      };
    case IndexingStatus.FAILED:
      return {
        icon: AlertCircle,
        label: 'Failed',
        dot: 'bg-[hsl(var(--danger))]',
        text: 'text-[hsl(var(--danger))]',
        bg: 'bg-[hsl(var(--danger)/0.08)]',
        border: 'border-[hsl(var(--danger)/0.3)]',
      };
    case IndexingStatus.QUEUED:
      return {
        icon: Clock,
        label: 'Queued',
        dot: 'bg-[hsl(var(--warning))]',
        text: 'text-[hsl(var(--warning))]',
        bg: 'bg-[hsl(var(--warning)/0.08)]',
        border: 'border-[hsl(var(--warning)/0.3)]',
      };
    case IndexingStatus.CLONING:
    case IndexingStatus.INDEXING:
    case IndexingStatus.ANALYZING:
    case IndexingStatus.CHUNKING:
    case IndexingStatus.EMBEDDING:
    case IndexingStatus.GENERATING_DOCS:
      return {
        icon: Loader2,
        label:
          status === IndexingStatus.CLONING
            ? 'Cloning'
            : status === IndexingStatus.EMBEDDING
              ? 'Embedding'
              : status === IndexingStatus.GENERATING_DOCS
                ? 'Writing docs'
                : status === IndexingStatus.CHUNKING
                  ? 'Chunking'
                  : status === IndexingStatus.ANALYZING
                    ? 'Analyzing'
                    : 'Indexing',
        dot: 'bg-[hsl(var(--accent-cyan))]',
        text: 'text-[hsl(var(--accent-cyan))]',
        bg: 'bg-[hsl(var(--accent-cyan)/0.08)]',
        border: 'border-[hsl(var(--accent-cyan)/0.35)]',
        animate: true,
      };
    default:
      return {
        icon: Clock,
        label: 'Not indexed',
        dot: 'bg-[hsl(var(--text-muted))]',
        text: 'text-[hsl(var(--text-muted))]',
        bg: 'bg-[hsl(var(--surface-2)/0.6)]',
        border: 'border-[hsl(var(--hairline))]',
      };
  }
}

export default function RepoCard({
  repository,
  onIndex,
  onReindex,
  onDeleted,
  indexing = false,
  reindexing = false,
}: RepoCardProps) {
  const router = useRouter();
  const toast = useToast();
  const cfg = statusFor(repository.indexing_status);
  const StatusIcon = cfg.icon;

  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setConfirmDelete(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  const handleClearCache = async () => {
    if (!repository.id) return;
    setClearing(true);
    try {
      await apiClient.invalidateCache(repository.id);
      toast.success('Cache cleared', `${repository.name}'s cache invalidated.`);
    } catch (e: any) {
      toast.error('Clear cache failed', e?.response?.data?.detail || e?.message);
    } finally {
      setClearing(false);
      setMenuOpen(false);
    }
  };

  const handleDelete = async () => {
    if (!repository.id) return;
    setDeleting(true);
    try {
      await apiClient.deleteRepository(repository.id);
      toast.success('Repository deleted', `${repository.name} and its data removed.`);
      onDeleted?.(repository.id);
    } catch (e: any) {
      toast.error('Delete failed', e?.response?.data?.detail || e?.message);
    } finally {
      setDeleting(false);
      setMenuOpen(false);
      setConfirmDelete(false);
    }
  };

  const isIndexed = repository.indexing_status === IndexingStatus.COMPLETED;
  const isFailed = repository.indexing_status === IndexingStatus.FAILED;
  const isActive = [
    IndexingStatus.QUEUED,
    IndexingStatus.CLONING,
    IndexingStatus.INDEXING,
    IndexingStatus.ANALYZING,
    IndexingStatus.CHUNKING,
    IndexingStatus.EMBEDDING,
    IndexingStatus.GENERATING_DOCS,
  ].includes(repository.indexing_status);

  const progress = repository.indexing_progress ?? 0;

  const handleCardClick = () => {
    if (isIndexed) router.push(`/repo/${repository.id}/overview`);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="h-full"
    >
      <Card
        variant="default"
        padding="lg"
        hover={isIndexed}
        onClick={isIndexed ? handleCardClick : undefined}
        className={cn('group h-full flex flex-col', !isIndexed && 'opacity-95')}
      >
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-[17px] font-semibold text-[hsl(var(--text-primary))] truncate group-hover:text-gradient transition-colors">
                {repository.name}
              </h3>
              {repository.is_imported && (
                <span className="inline-flex items-center gap-1 px-1.5 h-5 rounded-md text-[10px] font-medium uppercase tracking-wider border border-[hsl(var(--accent-violet)/0.4)] text-[hsl(var(--accent-violet))] bg-[hsl(var(--accent-violet)/0.08)]">
                  <Globe className="w-3 h-3" /> Imported
                </span>
              )}
            </div>
            <p className="text-[13px] mono text-[hsl(var(--text-muted))] truncate">{repository.full_name}</p>
          </div>

          {/* Status pill + kebab */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full text-[11px] font-medium border',
                cfg.bg,
                cfg.border,
                cfg.text
              )}
            >
              <StatusIcon className={cn('w-3.5 h-3.5', cfg.animate && 'animate-spin')} />
              {cfg.label}
            </span>
            {repository.id && (
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen((o) => !o);
                  }}
                  aria-label="Repository actions"
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-[hsl(var(--text-muted))] hover:text-[hsl(var(--text-primary))] hover:bg-[hsl(var(--surface-2))] transition-colors"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
                <AnimatePresence>
                  {menuOpen && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.94, y: -4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.94, y: -4 }}
                      transition={{ duration: 0.15 }}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-1))] shadow-[0_10px_30px_hsl(0_0%_0%/0.5)] z-30 overflow-hidden"
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onReindex?.(repository.github_repo_id);
                          setMenuOpen(false);
                        }}
                        disabled={!isIndexed && !isFailed}
                        className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--text-primary))] disabled:opacity-50 transition-colors"
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> Re-index
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleClearCache();
                        }}
                        disabled={clearing}
                        className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--text-primary))] disabled:opacity-50 transition-colors"
                      >
                        <Eraser className="w-3.5 h-3.5" /> {clearing ? 'Clearing…' : 'Clear cache'}
                      </button>
                      <div className="h-px bg-[hsl(var(--hairline))]" />
                      {!confirmDelete ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDelete(true);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-[hsl(var(--danger))] hover:bg-[hsl(var(--danger)/0.08)] transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete repository
                        </button>
                      ) : (
                        <div className="p-2 space-y-1.5">
                          <div className="text-[11px] text-[hsl(var(--danger))] px-1">
                            Permanently delete this repo and its data?
                          </div>
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete();
                              }}
                              disabled={deleting}
                              className="flex-1 px-2 py-1 rounded-md text-[11px] font-medium bg-[hsl(var(--danger))] text-[hsl(var(--text-inverse))] hover:opacity-90 disabled:opacity-60"
                            >
                              {deleting ? 'Deleting…' : 'Confirm'}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDelete(false);
                              }}
                              className="flex-1 px-2 py-1 rounded-md text-[11px] text-[hsl(var(--text-secondary))] border border-[hsl(var(--hairline))] hover:bg-[hsl(var(--surface-2))]"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>

        {/* Description (fixed two lines for grid alignment) */}
        <p className="text-[13px] leading-relaxed text-[hsl(var(--text-secondary))] line-clamp-2 mb-4 min-h-[2.6rem]">
          {repository.description || '\u00A0'}
        </p>

        {/* Active indexing progress */}
        {isActive && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-[11px] mono text-[hsl(var(--text-muted))] mb-1.5">
              <span>{repository.current_step ?? cfg.label}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="relative h-1 rounded-full bg-[hsl(var(--surface-2))] overflow-hidden">
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full bg-[linear-gradient(90deg,hsl(var(--accent-cyan)),hsl(var(--accent-violet)))]"
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(2, progress)}%` }}
                transition={{ type: 'spring', stiffness: 80, damping: 18 }}
              />
              <div className="absolute inset-0 overflow-hidden">
                <div className="absolute inset-y-0 w-1/3 bg-[linear-gradient(90deg,transparent,hsl(var(--accent-cyan)/0.5),transparent)] animate-shimmer" />
              </div>
            </div>
          </div>
        )}

        {/* Stats row */}
        <div className="flex items-center gap-4 text-[12px] text-[hsl(var(--text-muted))] mb-5">
          {repository.language && (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--accent-cyan))]" />
              {repository.language}
            </span>
          )}
          {repository.stars_count !== undefined && (
            <span className="inline-flex items-center gap-1">
              <Star className="w-3.5 h-3.5" />
              {repository.stars_count}
            </span>
          )}
          {repository.forks_count !== undefined && (
            <span className="inline-flex items-center gap-1">
              <GitFork className="w-3.5 h-3.5" />
              {repository.forks_count}
            </span>
          )}
        </div>

        <div className="flex-1" />

        {/* Action row */}
        <div className="flex items-center gap-2">
          {!isIndexed && !isActive && (
            <Button
              variant="gradient"
              size="sm"
              fullWidth
              loading={indexing}
              icon={<FileCode className="w-4 h-4" />}
              onClick={(e) => {
                e.stopPropagation();
                onIndex?.(repository.github_repo_id);
              }}
            >
              {repository.indexing_status === IndexingStatus.FAILED ? 'Retry indexing' : 'Index repository'}
            </Button>
          )}

          {isIndexed && (
            <>
              <Button
                variant="outline"
                size="sm"
                fullWidth
                icon={<ArrowUpRight className="w-4 h-4" />}
                iconPosition="right"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCardClick();
                }}
              >
                Explore
              </Button>
              <Button
                variant="ghost"
                size="sm"
                loading={reindexing}
                icon={<RefreshCw className="w-4 h-4" />}
                title="Re-index repository"
                aria-label={`Re-index ${repository.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onReindex?.(repository.github_repo_id);
                }}
              />
            </>
          )}

          {isActive && (
            <div className="flex-1 text-center text-[12px] mono text-[hsl(var(--text-muted))]">
              Processing…
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
