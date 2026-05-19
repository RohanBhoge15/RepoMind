/**
 * Animated indexing status component with live chunking and embedding animations
 */
'use client';

import { useEffect, useState } from 'react';
import { IndexingStatus } from '@/lib/types';
import { Loader2, FileText, Scissors, Sparkles, Database } from 'lucide-react';

interface IndexingAnimationProps {
  status: IndexingStatus;
  progress: number;
  message?: string;
}

export default function IndexingAnimation({ status, progress, message }: IndexingAnimationProps) {
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; delay: number }>>([]);

  // Generate particles for chunking and embedding animations
  useEffect(() => {
    if (status === IndexingStatus.CHUNKING || status === IndexingStatus.EMBEDDING) {
      const newParticles = Array.from({ length: 8 }, (_, i) => ({
        id: Date.now() + i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        delay: Math.random() * 2,
      }));
      setParticles(newParticles);
    } else {
      setParticles([]);
    }
  }, [status]);

  const getStatusIcon = () => {
    switch (status) {
      case IndexingStatus.CLONING:
        return <Database className="w-5 h-5 text-blue-500 animate-pulse" />;
      case IndexingStatus.ANALYZING:
        return <FileText className="w-5 h-5 text-purple-500 animate-pulse" />;
      case IndexingStatus.CHUNKING:
        return <Scissors className="w-5 h-5 text-orange-500" />;
      case IndexingStatus.EMBEDDING:
        return <Sparkles className="w-5 h-5 text-pink-500" />;
      case IndexingStatus.GENERATING_DOCS:
        return <FileText className="w-5 h-5 text-green-500 animate-pulse" />;
      default:
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
    }
  };

  const getStatusText = () => {
    return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ');
  };

  const getStatusColor = () => {
    switch (status) {
      case IndexingStatus.CLONING:
        return 'bg-blue-500';
      case IndexingStatus.ANALYZING:
        return 'bg-purple-500';
      case IndexingStatus.CHUNKING:
        return 'bg-orange-500';
      case IndexingStatus.EMBEDDING:
        return 'bg-pink-500';
      case IndexingStatus.GENERATING_DOCS:
        return 'bg-green-500';
      default:
        return 'bg-blue-500';
    }
  };

  return (
    <div className="mb-4">
      {/* Status header with icon */}
      <div className="flex items-center justify-between text-sm mb-2">
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <span className="text-gray-700 dark:text-gray-300 font-medium">
            {getStatusText()}
          </span>
        </div>
        <span className="text-gray-600 dark:text-gray-400 font-semibold">
          {progress}%
        </span>
      </div>

      {/* Progress bar with animation */}
      <div className="relative w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
        {/* Main progress bar */}
        <div
          className={`${getStatusColor()} h-3 rounded-full transition-all duration-500 ease-out relative`}
          style={{ width: `${progress}%` }}
        >
          {/* Shimmer effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
        </div>

        {/* Chunking animation - flying scissors */}
        {status === IndexingStatus.CHUNKING && (
          <div className="absolute inset-0 pointer-events-none">
            {particles.map((particle) => (
              <div
                key={particle.id}
                className="absolute animate-float-particle"
                style={{
                  left: `${particle.x}%`,
                  top: `${particle.y}%`,
                  animationDelay: `${particle.delay}s`,
                }}
              >
                <Scissors className="w-3 h-3 text-orange-400 opacity-60 animate-spin-slow" />
              </div>
            ))}
          </div>
        )}

        {/* Embedding animation - sparkles */}
        {status === IndexingStatus.EMBEDDING && (
          <div className="absolute inset-0 pointer-events-none">
            {particles.map((particle) => (
              <div
                key={particle.id}
                className="absolute animate-sparkle"
                style={{
                  left: `${particle.x}%`,
                  top: `${particle.y}%`,
                  animationDelay: `${particle.delay}s`,
                }}
              >
                <Sparkles className="w-3 h-3 text-pink-400 opacity-70" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Status message */}
      {message && (
        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 italic">
          {message}
        </div>
      )}

      {/* Detailed status info for chunking and embedding */}
      {(status === IndexingStatus.CHUNKING || status === IndexingStatus.EMBEDDING) && (
        <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 text-xs">
            {status === IndexingStatus.CHUNKING ? (
              <>
                <Scissors className="w-4 h-4 text-orange-500 animate-pulse" />
                <div className="flex-1">
                  <div className="font-medium text-gray-700 dark:text-gray-300">
                    Breaking code into chunks...
                  </div>
                  <div className="text-gray-500 dark:text-gray-400 mt-1">
                    Splitting files into semantic code blocks for better analysis
                  </div>
                </div>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-pink-500 animate-pulse" />
                <div className="flex-1">
                  <div className="font-medium text-gray-700 dark:text-gray-300">
                    Generating embeddings...
                  </div>
                  <div className="text-gray-500 dark:text-gray-400 mt-1">
                    Creating vector representations for semantic search
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Animated progress dots */}
          <div className="flex items-center gap-1 mt-2">
            <div className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" style={{ animationDelay: '0s' }} />
            <div className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" style={{ animationDelay: '0.2s' }} />
            <div className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" style={{ animationDelay: '0.4s' }} />
          </div>
        </div>
      )}
    </div>
  );
}

