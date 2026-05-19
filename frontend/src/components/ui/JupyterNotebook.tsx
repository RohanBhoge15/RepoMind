/**
 * Jupyter Notebook Renderer Component
 * Renders .ipynb files with a Jupyter-like interface
 */
'use client';

import { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Play, ChevronDown, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface NotebookCell {
  cell_type: 'code' | 'markdown' | 'raw';
  source: string | string[];
  outputs?: any[];
  execution_count?: number | null;
  metadata?: any;
}

interface NotebookData {
  cells: NotebookCell[];
  metadata?: any;
  nbformat?: number;
  nbformat_minor?: number;
}

interface JupyterNotebookProps {
  content: string;
}

export default function JupyterNotebook({ content }: JupyterNotebookProps) {
  const [collapsedCells, setCollapsedCells] = useState<Set<number>>(new Set());

  let notebook: NotebookData;
  try {
    notebook = JSON.parse(content);
  } catch (error) {
    return (
      <div className="p-8 text-center text-red-500">
        <p>Error parsing notebook: Invalid JSON</p>
      </div>
    );
  }

  const toggleCell = (index: number) => {
    const newCollapsed = new Set(collapsedCells);
    if (newCollapsed.has(index)) {
      newCollapsed.delete(index);
    } else {
      newCollapsed.add(index);
    }
    setCollapsedCells(newCollapsed);
  };

  const renderCellSource = (source: string | string[]) => {
    return Array.isArray(source) ? source.join('') : source;
  };

  const renderOutput = (output: any) => {
    // Handle different output types
    if (output.output_type === 'stream') {
      const text = Array.isArray(output.text) ? output.text.join('') : output.text;
      return (
        <pre className="bg-white dark:bg-slate-950 p-3 rounded text-sm font-mono text-slate-800 dark:text-slate-200 overflow-x-auto border border-slate-200 dark:border-slate-800">
          {text}
        </pre>
      );
    }

    if (output.output_type === 'execute_result' || output.output_type === 'display_data') {
      const data = output.data;

      // Handle HTML output
      if (data['text/html']) {
        const html = Array.isArray(data['text/html']) ? data['text/html'].join('') : data['text/html'];
        return (
          <div 
            className="bg-white dark:bg-slate-950 p-3 rounded border border-slate-200 dark:border-slate-800"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      }

      // Handle image output
      if (data['image/png']) {
        return (
          <div className="bg-white dark:bg-slate-950 p-3 rounded border border-slate-200 dark:border-slate-800">
            <img src={`data:image/png;base64,${data['image/png']}`} alt="Output" className="max-w-full" />
          </div>
        );
      }

      if (data['image/jpeg']) {
        return (
          <div className="bg-white dark:bg-slate-950 p-3 rounded border border-slate-200 dark:border-slate-800">
            <img src={`data:image/jpeg;base64,${data['image/jpeg']}`} alt="Output" className="max-w-full" />
          </div>
        );
      }

      // Handle plain text
      if (data['text/plain']) {
        const text = Array.isArray(data['text/plain']) ? data['text/plain'].join('') : data['text/plain'];
        return (
          <pre className="bg-white dark:bg-slate-950 p-3 rounded text-sm font-mono text-slate-800 dark:text-slate-200 overflow-x-auto border border-slate-200 dark:border-slate-800">
            {text}
          </pre>
        );
      }
    }

    if (output.output_type === 'error') {
      const traceback = output.traceback || [];
      const tracebackText = Array.isArray(traceback) ? traceback.join('\n') : traceback;
      return (
        <pre className="bg-red-50 dark:bg-red-950/20 p-3 rounded text-sm font-mono text-red-800 dark:text-red-300 overflow-x-auto border border-red-200 dark:border-red-800">
          {tracebackText}
        </pre>
      );
    }

    return null;
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-50 dark:bg-slate-900">
      {/* Notebook Header */}
      <div className="sticky top-0 z-10 bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 px-6 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Jupyter Notebook
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {notebook.cells?.length || 0} cells • Python {notebook.metadata?.language_info?.version || '3'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-xs font-medium rounded">
              Read-only
            </span>
          </div>
        </div>
      </div>

      {/* Notebook Cells */}
      <div className="p-6 space-y-4">
        {notebook.cells?.map((cell, index) => {
          const isCollapsed = collapsedCells.has(index);
          const cellSource = renderCellSource(cell.source);

          return (
            <div
              key={index}
              className="bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm hover:shadow-md transition-shadow"
            >
              {/* Cell Header */}
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                <button
                  onClick={() => toggleCell(index)}
                  className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  {isCollapsed ? (
                    <ChevronRight className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>

                {cell.cell_type === 'code' && (
                  <>
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                        In [{cell.execution_count || ' '}]
                      </span>
                      <div className="h-4 w-px bg-slate-300 dark:bg-slate-700" />
                      <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                        Code
                      </span>
                    </div>
                    <Play className="w-4 h-4 text-slate-400" />
                  </>
                )}

                {cell.cell_type === 'markdown' && (
                  <span className="text-xs font-medium text-green-600 dark:text-green-400">
                    Markdown
                  </span>
                )}

                {cell.cell_type === 'raw' && (
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Raw
                  </span>
                )}
              </div>

              {/* Cell Content */}
              {!isCollapsed && (
                <div>
                  {/* Input */}
                  <div className="p-4">
                    {cell.cell_type === 'code' && (
                      <SyntaxHighlighter
                        language="python"
                        style={vscDarkPlus}
                        customStyle={{
                          margin: 0,
                          borderRadius: '0.375rem',
                          fontSize: '0.875rem',
                          background: 'transparent',
                        }}
                        codeTagProps={{
                          style: {
                            fontFamily: "'Fira Code', 'Cascadia Code', 'Consolas', monospace",
                          }
                        }}
                      >
                        {cellSource}
                      </SyntaxHighlighter>
                    )}

                    {cell.cell_type === 'markdown' && (
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown>{cellSource}</ReactMarkdown>
                      </div>
                    )}

                    {cell.cell_type === 'raw' && (
                      <pre className="text-sm font-mono text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                        {cellSource}
                      </pre>
                    )}
                  </div>

                  {/* Output */}
                  {cell.cell_type === 'code' && cell.outputs && cell.outputs.length > 0 && (
                    <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30 p-4">
                      <div className="text-xs font-mono text-slate-500 dark:text-slate-400 mb-2">
                        Out[{cell.execution_count || ' '}]:
                      </div>
                      <div className="space-y-2">
                        {cell.outputs.map((output, outputIndex) => (
                          <div key={outputIndex}>
                            {renderOutput(output)}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

