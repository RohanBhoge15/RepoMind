/**
 * Repository viewer layout — sticky glass header with breadcrumb and tabs.
 */
'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { apiClient } from '@/lib/api';
import { Repository } from '@/lib/types';
import {
  FileCode,
  BookOpen,
  MessageSquare,
  LayoutDashboard,
  Terminal,
  ChevronRight,
  Sparkles,
  Activity,
  FlaskConical,
} from 'lucide-react';
import Link from 'next/link';

export default function RepoLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [repository, setRepository] = useState<Repository | null>(null);
  const repoId = parseInt(params.id);

  useEffect(() => {
    if (session) {
      const backendToken = (session as any).backendToken;
      if (backendToken) apiClient.setAuthToken(backendToken);
      loadRepository();
    }
  }, [session, repoId]);

  const loadRepository = async () => {
    try {
      const data = await apiClient.listRepositories();
      const repo = data.repositories.find((r) => r.id === repoId);
      if (repo) setRepository(repo);
    } catch (err) {
      console.error('Failed to load repository:', err);
    }
  };

  const tabs = [
    { name: 'Overview', href: `/repo/${repoId}/overview`, icon: LayoutDashboard },
    { name: 'Code', href: `/repo/${repoId}`, icon: FileCode },
    { name: 'Constellation', href: `/repo/${repoId}/constellation`, icon: Sparkles },
    { name: 'Health', href: `/repo/${repoId}/health`, icon: Activity },
    { name: 'Lab', href: `/repo/${repoId}/lab`, icon: FlaskConical },
    { name: 'Docs', href: `/repo/${repoId}/docs`, icon: BookOpen },
    { name: 'Chat', href: `/repo/${repoId}/chat`, icon: MessageSquare },
  ];

  return (
    <div className="min-h-screen">
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="sticky top-0 z-50 backdrop-blur-xl bg-[hsl(var(--bg-base)/0.75)] border-b border-[hsl(var(--hairline))]"
      >
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="py-2.5 flex items-center justify-between border-b border-[hsl(var(--hairline))]">
            <div className="flex items-center gap-2 text-[13px] min-w-0">
              <Link href="/dashboard" className="flex items-center gap-2 group">
                <div className="w-7 h-7 rounded-lg bg-[linear-gradient(135deg,hsl(var(--accent-cyan)),hsl(var(--accent-violet)))] flex items-center justify-center shadow-[0_0_14px_-4px_hsl(var(--accent-cyan)/0.5)]">
                  <Terminal className="w-3.5 h-3.5 text-white" />
                </div>
              </Link>
              <ChevronRight className="w-3 h-3 text-[hsl(var(--text-muted))]" />
              <Link
                href="/dashboard"
                className="text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--text-primary))] transition-colors"
              >
                dashboard
              </Link>
              <ChevronRight className="w-3 h-3 text-[hsl(var(--text-muted))]" />
              <span className="text-[hsl(var(--text-primary))] font-medium truncate mono">
                {repository?.name || 'loading…'}
              </span>
            </div>

            <div className="flex items-center gap-2 px-2.5 py-1 rounded-md border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-1)/0.5)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--success))] shadow-[0_0_6px_hsl(var(--success))]" />
              <span className="text-[11px] text-[hsl(var(--text-secondary))]">
                {session?.user?.name || 'User'}
              </span>
            </div>
          </div>

          <div className="flex gap-5">
            {tabs.map((tab) => {
              const isActive =
                tab.name === 'Code'
                  ? pathname === tab.href
                  : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
              // Code tab uses bare /repo/[id], so don't let it match deeper paths
              const Icon = tab.icon;
              return (
                <Link
                  key={tab.name}
                  href={tab.href}
                  className={`relative flex items-center gap-1.5 py-3 text-[13px] font-medium transition-colors ${
                    isActive
                      ? 'text-[hsl(var(--accent-cyan))]'
                      : 'text-[hsl(var(--text-muted))] hover:text-[hsl(var(--text-primary))]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.name}
                  {isActive && (
                    <motion.div
                      layoutId="activeRepoTab"
                      className="absolute -bottom-px left-0 right-0 h-0.5 bg-[hsl(var(--accent-cyan))] shadow-[0_0_8px_hsl(var(--accent-cyan))]"
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    />
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </motion.header>

      <main className="h-[calc(100vh-97px)] overflow-hidden">{children}</main>
    </div>
  );
}
