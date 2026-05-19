'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useParams, useRouter } from 'next/navigation';
import { FlaskConical, RotateCcw, ArrowLeft } from 'lucide-react';

export default function LabError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  const params = useParams();
  const repoId = params?.id as string | undefined;

  useEffect(() => {
    console.error('[LabError]', error);
  }, [error]);

  return (
    <div className="min-h-[50vh] flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-2xl border border-[hsl(var(--accent-violet)/0.4)] bg-[hsl(var(--surface-1)/0.9)] p-6 text-center"
        style={{ boxShadow: '0 20px 50px hsl(0 0% 0% / 0.3)' }}
      >
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-3 bg-[hsl(var(--accent-violet)/0.15)] text-[hsl(var(--accent-violet))]">
          <FlaskConical className="w-5 h-5" />
        </div>
        <div className="mono text-[10px] uppercase tracking-widest text-[hsl(var(--accent-violet))] mb-1">Lab experiment crashed</div>
        <h2 className="text-base font-semibold text-[hsl(var(--text-primary))] mb-2">This experiment hit a snag</h2>
        <p className="text-sm text-[hsl(var(--text-secondary))] mb-4">
          Some lab features rely on derived data that may be sparse for very small repos. Try another experiment, or retry.
        </p>
        {error.message && (
          <pre className="mono text-[10px] text-left text-[hsl(var(--text-muted))] bg-[hsl(var(--surface-2))] rounded-lg p-2 mb-3 overflow-auto max-h-20">
            {error.message}
          </pre>
        )}
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => router.push(repoId ? `/repo/${repoId}/lab` : '/dashboard')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-[hsl(var(--text-secondary))] border border-[hsl(var(--hairline))] hover:bg-[hsl(var(--surface-2))]"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Lab home
          </button>
          <button
            onClick={reset}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
            style={{
              background: 'hsl(var(--accent-violet) / 0.2)',
              border: '1px solid hsl(var(--accent-violet) / 0.5)',
              color: 'hsl(var(--accent-violet))',
            }}
          >
            <RotateCcw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      </motion.div>
    </div>
  );
}
