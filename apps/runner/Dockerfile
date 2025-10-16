FROM oven/bun:1 AS builder

WORKDIR /app

COPY package.json ./
COPY apps/runner/package.json ./apps/runner/
COPY packages/shared/package.json ./packages/shared/
COPY tsconfig.json ./

RUN bun install

COPY packages/shared ./packages/shared
COPY apps/runner ./apps/runner

WORKDIR /app/packages/shared
RUN bunx tsc || echo "No build needed for shared"

WORKDIR /app/apps/runner
RUN bun install
RUN bunx tsc

FROM node:20-alpine AS runner

RUN apk add --no-cache git openssh-client curl

WORKDIR /app

COPY --from=builder /app/apps/runner/dist ./dist
COPY --from=builder /app/apps/runner/package.json ./package.json
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/node_modules ./node_modules

RUN mkdir -p /tmp/overviewer-workspaces &&     chown -R node:node /tmp/overviewer-workspaces

ENV NODE_ENV=production
ENV WORKSPACE_ROOT=/tmp/overviewer-workspaces

USER node

RUN git config --global user.email "bot@overviewer-agent.local" &&     git config --global user.name "Overviewer Agent" &&     git config --global init.defaultBranch main

CMD ["node", "./dist/index.js"]
