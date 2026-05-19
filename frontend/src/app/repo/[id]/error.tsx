/**
 * Repo-segment error boundary — keeps the rest of the app alive when a single
 * tab (lab, overview, constellation) crashes.
 */
'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { AlertTriangle, RotateCcw, ArrowLeft } from 'lucide-react';

export default function RepoError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  const params = useParams();
  const repoId = params?.id as string | undefined;

  useEffect(() => {
    console.error('[RepoError]', error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6 py-12">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
        className="w-full max-w-md rounded-2xl border p-6 text-center"
        style={{
          background: 'linear-gradient(180deg, hsl(var(--surface-1) / 0.92), hsl(var(--surface-1) / 0.85))',
          borderColor: 'hsl(var(--danger) / 0.3)',
          boxShadow: '0 20px 50px hsl(0 0% 0% / 0.35), 0 0 0 1px hsl(var(--danger) / 0.12)',
        }}
      >
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4 bg-[hsl(var(--danger)/0.15)] text-[hsl(var(--danger))]">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div className="mono text-[10px] uppercase tracking-widest text-[hsl(var(--danger))] mb-1">
          This view crashed
        </div>
        <h2 className="text-lg font-semibold text-[hsl(var(--text-primary))] mb-2">
          Couldn’t render this tab
        </h2>
        <p className="text-sm text-[hsl(var(--text-secondary))] mb-4">
          The rest of the app is still working. Try retrying — if it keeps failing, switch tabs or re-index the repo.
        </p>
        {error.message && (
          <pre className="mono text-[10px] text-left text-[hsl(var(--text-muted))] bg-[hsl(var(--surface-2))] border border-[hsl(var(--hairline))] rounded-lg p-2.5 mb-4 overflow-auto max-h-24 whitespace-pre-wrap">
            {error.message}
          </pre>
        )}
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => router.push(repoId ? `/repo/${repoId}/overview` : '/dashboard')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[hsl(var(--text-secondary))] border border-[hsl(var(--hairline))] hover:bg-[hsl(var(--surface-2))]"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Overview
          </button>
          <button
            onClick={reset}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{
              background: 'hsl(var(--accent-cyan) / 0.18)',
              border: '1px solid hsl(var(--accent-cyan) / 0.5)',
              color: 'hsl(var(--accent-cyan))',
            }}
          >
            <RotateCcw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      </motion.div>
    </div>
  );
}
