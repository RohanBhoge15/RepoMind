'use client';

import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline' | 'gradient' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  title?: string;
  id?: string;
  type?: 'button' | 'submit' | 'reset';
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-expanded'?: boolean;
  'aria-controls'?: string;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      loading = false,
      disabled,
      icon,
      iconPosition = 'left',
      fullWidth = false,
      children,
      onClick,
      title,
      id,
      type = 'button',
      ...rest
    },
    ref
  ) => {
    const ariaProps = rest as Record<string, unknown>;
    const base =
      'relative inline-flex items-center justify-center gap-2 font-medium tracking-tight rounded-xl gpu press select-none disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none transition-[background,border-color,color,box-shadow] duration-200 ease-out';

    const variants = {
      primary: [
        'bg-[hsl(var(--accent-cyan))] text-[hsl(var(--text-inverse))]',
        'shadow-[0_0_0_1px_hsl(var(--accent-cyan)/0.5),0_8px_24px_-4px_hsl(var(--accent-cyan)/0.45)]',
        'hover:bg-[hsl(var(--accent-cyan)/0.92)]',
        'hover:shadow-[0_0_0_1px_hsl(var(--accent-cyan)/0.7),0_12px_36px_-4px_hsl(var(--accent-cyan)/0.6)]',
      ].join(' '),

      secondary: [
        'glass text-[hsl(var(--text-primary))]',
        'hover:bg-[hsl(var(--surface-2)/0.85)]',
        'hover:border-[hsl(var(--hairline-strong))]',
      ].join(' '),

      ghost:
        'text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--text-primary))] hover:bg-[hsl(var(--surface-2)/0.6)]',

      outline: [
        'border border-[hsl(var(--hairline-strong))] text-[hsl(var(--text-primary))] bg-transparent',
        'hover:border-[hsl(var(--accent-cyan)/0.6)] hover:text-[hsl(var(--accent-cyan))]',
        'hover:shadow-[0_0_0_1px_hsl(var(--accent-cyan)/0.3),0_0_24px_-4px_hsl(var(--accent-cyan)/0.4)]',
      ].join(' '),

      gradient: [
        'text-white border border-white/10',
        'bg-[linear-gradient(120deg,hsl(var(--accent-cyan))_0%,hsl(var(--accent-blue))_50%,hsl(var(--accent-violet))_100%)]',
        'bg-[length:200%_100%] [background-position:0%_0%]',
        'hover:[background-position:100%_0%]',
        'shadow-[0_0_0_1px_hsl(var(--accent-blue)/0.5),0_10px_30px_-4px_hsl(var(--accent-violet)/0.45)]',
        'hover:shadow-[0_0_0_1px_hsl(var(--accent-cyan)/0.6),0_14px_40px_-4px_hsl(var(--accent-violet)/0.6)]',
        'transition-[background-position,box-shadow] duration-500 ease-out',
      ].join(' '),

      danger: [
        'bg-[hsl(var(--danger))] text-white',
        'shadow-[0_0_0_1px_hsl(var(--danger)/0.5),0_8px_24px_-4px_hsl(var(--danger)/0.45)]',
        'hover:brightness-110',
      ].join(' '),
    };

    const sizes = {
      sm: 'h-8 px-3 text-[13px]',
      md: 'h-10 px-4 text-sm',
      lg: 'h-12 px-6 text-base',
      xl: 'h-14 px-8 text-lg',
    };

    const isDisabled = disabled || loading;

    return (
      <motion.button
        ref={ref}
        type={type}
        id={id}
        title={title}
        disabled={isDisabled}
        onClick={onClick}
        aria-label={ariaProps['aria-label'] as string | undefined}
        aria-describedby={ariaProps['aria-describedby'] as string | undefined}
        aria-expanded={ariaProps['aria-expanded'] as boolean | undefined}
        aria-controls={ariaProps['aria-controls'] as string | undefined}
        aria-busy={loading || undefined}
        whileHover={!isDisabled ? { y: -1 } : undefined}
        whileTap={!isDisabled ? { y: 0, scale: 0.98 } : undefined}
        transition={{ type: 'spring', stiffness: 500, damping: 30, mass: 0.6 }}
        className={cn(base, variants[variant], sizes[size], fullWidth && 'w-full', className)}
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {!loading && icon && iconPosition === 'left' && <span className="inline-flex">{icon}</span>}
        {children && <span className="inline-flex items-center">{children}</span>}
        {!loading && icon && iconPosition === 'right' && <span className="inline-flex">{icon}</span>}
      </motion.button>
    );
  }
);

Button.displayName = 'Button';

export default Button;
