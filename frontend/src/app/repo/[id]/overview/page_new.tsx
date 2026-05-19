/**
 * Overview tab - repository information and dependency visualization with D3.js
 */
'use client';

import { useEffect, useState, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { apiClient } from '@/lib/api';
import { DependencyGraph, Repository } from '@/lib/types';
import { Loader2, Network, Code2, Calendar, GitBranch, FolderGit2 } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import * as d3 from 'd3';

export default function OverviewPage({ params }: { params: { id: string } }) {
  const { data: session } = useSession();
  const { theme } = useTheme();
  const repoId = parseInt(params.id);

  const [repository, setRepository] = useState<Repository | null>(null);
  const [graph, setGraph] = useState<DependencyGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (session) {
      const backendToken = (session as any).backendToken;
      if (backendToken) {
        apiClient.setAuthToken(backendToken);
      }
      loadRepository();
      loadGraph();
    }
  }, [session, repoId]);

  const loadRepository = async () => {
    try {
      const data = await apiClient.listRepositories();
      const repo = data.repositories.find(r => r.id === repoId);
      if (repo) {
        setRepository(repo);
      }
    } catch (error) {
      console.error('Failed to load repository:', error);
    }
  };

  const loadGraph = async () => {
    try {
      setLoading(true);
      const graphData = await apiClient.getDependencyGraph(repoId);
      
      // Filter out non-essential files
      const uselessFilePatterns = [
        /package\.json$/i,
        /package-lock\.json$/i,
        /yarn\.lock$/i,
        /\.gitignore$/i,
        /\.env/i,
        /readme\.md$/i,
        /license/i,
        /changelog/i,
        /\.config\.(js|ts|json)$/i,
        /^(tsconfig|jsconfig|babel\.config|webpack\.config|vite\.config|tailwind\.config|postcss\.config)/i,
        /\.eslintrc/i,
        /\.prettierrc/i,
        /node_modules/i,
        /\.test\.(js|ts|jsx|tsx)$/i,
        /\.spec\.(js|ts|jsx|tsx)$/i,
        /\.d\.ts$/i,
        /migrations?\//i,
        /seeds?\//i,
        /create.*table/i,
        /\d{3,}_.*\.js$/i,
        /_table\.js$/i,
        /knexfile/i,
        /migrate\.js$/i,
        /setup\.(js|sh|ps1)$/i,
        /build\.(js|sh)$/i,
        /init\.js$/i,
        /health-check/i,
        /test-integration/i,
        /^index\.(html|css)$/i,
      ];
      
      const filteredNodes = graphData.nodes.filter(node => {
        const fileName = node.label.toLowerCase();
        const filePath = node.path.toLowerCase();
        return !uselessFilePatterns.some(pattern => 
          pattern.test(fileName) || pattern.test(filePath)
        );
      });
      
      const filteredNodeIds = new Set(filteredNodes.map(n => n.id));
      const filteredEdges = graphData.edges.filter(edge => 
        filteredNodeIds.has(edge.source) && filteredNodeIds.has(edge.target)
      );
      
      setGraph({
        nodes: filteredNodes,
        edges: filteredEdges
      });
    } catch (error) {
      console.error('Failed to load graph:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!graph || !svgRef.current || !containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const radius = Math.min(width, height) * 0.4;

    // Clear previous content
    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`);

    const g = svg.append('g')
      .attr('transform', `translate(${width / 2}, ${height / 2})`);

    // Calculate positions in a circle
    const nodeCount = graph.nodes.length;
    const angleStep = (2 * Math.PI) / nodeCount;

    const positions = graph.nodes.map((node, i) => {
      const angle = i * angleStep - Math.PI / 2; // Start from top
      return {
        ...node,
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle),
        angle: angle
      };
    });

    // Draw edges
    const edges = g.append('g').attr('class', 'edges');
    
    graph.edges.forEach(edge => {
      const source = positions.find(n => n.id === edge.source);
      const target = positions.find(n => n.id === edge.target);
      
      if (source && target) {
        edges.append('line')
          .attr('x1', source.x)
          .attr('y1', source.y)
          .attr('x2', target.x)
          .attr('y2', target.y)
          .attr('stroke', theme === 'dark' ? '#4b5563' : '#d1d5db')
          .attr('stroke-width', 1)
          .attr('stroke-opacity', 0.3)
          .attr('class', `edge edge-${edge.source} edge-${edge.target}`);
      }
    });

    // Draw nodes
    const nodes = g.append('g').attr('class', 'nodes');
    
    positions.forEach(node => {
      const nodeGroup = nodes.append('g')
        .attr('transform', `translate(${node.x}, ${node.y})`)
        .attr('class', 'node')
        .style('cursor', 'pointer')
        .on('click', () => {
          setSelectedNode(selectedNode === node.id ? null : node.id);
        })
        .on('mouseenter', function() {
          d3.select(this).select('circle')
            .attr('r', 8)
            .attr('fill', theme === 'dark' ? '#60a5fa' : '#3b82f6');
        })
        .on('mouseleave', function() {
          if (selectedNode !== node.id) {
            d3.select(this).select('circle')
              .attr('r', 5)
              .attr('fill', '#ffffff');
          }
        });

      // Node circle
      nodeGroup.append('circle')
        .attr('r', selectedNode === node.id ? 8 : 5)
        .attr('fill', selectedNode === node.id ? '#ef4444' : '#ffffff')
        .attr('stroke', selectedNode === node.id ? '#ffffff' : 'none')
        .attr('stroke-width', 2);

      // Node label
      const angle = node.angle * (180 / Math.PI);
      const normalizedAngle = ((angle + 90) % 360 + 360) % 360;
      
      // Determine text positioning
      const isTopArea = normalizedAngle < 45 || normalizedAngle > 315;
      const isBottomArea = normalizedAngle > 135 && normalizedAngle < 225;
      
      const text = nodeGroup.append('text')
        .attr('font-size', '24px')
        .attr('font-family', 'sans-serif')
        .attr('fill', '#ffffff')
        .text(node.label);

      if (isTopArea || isBottomArea) {
        // Vertical text for top/bottom
        text
          .attr('transform', 'rotate(-90)')
          .attr('text-anchor', 'middle')
          .attr('y', isTopArea ? -15 : 15)
          .attr('dominant-baseline', isTopArea ? 'auto' : 'hanging');
      } else {
        // Horizontal text for sides
        const isLeftSide = normalizedAngle > 90 && normalizedAngle < 270;
        text
          .attr('text-anchor', isLeftSide ? 'end' : 'start')
          .attr('x', isLeftSide ? -15 : 15)
          .attr('dominant-baseline', 'middle');
      }
    });

    // Highlight selected node connections
    if (selectedNode) {
      svg.selectAll('.edge')
        .attr('stroke-opacity', 0.1)
        .filter(function() {
          const classes = d3.select(this).attr('class');
          return classes.includes(selectedNode);
        })
        .attr('stroke', theme === 'dark' ? '#60a5fa' : '#3b82f6')
        .attr('stroke-width', 2)
        .attr('stroke-opacity', 1);
    }

  }, [graph, theme, selectedNode]);

  // Format date
  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Get top languages
  const getTopLanguages = () => {
    if (!repository?.languages) return [];
    const entries = Object.entries(repository.languages);
    const total = entries.reduce((sum, [, count]) => sum + count, 0);
    return entries
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([lang, count]) => ({
        name: lang,
        percentage: ((count / total) * 100).toFixed(1)
      }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!graph || graph.nodes.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="text-center">
          <Network className="w-12 h-12 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No dependency graph available
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            The dependency graph will be generated during repository indexing
          </p>
        </div>
      </div>
    );
  }

  const selectedNodeData = selectedNode
    ? graph.nodes.find(n => n.id === selectedNode)
    : null;

  const connectedEdges = selectedNode
    ? graph.edges.filter(e => e.source === selectedNode || e.target === selectedNode)
    : [];

  const imports = connectedEdges.filter(e => e.source === selectedNode);
  const importedBy = connectedEdges.filter(e => e.target === selectedNode);

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      {/* Left Sidebar - Repository Info */}
      <div className="w-[800px] bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 overflow-y-auto flex-shrink-0">
        <div className="p-6 space-y-6">
          {/* Repository Header */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <FolderGit2 className="w-8 h-8 text-gray-900 dark:text-white" />
              <div className="flex-1">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {repository?.name || 'Loading...'}
                </h2>
                <a
                  href={repository?.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  View on GitHub
                </a>
              </div>
            </div>
            {repository?.description && (
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {repository.description}
              </p>
            )}
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <Code2 className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Language</span>
              </div>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {getTopLanguages()[0]?.name || 'N/A'}
              </p>
            </div>

            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <GitBranch className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Default Branch</span>
              </div>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {repository?.default_branch || 'main'}
              </p>
            </div>

            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Last Updated</span>
              </div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {formatDate(repository?.indexed_at)}
              </p>
            </div>

            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <Network className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Total Files</span>
              </div>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {repository?.total_files?.toLocaleString() || '0'}
              </p>
            </div>
          </div>

          {/* Languages */}
          {getTopLanguages().length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Languages</h3>
              <div className="space-y-2">
                {getTopLanguages().map((lang, idx) => (
                  <div key={idx}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700 dark:text-gray-300">{lang.name}</span>
                      <span className="text-gray-500 dark:text-gray-400">{lang.percentage}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-blue-600 dark:bg-blue-500 h-2 rounded-full"
                        style={{ width: `${lang.percentage}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Documentation Status */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Documentation Status</h3>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-sm text-gray-700 dark:text-gray-300">Documentation ready to access</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Visualization */}
      <div ref={containerRef} className="flex-1 relative bg-gray-950 dark:bg-black flex items-center justify-center">
        <svg ref={svgRef} className="w-full h-full"></svg>

        {/* Bottom Stats */}
        <div className="absolute bottom-4 right-4 bg-gray-900/90 dark:bg-gray-950/90 backdrop-blur-sm rounded-lg px-4 py-2 border border-gray-700">
          <div className="flex items-center gap-4 text-xs text-gray-300">
            <span>{graph.nodes.length} files</span>
            <span>•</span>
            <span>{graph.edges.length} connections</span>
          </div>
        </div>

        {/* File Details Overlay */}
        {selectedNodeData && (
          <div className="absolute top-20 right-4 w-72 bg-gray-900/95 dark:bg-gray-950/95 backdrop-blur-sm rounded-lg border border-gray-700 p-4 max-h-[calc(100%-120px)] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white">
                File Details
              </h3>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                  Filename
                </label>
                <p className="text-xs text-white font-mono mt-1 bg-gray-800/50 p-2 rounded">
                  {selectedNodeData.label}
                </p>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                  Path
                </label>
                <p className="text-xs text-white font-mono mt-1 bg-gray-800/50 p-2 rounded break-all">
                  {selectedNodeData.path}
                </p>
              </div>

              {selectedNodeData.language && (
                <div>
                  <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                    Language
                  </label>
                  <p className="text-xs text-white mt-1">
                    <span className="inline-block px-2 py-1 bg-blue-600/30 text-blue-300 rounded text-xs font-medium border border-blue-600/50">
                      {selectedNodeData.language}
                    </span>
                  </p>
                </div>
              )}

              {/* Imports */}
              {imports.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-red-400 uppercase tracking-wide mb-2 block">
                    Imports ({imports.length})
                  </label>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {imports.map((edge, idx) => {
                      const connectedNode = graph.nodes.find(n => n.id === edge.target);
                      return (
                        <div
                          key={idx}
                          className="text-xs p-2 bg-red-600/20 rounded border border-red-600/30 cursor-pointer hover:bg-red-600/30 transition-colors"
                          onClick={() => setSelectedNode(edge.target)}
                        >
                          <p className="text-white font-mono truncate">
                            {connectedNode?.label || edge.target}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Imported By */}
              {importedBy.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-blue-400 uppercase tracking-wide mb-2 block">
                    Imported By ({importedBy.length})
                  </label>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {importedBy.map((edge, idx) => {
                      const connectedNode = graph.nodes.find(n => n.id === edge.source);
                      return (
                        <div
                          key={idx}
                          className="text-xs p-2 bg-blue-600/20 rounded border border-blue-600/30 cursor-pointer hover:bg-blue-600/30 transition-colors"
                          onClick={() => setSelectedNode(edge.source)}
                        >
                          <p className="text-white font-mono truncate">
                            {connectedNode?.label || edge.source}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {connectedEdges.length === 0 && (
                <div className="text-center py-4 text-gray-400 text-xs">
                  No connections found
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
