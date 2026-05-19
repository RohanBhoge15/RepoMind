'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Building2,
  GitBranch,
  Map,
  ShieldCheck,
  BookOpen,
  FlaskRound,
  Brain,
  Scale,
  Users,
  Radar,
  Activity,
  Search,
  Beaker,
  StickyNote,
  KeyRound,
  PackageSearch,
  Copy,
  Gauge,
  FlaskConical,
  Dna,
  CircuitBoard,
} from 'lucide-react';
import Card from '@/components/ui/Card';

interface LabFeature {
  slug: string;
  title: string;
  blurb: string;
  icon: any;
  group: string;
  accent: string;
}

const FEATURES: LabFeature[] = [
  { slug: 'city', title: 'Code City', blurb: 'Software as a 3D cityscape — buildings sized by code, districts by package.', icon: Building2, group: 'Visualization', accent: 'cyan' },
  { slug: 'sankey', title: 'Flow Sankey', blurb: 'Data and control flow as streaming rivers between modules.', icon: GitBranch, group: 'Visualization', accent: 'violet' },
  { slug: 'map', title: 'Semantic Map', blurb: 'Google-Maps-for-code: zoom from continents to street view.', icon: Map, group: 'Visualization', accent: 'blue' },
  { slug: 'dna', title: 'Git DNA', blurb: 'Animated double-helix timeline — every file\'s lifeline of churn and growth.', icon: Dna, group: 'Visualization', accent: 'pink' },
  { slug: 'chord', title: 'Chord Map', blurb: 'Interactive dependency chord — bezier ties, cluster arcs, cycle detection.', icon: CircuitBoard, group: 'Visualization', accent: 'violet' },
  { slug: 'reviewer', title: 'AI Reviewer', blurb: 'Heat-mapped review with letter-grade overlays per file.', icon: ShieldCheck, group: 'AI', accent: 'pink' },
  { slug: 'eli5', title: 'ELI-N Docs', blurb: 'Adaptive explanations — 5-year-old to staff engineer.', icon: BookOpen, group: 'AI', accent: 'cyan' },
  { slug: 'tests', title: 'AI Tests', blurb: 'Synthesize tests, mutate to verify, report drift.', icon: FlaskRound, group: 'AI', accent: 'violet' },
  { slug: 'plan', title: 'Intent Chat', blurb: 'Plan before code — chat that drafts a multi-file execution plan.', icon: Brain, group: 'AI', accent: 'blue' },
  { slug: 'debate', title: 'LLM Debate', blurb: 'Multiple models argue trade-offs, output a structured ADR.', icon: Scale, group: 'AI', accent: 'pink' },
  { slug: 'contributors', title: 'Influence Map', blurb: 'Who actually owns what — by recency, churn, and review.', icon: Users, group: 'Analytics', accent: 'cyan' },
  { slug: 'radar', title: 'Tech Radar', blurb: 'Auto-classify deps: Adopt / Trial / Assess / Hold.', icon: Radar, group: 'Analytics', accent: 'violet' },
  { slug: 'impact', title: 'Change Impact', blurb: 'Predict blast radius before you touch a file.', icon: Activity, group: 'Analytics', accent: 'blue' },
  { slug: 'search', title: 'NL Search', blurb: 'Ask in English — "where do we hash passwords?"', icon: Search, group: 'Interaction', accent: 'pink' },
  { slug: 'sandbox', title: 'What-If Sandbox', blurb: 'Simulate a refactor — see ripple before committing.', icon: Beaker, group: 'Interaction', accent: 'cyan' },
  { slug: 'annotations', title: 'Annotations', blurb: 'Pin notes, decisions, gotchas onto files and lines.', icon: StickyNote, group: 'Interaction', accent: 'violet' },
  { slug: 'secrets', title: 'Secret Radar', blurb: 'Detect leaked keys + show their reachable blast radius.', icon: KeyRound, group: 'Security', accent: 'pink' },
  { slug: 'sbom', title: 'SBOM + CVE', blurb: 'Dependency bill of materials with live CVE overlays.', icon: PackageSearch, group: 'Security', accent: 'blue' },
  { slug: 'clones', title: 'Clone Detection', blurb: 'Find near-duplicate code via embedding similarity.', icon: Copy, group: 'Novel', accent: 'cyan' },
  { slug: 'confidence', title: 'Confidence Map', blurb: "Where AI is sure — and where it's guessing.", icon: Gauge, group: 'Novel', accent: 'violet' },
];

const accentMap: Record<string, string> = {
  cyan: 'hsl(var(--accent-cyan))',
  violet: 'hsl(var(--accent-violet))',
  blue: 'hsl(var(--accent-blue))',
  pink: 'hsl(var(--accent-pink))',
};

export default function LabHubPage() {
  const params = useParams();
  const repoId = params.id as string;
  const groups = Array.from(new Set(FEATURES.map((f) => f.group)));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--hairline)] bg-[var(--surface-1)]/70 px-3 py-1 text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
            <FlaskConical className="h-3 w-3" /> Experimental
          </div>
          <h1 className="mt-4 text-3xl font-semibold text-[var(--text-primary)]">The Lab</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--text-secondary)]">
            Eighteen new ways to see, query, and reason about your repository. Click anything — it's a playground.
          </p>
        </motion.div>

        {groups.map((group) => (
          <section key={group} className="mb-12">
            <div className="mb-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-[var(--hairline)]" />
              <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                {group}
              </span>
              <div className="h-px flex-1 bg-[var(--hairline)]" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.filter((f) => f.group === group).map((f, i) => {
                const Icon = f.icon;
                const accent = accentMap[f.accent];
                return (
                  <motion.div
                    key={f.slug}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                  >
                    <Link href={`/repo/${repoId}/lab/${f.slug}`}>
                      <Card padding="lg" className="group h-full">
                        <div
                          className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--hairline)] transition-all group-hover:scale-110"
                          style={{
                            background: `linear-gradient(135deg, ${accent}25, transparent)`,
                            boxShadow: `0 0 18px -8px ${accent}`,
                          }}
                        >
                          <Icon className="h-5 w-5" style={{ color: accent }} />
                        </div>
                        <div className="font-medium text-[var(--text-primary)]">{f.title}</div>
                        <div className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
                          {f.blurb}
                        </div>
                      </Card>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
