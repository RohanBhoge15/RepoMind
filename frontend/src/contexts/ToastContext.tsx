/**
 * Toast / notification system.
 * Replaces alert() with stacked, animated, dismissible toasts.
 */
'use client';

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertCircle, Info, X, AlertTriangle } from 'lucide-react';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
  duration?: number; // ms; 0 = sticky
}

interface ToastContextValue {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>) => string;
  success: (title: string, message?: string) => string;
  error: (title: string, message?: string) => string;
  info: (title: string, message?: string) => string;
  warning: (title: string, message?: string) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const KIND_META: Record<ToastKind, { icon: typeof CheckCircle2; accent: string }> = {
  success: { icon: CheckCircle2, accent: 'success' },
  error: { icon: AlertCircle, accent: 'danger' },
  info: { icon: Info, accent: 'accent-cyan' },
  warning: { icon: AlertTriangle, accent: 'warning' },
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const meta = KIND_META[toast.kind];
  const Icon = meta.icon;
  const duration = toast.duration ?? (toast.kind === 'error' ? 6000 : 4000);

  useEffect(() => {
    if (duration <= 0) return;
    const t = setTimeout(onDismiss, duration);
    return () => clearTimeout(t);
  }, [duration, onDismiss]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 60, scale: 0.94, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      className="relative overflow-hidden rounded-xl border w-full pointer-events-auto"
      style={{
        background: 'linear-gradient(135deg, hsl(var(--surface-1) / 0.96), hsl(var(--surface-2) / 0.96))',
        borderColor: `hsl(var(--${meta.accent}) / 0.4)`,
        boxShadow: `0 10px 30px hsl(0 0% 0% / 0.4), 0 0 0 1px hsl(var(--${meta.accent}) / 0.18)`,
        backdropFilter: 'blur(12px)',
      }}
    >
      <div
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: `hsl(var(--${meta.accent}))` }}
      />
      <div className="flex items-start gap-3 p-3 pl-4">
        <div
          className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center"
          style={{
            background: `hsl(var(--${meta.accent}) / 0.15)`,
            color: `hsl(var(--${meta.accent}))`,
          }}
        >
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-[hsl(var(--text-primary))] leading-tight">
            {toast.title}
          </div>
          {toast.message && (
            <div className="text-[12px] text-[hsl(var(--text-secondary))] mt-0.5 leading-snug break-words">
              {toast.message}
            </div>
          )}
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="flex-shrink-0 p-1 rounded-md text-[hsl(var(--text-muted))] hover:text-[hsl(var(--text-primary))] hover:bg-[hsl(var(--surface-2))] transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {duration > 0 && (
        <motion.div
          className="absolute bottom-0 left-0 h-0.5"
          style={{ background: `hsl(var(--${meta.accent}))` }}
          initial={{ width: '100%' }}
          animate={{ width: '0%' }}
          transition={{ duration: duration / 1000, ease: 'linear' }}
        />
      )}
    </motion.div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((t: Omit<Toast, 'id'>): string => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((cur) => [...cur, { ...t, id }].slice(-6));
    return id;
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((cur) => cur.filter((t) => t.id !== id));
  }, []);

  const success = useCallback((title: string, message?: string) => push({ kind: 'success', title, message }), [push]);
  const error = useCallback((title: string, message?: string) => push({ kind: 'error', title, message }), [push]);
  const info = useCallback((title: string, message?: string) => push({ kind: 'info', title, message }), [push]);
  const warning = useCallback((title: string, message?: string) => push({ kind: 'warning', title, message }), [push]);

  return (
    <ToastContext.Provider value={{ toasts, push, success, error, info, warning, dismiss }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[min(360px,calc(100vw-2rem))] pointer-events-none"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
