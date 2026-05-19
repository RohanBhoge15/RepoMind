/**
 * Documentation tab — AI-generated, section-based docs.
 */
'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiClient } from '@/lib/api';
import { Documentation } from '@/lib/types';
import {
  Loader2,
  BookOpen,
  ChevronRight,
  ChevronLeft,
  FileText,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import MermaidDiagram from '@/components/ui/MermaidDiagram';
import CodeBlock from '@/components/ui/CodeBlock';

export default function DocsPage({ params }: { params: { id: string } }) {
  const { data: session } = useSession();
  const repoId = parseInt(params.id);

  const [documentation, setDocumentation] = useState<Documentation | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<number>(0);
  const [isRegenerating, setIsRegenerating] = useState(false);

  useEffect(() => {
    if (session) {
      const backendToken = (session as any).backendToken;
      if (backendToken) apiClient.setAuthToken(backendToken);
      loadDocumentation();
    }
  }, [session, repoId]);

  const loadDocumentation = async () => {
    try {
      setLoading(true);
      const docs = await apiClient.getDocumentation(repoId);
      setDocumentation(docs);
    } catch (err) {
      console.error('Failed to load documentation:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateAll = async () => {
    try {
      setIsRegenerating(true);
      const docs = await apiClient.regenerateAllDocumentation(repoId);
      setDocumentation(docs);
      setActiveSection(0);
    } catch (err) {
      console.error('Failed to regenerate documentation:', err);
      alert('Failed to regenerate documentation. Please try again.');
    } finally {
      setIsRegenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--accent-cyan))]" />
      </div>
    );
  }

  if (!documentation || documentation.sections.length === 0) {
    return (
      <div className="px-6 py-12 h-full overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-xl mx-auto"
        >
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl flex items-center justify-center bg-[linear-gradient(135deg,hsl(var(--accent-cyan)),hsl(var(--accent-violet)))] shadow-[0_0_24px_-6px_hsl(var(--accent-cyan)/0.6)]">
            <BookOpen className="w-7 h-7 text-white" />
          </div>
          <h3 className="text-xl font-semibold text-[hsl(var(--text-primary))] mb-2 tracking-tight">
            No documentation yet
          </h3>
          <p className="text-[hsl(var(--text-secondary))]">
            Docs are generated during repository indexing.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-8 relative">
      <AnimatePresence>
        {isRegenerating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[hsl(var(--bg-base)/0.7)] backdrop-blur-md z-50 flex items-center justify-center"
          >
            <Card variant="glass" padding="lg" className="text-center">
              <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--accent-violet))] mx-auto mb-3" />
              <p className="text-[hsl(var(--text-primary))] font-medium">
                Regenerating documentation…
              </p>
              <p className="mono text-[11px] uppercase tracking-widest text-[hsl(var(--text-muted))] mt-1.5">
                This may take a minute
              </p>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex gap-8 max-w-6xl mx-auto">
        <motion.aside
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          className="w-64 flex-shrink-0"
        >
          <div className="sticky top-4">
            <Card variant="glass" padding="md">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[hsl(var(--accent-cyan))]" />
                  <h3 className="mono text-[10px] uppercase tracking-widest text-[hsl(var(--accent-cyan))]">
                    Contents
                  </h3>
                </div>
                <motion.button
                  onClick={handleRegenerateAll}
                  disabled={isRegenerating}
                  className="p-1.5 rounded-md bg-[hsl(var(--accent-violet)/0.12)] hover:bg-[hsl(var(--accent-violet)/0.2)] border border-[hsl(var(--accent-violet)/0.3)] text-[hsl(var(--accent-violet))] transition-colors disabled:opacity-50"
                  title="Regenerate documentation"
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <RefreshCw className={`w-3 h-3 ${isRegenerating ? 'animate-spin' : ''}`} />
                </motion.button>
              </div>

              {documentation.sections.length === 1 && (
                <p className="text-[11px] text-[hsl(var(--warning))] mb-3 p-2 bg-[hsl(var(--warning)/0.08)] border border-[hsl(var(--warning)/0.25)] rounded">
                  Only 1 section detected. Try regenerating.
                </p>
              )}

              <nav className="space-y-0.5">
                {documentation.sections.map((section, idx) => (
                  <motion.button
                    key={section.id}
                    onClick={() => setActiveSection(idx)}
                    whileHover={{ x: 2 }}
                    className={`block w-full text-left px-2.5 py-2 text-[13px] rounded-lg transition-colors ${
                      activeSection === idx
                        ? 'bg-[hsl(var(--accent-cyan)/0.12)] text-[hsl(var(--accent-cyan))] font-medium border border-[hsl(var(--accent-cyan)/0.3)]'
                        : 'text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--surface-2)/0.6)] hover:text-[hsl(var(--text-primary))] border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      {activeSection === idx && <ChevronRight className="w-3 h-3 flex-shrink-0" />}
                      <span className={activeSection !== idx ? 'ml-[18px]' : ''}>
                        {section.section_name}
                      </span>
                    </div>
                  </motion.button>
                ))}
              </nav>
            </Card>
          </div>
        </motion.aside>

        <div className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
            >
              <Card variant="default" padding="lg">
                <div className="flex items-start gap-3 mb-6 pb-6 border-b border-[hsl(var(--hairline))]">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-[linear-gradient(135deg,hsl(var(--accent-cyan)),hsl(var(--accent-violet)))] shadow-[0_0_18px_-4px_hsl(var(--accent-cyan)/0.5)]">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-[hsl(var(--text-primary))] mb-1 tracking-tight">
                      {documentation.sections[activeSection].section_name}
                    </h2>
                    <p className="mono text-[11px] uppercase tracking-widest text-[hsl(var(--text-muted))]">
                      Section {activeSection + 1} / {documentation.sections.length}
                    </p>
                  </div>
                </div>

                <div className="prose prose-invert max-w-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h2: ({ children }) => (
                        <h2 className="flex items-center gap-3 text-xl font-bold text-[hsl(var(--accent-cyan))] mt-8 mb-4 pb-2 border-b border-[hsl(var(--hairline))]">
                          <span className="w-1 h-5 bg-[linear-gradient(180deg,hsl(var(--accent-cyan)),hsl(var(--accent-violet)))] rounded-full" />
                          {children}
                        </h2>
                      ),
                      h3: ({ children }) => (
                        <h3 className="flex items-center gap-2 text-lg font-semibold text-[hsl(var(--accent-violet))] mt-6 mb-3">
                          <span className="w-1.5 h-1.5 bg-[hsl(var(--accent-violet))] rounded-full" />
                          {children}
                        </h3>
                      ),
                      h4: ({ children }) => (
                        <h4 className="text-base font-semibold text-[hsl(var(--text-primary))] mt-4 mb-2">
                          {children}
                        </h4>
                      ),
                      p: ({ children }) => (
                        <p className="text-[hsl(var(--text-secondary))] leading-[1.75] my-3 text-[14.5px]">
                          {children}
                        </p>
                      ),
                      ul: ({ children }) => <ul className="my-4 ml-2 space-y-1.5">{children}</ul>,
                      ol: ({ children }) => (
                        <ol className="my-4 ml-6 space-y-1.5 list-decimal">{children}</ol>
                      ),
                      li: ({ children }) => (
                        <li className="flex items-start gap-2 text-[hsl(var(--text-secondary))] text-[14.5px]">
                          <span className="w-1 h-1 bg-[hsl(var(--accent-cyan))] rounded-full mt-2.5 flex-shrink-0" />
                          <span>{children}</span>
                        </li>
                      ),
                      strong: ({ children }) => (
                        <strong className="font-semibold text-[hsl(var(--text-primary))]">
                          {children}
                        </strong>
                      ),
                      a: ({ children, href }) => (
                        <a
                          href={href}
                          className="text-[hsl(var(--accent-cyan))] hover:underline"
                          target="_blank"
                          rel="noreferrer"
                        >
                          {children}
                        </a>
                      ),
                      blockquote: ({ children }) => (
                        <blockquote className="border-l-2 border-[hsl(var(--accent-cyan))] bg-[hsl(var(--accent-cyan)/0.05)] px-4 py-2 my-4 rounded-r-lg text-[hsl(var(--text-secondary))] italic">
                          {children}
                        </blockquote>
                      ),
                      hr: () => <hr className="my-8 border-[hsl(var(--hairline))]" />,
                      code({ node, className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className || '');
                        const language = match ? match[1] : '';
                        const codeString = String(children).replace(/\n$/, '');
                        const isInline = !match;

                        if (language === 'mermaid' || (isInline && codeString.trim().startsWith('mermaid'))) {
                          const chart = isInline ? codeString.replace(/^mermaid\s+/, '') : codeString;
                          return (
                            <MermaidDiagram
                              chart={chart}
                              className="my-6"
                              repoId={repoId}
                              sectionId={documentation.sections[activeSection].id}
                            />
                          );
                        }

                        if (!isInline && language) {
                          return (
                            <CodeBlock
                              code={codeString}
                              language={language}
                              showLineNumbers={false}
                              className="my-4"
                            />
                          );
                        }

                        return (
                          <code
                            className="px-1.5 py-0.5 mono text-[12.5px] rounded border border-[hsl(var(--accent-cyan)/0.25)] bg-[hsl(var(--accent-cyan)/0.1)] text-[hsl(var(--accent-cyan))]"
                            {...props}
                          >
                            {children}
                          </code>
                        );
                      },
                    }}
                  >
                    {(() => {
                      const content = documentation.sections[activeSection].content;
                      if (!content) return '';
                      return content
                        .replace(/([^\n])(```mermaid)/g, '$1\n$2')
                        .replace(/(```mermaid)([^\n])/g, '$1\n$2')
                        .replace(/([^\n])(```)(?:\s+)?(?:\n|$)/g, '$1\n$2');
                    })()}
                  </ReactMarkdown>
                </div>

                <div className="flex justify-between items-center mt-8 pt-6 border-t border-[hsl(var(--hairline))]">
                  <Button
                    onClick={() => setActiveSection(Math.max(0, activeSection - 1))}
                    disabled={activeSection === 0}
                    variant="outline"
                    size="md"
                    icon={<ChevronLeft className="w-4 h-4" />}
                    iconPosition="left"
                  >
                    Previous
                  </Button>

                  <span className="mono text-[11px] uppercase tracking-widest text-[hsl(var(--text-muted))]">
                    {activeSection + 1} / {documentation.sections.length}
                  </span>

                  <Button
                    onClick={() =>
                      setActiveSection(
                        Math.min(documentation.sections.length - 1, activeSection + 1),
                      )
                    }
                    disabled={activeSection === documentation.sections.length - 1}
                    variant="gradient"
                    size="md"
                    icon={<ChevronRight className="w-4 h-4" />}
                    iconPosition="right"
                  >
                    Next
                  </Button>
                </div>
              </Card>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
