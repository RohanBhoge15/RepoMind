'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import { motion } from 'framer-motion';
import * as THREE from 'three';
import { Building2 } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { DependencyGraph, GraphNode } from '@/lib/types';
import Card from '@/components/ui/Card';
import LabShell from '../_components/LabShell';

interface Building {
  node: GraphNode;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  color: THREE.Color;
  district: string;
}

const LANG_HUE: Record<string, number> = {
  TypeScript: 210, JavaScript: 48, Python: 200, Go: 190, Rust: 18, Java: 14,
  'C++': 280, C: 240, Ruby: 0, PHP: 270, CSS: 320, HTML: 30, Markdown: 160,
};

function packDistricts(nodes: GraphNode[]): Building[] {
  const byDir = new Map<string, GraphNode[]>();
  nodes.forEach((n) => {
    const parts = n.path.split('/');
    const dir = parts.slice(0, Math.max(1, parts.length - 1)).join('/') || 'root';
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir)!.push(n);
  });

  const districts = Array.from(byDir.entries()).sort((a, b) => b[1].length - a[1].length);
  const buildings: Building[] = [];
  let cursorX = 0;
  let cursorZ = 0;
  let rowMaxDepth = 0;
  const ROW_WIDTH = 60;

  for (const [dir, files] of districts) {
    const cols = Math.ceil(Math.sqrt(files.length));
    const cellSize = 2.2;
    const districtW = cols * cellSize;
    const districtD = Math.ceil(files.length / cols) * cellSize;

    if (cursorX + districtW > ROW_WIDTH) {
      cursorX = 0;
      cursorZ += rowMaxDepth + 3;
      rowMaxDepth = 0;
    }

    files.forEach((f, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const loc = Math.max(1, f.loc || 10);
      const height = Math.max(0.5, Math.log10(loc + 1) * 2.5);
      const hue = (LANG_HUE[f.language || ''] ?? 220) / 360;
      const sat = (f.vulnerability_count || 0) > 0 ? 0.85 : 0.55;
      const lit = 0.45 + Math.min(0.25, (f.complexity || 0) * 0.04);
      buildings.push({
        node: f,
        x: cursorX + col * cellSize - districtW / 2 + cellSize / 2,
        z: cursorZ + row * cellSize - districtD / 2 + cellSize / 2,
        width: cellSize * 0.85,
        depth: cellSize * 0.85,
        height,
        color: new THREE.Color().setHSL(hue, sat, lit),
        district: dir,
      });
    });

    cursorX += districtW + 2;
    rowMaxDepth = Math.max(rowMaxDepth, districtD);
  }

  // Center the city
  const xs = buildings.map((b) => b.x);
  const zs = buildings.map((b) => b.z);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  return buildings.map((b) => ({ ...b, x: b.x - cx, z: b.z - cz }));
}

function BuildingMesh({ b, onHover }: { b: Building; onHover: (b: Building | null) => void }) {
  const ref = useRef<THREE.Mesh>(null);
  return (
    <mesh
      ref={ref}
      position={[b.x, b.height / 2, b.z]}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(b);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        onHover(null);
        document.body.style.cursor = 'auto';
      }}
    >
      <boxGeometry args={[b.width, b.height, b.depth]} />
      <meshStandardMaterial
        color={b.color}
        emissive={b.color}
        emissiveIntensity={0.18}
        roughness={0.4}
        metalness={0.2}
      />
    </mesh>
  );
}

function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <planeGeometry args={[200, 200]} />
      <meshStandardMaterial color="#0a0f1a" roughness={1} />
    </mesh>
  );
}

function GridHelper() {
  return <gridHelper args={[200, 80, '#1e293b', '#0f172a']} position={[0, 0.01, 0]} />;
}

export default function CodeCityPage() {
  const params = useParams();
  const repoId = parseInt(params.id as string, 10);
  const [graph, setGraph] = useState<DependencyGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState<Building | null>(null);

  useEffect(() => {
    apiClient.getDependencyGraph(repoId).then((g) => {
      setGraph(g);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [repoId]);

  const buildings = useMemo(() => (graph ? packDistricts(graph.nodes) : []), [graph]);

  return (
    <LabShell
      title="Code City"
      subtitle="Each building is a file. Height = lines of code, color = language, district = folder."
      icon={<Building2 className="h-5 w-5 text-[hsl(var(--accent-cyan))]" />}
      scroll={false}
    >
      <div className="relative h-[calc(100vh-220px)] overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[var(--surface-1)]/40">
        {!loading && buildings.length > 0 && (
          <Canvas camera={{ position: [40, 30, 40], fov: 50 }} shadows>
            <ambientLight intensity={0.4} />
            <directionalLight position={[30, 40, 20]} intensity={1.1} color="#7dd3fc" castShadow />
            <directionalLight position={[-20, 30, -20]} intensity={0.5} color="#c084fc" />
            <Ground />
            <GridHelper />
            {buildings.map((b) => (
              <BuildingMesh key={b.node.id} b={b} onHover={setHovered} />
            ))}
            <OrbitControls makeDefault maxPolarAngle={Math.PI / 2.1} />
            <fog attach="fog" args={['#020617', 50, 120]} />
          </Canvas>
        )}

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex items-center gap-3 rounded-full border border-[var(--hairline)] bg-[var(--surface-1)]/80 px-5 py-3 backdrop-blur-md">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--accent-cyan)] border-t-transparent" />
              <span className="text-sm text-[var(--text-secondary)]">Building the city…</span>
            </div>
          </div>
        )}

        {hovered && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="pointer-events-none absolute bottom-4 left-4 w-72"
          >
            <Card padding="md" className="pointer-events-auto">
              <div className="truncate font-mono text-sm text-[var(--text-primary)]">{hovered.node.label}</div>
              <div className="truncate text-xs text-[var(--text-muted)]">{hovered.node.path}</div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <Stat label="District" value={hovered.district.split('/').pop() || 'root'} />
                <Stat label="LoC" value={hovered.node.loc ?? 0} />
                <Stat label="Lang" value={hovered.node.language || '—'} />
                <Stat label="Complexity" value={hovered.node.complexity?.toFixed(1) ?? '—'} />
              </div>
            </Card>
          </motion.div>
        )}

        <div className="pointer-events-none absolute right-4 top-4">
          <Card padding="sm" className="pointer-events-auto text-[11px] text-[var(--text-muted)]">
            <div>Drag to orbit · Scroll to zoom · Pan with right-click</div>
          </Card>
        </div>
      </div>
    </LabShell>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-[var(--hairline)] bg-[var(--surface-2)] px-2 py-1">
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{label}</div>
      <div className="font-mono text-[var(--text-primary)]">{value}</div>
    </div>
  );
}
