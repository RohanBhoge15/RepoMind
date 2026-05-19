/**
 * Code tab — file tree, AI explanation, code viewer.
 */
'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { apiClient } from '@/lib/api';
import { FileTreeNode, FileContent, FileExplanation } from '@/lib/types';
import { motion } from 'framer-motion';
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  Loader2,
  AlertTriangle,
  Sparkles,
  Search,
} from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import dynamic from 'next/dynamic';
import JupyterNotebook from '@/components/ui/JupyterNotebook';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function fixMarkdown(text: string): string {
  if (!text) return '';
  let fixed = text;
  fixed = fixed.replace(/\*\*([^*]+)\s+\*\*(:?)/g, '**$1**$2');
  fixed = fixed.replace(/\*([^*]+)\s+\*(:?)/g, '*$1*$2');
  fixed = fixed.replace(/•\s*\*\*/g, '\n\n- **');
  fixed = fixed.replace(/•\s+/g, '\n\n- ');
  fixed = fixed.replace(/(\S)\s*(\d+)\.\s*\*\*/g, '$1\n\n$2. **');
  fixed = fixed.replace(/(\S)\s*(\d+)\.\s*([A-Z])/g, '$1\n\n$2. $3');
  fixed = fixed.replace(/(\S)\s+\*\*([^*]+)\*\*:/g, '$1\n\n**$2**:');
  fixed = fixed.replace(/(\S)\s+-\s*\*\*/g, '$1\n\n- **');
  fixed = fixed.replace(/(\S)\s+-\s+([a-z])/gi, '$1\n\n- $2');
  fixed = fixed.replace(/\n{3,}/g, '\n\n');
  return fixed.trim();
}

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

interface FileTreeProps {
  nodes: FileTreeNode[];
  onFileSelect: (fileId: number) => void;
  selectedFileId?: number;
}

function FileTree({ nodes, onFileSelect, selectedFileId }: FileTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    nodes.forEach((n) => n.type === 'directory' && initial.add(n.path));
    return initial;
  });

  const toggleExpand = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  };

  const sortNodes = (list: FileTreeNode[]): FileTreeNode[] => {
    return [...list].sort((a, b) => {
      if (a.type === 'directory' && b.type === 'file') return -1;
      if (a.type === 'file' && b.type === 'directory') return 1;
      return a.name.localeCompare(b.name);
    });
  };

  const renderNode = (node: FileTreeNode, level: number = 0) => {
    const isExpanded = expanded.has(node.path);
    const isSelected = node.file_id === selectedFileId;
    const isDirectory = node.type === 'directory';

    return (
      <div key={node.path}>
        <div
          className={`group flex items-center gap-1.5 py-1 cursor-pointer transition-colors text-[13px] ${
            isSelected
              ? 'bg-[hsl(var(--accent-cyan)/0.12)] text-[hsl(var(--accent-cyan))]'
              : 'hover:bg-[hsl(var(--surface-2)/0.6)] text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--text-primary))]'
          }`}
          style={{ paddingLeft: `${level * 12 + 8}px` }}
          onClick={() => {
            if (isDirectory) toggleExpand(node.path);
            else if (node.file_id) onFileSelect(node.file_id);
          }}
        >
          {isDirectory ? (
            <>
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 text-[hsl(var(--text-muted))]" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 text-[hsl(var(--text-muted))]" />
              )}
              <Folder
                className={`w-3.5 h-3.5 flex-shrink-0 ${
                  isExpanded ? 'text-[hsl(var(--accent-amber,40_90%_60%))]' : 'text-[hsl(var(--text-muted))]'
                }`}
              />
            </>
          ) : (
            <>
              <div className="w-3.5" />
              <File className="w-3.5 h-3.5 flex-shrink-0 text-[hsl(var(--text-muted))]" />
            </>
          )}
          <span className="truncate mono text-[12px]">{node.name}</span>
        </div>

        {isDirectory && isExpanded && node.children && node.children.length > 0 && (
          <div>{sortNodes(node.children).map((c) => renderNode(c, level + 1))}</div>
        )}
      </div>
    );
  };

  return <div className="overflow-y-auto py-1">{sortNodes(nodes).map((n) => renderNode(n))}</div>;
}

export default function CodePage({ params }: { params: { id: string } }) {
  const { data: session } = useSession();
  const { theme } = useTheme();
  const repoId = parseInt(params.id);
  const containerRef = useRef<HTMLDivElement>(null);

  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<number | undefined>();
  const [fileContent, setFileContent] = useState<FileContent | null>(null);
  const [fileExplanation, setFileExplanation] = useState<FileExplanation | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingFile, setLoadingFile] = useState(false);

  const [leftPanelWidth, setLeftPanelWidth] = useState(220);
  const [middlePanelWidth, setMiddlePanelWidth] = useState(600);
  const [isDragging, setIsDragging] = useState<'left' | 'right' | null>(null);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;
      const deltaX = e.clientX - dragStartX.current;
      if (isDragging === 'left') {
        setLeftPanelWidth(Math.max(160, Math.min(360, dragStartWidth.current + deltaX)));
      } else if (isDragging === 'right') {
        setMiddlePanelWidth(Math.max(320, Math.min(900, dragStartWidth.current + deltaX)));
      }
    },
    [isDragging],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(null);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const startResize = (panel: 'left' | 'right', e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(panel);
    dragStartX.current = e.clientX;
    dragStartWidth.current = panel === 'left' ? leftPanelWidth : middlePanelWidth;
  };

  useEffect(() => {
    if (session) {
      const backendToken = (session as any).backendToken;
      if (backendToken) apiClient.setAuthToken(backendToken);
      loadFileTree();
    }
  }, [session, repoId]);

  const loadFileTree = async () => {
    try {
      setLoading(true);
      const tree = await apiClient.getFileTree(repoId);
      setFileTree(tree);
    } catch (err) {
      console.error('Failed to load file tree:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (fileId: number) => {
    try {
      setLoadingFile(true);
      setSelectedFileId(fileId);
      const [content, explanation] = await Promise.all([
        apiClient.getFileContent(fileId),
        apiClient.getFileExplanation(fileId),
      ]);
      setFileContent(content);
      setFileExplanation(explanation);
    } catch (err) {
      console.error('Failed to load file:', err);
    } finally {
      setLoadingFile(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--accent-cyan))]" />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full flex bg-[hsl(var(--bg-base))]">
      {/* Left: File tree */}
      <div
        style={{ width: leftPanelWidth }}
        className="bg-[hsl(var(--surface-1))] border-r border-[hsl(var(--hairline))] overflow-hidden flex flex-col flex-shrink-0"
      >
        <div className="px-2.5 py-2 border-b border-[hsl(var(--hairline))]">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-[hsl(var(--text-muted))]" />
            <input
              type="text"
              placeholder="Search files"
              className="w-full bg-[hsl(var(--surface-2))] text-[hsl(var(--text-primary))] placeholder:text-[hsl(var(--text-muted))] text-[12px] pl-7 pr-2 py-1.5 rounded-md border border-[hsl(var(--hairline))] focus:outline-none focus:border-[hsl(var(--accent-cyan)/0.5)]"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <FileTree
            nodes={fileTree}
            onFileSelect={handleFileSelect}
            selectedFileId={selectedFileId}
          />
        </div>
      </div>

      <div
        className="w-px bg-[hsl(var(--hairline))] hover:bg-[hsl(var(--accent-cyan))] cursor-col-resize transition-colors flex-shrink-0"
        onMouseDown={(e) => startResize('left', e)}
      />

      {/* Center: AI explanation */}
      <div
        style={{ width: middlePanelWidth }}
        className="bg-[hsl(var(--bg-elevated))] border-r border-[hsl(var(--hairline))] overflow-hidden flex flex-col flex-shrink-0"
      >
        <div className="px-4 py-2.5 border-b border-[hsl(var(--hairline))] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-[hsl(var(--accent-cyan))]" />
            <span className="text-[13px] font-medium text-[hsl(var(--text-primary))]">
              AI explanation
            </span>
          </div>
          {fileContent && (
            <span className="mono text-[11px] text-[hsl(var(--text-muted))] truncate ml-3">
              {fileContent.path}
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loadingFile ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-[hsl(var(--accent-cyan))]" />
            </div>
          ) : fileExplanation ? (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="text-[14px] text-[hsl(var(--text-secondary))] leading-[1.7]">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({ node, ...props }: any) => <p className="mb-4 last:mb-0" {...props} />,
                    a: ({ node, ...props }: any) => (
                      <a className="text-[hsl(var(--accent-cyan))] hover:underline" {...props} />
                    ),
                    strong: ({ node, ...props }: any) => (
                      <strong className="font-semibold text-[hsl(var(--text-primary))]" {...props} />
                    ),
                    ul: ({ node, ...props }: any) => (
                      <ul className="list-disc pl-5 my-3 space-y-2" {...props} />
                    ),
                    ol: ({ node, ...props }: any) => (
                      <ol className="list-decimal pl-5 my-3 space-y-2" {...props} />
                    ),
                    li: ({ node, ...props }: any) => <li className="pl-1 mb-2" {...props} />,
                    code: ({ node, className, children, ...props }: any) => {
                      const match = /language-(\w+)/.exec(className || '');
                      return !match ? (
                        <code
                          className="mono text-[12px] rounded px-1.5 py-0.5 border border-[hsl(var(--accent-cyan)/0.25)] bg-[hsl(var(--accent-cyan)/0.1)] text-[hsl(var(--accent-cyan))]"
                          {...props}
                        >
                          {children}
                        </code>
                      ) : (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      );
                    },
                    pre: ({ node, ...props }: any) => (
                      <pre
                        className="bg-[hsl(var(--surface-2))] border border-[hsl(var(--hairline))] rounded-lg p-3 my-3 overflow-x-auto text-xs"
                        {...props}
                      />
                    ),
                    h1: ({ node, ...props }: any) => (
                      <h3
                        className="text-lg font-bold mb-2 mt-6 first:mt-0 text-[hsl(var(--text-primary))]"
                        {...props}
                      />
                    ),
                    h2: ({ node, ...props }: any) => (
                      <h4
                        className="text-base font-bold mb-2 mt-5 first:mt-0 text-[hsl(var(--text-primary))]"
                        {...props}
                      />
                    ),
                    h3: ({ node, ...props }: any) => (
                      <h5
                        className="text-sm font-bold mb-1 mt-4 first:mt-0 text-[hsl(var(--text-primary))]"
                        {...props}
                      />
                    ),
                  }}
                >
                  {fixMarkdown(fileExplanation.explanation)}
                </ReactMarkdown>
              </div>

              {fileExplanation.key_functions.length > 0 && (
                <div className="pt-4 border-t border-[hsl(var(--hairline))]">
                  <div className="mono text-[10px] uppercase tracking-widest text-[hsl(var(--accent-violet))] mb-3">
                    Key functions
                  </div>
                  <ul className="space-y-3">
                    {fileExplanation.key_functions.map((func, idx) => (
                      <li key={idx} className="text-[14px]">
                        <code className="mono text-[12px] px-2 py-1 rounded border border-[hsl(var(--accent-violet)/0.3)] bg-[hsl(var(--accent-violet)/0.1)] text-[hsl(var(--accent-violet))]">
                          {func.name}
                        </code>
                        <div className="text-[hsl(var(--text-secondary))] mt-1.5 leading-relaxed">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              p: ({ node, ...props }: any) => (
                                <p className="mb-1 last:mb-0" {...props} />
                              ),
                              strong: ({ node, ...props }: any) => (
                                <strong
                                  className="font-semibold text-[hsl(var(--text-primary))]"
                                  {...props}
                                />
                              ),
                              code: ({ node, ...props }: any) => (
                                <code
                                  className="mono text-[11px] rounded px-1 py-0.5 bg-[hsl(var(--surface-2))] text-[hsl(var(--text-primary))]"
                                  {...props}
                                />
                              ),
                            }}
                          >
                            {fixMarkdown(func.description)}
                          </ReactMarkdown>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {fileExplanation.dependencies.length > 0 && (
                <div className="pt-4 border-t border-[hsl(var(--hairline))]">
                  <div className="mono text-[10px] uppercase tracking-widest text-[hsl(var(--success))] mb-3">
                    Dependencies
                  </div>
                  <ul className="space-y-1.5">
                    {fileExplanation.dependencies.map((dep, idx) => (
                      <li
                        key={idx}
                        className="mono text-[12px] px-3 py-2 rounded-md border border-[hsl(var(--success)/0.25)] bg-[hsl(var(--success)/0.08)] text-[hsl(var(--success))]"
                      >
                        {dep}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {fileExplanation.vulnerabilities.length > 0 && (
                <div className="pt-4 border-t border-[hsl(var(--hairline))]">
                  <div className="mono text-[10px] uppercase tracking-widest text-[hsl(var(--warning))] mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Security issues
                  </div>
                  <ul className="space-y-3">
                    {fileExplanation.vulnerabilities.map((vuln, idx) => {
                      const sevColor =
                        vuln.severity === 'HIGH'
                          ? 'danger'
                          : vuln.severity === 'MEDIUM'
                          ? 'warning'
                          : 'accent-amber';
                      return (
                        <li key={idx} className="text-sm">
                          <span
                            className={`inline-block mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded border border-[hsl(var(--${sevColor})/0.4)] bg-[hsl(var(--${sevColor})/0.1)] text-[hsl(var(--${sevColor}))]`}
                          >
                            {vuln.severity}
                          </span>
                          <div className="text-[hsl(var(--text-secondary))] mt-1.5 leading-relaxed text-[14px]">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                p: ({ node, ...props }: any) => (
                                  <p className="mb-2 last:mb-0" {...props} />
                                ),
                                strong: ({ node, ...props }: any) => (
                                  <strong
                                    className="font-semibold text-[hsl(var(--text-primary))]"
                                    {...props}
                                  />
                                ),
                                code: ({ node, ...props }: any) => (
                                  <code
                                    className="mono text-[11px] rounded px-1 py-0.5 bg-[hsl(var(--surface-2))] text-[hsl(var(--text-primary))]"
                                    {...props}
                                  />
                                ),
                              }}
                            >
                              {fixMarkdown(vuln.description)}
                            </ReactMarkdown>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </motion.div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <File className="w-10 h-10 text-[hsl(var(--text-muted))] mb-3" />
              <p className="text-[13px] text-[hsl(var(--text-muted))]">
                Select a file to view its explanation
              </p>
            </div>
          )}
        </div>
      </div>

      <div
        className="w-px bg-[hsl(var(--hairline))] hover:bg-[hsl(var(--accent-cyan))] cursor-col-resize transition-colors flex-shrink-0"
        onMouseDown={(e) => startResize('right', e)}
      />

      {/* Right: Code viewer */}
      <div className="flex-1 bg-[hsl(var(--surface-1))] overflow-hidden flex flex-col">
        <div className="px-4 py-2.5 border-b border-[hsl(var(--hairline))]">
          <div className="flex items-center gap-2">
            <File className="w-3.5 h-3.5 text-[hsl(var(--text-muted))]" />
            <span className="mono text-[12px] text-[hsl(var(--text-primary))]">
              {fileContent?.path || 'README.md'}
            </span>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          {loadingFile ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--accent-cyan))]" />
            </div>
          ) : fileContent ? (
            fileContent.path?.endsWith('.ipynb') ? (
              <JupyterNotebook content={fileContent.content} />
            ) : (
              <MonacoEditor
                height="100%"
                language={fileContent.language?.toLowerCase() || 'plaintext'}
                value={fileContent.content}
                theme="vs-dark"
                options={{
                  readOnly: true,
                  minimap: { enabled: true },
                  fontSize: 13,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  fontFamily: "'Fira Code', 'Cascadia Code', 'Consolas', 'Monaco', monospace",
                  fontLigatures: true,
                  renderLineHighlight: 'all',
                  cursorBlinking: 'smooth',
                  smoothScrolling: true,
                  padding: { top: 16, bottom: 16 },
                }}
              />
            )
          ) : (
            <div className="flex flex-col items-center justify-center h-full">
              <File className="w-12 h-12 text-[hsl(var(--text-muted))] mb-3" />
              <p className="text-[13px] text-[hsl(var(--text-muted))]">
                Select a file to view its content
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
