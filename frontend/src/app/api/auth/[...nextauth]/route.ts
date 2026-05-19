/**
 * NextAuth configuration for GitHub OAuth.
 */
import NextAuth, { NextAuthOptions } from 'next-auth';
import { JWT } from 'next-auth/jwt';
import { apiClient } from '@/lib/api';

const authOptions: NextAuthOptions = {
  providers: [
    {
      id: 'github',
      name: 'GitHub',
      type: 'oauth',
      authorization: {
        url: 'https://github.com/login/oauth/authorize',
        params: { scope: 'repo user' },
      },
      token: 'https://github.com/login/oauth/access_token',
      userinfo: 'https://api.github.com/user',
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      profile(profile) {
        return {
          id: profile.id.toString(),
          name: profile.login,
          email: profile.email,
          image: profile.avatar_url,
        };
      },
    },
  ],
  callbacks: {
    async jwt({ token, account, profile, trigger }) {
      // On initial sign in, exchange GitHub code for backend token
      if (account && account.provider === 'github') {
        try {
          console.log('🔐 Exchanging GitHub token with backend...');

          // Server-side calls go via BACKEND_INTERNAL_URL (e.g. http://backend:8000 inside docker).
          // NEXT_PUBLIC_API_URL is for browser-side calls only.
          const backendUrl = process.env.BACKEND_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

          // Exchange GitHub access token with backend with retry logic
          const maxRetries = 5;
          let lastError: Error | null = null;

          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
              console.log(`🔄 Attempt ${attempt}/${maxRetries} to connect to backend at ${backendUrl}`);

              const response = await fetch(`${backendUrl}/auth/github/callback`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  code: account.access_token,
                }),
                signal: AbortSignal.timeout(15000), // 15 second timeout
              });

              if (response.ok) {
                const data = await response.json();
                token.backendToken = data.access_token;
                token.backendTokenTimestamp = Date.now();
                console.log('✅ Backend token received and stored successfully');
                break; // Success, exit retry loop
              } else {
                const errorText = await response.text();
                console.error(`❌ Backend returned error ${response.status}:`, errorText);
                lastError = new Error(`Backend token exchange failed: ${response.status}`);

                // Don't retry on 4xx errors (client errors) except 429 (rate limit)
                if (response.status >= 400 && response.status < 500 && response.status !== 429) {
                  console.error('❌ Client error - not retrying');
                  break;
                }
              }
            } catch (fetchError: any) {
              lastError = fetchError;
              console.error(`❌ Attempt ${attempt} failed:`, fetchError.message);

              // Wait before retrying (exponential backoff)
              if (attempt < maxRetries) {
                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
                console.log(`⏳ Waiting ${delay}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, delay));
              }
            }
          }

          if (!token.backendToken && lastError) {
            console.error('⚠️ All backend connection attempts failed:', lastError.message);
            console.log('ℹ️ Session will be created without backend token. Frontend will retry.');
          }
        } catch (error) {
          console.error('❌ Unexpected error during token exchange:', error);
          // Don't throw - allow the session to be created, but without backend token
        }
      }

      // On session update (trigger === 'update'), keep the existing backend token
      // This ensures the token persists across session updates

      return token;
    },
    async session({ session, token }) {
      // Add backend token to session
      if (token.backendToken) {
        (session as any).backendToken = token.backendToken;
      }
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
  },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };

