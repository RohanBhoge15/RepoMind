# syntax=docker/dockerfile:1.7
# BuildKit-cached Next.js build. npm and Next's build cache persist between
# rebuilds via cache mounts.

FROM node:20-alpine AS builder

WORKDIR /app

# Copy lockfile + manifest first so the cached layer survives source changes.
COPY package*.json ./
COPY tsconfig.json ./

# npm cache mount keeps downloaded tarballs between builds — repeat builds
# install in seconds instead of re-downloading every package.
RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY . .

# Persist Next's incremental build cache so subsequent builds reuse compiled
# pages, type-check output and webpack chunks.
RUN --mount=type=cache,target=/app/.next/cache \
    npm run build

FROM node:20-alpine

WORKDIR /app

# Tiny curl for healthcheck
RUN apk add --no-cache curl

COPY --from=builder /app/package*.json ./

RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.js ./
COPY --from=builder /app/next-env.d.ts ./

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:3000 || exit 1

CMD ["npm", "start"]
