/**
 * Animated hero section with code indexing visualization
 * Features: flowing nodes, connecting lines, dynamic syntax fragments
 */
'use client';

import { useEffect, useState, useRef } from 'react';

interface Node {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  type: 'function' | 'class' | 'variable' | 'import';
}

interface Connection {
  from: number;
  to: number;
  opacity: number;
}

const codeFragments = [
  'function',
  'class',
  'const',
  'import',
  'export',
  'async',
  'await',
  'return',
  'interface',
  'type',
];

export default function HeroAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    // Initialize nodes
    const initialNodes: Node[] = Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      vx: (Math.random() - 0.5) * 0.2,
      vy: (Math.random() - 0.5) * 0.2,
      size: Math.random() * 3 + 2,
      type: ['function', 'class', 'variable', 'import'][Math.floor(Math.random() * 4)] as Node['type'],
    }));
    setNodes(initialNodes);

    // Create initial connections
    const initialConnections: Connection[] = [];
    for (let i = 0; i < initialNodes.length; i++) {
      const connectTo = Math.floor(Math.random() * initialNodes.length);
      if (connectTo !== i) {
        initialConnections.push({
          from: i,
          to: connectTo,
          opacity: Math.random() * 0.3 + 0.1,
        });
      }
    }
    setConnections(initialConnections);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const updateCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };

    updateCanvas();
    window.addEventListener('resize', updateCanvas);

    const animate = () => {
      if (!canvas || !ctx) return;

      const width = canvas.width / window.devicePixelRatio;
      const height = canvas.height / window.devicePixelRatio;

      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      // Update and draw nodes
      setNodes((prevNodes) => {
        const updatedNodes = prevNodes.map((node) => {
          let newX = node.x + node.vx;
          let newY = node.y + node.vy;
          let newVx = node.vx;
          let newVy = node.vy;

          // Bounce off edges
          if (newX <= 0 || newX >= 100) newVx = -newVx;
          if (newY <= 0 || newY >= 100) newVy = -newVy;

          newX = Math.max(0, Math.min(100, newX));
          newY = Math.max(0, Math.min(100, newY));

          return { ...node, x: newX, y: newY, vx: newVx, vy: newVy };
        });

        // Draw connections
        connections.forEach((conn) => {
          const fromNode = updatedNodes[conn.from];
          const toNode = updatedNodes[conn.to];
          if (fromNode && toNode) {
            ctx.beginPath();
            ctx.moveTo((fromNode.x / 100) * width, (fromNode.y / 100) * height);
            ctx.lineTo((toNode.x / 100) * width, (toNode.y / 100) * height);
            ctx.strokeStyle = `rgba(6, 182, 212, ${conn.opacity})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        });

        // Draw nodes
        updatedNodes.forEach((node) => {
          const x = (node.x / 100) * width;
          const y = (node.y / 100) * height;

          // Node glow
          const gradient = ctx.createRadialGradient(x, y, 0, x, y, node.size * 3);
          gradient.addColorStop(0, 'rgba(6, 182, 212, 0.4)');
          gradient.addColorStop(1, 'rgba(6, 182, 212, 0)');
          ctx.fillStyle = gradient;
          ctx.fillRect(x - node.size * 3, y - node.size * 3, node.size * 6, node.size * 6);

          // Node core
          ctx.beginPath();
          ctx.arc(x, y, node.size, 0, Math.PI * 2);
          ctx.fillStyle = '#06b6d4';
          ctx.fill();
        });

        return updatedNodes;
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', updateCanvas);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [connections]);

  return (
    <div className="absolute inset-0 overflow-hidden opacity-30 dark:opacity-20">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ width: '100%', height: '100%' }}
      />
      
      {/* Floating code fragments */}
      <div className="absolute inset-0 pointer-events-none">
        {codeFragments.map((fragment, i) => (
          <div
            key={i}
            className="absolute font-mono text-electric-500 opacity-20 animate-float-gentle"
            style={{
              left: `${(i * 10 + 5) % 90}%`,
              top: `${(i * 15 + 10) % 80}%`,
              animationDelay: `${i * 0.5}s`,
              fontSize: `${Math.random() * 0.5 + 0.75}rem`,
            }}
          >
            {fragment}
          </div>
        ))}
      </div>

      {/* Scanning lines */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute w-full h-px bg-gradient-to-r from-transparent via-electric-500 to-transparent animate-code-scan opacity-30" />
        <div
          className="absolute w-full h-px bg-gradient-to-r from-transparent via-electric-500 to-transparent animate-code-scan opacity-20"
          style={{ animationDelay: '1s' }}
        />
      </div>
    </div>
  );
}

