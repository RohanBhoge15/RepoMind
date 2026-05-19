/**
 * Landing page — dark glassmorphism with neon accents.
 */
'use client';

import { useSession, signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/contexts/ThemeContext';
import { motion } from 'framer-motion';
import {
  Github,
  MessageSquare,
  Search,
  BookOpen,
  Moon,
  Sun,
  ArrowRight,
  Sparkles,
  Terminal,
  Database,
  Brain,
  Rocket,
  Lock,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
};

export default function Home() {
  const { status } = useSession();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();

  const handleGetStarted = () => {
    if (status === 'authenticated') {
      router.push('/dashboard');
    } else {
      signIn('github', { callbackUrl: '/dashboard' });
    }
  };

  return (
    <div className="min-h-screen relative">
      {/* Header */}
      <motion.header
        initial={{ y: -24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-[hsl(var(--bg-base)/0.6)] border-b border-[hsl(var(--hairline))]"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <motion.div className="flex items-center gap-2.5" whileHover={{ scale: 1.02 }}>
              <div className="relative">
                <div className="w-9 h-9 rounded-xl bg-[linear-gradient(135deg,hsl(var(--accent-cyan)),hsl(var(--accent-violet)))] flex items-center justify-center shadow-[0_0_20px_-4px_hsl(var(--accent-cyan)/0.6)]">
                  <Terminal className="w-5 h-5 text-white" />
                </div>
              </div>
              <span className="text-lg font-bold tracking-tight text-[hsl(var(--text-primary))]">
                RepoMind
              </span>
              <span className="mono text-[10px] uppercase tracking-widest text-[hsl(var(--accent-cyan))] border border-[hsl(var(--accent-cyan)/0.3)] bg-[hsl(var(--accent-cyan)/0.08)] rounded px-1.5 py-0.5 hidden sm:inline">
                AI
              </span>
            </motion.div>

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

              <Button
                onClick={handleGetStarted}
                variant="gradient"
                size="md"
                icon={status === 'authenticated' ? <ArrowRight className="w-4 h-4" /> : <Github className="w-4 h-4" />}
                iconPosition="right"
              >
                {status === 'authenticated' ? 'Dashboard' : 'Sign In'}
              </Button>
            </div>
          </div>
        </div>
      </motion.header>

      {/* Hero */}
      <section className="relative pt-40 pb-28 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto text-center space-y-8">
          <motion.div
            initial="hidden"
            animate="show"
            variants={fadeUp}
            transition={{ duration: 0.5 }}
            className="inline-flex"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-medium glass border-[hsl(var(--accent-cyan)/0.3)] text-[hsl(var(--text-secondary))]">
              <Sparkles className="w-3.5 h-3.5 text-[hsl(var(--accent-cyan))]" />
              AI-powered code intelligence
            </div>
          </motion.div>

          <motion.h1
            initial="hidden"
            animate="show"
            variants={fadeUp}
            transition={{ duration: 0.6, delay: 0.08 }}
            className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-[hsl(var(--text-primary))] leading-[1.05]"
          >
            Explore your codebase
            <br />
            <span className="text-gradient-flow">at the speed of thought</span>
          </motion.h1>

          <motion.p
            initial="hidden"
            animate="show"
            variants={fadeUp}
            transition={{ duration: 0.6, delay: 0.16 }}
            className="text-lg sm:text-xl text-[hsl(var(--text-secondary))] max-w-2xl mx-auto leading-relaxed"
          >
            Index any GitHub repo, chat with it, search by meaning, and generate docs — all in one
            quiet, fast workspace.
          </motion.p>

          <motion.div
            initial="hidden"
            animate="show"
            variants={fadeUp}
            transition={{ duration: 0.6, delay: 0.24 }}
            className="flex flex-col sm:flex-row gap-3 justify-center items-center pt-2"
          >
            <Button
              onClick={handleGetStarted}
              variant="gradient"
              size="lg"
              icon={<Github className="w-4 h-4" />}
            >
              {status === 'authenticated' ? 'Go to dashboard' : 'Continue with GitHub'}
            </Button>
            <Button
              variant="ghost"
              size="lg"
              icon={<ArrowRight className="w-4 h-4" />}
              iconPosition="right"
              onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
            >
              See what it does
            </Button>
          </motion.div>

          <motion.div
            initial="hidden"
            animate="show"
            variants={fadeUp}
            transition={{ duration: 0.6, delay: 0.32 }}
            className="pt-16 grid grid-cols-3 gap-4 max-w-xl mx-auto"
          >
            {[
              { label: 'Models', value: '8+' },
              { label: 'Analysis', value: 'Real-time' },
              { label: 'Languages', value: 'All' },
            ].map((stat) => (
              <div
                key={stat.label}
                className="glass rounded-xl py-4 px-3 text-center"
              >
                <div className="text-xl font-semibold text-gradient mb-0.5">{stat.value}</div>
                <div className="mono text-[10px] uppercase tracking-widest text-[hsl(var(--text-muted))]">
                  {stat.label}
                </div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-4 sm:px-6 lg:px-8 relative">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-100px' }}
            variants={fadeUp}
            transition={{ duration: 0.6 }}
            className="text-center mb-14 space-y-3"
          >
            <div className="mono text-[10px] uppercase tracking-widest text-[hsl(var(--accent-cyan))]">
              Features
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-[hsl(var(--text-primary))] tracking-tight">
              Built for understanding code
            </h2>
            <p className="text-[hsl(var(--text-secondary))] max-w-xl mx-auto">
              Six tools that work together so you can answer any question about a repository in
              seconds.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                icon: Brain,
                title: 'AI code analysis',
                description: 'Deep semantic understanding of structure, intent, and edges.',
                accent: 'cyan',
              },
              {
                icon: MessageSquare,
                title: 'Chat with code',
                description: 'Context-aware Q&A grounded in the actual repository.',
                accent: 'violet',
              },
              {
                icon: Search,
                title: 'Semantic search',
                description: 'Find code by meaning. Embeddings, not just substrings.',
                accent: 'blue',
              },
              {
                icon: Lock,
                title: 'Security review',
                description: 'Surface vulnerabilities, unsafe patterns, and risky paths.',
                accent: 'pink',
              },
              {
                icon: BookOpen,
                title: 'Auto documentation',
                description: 'Architecture overviews and per-file docs, generated on demand.',
                accent: 'cyan',
              },
              {
                icon: Rocket,
                title: 'Fast indexing',
                description: 'Incremental, parallel indexing that scales to large repos.',
                accent: 'violet',
              },
            ].map((feature, i) => (
              <motion.div
                key={feature.title}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: '-50px' }}
                variants={fadeUp}
                transition={{ duration: 0.45, delay: i * 0.05 }}
              >
                <Card variant="default" hover padding="lg" className="h-full group">
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 border border-[hsl(var(--accent-${feature.accent})/0.3)] bg-[hsl(var(--accent-${feature.accent})/0.08)]`}
                  >
                    <feature.icon className={`w-5 h-5 text-[hsl(var(--accent-${feature.accent}))]`} />
                  </div>
                  <h3 className="text-base font-semibold text-[hsl(var(--text-primary))] mb-1.5 tracking-tight">
                    {feature.title}
                  </h3>
                  <p className="text-[14px] text-[hsl(var(--text-secondary))] leading-relaxed">
                    {feature.description}
                  </p>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 relative">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-100px' }}
            variants={fadeUp}
            transition={{ duration: 0.6 }}
            className="text-center mb-16 space-y-3"
          >
            <div className="mono text-[10px] uppercase tracking-widest text-[hsl(var(--accent-violet))]">
              Workflow
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-[hsl(var(--text-primary))] tracking-tight">
              Three steps to a queryable repo
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6 relative">
            <div
              aria-hidden
              className="hidden md:block absolute top-12 left-[16%] right-[16%] h-px bg-gradient-to-r from-transparent via-[hsl(var(--accent-cyan)/0.4)] to-transparent"
            />

            {[
              {
                icon: Github,
                step: '01',
                title: 'Connect',
                description: 'Sign in with GitHub and pick a repository.',
              },
              {
                icon: Database,
                step: '02',
                title: 'Index',
                description: 'We parse, embed, and graph every file.',
              },
              {
                icon: Sparkles,
                step: '03',
                title: 'Explore',
                description: 'Search, chat, and read auto-generated docs.',
              },
            ].map((step, i) => (
              <motion.div
                key={step.step}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: '-50px' }}
                variants={fadeUp}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="relative"
              >
                <Card variant="glass" padding="lg" hover className="text-center h-full group">
                  <div className="w-12 h-12 mx-auto rounded-xl flex items-center justify-center mb-4 bg-[linear-gradient(135deg,hsl(var(--accent-cyan)/0.15),hsl(var(--accent-violet)/0.15))] border border-[hsl(var(--hairline))] group-hover:border-[hsl(var(--accent-cyan)/0.4)] transition-colors">
                    <step.icon className="w-5 h-5 text-[hsl(var(--accent-cyan))]" />
                  </div>
                  <div className="mono text-[10px] uppercase tracking-widest text-[hsl(var(--text-muted))] mb-1">
                    Step {step.step}
                  </div>
                  <h3 className="text-base font-semibold text-[hsl(var(--text-primary))] mb-2 tracking-tight">
                    {step.title}
                  </h3>
                  <p className="text-[14px] text-[hsl(var(--text-secondary))]">{step.description}</p>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-100px' }}
          variants={fadeUp}
          transition={{ duration: 0.6 }}
          className="max-w-3xl mx-auto"
        >
          <Card variant="glass" padding="xl" className="text-center relative overflow-hidden">
            <div
              aria-hidden
              className="absolute inset-0 opacity-40 pointer-events-none"
              style={{
                background:
                  'radial-gradient(600px circle at 50% 0%, hsl(var(--accent-cyan) / 0.25), transparent 60%)',
              }}
            />
            <div className="relative space-y-6">
              <h2 className="text-3xl sm:text-4xl font-bold text-[hsl(var(--text-primary))] tracking-tight">
                Make your codebase answer back.
              </h2>
              <p className="text-[hsl(var(--text-secondary))] max-w-lg mx-auto">
                Free to try with your GitHub account. No credit card.
              </p>
              <div className="flex justify-center pt-2">
                <Button
                  onClick={handleGetStarted}
                  variant="gradient"
                  size="lg"
                  icon={<Github className="w-4 h-4" />}
                  iconPosition="left"
                >
                  {status === 'authenticated' ? 'Open dashboard' : 'Continue with GitHub'}
                </Button>
              </div>
            </div>
          </Card>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-4 sm:px-6 lg:px-8 border-t border-[hsl(var(--hairline))]">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[linear-gradient(135deg,hsl(var(--accent-cyan)),hsl(var(--accent-violet)))] flex items-center justify-center">
              <Terminal className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold text-[hsl(var(--text-primary))]">RepoMind</span>
          </div>
          <p className="text-[12px] text-[hsl(var(--text-muted))]">
            © 2026 RepoMind — AI-powered code intelligence
          </p>
          <div className="flex items-center gap-4 text-[12px] text-[hsl(var(--text-muted))]">
            <a href="#" className="hover:text-[hsl(var(--accent-cyan))] transition-colors">Privacy</a>
            <a href="#" className="hover:text-[hsl(var(--accent-cyan))] transition-colors">Terms</a>
            <a href="#" className="hover:text-[hsl(var(--accent-cyan))] transition-colors">Docs</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
