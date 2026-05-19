'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, FlaskConical } from 'lucide-react';

interface Props {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  accent?: string;
  children: React.ReactNode;
  scroll?: boolean;
}

export default function LabShell({ title, subtitle, icon, accent = 'hsl(var(--accent-cyan))', children, scroll = true }: Props) {
  const params = useParams();
  const repoId = params.id as string;
  return (
    <div className={`h-full ${scroll ? 'overflow-y-auto' : 'overflow-hidden'}`}>
      <div className="mx-auto max-w-7xl px-6 py-8">
        <Link
          href={`/repo/${repoId}/lab`}
          className="mb-6 inline-flex items-center gap-2 text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
        >
          <ArrowLeft className="h-3 w-3" /> Back to Lab
        </Link>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex items-start gap-4"
        >
          <div
            className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--hairline)]"
            style={{
              background: `linear-gradient(135deg, ${accent}30, transparent)`,
              boxShadow: `0 0 24px -10px ${accent}`,
            }}
          >
            {icon ?? <FlaskConical className="h-5 w-5" style={{ color: accent }} />}
          </div>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Lab feature</div>
            <h1 className="text-2xl font-semibold text-[var(--text-primary)]">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-[var(--text-secondary)]">{subtitle}</p>}
          </div>
        </motion.div>
        {children}
      </div>
    </div>
  );
}
