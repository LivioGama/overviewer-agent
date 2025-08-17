FROM oven/bun:1 AS builder

WORKDIR /app

# Copy workspace files  
COPY package.json bun.lock ./
COPY packages/runner/package.json ./packages/runner/
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/
COPY packages/web/package.json ./packages/web/

# Install dependencies using Bun
RUN bun install --frozen-lockfile

# Copy source files
COPY packages/shared ./packages/shared
COPY packages/runner ./packages/runner

# Build shared package first
WORKDIR /app/packages/shared
RUN bunx tsc || echo "No build needed for shared"

# Build with TypeScript only (no bundling to avoid circular deps)
WORKDIR /app/packages/runner
RUN bunx tsc

FROM node:20-alpine AS runner

# Install system dependencies
RUN apk add --no-cache git openssh-client curl

# Configure git for automated commits
RUN git config --global user.email "bot@ollama-turbo-agent.local" && \
    git config --global user.name "Ollama Turbo Agent Bot" && \
    git config --global init.defaultBranch main

# Install Ollama CLI (optional, for local development)
RUN curl -fsSL https://ollama.ai/install.sh | sh || true

WORKDIR /app

# Copy built application and shared package
COPY --from=builder /app/packages/runner/dist ./dist
COPY --from=builder /app/packages/runner/package.json ./package.json
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/node_modules ./node_modules

# Create workspace directory and set proper ownership
RUN mkdir -p /tmp/ollama-turbo-workspaces && \
    chown -R node:node /tmp/ollama-turbo-workspaces

# Set environment variables
ENV NODE_ENV=production
ENV WORKSPACE_ROOT=/tmp/ollama-turbo-workspaces

USER node

CMD ["node", "./dist/index.js"]


