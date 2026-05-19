/**
 * Empty state for a freshly-signed-in user with no repositories.
 * Welcoming + feature-promoting + import CTA.
 */
'use client';

import { motion } from 'framer-motion';
import {
  Plus,
  Sparkles,
  Network,
  MessageSquare,
  FlaskConical,
  ShieldCheck,
  Zap,
  ArrowRight,
} from 'lucide-react';

interface Props {
  onImport: () => void;
}

const FEATURES = [
  { icon: Network, title: 'Interactive constellation', sub: 'Every file as a star, every import an edge', accent: 'cyan' },
  { icon: MessageSquare, title: 'Chat with code', sub: 'Ask in English — answers cite real files', accent: 'violet' },
  { icon: FlaskConical, title: '19 lab experiments', sub: 'Code City, DNA, ELI-N docs, clone detection…', accent: 'pink' },
  { icon: ShieldCheck, title: 'Security & quality', sub: 'CVE, secrets, complexity, doc coverage', accent: 'blue' },
];

export default function EmptyDashboard({ onImport }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative overflow-hidden rounded-3xl border p-8 sm:p-12 mt-4"
      style={{
        background:
          'linear-gradient(135deg, hsl(var(--surface-1) / 0.85) 0%, hsl(var(--surface-2) / 0.6) 100%)',
        borderColor: 'hsl(var(--hairline))',
      }}
    >
      {/* ambient grid + glow */}
      <div
        className="absolute inset-0 opacity-30 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(to right, hsl(var(--hairline) / 0.3) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--hairline) / 0.3) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          maskImage: 'radial-gradient(ellipse at top left, black, transparent 70%)',
        }}
      />
      <motion.div
        className="absolute -top-32 -right-32 w-80 h-80 rounded-full blur-3xl"
        style={{ background: 'hsl(var(--accent-violet) / 0.18)' }}
        animate={{ scale: [1, 1.1, 1], opacity: [0.6, 0.9, 0.6] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -bottom-32 -left-32 w-80 h-80 rounded-full blur-3xl"
        style={{ background: 'hsl(var(--accent-cyan) / 0.16)' }}
        animate={{ scale: [1.1, 1, 1.1], opacity: [0.5, 0.85, 0.5] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div className="relative grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-10 items-center">
        <div>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1 mb-4"
            style={{
              background: 'hsl(var(--accent-cyan) / 0.1)',
              borderColor: 'hsl(var(--accent-cyan) / 0.3)',
            }}
          >
            <Sparkles className="w-3 h-3 text-[hsl(var(--accent-cyan))]" />
            <span className="mono text-[10px] uppercase tracking-widest text-[hsl(var(--accent-cyan))]">
              Welcome to RepoMind
            </span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="text-3xl sm:text-4xl font-bold text-[hsl(var(--text-primary))] tracking-tight leading-tight"
          >
            Let's index your first
            <br />
            <span
              className="inline-block bg-clip-text text-transparent"
              style={{
                backgroundImage:
                  'linear-gradient(135deg, hsl(var(--accent-cyan)), hsl(var(--accent-violet)), hsl(var(--accent-pink)))',
              }}
            >
              repository
            </span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-3 text-[15px] text-[hsl(var(--text-secondary))] max-w-lg leading-relaxed"
          >
            Paste a GitHub URL or pick from your connected account. We'll clone, parse, chunk,
            embed, and document it — then unlock the lab.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="mt-6 flex flex-wrap gap-3"
          >
            <button
              onClick={onImport}
              className="group inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
              style={{
                background:
                  'linear-gradient(135deg, hsl(var(--accent-cyan)), hsl(var(--accent-violet)))',
                color: 'hsl(var(--text-inverse))',
                boxShadow:
                  '0 8px 24px hsl(var(--accent-violet) / 0.35), inset 0 1px 0 hsl(0 0% 100% / 0.2)',
              }}
            >
              <Plus className="w-4 h-4" />
              Import your first repo
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </button>
            <div className="inline-flex items-center gap-2 mono text-[11px] uppercase tracking-widest text-[hsl(var(--text-muted))] px-3 py-2.5">
              <kbd className="px-1.5 py-0.5 rounded border border-[hsl(var(--hairline))] text-[10px]">
                ⌘ K
              </kbd>
              <span>opens command palette</span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3"
          >
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 + i * 0.06 }}
                className="flex items-start gap-3 p-3 rounded-xl border"
                style={{
                  background: 'hsl(var(--surface-1) / 0.5)',
                  borderColor: 'hsl(var(--hairline))',
                }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{
                    background: `hsl(var(--accent-${f.accent}) / 0.15)`,
                    color: `hsl(var(--accent-${f.accent}))`,
                    border: `1px solid hsl(var(--accent-${f.accent}) / 0.3)`,
                  }}
                >
                  <f.icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-[hsl(var(--text-primary))] leading-tight">
                    {f.title}
                  </div>
                  <div className="text-[11.5px] text-[hsl(var(--text-secondary))] mt-0.5 leading-snug">
                    {f.sub}
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* Decorative pipeline preview */}
        <motion.div
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="hidden lg:block"
        >
          <div
            className="relative rounded-2xl border p-5 overflow-hidden"
            style={{
              background: 'linear-gradient(180deg, hsl(var(--surface-2) / 0.7), hsl(var(--surface-1) / 0.7))',
              borderColor: 'hsl(var(--hairline))',
            }}
          >
            <div className="mono text-[9px] uppercase tracking-widest text-[hsl(var(--text-muted))] mb-3">
              What happens on import
            </div>
            {['Clone', 'Parse', 'Chunk', 'Embed', 'Document'].map((step, i) => (
              <div key={step} className="flex items-center gap-2.5 mb-2.5 last:mb-0">
                <motion.div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold mono"
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.5 + i * 0.1 }}
                  style={{
                    background: 'hsl(var(--accent-cyan) / 0.18)',
                    color: 'hsl(var(--accent-cyan))',
                    border: '1px solid hsl(var(--accent-cyan) / 0.4)',
                  }}
                >
                  {i + 1}
                </motion.div>
                <div className="flex-1">
                  <div className="text-[12px] font-semibold text-[hsl(var(--text-primary))]">{step}</div>
                </div>
                <motion.div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: 'hsl(var(--accent-cyan))' }}
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.18 }}
                />
              </div>
            ))}
            <div className="mt-4 pt-3 border-t border-[hsl(var(--hairline))]">
              <div className="flex items-center gap-1.5 text-[11px] text-[hsl(var(--text-secondary))]">
                <Zap className="w-3 h-3 text-[hsl(var(--accent-violet))]" />
                Usually takes 30s–2min depending on repo size.
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
