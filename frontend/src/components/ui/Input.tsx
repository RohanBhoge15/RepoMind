'use client';

import { InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  hint?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', label, error, icon, iconPosition = 'left', hint, disabled, id, ...props }, ref) => {
    const reactId = (props.name ?? 'input') + '-' + Math.random().toString(36).slice(2, 8);
    const inputId = id ?? reactId;

    const base =
      'w-full h-11 bg-[hsl(var(--surface-1)/0.6)] backdrop-blur-md border border-[hsl(var(--hairline))] rounded-xl text-[hsl(var(--text-primary))] placeholder:text-[hsl(var(--text-muted))] transition-[border-color,box-shadow] duration-200 outline-none focus:border-[hsl(var(--accent-cyan)/0.6)] focus:shadow-[0_0_0_3px_hsl(var(--accent-cyan)/0.15)] disabled:opacity-50 disabled:cursor-not-allowed';

    const errorStyles = error
      ? 'border-[hsl(var(--danger)/0.6)] focus:border-[hsl(var(--danger))] focus:shadow-[0_0_0_3px_hsl(var(--danger)/0.15)]'
      : '';

    const padL = icon && iconPosition === 'left' ? 'pl-10' : 'pl-4';
    const padR = icon && iconPosition === 'right' ? 'pr-10' : 'pr-4';

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-[12px] font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-2"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {icon && iconPosition === 'left' && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--text-muted))] pointer-events-none">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            type={type}
            disabled={disabled}
            aria-invalid={!!error}
            aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
            className={cn(base, errorStyles, padL, padR, className)}
            {...props}
          />
          {icon && iconPosition === 'right' && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--text-muted))] pointer-events-none">
              {icon}
            </div>
          )}
        </div>
        {error ? (
          <p id={`${inputId}-error`} role="alert" className="mt-2 text-[13px] text-[hsl(var(--danger))]">
            {error}
          </p>
        ) : hint ? (
          <p id={`${inputId}-hint`} className="mt-2 text-[13px] text-[hsl(var(--text-muted))]">
            {hint}
          </p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
