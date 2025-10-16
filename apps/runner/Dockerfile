FROM oven/bun:1 AS builder

WORKDIR /app

COPY package.json bun.lock* ./
COPY apps/runner/package.json ./apps/runner/
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/

RUN bun install --frozen-lockfile

COPY tsconfig.json ./
COPY packages/shared ./packages/shared

WORKDIR /app/packages/shared
RUN bun run build

WORKDIR /app
COPY apps/runner ./apps/runner

WORKDIR /app/apps/runner
RUN bun run build

FROM node:20-alpine AS runner

RUN apk add --no-cache git openssh-client curl

WORKDIR /app

COPY --from=builder /app/apps/runner/dist ./apps/runner/dist
COPY --from=builder /app/apps/runner/package.json ./apps/runner/package.json
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/node_modules ./node_modules

RUN mkdir -p /tmp/overviewer-workspaces && chown -R node:node /tmp/overviewer-workspaces

ENV NODE_ENV=production
ENV WORKSPACE_ROOT=/tmp/overviewer-workspaces

USER node

RUN git config --global user.email "bot@overviewer-agent.local" && \
    git config --global user.name "Overviewer Agent" && \
    git config --global init.defaultBranch main

CMD ["node", "apps/runner/dist/index.js"]
