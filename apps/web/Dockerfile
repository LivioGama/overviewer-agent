FROM oven/bun:1 AS builder
WORKDIR /app

# Copy workspace files
COPY package.json ./
COPY packages/web/package.json ./packages/web/
COPY packages/shared/package.json ./packages/shared/
COPY packages/runner/package.json ./packages/runner/

# Install dependencies using Bun
RUN bun install

# Copy source code
COPY packages/shared ./packages/shared
COPY packages/web ./packages/web

# Build the web application
WORKDIR /app/packages/web
ENV NEXT_TELEMETRY_DISABLED 1
RUN bun run build

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built application and ALL dependencies
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

# Create public directory (may not exist)
RUN mkdir -p ./public

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
