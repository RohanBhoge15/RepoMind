/**
 * Root error boundary — catches anything not handled by nested boundaries.
 */
'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';
import Link from 'next/link';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[GlobalError]', error);
  }, [error]);

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-6 py-16">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg text-center"
      >
        <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5 mx-auto">
          <motion.div
            className="absolute inset-0 rounded-2xl"
            style={{ background: 'hsl(var(--danger) / 0.15)' }}
            animate={{ scale: [1, 1.08, 1], opacity: [0.6, 0.9, 0.6] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />
          <AlertTriangle className="relative w-7 h-7 text-[hsl(var(--danger))]" />
        </div>
        <div className="mono text-[10px] uppercase tracking-widest text-[hsl(var(--danger))] mb-2">Error</div>
        <h1 className="text-2xl font-bold text-[hsl(var(--text-primary))] mb-2">Something went wrong</h1>
        <p className="text-[hsl(var(--text-secondary))] text-sm mb-6">
          An unexpected error occurred while rendering this page. You can retry or head back to the dashboard.
        </p>
        {error.message && (
          <pre className="mono text-[11px] text-left text-[hsl(var(--text-muted))] bg-[hsl(var(--surface-2))] border border-[hsl(var(--hairline))] rounded-lg p-3 mb-6 overflow-auto max-h-32 whitespace-pre-wrap">
            {error.message}
            {error.digest && `\nDigest: ${error.digest}`}
          </pre>
        )}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-[hsl(var(--text-primary))] border border-[hsl(var(--hairline))] hover:border-[hsl(var(--accent-cyan)/0.5)] hover:bg-[hsl(var(--surface-2))] transition-colors"
          >
            <RotateCcw className="w-4 h-4" /> Retry
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
            style={{
              background: 'linear-gradient(135deg, hsl(var(--accent-cyan) / 0.2), hsl(var(--accent-violet) / 0.2))',
              border: '1px solid hsl(var(--accent-cyan) / 0.5)',
              color: 'hsl(var(--accent-cyan))',
            }}
          >
            <Home className="w-4 h-4" /> Dashboard
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
