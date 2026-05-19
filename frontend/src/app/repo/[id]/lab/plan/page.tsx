'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Sparkles, FileEdit, FilePlus, FileMinus, ArrowRight, CheckCircle2 } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import LabShell from '../_components/LabShell';

interface PlanStep {
  id: string;
  action: 'create' | 'edit' | 'delete';
  file: string;
  why: string;
  estimate: string;
}

interface Plan {
  intent: string;
  goal: string;
  questions: string[];
  steps: PlanStep[];
  risks: string[];
  acceptance: string[];
}

function generatePlan(intent: string): Plan {
  const lower = intent.toLowerCase();
  const isAuth = /auth|login|sign[\s-]?in|password/.test(lower);
  const isAPI = /api|endpoint|route|fastapi/.test(lower);
  const isUI = /ui|component|page|button|form/.test(lower);

  let goal = `Implement: "${intent}"`;
  const questions: string[] = [];
  const steps: PlanStep[] = [];
  const risks: string[] = [];
  const acceptance: string[] = [];

  if (isAuth) {
    questions.push('Are you targeting OAuth, JWT, or session cookies?');
    questions.push('Does this need to integrate with the existing GitHub auth flow?');
    steps.push(
      { id: '1', action: 'edit', file: 'backend/auth.py', why: 'Add the new auth strategy alongside existing handlers.', estimate: '~45 min' },
      { id: '2', action: 'create', file: 'backend/routers/auth_router.py', why: 'Expose login/refresh endpoints separately from existing routes.', estimate: '~30 min' },
      { id: '3', action: 'edit', file: 'frontend/src/app/auth/signin/page.tsx', why: 'Surface the new option in the sign-in UI.', estimate: '~20 min' },
      { id: '4', action: 'create', file: 'backend/tests/test_auth.py', why: 'Cover happy path + token expiry + invalid credentials.', estimate: '~30 min' },
    );
    risks.push('Token storage location must match SameSite/HTTPS constraints.');
    risks.push('Existing sessions could be invalidated if cookie names change.');
    acceptance.push('Sign-in with new method returns a valid token.');
    acceptance.push('Existing GitHub sign-in still works unchanged.');
  } else if (isAPI) {
    questions.push('What\'s the resource shape — DB-backed or computed on the fly?');
    questions.push('Should responses be paginated?');
    steps.push(
      { id: '1', action: 'edit', file: 'backend/schemas.py', why: 'Add request/response Pydantic models.', estimate: '~15 min' },
      { id: '2', action: 'create', file: 'backend/routers/<new>_router.py', why: 'Define endpoint, validation, and DB binding.', estimate: '~40 min' },
      { id: '3', action: 'edit', file: 'backend/main.py', why: 'Register the new router.', estimate: '~5 min' },
      { id: '4', action: 'edit', file: 'frontend/src/lib/api.ts', why: 'Add a typed client method.', estimate: '~15 min' },
    );
    risks.push('New endpoint must respect auth middleware.');
    acceptance.push('Endpoint returns 200 on valid request and 4xx on invalid.');
  } else if (isUI) {
    questions.push('Where should this live in the navigation?');
    questions.push('Any required loading / empty / error states?');
    steps.push(
      { id: '1', action: 'create', file: 'frontend/src/components/ui/<Component>.tsx', why: 'Build the reusable primitive with motion + tokens.', estimate: '~35 min' },
      { id: '2', action: 'edit', file: 'frontend/src/app/<target>/page.tsx', why: 'Wire the component into the target page.', estimate: '~20 min' },
    );
    acceptance.push('Component renders in light + dark themes.');
    acceptance.push('Keyboard + screen-reader behavior verified.');
  } else {
    questions.push('Which directory is the primary surface for this change?');
    questions.push('Any backwards-compatibility constraints?');
    steps.push(
      { id: '1', action: 'edit', file: '<inferred target file>', why: 'Make the core change inline with existing patterns.', estimate: '~30 min' },
      { id: '2', action: 'create', file: '<inferred test file>', why: 'Lock the new behavior with a focused test.', estimate: '~20 min' },
    );
    acceptance.push('Behavior described in the intent works end-to-end.');
  }

  if (!risks.length) risks.push('No obvious risks — but verify there are no consumers outside this repo.');

  return { intent, goal, questions, steps, risks, acceptance };
}

const ICON: Record<PlanStep['action'], any> = { create: FilePlus, edit: FileEdit, delete: FileMinus };
const TONE: Record<PlanStep['action'], string> = {
  create: 'text-[var(--success)]',
  edit: 'text-[var(--accent-cyan)]',
  delete: 'text-[var(--danger)]',
};

export default function PlanPage() {
  const [intent, setIntent] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [thinking, setThinking] = useState(false);

  const submit = () => {
    if (!intent.trim()) return;
    setThinking(true);
    setPlan(null);
    setTimeout(() => {
      setPlan(generatePlan(intent));
      setThinking(false);
    }, 600);
  };

  return (
    <LabShell
      title="Intent Chat"
      subtitle="Describe what you want — get a multi-file execution plan before any code is written."
      icon={<Brain className="h-5 w-5 text-[hsl(var(--accent-blue))]" />}
      accent="hsl(var(--accent-blue))"
    >
      <Card padding="lg" className="mb-6">
        <label className="text-xs uppercase tracking-wider text-[var(--text-muted)]">Your intent</label>
        <textarea
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          placeholder="e.g. add magic-link login that emails a one-time token and signs the user in"
          className="mt-2 min-h-[100px] w-full resize-y rounded-lg border border-[var(--hairline)] bg-[var(--surface-2)] p-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-blue)]"
        />
        <div className="mt-3 flex items-center justify-between">
          <div className="text-[11px] text-[var(--text-muted)]">No code is touched until you approve.</div>
          <Button onClick={submit} disabled={thinking}>
            <Sparkles className="mr-2 h-4 w-4" />
            {thinking ? 'Thinking…' : 'Draft plan'}
          </Button>
        </div>
      </Card>

      <AnimatePresence>
        {plan && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <Card padding="lg">
              <div className="text-xs uppercase tracking-wider text-[var(--text-muted)]">Goal</div>
              <div className="mt-1 text-sm text-[var(--text-primary)]">{plan.goal}</div>
            </Card>

            {plan.questions.length > 0 && (
              <Card padding="lg">
                <div className="mb-2 text-xs uppercase tracking-wider text-[var(--text-muted)]">Clarifying questions</div>
                <ul className="space-y-1.5 text-sm text-[var(--text-secondary)]">
                  {plan.questions.map((q, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <ArrowRight className="mt-1 h-3 w-3 shrink-0 text-[var(--accent-blue)]" />
                      <span>{q}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <Card padding="lg">
              <div className="mb-3 text-xs uppercase tracking-wider text-[var(--text-muted)]">Execution plan</div>
              <ol className="space-y-2">
                {plan.steps.map((s, i) => {
                  const Icon = ICON[s.action];
                  return (
                    <motion.li
                      key={s.id}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="flex gap-3 rounded-lg border border-[var(--hairline)] bg-[var(--surface-2)] p-3"
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--surface-3)] text-xs font-bold text-[var(--text-secondary)]">
                        {i + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Icon className={`h-3.5 w-3.5 ${TONE[s.action]}`} />
                          <span className="font-mono text-xs text-[var(--text-primary)]">{s.file}</span>
                          <span className="ml-auto text-[10px] text-[var(--text-muted)]">{s.estimate}</span>
                        </div>
                        <div className="mt-1 text-xs text-[var(--text-secondary)]">{s.why}</div>
                      </div>
                    </motion.li>
                  );
                })}
              </ol>
            </Card>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Card padding="lg">
                <div className="mb-2 text-xs uppercase tracking-wider text-[var(--text-muted)]">Risks</div>
                <ul className="space-y-1.5 text-xs text-[var(--text-secondary)]">
                  {plan.risks.map((r, i) => <li key={i}>· {r}</li>)}
                </ul>
              </Card>
              <Card padding="lg">
                <div className="mb-2 text-xs uppercase tracking-wider text-[var(--text-muted)]">Done when</div>
                <ul className="space-y-1.5 text-xs text-[var(--text-secondary)]">
                  {plan.acceptance.map((a, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--success)]" />
                      <span>{a}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </LabShell>
  );
}
