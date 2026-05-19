'use client';

import { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface LoadingSkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'circular' | 'rectangular' | 'card';
  width?: string | number;
  height?: string | number;
  count?: number;
}

export default function LoadingSkeleton({
  className,
  variant = 'rectangular',
  width,
  height,
  count = 1,
  ...props
}: LoadingSkeletonProps) {
  const base = 'skeleton';
  const variants = {
    text: 'h-4 rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
    card: 'h-48 rounded-2xl',
  };
  const style = {
    width: width ?? (variant === 'circular' ? height : undefined),
    height: height ?? undefined,
  };

  if (count > 1) {
    return (
      <div className="space-y-3">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className={cn(base, variants[variant], className)} style={style} {...props} />
        ))}
      </div>
    );
  }
  return <div className={cn(base, variants[variant], className)} style={style} {...props} />;
}

export function RepoCardSkeleton() {
  return (
    <div className="bg-[hsl(var(--surface-1)/0.6)] backdrop-blur-md rounded-2xl border border-[hsl(var(--hairline))] p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-2">
          <LoadingSkeleton variant="text" width="60%" height="1.5rem" />
          <LoadingSkeleton variant="text" width="40%" height="1rem" />
        </div>
        <LoadingSkeleton variant="rectangular" width="5rem" height="1.5rem" />
      </div>
      <LoadingSkeleton variant="text" count={2} />
      <div className="flex gap-2 pt-2">
        <LoadingSkeleton variant="rectangular" width="5rem" height="2rem" />
        <LoadingSkeleton variant="rectangular" width="2rem" height="2rem" />
      </div>
    </div>
  );
}

export function ChatMessageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <LoadingSkeleton variant="rectangular" width="60%" height="3rem" className="rounded-2xl" />
      </div>
      <div className="flex justify-start">
        <LoadingSkeleton variant="rectangular" width="80%" height="6rem" className="rounded-2xl" />
      </div>
    </div>
  );
}
