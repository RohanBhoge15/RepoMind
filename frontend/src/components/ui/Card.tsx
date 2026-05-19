'use client';

import { forwardRef, useRef } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface CardProps {
  variant?: 'default' | 'glass' | 'neu' | 'gradient' | 'outline';
  hover?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  animated?: boolean;
  className?: string;
  children?: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      className,
      variant = 'default',
      hover = true,
      padding = 'md',
      animated = true,
      children,
      onClick,
    },
    ref
  ) => {
    const localRef = useRef<HTMLDivElement | null>(null);

    const handleMouseMove: React.MouseEventHandler<HTMLDivElement> = (e) => {
      const el = (localRef.current ?? (e.currentTarget as HTMLDivElement));
      const rect = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - rect.left}px`);
      el.style.setProperty('--my', `${e.clientY - rect.top}px`);
    };

    const base = 'relative rounded-2xl transition-[border-color,box-shadow,transform] duration-300';

    const variants = {
      default:
        'bg-[hsl(var(--surface-1)/0.7)] backdrop-blur-md border border-[hsl(var(--hairline))] shadow-soft',
      glass: 'glass shadow-soft',
      neu: 'bg-[hsl(var(--surface-2))] shadow-[inset_0_1px_0_hsl(var(--hairline-strong)/0.3),0_8px_24px_hsl(0_0%_0%/0.3)]',
      gradient:
        'bg-[linear-gradient(135deg,hsl(var(--surface-1))_0%,hsl(var(--surface-2))_100%)] border border-[hsl(var(--hairline))]',
      outline:
        'border border-[hsl(var(--hairline-strong))] bg-transparent hover:border-[hsl(var(--accent-cyan)/0.5)]',
    };

    const paddings = {
      none: '',
      sm: 'p-3',
      md: 'p-4',
      lg: 'p-6',
      xl: 'p-8',
    };

    const setRef = (node: HTMLDivElement | null) => {
      localRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
    };

    const Component = animated ? motion.div : 'div';
    const motionProps = animated
      ? {
          initial: { opacity: 0, y: 16 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
        }
      : {};

    return (
      <Component
        ref={setRef as any}
        onClick={onClick}
        onMouseMove={hover ? handleMouseMove : undefined}
        className={cn(
          base,
          variants[variant],
          paddings[padding],
          hover && 'spotlight lift',
          onClick && 'cursor-pointer',
          className
        )}
        {...motionProps}
      >
        {children}
      </Component>
    );
  }
);

Card.displayName = 'Card';

export default Card;
