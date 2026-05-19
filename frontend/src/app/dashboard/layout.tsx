/**
 * Dashboard layout — dark glass header with user menu.
 */
'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { LogOut, Moon, Sun, Terminal } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTheme } from '@/contexts/ThemeContext';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center space-y-3"
        >
          <div className="relative w-12 h-12 mx-auto">
            <motion.div
              className="absolute inset-0 rounded-2xl bg-[linear-gradient(135deg,hsl(var(--accent-cyan)),hsl(var(--accent-violet)))]"
              animate={{ rotate: [0, 360] }}
              transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
            />
            <div className="absolute inset-[2px] rounded-2xl bg-[hsl(var(--bg-base))] flex items-center justify-center">
              <Terminal className="w-5 h-5 text-[hsl(var(--accent-cyan))]" />
            </div>
          </div>
          <p className="mono text-[12px] uppercase tracking-widest text-[hsl(var(--text-muted))]">
            Loading
          </p>
        </motion.div>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="min-h-screen">
      <motion.header
        initial={{ y: -16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="sticky top-0 z-40 backdrop-blur-xl bg-[hsl(var(--bg-base)/0.7)] border-b border-[hsl(var(--hairline))]"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <button
              onClick={() => router.push('/dashboard')}
              className="flex items-center gap-2.5 group"
            >
              <div className="w-8 h-8 rounded-lg bg-[linear-gradient(135deg,hsl(var(--accent-cyan)),hsl(var(--accent-violet)))] flex items-center justify-center shadow-[0_0_18px_-4px_hsl(var(--accent-cyan)/0.5)] group-hover:shadow-[0_0_24px_-4px_hsl(var(--accent-cyan)/0.7)] transition-shadow">
                <Terminal className="w-4 h-4 text-white" />
              </div>
              <span className="text-base font-semibold tracking-tight text-[hsl(var(--text-primary))]">
                RepoMind
              </span>
            </button>

            <div className="flex items-center gap-2">
              <motion.button
                onClick={toggleTheme}
                className="p-2 rounded-lg text-[hsl(var(--text-muted))] hover:text-[hsl(var(--text-primary))] hover:bg-[hsl(var(--surface-2)/0.6)] transition-colors"
                aria-label="Toggle theme"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </motion.button>

              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-1)/0.5)]">
                {session.user?.image && (
                  <img
                    src={session.user.image}
                    alt={session.user.name || 'User'}
                    className="w-6 h-6 rounded-full ring-1 ring-[hsl(var(--hairline))]"
                  />
                )}
                <span className="text-[13px] font-medium text-[hsl(var(--text-primary))] hidden sm:inline">
                  {session.user?.name}
                </span>
              </div>

              <motion.button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="flex items-center gap-1.5 px-2.5 h-9 text-[13px] text-[hsl(var(--text-muted))] hover:text-[hsl(var(--danger))] hover:bg-[hsl(var(--danger)/0.08)] rounded-lg transition-colors"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sign out</span>
              </motion.button>
            </div>
          </div>
        </div>
      </motion.header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
    </div>
  );
}
