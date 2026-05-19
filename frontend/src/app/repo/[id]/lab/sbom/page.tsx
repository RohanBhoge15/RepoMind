'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { PackageSearch, ShieldAlert, ExternalLink, Filter } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { DependencyGraph, GraphNode } from '@/lib/types';
import Card from '@/components/ui/Card';
import LabShell from '../_components/LabShell';

interface Package {
  name: string;
  version: string;
  ecosystem: 'npm' | 'pypi' | 'go' | 'rust';
  cves: { id: string; severity: 'critical' | 'high' | 'medium' | 'low'; summary: string }[];
  license: string;
}

const NPM = ['next', 'react', 'axios', 'framer-motion', 'lucide-react', 'tailwindcss', '@radix-ui/react-dialog', 'cytoscape', 'd3', 'mermaid', 'three'];
const PYPI = ['fastapi', 'sqlalchemy', 'pydantic', 'uvicorn', 'redis', 'celery', 'anthropic', 'numpy', 'requests'];

const SEV_COLOR: Record<string, string> = {
  critical: '#f43f5e',
  high: '#fb923c',
  medium: '#fbbf24',
  low: '#7dd3fc',
};

function hash(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }

function mockPackages(): Package[] {
  const all: Package[] = [];
  NPM.forEach((name) => {
    const h = hash(name);
    const numCves = h % 4;
    const cves = Array.from({ length: numCves }, (_, i) => {
      const sevs = ['low', 'medium', 'high', 'critical'] as const;
      const sev = sevs[(h + i) % 4];
      return {
        id: `CVE-${2024 + ((h + i) % 2)}-${1000 + ((h + i * 17) % 8999)}`,
        severity: sev,
        summary: ['Prototype pollution', 'Regex DoS', 'Path traversal', 'XSS in error page', 'Open redirect'][((h + i) % 5)],
      };
    });
    all.push({
      name,
      version: `${(h % 9) + 1}.${(h % 30)}.${(h % 50)}`,
      ecosystem: 'npm',
      cves,
      license: ['MIT', 'Apache-2.0', 'ISC', 'BSD-3-Clause'][h % 4],
    });
  });
  PYPI.forEach((name) => {
    const h = hash(name);
    const numCves = h % 3;
    const cves = Array.from({ length: numCves }, (_, i) => ({
      id: `CVE-${2024 + ((h + i) % 2)}-${2000 + ((h + i * 13) % 7999)}`,
      severity: (['low', 'medium', 'high'] as const)[(h + i) % 3],
      summary: ['SQL injection vector', 'Header smuggling', 'Resource exhaustion', 'TOCTOU race'][(h + i) % 4],
    }));
    all.push({
      name,
      version: `${(h % 4)}.${(h % 12)}.${(h % 30)}`,
      ecosystem: 'pypi',
      cves,
      license: ['MIT', 'Apache-2.0', 'BSD-3-Clause'][h % 3],
    });
  });
  return all.sort((a, b) => b.cves.length - a.cves.length);
}

const ECO_COLOR: Record<Package['ecosystem'], string> = {
  npm: '#f43f5e',
  pypi: '#fbbf24',
  go: '#22d3ee',
  rust: '#fb923c',
};

export default function SbomPage() {
  const [packages] = useState<Package[]>(() => mockPackages());
  const [filter, setFilter] = useState<'all' | 'vulnerable'>('all');
  const [eco, setEco] = useState<Package['ecosystem'] | 'all'>('all');

  const filtered = useMemo(() => {
    return packages.filter((p) => {
      if (filter === 'vulnerable' && p.cves.length === 0) return false;
      if (eco !== 'all' && p.ecosystem !== eco) return false;
      return true;
    });
  }, [packages, filter, eco]);

  const totals = useMemo(() => {
    const t = { critical: 0, high: 0, medium: 0, low: 0 };
    packages.forEach((p) => p.cves.forEach((c) => t[c.severity]++));
    return t;
  }, [packages]);

  return (
    <LabShell
      title="SBOM + CVE overlay"
      subtitle="Every dependency, every known vulnerability, every license — in one bill of materials."
      icon={<PackageSearch className="h-5 w-5 text-[hsl(var(--accent-blue))]" />}
      accent="hsl(var(--accent-blue))"
    >
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Card padding="md">
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Packages</div>
          <div className="mt-1 text-2xl font-bold text-[var(--text-primary)]">{packages.length}</div>
        </Card>
        {(['critical', 'high', 'medium', 'low'] as const).map((s) => (
          <Card key={s} padding="md">
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{s} CVEs</div>
            <div className="mt-1 text-2xl font-bold" style={{ color: SEV_COLOR[s] }}>{totals[s]}</div>
          </Card>
        ))}
      </div>

      <Card padding="md" className="mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <Filter className="h-3.5 w-3.5 text-[var(--text-muted)]" />
          <button
            onClick={() => setFilter(filter === 'all' ? 'vulnerable' : 'all')}
            className={`rounded-full border px-3 py-1 text-[11px] transition-all ${
              filter === 'vulnerable' ? 'border-[var(--danger)] bg-[var(--danger)]/15 text-[var(--danger)]' : 'border-[var(--hairline)] text-[var(--text-secondary)]'
            }`}
          >
            Vulnerable only
          </button>
          <div className="h-4 w-px bg-[var(--hairline)]" />
          {(['all', 'npm', 'pypi'] as const).map((e) => (
            <button
              key={e}
              onClick={() => setEco(e)}
              className={`rounded-full border px-3 py-1 text-[11px] transition-all ${
                eco === e ? 'border-[var(--accent-blue)] bg-[var(--accent-blue)]/15 text-[var(--accent-blue)]' : 'border-[var(--hairline)] text-[var(--text-secondary)]'
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </Card>

      <ul className="space-y-2">
        {filtered.map((p, i) => (
          <motion.li
            key={`${p.ecosystem}:${p.name}`}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.02 }}
          >
            <Card padding="md">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                  style={{ background: `${ECO_COLOR[p.ecosystem]}25`, color: ECO_COLOR[p.ecosystem] }}
                >
                  {p.ecosystem}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-[var(--text-primary)]">{p.name}</span>
                    <span className="font-mono text-xs text-[var(--text-muted)]">{p.version}</span>
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)]">License: {p.license}</div>
                </div>
                {p.cves.length === 0 ? (
                  <span className="rounded-full bg-[var(--success)]/15 px-2 py-0.5 text-[10px] text-[var(--success)]">clean</span>
                ) : (
                  <div className="flex items-center gap-1">
                    {p.cves.map((c) => (
                      <span
                        key={c.id}
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                        style={{ background: `${SEV_COLOR[c.severity]}20`, color: SEV_COLOR[c.severity] }}
                        title={c.summary}
                      >
                        {c.severity}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {p.cves.length > 0 && (
                <ul className="mt-2 space-y-1 border-t border-[var(--hairline)] pt-2">
                  {p.cves.map((c) => (
                    <li key={c.id} className="flex items-start gap-2 text-xs">
                      <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: SEV_COLOR[c.severity] }} />
                      <a
                        href={`https://nvd.nist.gov/vuln/detail/${c.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-[var(--accent-blue)] hover:underline"
                      >
                        {c.id}
                      </a>
                      <span className="text-[var(--text-secondary)]">— {c.summary}</span>
                      <ExternalLink className="ml-1 h-3 w-3 text-[var(--text-muted)]" />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </motion.li>
        ))}
      </ul>
    </LabShell>
  );
}
