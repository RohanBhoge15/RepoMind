import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import CommandPalette from '@/components/ui/CommandPalette';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'RepoMind — AI-native codebase intelligence',
  description: 'Index, explore, and chat with any GitHub repository. AI-powered documentation, semantic search, and dependency graphs.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var t = localStorage.getItem('theme');
                var root = document.documentElement;
                if (t === 'light') {
                  root.classList.remove('dark');
                  root.classList.add('light');
                } else {
                  root.classList.add('dark');
                  root.classList.remove('light');
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className={inter.className}>
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <Providers>
          <div id="main-content">{children}</div>
          <CommandPalette />
        </Providers>
      </body>
    </html>
  );
}
