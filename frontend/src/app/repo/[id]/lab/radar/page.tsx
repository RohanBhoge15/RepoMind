'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Radar as RadarIcon } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { DependencyGraph, GraphNode } from '@/lib/types';
import Card from '@/components/ui/Card';
import LabShell from '../_components/LabShell';

type Ring = 'Adopt' | 'Trial' | 'Assess' | 'Hold';
type Quadrant = 'Languages' | 'Frameworks' | 'Tools' | 'Patterns';

interface Blip {
  name: string;
  ring: Ring;
  quadrant: Quadrant;
  usage: number;
}

const RING_RADIUS: Record<Ring, [number, number]> = {
  Adopt: [0, 80],
  Trial: [80, 140],
  Assess: [140, 195],
  Hold: [195, 240],
};

const RING_COLOR: Record<Ring, string> = {
  Adopt: '#34d399',
  Trial: '#7dd3fc',
  Assess: '#fbbf24',
  Hold: '#f43f5e',
};

const QUAD_ANGLE: Record<Quadrant, [number, number]> = {
  Languages: [Math.PI, Math.PI * 1.5],
  Frameworks: [Math.PI * 1.5, Math.PI * 2],
  Tools: [0, Math.PI * 0.5],
  Patterns: [Math.PI * 0.5, Math.PI],
};

function classifyExt(path: string): { name: string; quadrant: Quadrant } | null {
  if (/\.(ts|tsx)$/.test(path)) return { name: 'TypeScript', quadrant: 'Languages' };
  if (/\.(js|jsx)$/.test(path)) return { name: 'JavaScript', quadrant: 'Languages' };
  if (/\.py$/.test(path)) return { name: 'Python', quadrant: 'Languages' };
  if (/\.go$/.test(path)) return { name: 'Go', quadrant: 'Languages' };
  if (/\.rs$/.test(path)) return { name: 'Rust', quadrant: 'Languages' };
  if (/next\.config|app\/.*\/page\.tsx/.test(path)) return { name: 'Next.js', quadrant: 'Frameworks' };
  if (/fastapi|main\.py$/.test(path)) return { name: 'FastAPI', quadrant: 'Frameworks' };
  if (/tailwind|\.css$/.test(path)) return { name: 'Tailwind', quadrant: 'Frameworks' };
  if (/docker/i.test(path)) return { name: 'Docker', quadrant: 'Tools' };
  if (/nginx/i.test(path)) return { name: 'Nginx', quadrant: 'Tools' };
  if (/migrations|alembic/i.test(path)) return { name: 'Alembic', quadrant: 'Tools' };
  if (/test|spec/i.test(path)) return { name: 'Tests', quadrant: 'Patterns' };
  if (/router/i.test(path)) return { name: 'Routers', quadrant: 'Patterns' };
  if (/schema|model/i.test(path)) return { name: 'Schemas', quadrant: 'Patterns' };
  return null;
}

function classifyRing(name: string, usage: number, total: number): Ring {
  if (name === 'JavaScript') return 'Hold';
  const pct = (usage / Math.max(1, total)) * 100;
  if (pct >= 25) return 'Adopt';
  if (pct >= 10) return 'Trial';
  if (pct >= 3) return 'Assess';
  return 'Hold';
}

function deriveBlips(nodes: GraphNode[]): Blip[] {
  const counts = new Map<string, { quadrant: Quadrant; n: number }>();
  nodes.forEach((n) => {
    const c = classifyExt(n.path);
    if (!c) return;
    if (!counts.has(c.name)) counts.set(c.name, { quadrant: c.quadrant, n: 0 });
    counts.get(c.name)!.n++;
  });
  const total = nodes.length;
  return Array.from(counts.entries()).map(([name, { quadrant, n }]) => ({
    name,
    quadrant,
    usage: n,
    ring: classifyRing(name, n, total),
  }));
}

export default function RadarPage() {
  const params = useParams();
  const repoId = parseInt(params.id as string, 10);
  const [graph, setGraph] = useState<DependencyGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Ring | 'all'>('all');

  useEffect(() => {
    apiClient.getDependencyGraph(repoId).then((g) => {
      setGraph(g);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [repoId]);

  const blips = useMemo(() => (graph ? deriveBlips(graph.nodes) : []), [graph]);

  const positioned = useMemo(() => {
    return blips.map((b, i) => {
      const [r0, r1] = RING_RADIUS[b.ring];
      const [a0, a1] = QUAD_ANGLE[b.quadrant];
      const seed = b.name.charCodeAt(0) + i;
      const r = r0 + ((seed * 13) % 100) / 100 * (r1 - r0);
      const a = a0 + ((seed * 7) % 100) / 100 * (a1 - a0);
      return {
        ...b,
        x: 250 + Math.cos(a) * r,
        y: 250 + Math.sin(a) * r,
      };
    });
  }, [blips]);

  return (
    <LabShell
      title="Tech Radar"
      subtitle="Auto-classified stack: which technologies to adopt, trial, assess, or retire."
      icon={<RadarIcon className="h-5 w-5 text-[hsl(var(--accent-violet))]" />}
      accent="hsl(var(--accent-violet))"
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <Card padding="lg">
          {loading ? (
            <div className="flex h-96 items-center justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--accent-violet)] border-t-transparent" />
            </div>
          ) : (
            <svg viewBox="0 0 500 500" className="w-full">
              <line x1="250" y1="10" x2="250" y2="490" stroke="hsl(var(--hairline))" strokeDasharray="2 4" />
              <line x1="10" y1="250" x2="490" y2="250" stroke="hsl(var(--hairline))" strokeDasharray="2 4" />
              {(Object.keys(RING_RADIUS) as Ring[]).reverse().map((r) => (
                <circle
                  key={r}
                  cx="250"
                  cy="250"
                  r={RING_RADIUS[r][1]}
                  fill={RING_COLOR[r]}
                  fillOpacity={0.04}
                  stroke={RING_COLOR[r]}
                  strokeOpacity={0.5}
                  strokeDasharray={r === 'Hold' ? '3 3' : ''}
                />
              ))}
              {(Object.keys(RING_RADIUS) as Ring[]).map((r) => (
                <text
                  key={r}
                  x="252"
                  y={250 - RING_RADIUS[r][1] + 14}
                  fontSize="9"
                  fontWeight="600"
                  fill={RING_COLOR[r]}
                  fillOpacity={0.7}
                >
                  {r}
                </text>
              ))}
              <text x="20" y="35" fontSize="11" fontWeight="600" fill="hsl(var(--text-secondary))">Patterns</text>
              <text x="425" y="35" fontSize="11" fontWeight="600" fill="hsl(var(--text-secondary))">Tools</text>
              <text x="20" y="485" fontSize="11" fontWeight="600" fill="hsl(var(--text-secondary))">Languages</text>
              <text x="395" y="485" fontSize="11" fontWeight="600" fill="hsl(var(--text-secondary))">Frameworks</text>
              {positioned.map((b, i) => {
                const visible = filter === 'all' || b.ring === filter;
                return (
                  <motion.g
                    key={b.name}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: visible ? 1 : 0.15, scale: 1 }}
                    transition={{ delay: i * 0.04 }}
                  >
                    <circle
                      cx={b.x}
                      cy={b.y}
                      r="6"
                      fill={RING_COLOR[b.ring]}
                      style={{ filter: `drop-shadow(0 0 6px ${RING_COLOR[b.ring]})` }}
                    />
                    <text x={b.x + 10} y={b.y + 4} fontSize="10" fill="hsl(var(--text-primary))">
                      {b.name}
                    </text>
                  </motion.g>
                );
              })}
            </svg>
          )}
        </Card>

        <div className="space-y-3">
          {(['Adopt', 'Trial', 'Assess', 'Hold'] as Ring[]).map((r) => (
            <Card key={r} padding="md" onClick={() => setFilter(filter === r ? 'all' : r)} className={filter === r ? 'ring-1' : ''}>
              <div className="flex items-center gap-3">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: RING_COLOR[r], boxShadow: `0 0 10px ${RING_COLOR[r]}` }} />
                <div className="flex-1">
                  <div className="text-sm font-semibold text-[var(--text-primary)]">{r}</div>
                  <div className="text-[11px] text-[var(--text-muted)]">{blips.filter((b) => b.ring === r).length} technologies</div>
                </div>
              </div>
            </Card>
          ))}
          <Card padding="md">
            <div className="text-[11px] leading-relaxed text-[var(--text-muted)]">
              <strong className="text-[var(--text-secondary)]">Adopt</strong> — proven, lean in.<br />
              <strong className="text-[var(--text-secondary)]">Trial</strong> — promising, expand carefully.<br />
              <strong className="text-[var(--text-secondary)]">Assess</strong> — early signal, watch.<br />
              <strong className="text-[var(--text-secondary)]">Hold</strong> — avoid new investment.
            </div>
          </Card>
        </div>
      </div>
    </LabShell>
  );
}
