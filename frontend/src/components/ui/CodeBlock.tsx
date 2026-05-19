'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface CodeBlockProps {
  code: string;
  language?: string;
  fileName?: string;
  showLineNumbers?: boolean;
  className?: string;
}

export default function CodeBlock({
  code,
  language = 'typescript',
  fileName,
  showLineNumbers = true,
  className,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* no-op */
    }
  };

  const lines = code.split('\n');

  return (
    <div
      className={cn(
        'relative group rounded-xl overflow-hidden border border-[hsl(var(--hairline))]',
        'bg-[hsl(var(--bg-elevated))]',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 h-10 border-b border-[hsl(var(--hairline))] bg-[hsl(var(--surface-2)/0.6)] backdrop-blur-md">
        <div className="flex items-center gap-3 min-w-0">
          {/* mac dots */}
          <div className="flex gap-1.5 flex-shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-[hsl(0_70%_60%/0.7)]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[hsl(40_90%_60%/0.7)]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[hsl(140_60%_55%/0.7)]" />
          </div>
          {fileName && (
            <span className="mono text-[12px] text-[hsl(var(--text-secondary))] truncate">{fileName}</span>
          )}
          {language && (
            <span className="mono text-[10px] uppercase tracking-widest text-[hsl(var(--accent-cyan))] bg-[hsl(var(--accent-cyan)/0.1)] border border-[hsl(var(--accent-cyan)/0.25)] rounded px-1.5 py-0.5">
              {language}
            </span>
          )}
        </div>

        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 px-2 h-7 rounded-md text-[12px] text-[hsl(var(--text-muted))] hover:text-[hsl(var(--text-primary))] hover:bg-[hsl(var(--surface-3)/0.6)] transition-colors"
          aria-label="Copy code"
        >
          <AnimatePresence mode="wait" initial={false}>
            {copied ? (
              <motion.span
                key="copied"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="inline-flex items-center gap-1.5 text-[hsl(var(--success))]"
              >
                <Check className="w-3.5 h-3.5" /> Copied
              </motion.span>
            ) : (
              <motion.span
                key="copy"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="inline-flex items-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" /> Copy
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>

      {/* Code */}
      <div className="overflow-x-auto">
        <pre className="p-4 text-[13px] mono leading-[1.65]">
          <code className="text-[hsl(var(--text-primary))]">
            {showLineNumbers ? (
              <div className="flex">
                <div className="select-none pr-4 mr-4 text-right border-r border-[hsl(var(--hairline))] text-[hsl(var(--text-muted))]">
                  {lines.map((_, i) => (
                    <div key={i}>{i + 1}</div>
                  ))}
                </div>
                <div className="flex-1">
                  {lines.map((line, i) => (
                    <div key={i}>{line || '\u00A0'}</div>
                  ))}
                </div>
              </div>
            ) : (
              code
            )}
          </code>
        </pre>
      </div>
    </div>
  );
}

export function InlineCode({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <code
      className={cn(
        'px-1.5 py-0.5 rounded-md mono text-[0.85em] border border-[hsl(var(--accent-cyan)/0.25)] bg-[hsl(var(--accent-cyan)/0.1)] text-[hsl(var(--accent-cyan))]',
        className
      )}
    >
      {children}
    </code>
  );
}
