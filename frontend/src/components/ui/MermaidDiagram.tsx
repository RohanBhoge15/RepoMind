/**
 * Mermaid Diagram Component
 * Renders Mermaid diagrams from markdown code blocks
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

let mermaidInitialized = false;

function ensureMermaidInitialized() {
  if (typeof window !== 'undefined' && !mermaidInitialized) {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      themeVariables: {
        primaryColor: '#6366f1',
        primaryTextColor: '#fff',
        primaryBorderColor: '#4f46e5',
        lineColor: '#6366f1',
        secondaryColor: '#8b5cf6',
        tertiaryColor: '#ec4899',
        background: '#ffffff',
        mainBkg: '#f8fafc',
        secondBkg: '#f1f5f9',
        border1: '#e2e8f0',
        border2: '#cbd5e1',
        note: '#fef3c7',
        noteBorder: '#fbbf24',
        noteBkgColor: '#fef3c7',
        noteTextColor: '#78350f',
        textColor: '#1e293b',
        labelTextColor: '#1e293b',
        fontSize: '14px',
      },
    });
    mermaidInitialized = true;
  }
}

export interface MermaidDiagramProps {
  chart: string;
  className?: string;
  repoId?: number;
  sectionId?: number; // For saving fixed diagrams to database
}

export default function MermaidDiagram({ chart: initialChart, className = '', repoId, sectionId }: MermaidDiagramProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [chart, setChart] = useState<string>(initialChart);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [rawError, setRawError] = useState<string>(''); // Store the actual Mermaid parse error
  const [isRendering, setIsRendering] = useState<boolean>(true);
  const [isRegenerating, setIsRegenerating] = useState<boolean>(false);

  // Update chart when initialChart prop changes
  useEffect(() => {
    setChart(initialChart);
  }, [initialChart]);

  const handleRegenerate = async () => {
    if (!repoId) {
      alert('Cannot regenerate: Repository ID not available');
      return;
    }

    try {
      setIsRegenerating(true);
      setError('');

      // Import apiClient dynamically to avoid circular deps
      const { apiClient } = await import('@/lib/api');
      // Pass the actual error message and section ID so AI can fix and save
      const result = await apiClient.regenerateDiagram(repoId, chart, rawError, sectionId);

      if (result.fixed_diagram) {
        setChart(result.fixed_diagram);
        // The useEffect watching 'chart' will re-render the diagram
      }
    } catch (err: any) {
      console.error('Failed to regenerate diagram:', err);
      setError(`Failed to regenerate: ${err.message || 'Unknown error'}`);
    } finally {
      setIsRegenerating(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    let timeoutId: NodeJS.Timeout;

    const renderDiagram = async () => {
      if (!chart) {
        setError('No diagram content provided');
        setIsRendering(false);
        return;
      }

      setIsRendering(true);
      setError('');
      setSvg('');

      // Add a safety timeout to prevent infinite "Rendering diagram..." state
      timeoutId = setTimeout(() => {
        if (isMounted) {
          setError('Rendering took too long - the diagram may be too complex or invalid');
          setIsRendering(false);
        }
      }, 8000);

      try {
        // Clean up the chart string - remove extra whitespace and newlines
        let cleanedChart = chart.trim();

        // Remove any markdown code fence artifacts
        cleanedChart = cleanedChart.replace(/^```mermaid\n?/i, '').replace(/\n?```$/i, '');
        cleanedChart = cleanedChart.trim();

        // Basic validation - check if it looks like valid Mermaid syntax
        if (!cleanedChart || cleanedChart.length < 5) {
          throw new Error('Invalid or empty diagram');
        }

        // Check if it starts with a valid Mermaid diagram type
        const validStarts = ['graph', 'flowchart', 'sequenceDiagram', 'classDiagram', 'stateDiagram', 'erDiagram', 'journey', 'gantt', 'pie', 'gitGraph'];
        const hasValidStart = validStarts.some(start => cleanedChart.toLowerCase().includes(start.toLowerCase()));

        if (!hasValidStart) {
          // Be lenient, maybe it's a new type or slight variation
          console.warn('Diagram does not start with a standard keyword, attempting render anyway:', cleanedChart.substring(0, 20));
        }

        // Generate unique ID for this diagram
        const id = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        console.log('Rendering Mermaid diagram:', cleanedChart.substring(0, 100) + '...');

        // Render the diagram
        const result = await mermaid.render(id, cleanedChart);

        clearTimeout(timeoutId);

        if (isMounted) {
          if (result && result.svg) {
            setSvg(result.svg);
            setError('');
            setRawError('');
          } else {
            throw new Error('Rendered SVG is empty');
          }
        }

      } catch (err: any) {
        console.error('Mermaid rendering error:', err);
        clearTimeout(timeoutId);

        if (!isMounted) return;

        // Extract meaningful error message
        let errorMsg = 'Failed to render diagram';
        const rawErrorMsg = err?.message || err?.toString() || 'Unknown Mermaid error';

        if (err?.message) {
          if (err.message.includes('Parse error') || err.message.includes('Expecting')) {
            errorMsg = 'Invalid diagram syntax - AI generated incorrect Mermaid code';
          } else if (err.message.includes('timeout')) {
            errorMsg = 'Diagram rendering timed out';
          } else if (err.message.includes('nvalid diagram type')) {
            errorMsg = err.message;
          } else if (err.message.includes('Rendered SVG is empty')) {
            errorMsg = 'Diagram rendered but produced no visual output';
          } else {
            errorMsg = `Rendering failed: ${err.message}`;
          }
        }

        setError(errorMsg);
        setRawError(rawErrorMsg); // Store raw error for AI
        setSvg('');
      } finally {
        if (isMounted) {
          setIsRendering(false);
        }
      }
    };

    renderDiagram();

    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [chart]);

  if (error) {
    return (
      <div className={`p-4 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg ${className}`}>
        <p className="text-sm text-yellow-800 dark:text-yellow-400 font-medium mb-2">
          ⚠️ {error}
        </p>
        <div className="flex items-center gap-3 mb-2">
          {repoId && (
            <button
              onClick={handleRegenerate}
              disabled={isRegenerating}
              className="text-xs px-3 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-800 disabled:cursor-wait text-white rounded-md transition-colors flex items-center gap-1.5"
            >
              {isRegenerating ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Regenerating...
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Regenerate Diagram
                </>
              )}
            </button>
          )}
        </div>
        <details className="text-xs">
          <summary className="cursor-pointer text-yellow-700 dark:text-yellow-500 hover:underline mb-1">
            Show diagram code
          </summary>
          <pre className="mt-2 text-xs text-yellow-600 dark:text-yellow-600 overflow-x-auto bg-yellow-100 dark:bg-yellow-900/20 p-2 rounded border border-yellow-200 dark:border-yellow-800">
            {chart}
          </pre>
        </details>
      </div>
    );
  }

  if (isRendering) {
    return (
      <div className={`p-6 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg ${className}`}>
        <div className="flex items-center justify-center gap-2 text-slate-500 dark:text-slate-400">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-slate-500"></div>
          <span className="text-sm">Rendering diagram...</span>
        </div>
      </div>
    );
  }

  if (!svg) {
    // Only show "No diagram" if we really have no content and no error
    // This state should theoretically be impossible with the logic above unless chart is empty string
    return (
      <div className={`p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg ${className}`}>
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center mb-3">
          {chart ? 'Diagram rendering failed silently' : 'No diagram content to display'}
        </p>

        {chart && (
          <div className="flex flex-col items-center gap-3">
            {repoId && (
              <button
                onClick={handleRegenerate}
                disabled={isRegenerating}
                className="text-xs px-3 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-800 disabled:cursor-wait text-white rounded-md transition-colors flex items-center gap-1.5"
              >
                {isRegenerating ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Regenerating...
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Regenerate Diagram
                  </>
                )}
              </button>
            )}

            <details className="text-xs w-full max-w-md">
              <summary className="cursor-pointer text-slate-500 hover:underline mb-1 text-center">
                Show diagram code
              </summary>
              <pre className="mt-2 text-xs text-slate-600 dark:text-slate-400 overflow-x-auto bg-slate-100 dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-slate-700">
                {chart}
              </pre>
            </details>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={`mermaid-diagram flex justify-center items-center p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg overflow-x-auto ${className}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

