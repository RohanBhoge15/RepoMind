'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Scale, MessageCircle, FileText, Gavel } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import LabShell from '../_components/LabShell';

interface Turn {
  speaker: 'Pro' | 'Con' | 'Judge';
  model: string;
  text: string;
}

const SAMPLE_QUESTIONS = [
  'Should we migrate from Postgres to a SQLite + LiteFS setup for this app?',
  'Adopt tRPC for the frontend/backend boundary, or keep REST + axios?',
  'Move from Tailwind to vanilla-extract for component styling?',
];

function runDebate(topic: string): { turns: Turn[]; adr: { title: string; status: string; context: string; decision: string; consequences: string[] } } {
  const t = topic.toLowerCase();
  const turns: Turn[] = [
    {
      speaker: 'Pro',
      model: 'Sonnet-4.6',
      text: `Argument FOR: ${topic.replace(/\?$/, '')} simplifies the operational surface and removes a moving part. For a small team this is real ergonomic wins — less infra to learn, fewer connections to manage, easier local dev.`,
    },
    {
      speaker: 'Con',
      model: 'Opus-4.7',
      text: `Argument AGAINST: this trades a well-understood, scalable tool for one with sharper edges at the boundaries we care about. If the system grows, the migration cost back to a heavier solution is non-trivial and easy to underestimate at the decision point.`,
    },
    {
      speaker: 'Pro',
      model: 'Sonnet-4.6',
      text: `Rebuttal: scaling concerns are speculative. We can revisit if traffic or schema complexity actually warrants it. Optimizing for hypothetical future load is exactly the trap to avoid.`,
    },
    {
      speaker: 'Con',
      model: 'Opus-4.7',
      text: `Counter-rebuttal: agreed it's speculative — but the cost asymmetry isn't. Reverting later is expensive in a way that adopting later is not. The default should be the more capable option until we have data suggesting it's overkill.`,
    },
    {
      speaker: 'Judge',
      model: 'Haiku-4.5',
      text: `Both sides have merit. The decision hinges on (a) current scale, (b) team familiarity, (c) revertibility. Recommend a time-boxed spike on a representative workload before committing.`,
    },
  ];
  const adr = {
    title: `ADR: ${topic}`,
    status: 'Proposed',
    context: `Team is evaluating: ${topic} Current state has tradeoffs around operational cost, learning curve, and future flexibility. Decision must be revisitable within one quarter without major rework.`,
    decision: t.includes('postgres')
      ? 'Defer migration. Run a 2-week spike against production-shaped data before committing either way.'
      : t.includes('trpc')
        ? 'Keep REST. Reconsider once frontend and backend share a Node runtime, which we do not today.'
        : 'Adopt incrementally on one new component, evaluate after 30 days against the existing approach.',
    consequences: [
      'We will commit to a date-bound re-evaluation rather than letting the question linger.',
      'The decision is reversible — we are deliberately not making it permanent.',
      'Owner: TBD. Re-eval: 30 days from acceptance.',
    ],
  };
  return { turns, adr };
}

export default function DebatePage() {
  const [topic, setTopic] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ReturnType<typeof runDebate> | null>(null);
  const [step, setStep] = useState(0);

  const start = (t?: string) => {
    const q = t ?? topic;
    if (!q.trim()) return;
    setTopic(q);
    setRunning(true);
    setResult(null);
    setStep(0);
    const r = runDebate(q);
    setResult(r);
    let i = 0;
    const tick = () => {
      i++;
      setStep(i);
      if (i < r.turns.length) {
        setTimeout(tick, 700);
      } else {
        setRunning(false);
      }
    };
    setTimeout(tick, 400);
  };

  const ROLE_COLOR: Record<Turn['speaker'], string> = {
    Pro: 'hsl(var(--accent-cyan))',
    Con: 'hsl(var(--accent-pink))',
    Judge: 'hsl(var(--accent-violet))',
  };

  return (
    <LabShell
      title="LLM Debate"
      subtitle="Two models argue both sides. A third writes the verdict as an ADR."
      icon={<Scale className="h-5 w-5 text-[hsl(var(--accent-pink))]" />}
      accent="hsl(var(--accent-pink))"
    >
      <Card padding="lg" className="mb-6">
        <label className="text-xs uppercase tracking-wider text-[var(--text-muted)]">Decision in question</label>
        <textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. Should we adopt server components for the dashboard?"
          className="mt-2 min-h-[80px] w-full resize-y rounded-lg border border-[var(--hairline)] bg-[var(--surface-2)] p-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-pink)]"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {SAMPLE_QUESTIONS.map((s, i) => (
            <button
              key={i}
              onClick={() => start(s)}
              className="rounded-full border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-1 text-[11px] text-[var(--text-secondary)] hover:border-[var(--accent-pink)] hover:text-[var(--text-primary)]"
            >
              {s}
            </button>
          ))}
        </div>
        <div className="mt-3 flex justify-end">
          <Button onClick={() => start()} disabled={running}>
            <Gavel className="mr-2 h-4 w-4" />
            {running ? 'Debating…' : 'Start debate'}
          </Button>
        </div>
      </Card>

      {result && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card padding="lg">
            <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--text-muted)]">
              <MessageCircle className="h-3.5 w-3.5" /> Transcript
            </div>
            <ul className="space-y-3">
              <AnimatePresence>
                {result.turns.slice(0, step).map((t, i) => (
                  <motion.li
                    key={i}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-[var(--hairline)] bg-[var(--surface-2)] p-3"
                    style={{ borderLeft: `3px solid ${ROLE_COLOR[t.speaker]}` }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold" style={{ color: ROLE_COLOR[t.speaker] }}>
                        {t.speaker}
                      </span>
                      <span className="rounded bg-[var(--surface-3)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
                        {t.model}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-secondary)]">{t.text}</p>
                  </motion.li>
                ))}
              </AnimatePresence>
              {running && (
                <li className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent-pink)]" />
                  Next speaker drafting…
                </li>
              )}
            </ul>
          </Card>

          <Card padding="lg">
            <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--text-muted)]">
              <FileText className="h-3.5 w-3.5" /> Generated ADR
            </div>
            {step >= result.turns.length ? (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                <div className="font-semibold text-[var(--text-primary)]">{result.adr.title}</div>
                <span className="mt-1 inline-block rounded-full bg-[var(--warning)]/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--warning)]">
                  {result.adr.status}
                </span>
                <div className="mt-4 space-y-3 text-sm">
                  <Section label="Context" text={result.adr.context} />
                  <Section label="Decision" text={result.adr.decision} />
                  <div>
                    <div className="text-xs uppercase tracking-wider text-[var(--text-muted)]">Consequences</div>
                    <ul className="mt-1 space-y-1 text-[var(--text-secondary)]">
                      {result.adr.consequences.map((c, i) => <li key={i}>· {c}</li>)}
                    </ul>
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="text-xs text-[var(--text-muted)]">ADR appears once the judge delivers the verdict…</div>
            )}
          </Card>
        </div>
      )}
    </LabShell>
  );
}

function Section({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 text-[var(--text-secondary)]">{text}</div>
    </div>
  );
}
