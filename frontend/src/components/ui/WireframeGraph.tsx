'use client';

import { useRef, useMemo, useState, useEffect } from 'react';

interface Node {
    id: string;
    label: string;
    path: string;
    language?: string;
}

interface Edge {
    source: string;
    target: string;
}

interface WireframeGraphProps {
    nodes: Node[];
    edges: Edge[];
    width?: number;
    height?: number;
}

export default function WireframeGraph({ nodes, edges, width = 800, height = 600 }: WireframeGraphProps) {
    const svgRef = useRef<SVGSVGElement>(null);
    const [selectedEdge, setSelectedEdge] = useState<number | null>(null);
    const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());
    const [rotation, setRotation] = useState(0);

    // Animate rotation
    useEffect(() => {
        let animationId: number;

        const animate = () => {
            // Only rotate when not hovering on an edge
            if (selectedEdge === null) {
                setRotation(prev => (prev + 0.05) % 360);
            }
            animationId = requestAnimationFrame(animate);
        };

        animationId = requestAnimationFrame(animate);

        return () => {
            cancelAnimationFrame(animationId);
        };
    }, [selectedEdge]);

    // Calculate positions for nodes arranged in a circle
    const { nodePositions, centerX, centerY, radius } = useMemo(() => {
        const cx = width / 2;
        const cy = height / 2;
        const r = Math.min(width, height) / 2 - 100; // Leave space for labels

        const positions: Record<string, { x: number; y: number; angle: number }> = {};

        nodes.forEach((node, index) => {
            // Distribute nodes around the circle
            const angle = (index / nodes.length) * 2 * Math.PI - Math.PI / 2; // Start from top
            positions[node.id] = {
                x: cx + r * Math.cos(angle),
                y: cy + r * Math.sin(angle),
                angle: angle
            };
        });

        return { nodePositions: positions, centerX: cx, centerY: cy, radius: r };
    }, [nodes, width, height]);

    // Generate curved paths for edges
    const edgePaths = useMemo(() => {
        return edges.map((edge, idx) => {
            const source = nodePositions[edge.source];
            const target = nodePositions[edge.target];

            if (!source || !target) return null;

            // Calculate control point for quadratic bezier curve
            // The curve goes through the center area
            const midX = (source.x + target.x) / 2;
            const midY = (source.y + target.y) / 2;

            // Pull the control point towards center based on distance
            const distFromCenter = Math.sqrt(
                Math.pow(midX - centerX, 2) + Math.pow(midY - centerY, 2)
            );

            // Calculate how much to pull towards center (more for nodes far apart)
            const angleDiff = Math.abs(source.angle - target.angle);
            const normalizedAngleDiff = Math.min(angleDiff, 2 * Math.PI - angleDiff);
            const pullFactor = 0.3 + (normalizedAngleDiff / Math.PI) * 0.5;

            const controlX = centerX + (midX - centerX) * (1 - pullFactor);
            const controlY = centerY + (midY - centerY) * (1 - pullFactor);

            return {
                path: `M ${source.x} ${source.y} Q ${controlX} ${controlY} ${target.x} ${target.y}`,
                source,
                target,
                id: `edge-${idx}`
            };
        }).filter((e): e is { path: string; source: { x: number; y: number; angle: number }; target: { x: number; y: number; angle: number }; id: string } => e !== null);
    }, [edges, nodePositions, centerX, centerY]);

    // Color palette for edges
    const getEdgeColor = (index: number) => {
        const colors = [
            '#ef4444', // red
            '#3b82f6', // blue
            '#22c55e', // green
            '#f59e0b', // amber
            '#8b5cf6', // violet
            '#ec4899', // pink
            '#06b6d4', // cyan
            '#f97316', // orange
        ];
        return colors[index % colors.length];
    };

    // Get label position (outside the circle)
    const getLabelPosition = (angle: number, nodeX: number, nodeY: number) => {
        const labelOffset = 15;
        const x = nodeX + labelOffset * Math.cos(angle);
        const y = nodeY + labelOffset * Math.sin(angle);

        // Determine text anchor based on position
        let anchor: 'start' | 'middle' | 'end' = 'middle';
        if (angle > -Math.PI / 4 && angle < Math.PI / 4) anchor = 'start'; // right side
        else if (angle > (3 * Math.PI) / 4 || angle < -(3 * Math.PI) / 4) anchor = 'end'; // left side

        return { x, y, anchor };
    };

    return (
        <svg
            ref={svgRef}
            width="100%"
            height="100%"
            viewBox={`0 0 ${width} ${height}`}
            className="wireframe-graph"
            style={{ background: '#0a0a0f' }}
        >
            {/* Gradient definitions */}
            <defs>
                {edgePaths.map((edge, idx) => (
                    <linearGradient
                        key={`gradient-${idx}`}
                        id={`gradient-${idx}`}
                        x1="0%"
                        y1="0%"
                        x2="100%"
                        y2="0%"
                    >
                        <stop offset="0%" stopColor={getEdgeColor(idx)} stopOpacity="0.8" />
                        <stop offset="50%" stopColor={getEdgeColor(idx)} stopOpacity="0.4" />
                        <stop offset="100%" stopColor={getEdgeColor(idx)} stopOpacity="0.8" />
                    </linearGradient>
                ))}

                {/* Glow filter */}
                <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                    <feMerge>
                        <feMergeNode in="coloredBlur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>

            {/* Rotating wrapper for the entire graph */}
            <g
                className="rotating-graph"
                style={{
                    transformOrigin: `${centerX}px ${centerY}px`,
                    transform: `rotate(${rotation}deg)`,
                    transition: selectedEdge !== null ? 'transform 0.3s ease-out' : 'none'
                }}
            >
                {/* Draw edges first (behind nodes) */}
                <g className="edges">
                    {edgePaths.map((edge, idx) => {
                        if (!edge) return null;
                        const isSelected = selectedEdge === idx;
                        const isConnectedToSelected = selectedNodes.has(edges[idx]?.source) || selectedNodes.has(edges[idx]?.target);
                        const isDimmed = selectedEdge !== null && !isSelected;

                        return (
                            <path
                                key={edge.id}
                                d={edge.path}
                                fill="none"
                                stroke={getEdgeColor(idx)}
                                strokeWidth={isSelected ? 4 : 1.5}
                                strokeOpacity={isDimmed ? 0.15 : isSelected ? 1 : 0.6}
                                className="transition-all duration-150 cursor-pointer"
                                filter={isSelected ? "url(#glow)" : undefined}
                                onMouseEnter={() => {
                                    setSelectedEdge(idx);
                                    setSelectedNodes(new Set([edges[idx]?.source, edges[idx]?.target]));
                                }}
                                onMouseLeave={() => {
                                    setSelectedEdge(null);
                                    setSelectedNodes(new Set());
                                }}
                            />
                        );
                    })}
                </g>

                {/* Draw the outer circle arc segments */}
                <g className="arc-segments">
                    {nodes.map((node, idx) => {
                        const pos = nodePositions[node.id];
                        if (!pos) return null;

                        // Draw a small arc segment for each node
                        const arcLength = (2 * Math.PI) / nodes.length;
                        const startAngle = pos.angle - arcLength / 2;
                        const endAngle = pos.angle + arcLength / 2;

                        const startX = centerX + radius * Math.cos(startAngle);
                        const startY = centerY + radius * Math.sin(startAngle);
                        const endX = centerX + radius * Math.cos(endAngle);
                        const endY = centerY + radius * Math.sin(endAngle);

                        // Get color based on language
                        const getNodeColor = (lang?: string) => {
                            const langColors: Record<string, string> = {
                                'JavaScript': '#f7df1e',
                                'TypeScript': '#3178c6',
                                'Python': '#3776ab',
                                'Java': '#ed8b00',
                                'C++': '#00599c',
                                'C': '#555555',
                                'Go': '#00add8',
                                'Rust': '#dea584',
                                'Ruby': '#cc342d',
                                'PHP': '#777bb4',
                            };
                            return langColors[lang || ''] || '#6366f1';
                        };

                        const isNodeSelected = selectedNodes.has(node.id);
                        const isDimmed = selectedEdge !== null && !isNodeSelected;

                        return (
                            <g key={node.id}>
                                {/* Arc segment */}
                                <path
                                    d={`M ${startX} ${startY} A ${radius} ${radius} 0 0 1 ${endX} ${endY}`}
                                    fill="none"
                                    stroke={getNodeColor(node.language)}
                                    strokeWidth={isNodeSelected ? 8 : 4}
                                    strokeOpacity={isDimmed ? 0.2 : isNodeSelected ? 1 : 0.8}
                                    className="transition-all duration-200"
                                    filter={isNodeSelected ? "url(#glow)" : undefined}
                                />

                                {/* Node dot */}
                                <circle
                                    cx={pos.x}
                                    cy={pos.y}
                                    r={isNodeSelected ? 8 : 4}
                                    fill={getNodeColor(node.language)}
                                    opacity={isDimmed ? 0.3 : 1}
                                    className="transition-all duration-200"
                                />
                            </g>
                        );
                    })}
                </g>

                {/* Draw labels */}
                <g className="labels">
                    {nodes.map((node) => {
                        const pos = nodePositions[node.id];
                        if (!pos) return null;

                        const label = getLabelPosition(pos.angle, pos.x, pos.y);

                        // Truncate long filenames
                        const displayName = node.label.length > 20
                            ? node.label.substring(0, 17) + '...'
                            : node.label;

                        const isNodeSelected = selectedNodes.has(node.id);
                        const isDimmed = selectedEdge !== null && !isNodeSelected;

                        return (
                            <text
                                key={`label-${node.id}`}
                                x={label.x}
                                y={label.y}
                                textAnchor={label.anchor}
                                dominantBaseline="middle"
                                fill={isNodeSelected ? '#ffffff' : isDimmed ? '#4b5563' : '#9ca3af'}
                                fontSize={isNodeSelected ? '13' : '11'}
                                fontFamily="ui-monospace, monospace"
                                fontWeight={isNodeSelected ? 'bold' : 'normal'}
                                className="transition-all duration-200 pointer-events-none"
                                transform={`rotate(${
                                    // Rotate labels on left side so they read correctly
                                    pos.angle > Math.PI / 2 || pos.angle < -Math.PI / 2
                                        ? (pos.angle * 180) / Math.PI + 180
                                        : (pos.angle * 180) / Math.PI
                                    }, ${label.x}, ${label.y})`}
                            >
                                {displayName}
                            </text>
                        );
                    })}
                </g>
            </g>  {/* End rotating wrapper */}

            {/* Stats overlay (not rotating) */}
            <g className="stats">
                <text x="20" y={height - 20} fill="#6b7280" fontSize="12" fontFamily="sans-serif">
                    {nodes.length} files • {edges.length} dependencies
                </text>
            </g>
        </svg>
    );
}
