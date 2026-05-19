'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { User, Sparkles, Code } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import MermaidDiagram from './MermaidDiagram';
import CodeBlock from './CodeBlock';

export interface ChatBubbleProps {
  message: string;
  isUser: boolean;
  timestamp?: string;
  loading?: boolean;
  contextChunks?: Array<{
    file_path: string;
    start_line: number;
    end_line: number;
    content: string;
  }>;
  className?: string;
}

function AiAvatar() {
  return (
    <div className="relative flex-shrink-0 w-9 h-9 rounded-xl grid place-items-center bg-[linear-gradient(135deg,hsl(var(--accent-cyan)),hsl(var(--accent-violet)))] shadow-neon-cyan">
      <Sparkles className="w-4 h-4 text-white" strokeWidth={2.2} />
    </div>
  );
}

function UserAvatar() {
  return (
    <div className="flex-shrink-0 w-9 h-9 rounded-xl grid place-items-center border border-[hsl(var(--hairline-strong))] bg-[hsl(var(--surface-2))] text-[hsl(var(--text-secondary))]">
      <User className="w-4 h-4" />
    </div>
  );
}

export default function ChatBubble({
  message,
  isUser,
  timestamp,
  loading = false,
  contextChunks,
  className,
}: ChatBubbleProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={cn('flex gap-3', isUser ? 'justify-end' : 'justify-start', className)}
    >
      {!isUser && <AiAvatar />}

      <div className={cn('max-w-[85%] space-y-3', isUser && 'flex flex-col items-end')}>
        <div
          className={cn(
            'px-4 py-3 rounded-2xl',
            isUser
              ? 'bg-[linear-gradient(135deg,hsl(var(--accent-cyan)/0.95),hsl(var(--accent-blue)/0.95))] text-white rounded-br-md shadow-[0_8px_24px_-8px_hsl(var(--accent-blue)/0.5)]'
              : 'glass-strong text-[hsl(var(--text-primary))] rounded-tl-md'
          )}
        >
          {loading ? (
            <div className="flex gap-1.5 py-1.5">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="w-2 h-2 rounded-full bg-[hsl(var(--accent-cyan))]"
                  animate={{ y: [0, -6, 0], opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
                />
              ))}
            </div>
          ) : (
            <div
              className={cn(
                'text-[14.5px] leading-relaxed prose prose-sm max-w-none',
                isUser
                  ? 'prose-invert prose-headings:text-white prose-p:text-white prose-strong:text-white prose-code:text-white'
                  : 'prose-invert prose-headings:text-[hsl(var(--text-primary))] prose-p:text-[hsl(var(--text-secondary))] prose-strong:text-[hsl(var(--text-primary))]'
              )}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || '');
                    const language = match ? match[1] : '';
                    const codeString = String(children).replace(/\n$/, '');
                    const isInline = !match;

                    if (language === 'mermaid') {
                      return <MermaidDiagram chart={codeString} className="my-3 -mx-1" />;
                    }
                    if (!isInline && language) {
                      return (
                        <CodeBlock
                          code={codeString}
                          language={language}
                          showLineNumbers={false}
                          className="my-3 -mx-1"
                        />
                      );
                    }
                    return (
                      <code
                        className={cn(
                          'px-1.5 py-0.5 rounded-md mono text-[0.85em]',
                          isUser
                            ? 'bg-white/20 text-white'
                            : 'bg-[hsl(var(--accent-cyan)/0.1)] text-[hsl(var(--accent-cyan))] border border-[hsl(var(--accent-cyan)/0.2)]',
                          className
                        )}
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  },
                  p({ children }) {
                    return <p className="mb-3 last:mb-0">{children}</p>;
                  },
                  ul({ children }) {
                    return <ul className="my-2 space-y-1 list-disc pl-5">{children}</ul>;
                  },
                  ol({ children }) {
                    return <ol className="my-2 space-y-1 list-decimal pl-5">{children}</ol>;
                  },
                  h1({ children }) {
                    return <h1 className="text-lg font-semibold mb-3 mt-3 first:mt-0">{children}</h1>;
                  },
                  h2({ children }) {
                    return <h2 className="text-base font-semibold mb-2 mt-3 first:mt-0">{children}</h2>;
                  },
                  h3({ children }) {
                    return <h3 className="text-[15px] font-semibold mb-2 mt-2 first:mt-0">{children}</h3>;
                  },
                }}
              >
                {message}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {!isUser && contextChunks && contextChunks.length > 0 && (
          <div className="space-y-2 w-full">
            <p className="text-[11px] mono uppercase tracking-wider text-[hsl(var(--text-muted))] flex items-center gap-1.5">
              <Code className="w-3 h-3" /> Referenced
            </p>
            {contextChunks.slice(0, 3).map((chunk, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.08 }}
                className="rounded-xl border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-1)/0.6)] backdrop-blur-md p-3"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="mono text-[12px] text-[hsl(var(--accent-cyan))] truncate">
                    {chunk.file_path}
                  </span>
                  <span className="mono text-[11px] text-[hsl(var(--text-muted))] flex-shrink-0">
                    L{chunk.start_line}–{chunk.end_line}
                  </span>
                </div>
                <pre className="text-[12px] mono text-[hsl(var(--text-secondary))] overflow-x-auto bg-[hsl(var(--bg-base)/0.6)] rounded-lg p-2.5 border border-[hsl(var(--hairline))]">
                  <code>{chunk.content.slice(0, 200)}…</code>
                </pre>
              </motion.div>
            ))}
          </div>
        )}

        {timestamp && (
          <p className="text-[11px] text-[hsl(var(--text-muted))] mono px-1">{timestamp}</p>
        )}
      </div>

      {isUser && <UserAvatar />}
    </motion.div>
  );
}

export function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-3 justify-start"
    >
      <AiAvatar />
      <div className="glass-strong rounded-2xl rounded-tl-md px-4 py-3">
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="w-2 h-2 rounded-full bg-[hsl(var(--accent-cyan))]"
              animate={{ y: [0, -6, 0], opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
