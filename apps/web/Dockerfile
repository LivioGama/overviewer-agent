FROM oven/bun:1 AS builder
WORKDIR /app

COPY package.json bun.lock* ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY apps/runner/package.json ./apps/runner/

RUN bun install --frozen-lockfile

COPY tsconfig.json ./
COPY packages/shared ./packages/shared

WORKDIR /app/packages/shared
RUN bun run build

WORKDIR /app
COPY apps/web ./apps/web

WORKDIR /app/apps/web
ENV NEXT_TELEMETRY_DISABLED 1
RUN bun run build

FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache git

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1
ENV NODE_PATH=/app/node_modules

RUN npm install -g @kilocode/cli

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

RUN mkdir -p /home/nextjs/.kilocode/cli
COPY --chown=nextjs:nodejs apps/web/kilo-config.json /home/nextjs/.kilocode/cli/config.json

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

# Fix broken symlinks from copying - repoint them to .bun structure
RUN cd /app/node_modules && \
    for link in $(find . -maxdepth 1 -type l); do \
        target=$(readlink "$link" 2>/dev/null || true); \
        if [[ "$target" == "../../../node_modules/.bun"* ]]; then \
            newlink="${target#../../../node_modules/}"; \
            rm "$link"; \
            ln -s "$newlink" "$link"; \
        fi; \
    done

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
