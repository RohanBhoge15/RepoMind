/**
 * Sign-in route — redirects to landing (GitHub OAuth) or dashboard.
 */
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { motion } from 'framer-motion';
import { Terminal } from 'lucide-react';

export default function SignIn() {
  const router = useRouter();
  const { status } = useSession();

  useEffect(() => {
    if (status === 'authenticated') {
      router.push('/dashboard');
    } else if (status === 'unauthenticated') {
      router.push('/');
    }
  }, [status, router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="text-center space-y-5"
      >
        <div className="relative w-14 h-14 mx-auto">
          <motion.div
            className="absolute inset-0 rounded-2xl bg-[linear-gradient(135deg,hsl(var(--accent-cyan)),hsl(var(--accent-violet)))] shadow-[0_0_30px_-4px_hsl(var(--accent-cyan)/0.7)]"
            animate={{ rotate: [0, 360] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
          />
          <div className="absolute inset-[2px] rounded-2xl bg-[hsl(var(--bg-base))] flex items-center justify-center">
            <Terminal className="w-6 h-6 text-[hsl(var(--accent-cyan))]" />
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-[hsl(var(--text-primary))] font-medium">Signing you in</p>
          <p className="mono text-[12px] text-[hsl(var(--text-muted))]">redirecting…</p>
        </div>
      </motion.div>
    </div>
  );
}
