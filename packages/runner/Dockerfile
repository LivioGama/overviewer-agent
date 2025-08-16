FROM oven/bun:1 AS builder

WORKDIR /app

# Copy root package files for workspace setup
COPY package.json bun.lock ./
COPY tsconfig.json ./

# Copy all workspace package.json files
COPY packages/backend/package.json ./packages/backend/
COPY packages/shared/package.json ./packages/shared/
COPY packages/runner/package.json ./packages/runner/
COPY packages/web/package.json ./packages/web/

# Install all workspace dependencies from root
RUN bun install --frozen-lockfile

# Copy source code
COPY packages/shared ./packages/shared
COPY packages/runner ./packages/runner

# Build the runner
WORKDIR /app/packages/runner
RUN bun run build

FROM node:20-alpine AS runner

# Install system dependencies
RUN apk add --no-cache git openssh-client curl

# Install Ollama CLI (optional, for local development)
RUN curl -fsSL https://ollama.ai/install.sh | sh || true

WORKDIR /app

# Create workspace directory
RUN mkdir -p /tmp/ollama-turbo-workspaces

# Copy built application
COPY --from=builder /app/packages/runner/dist ./dist
COPY --from=builder /app/packages/runner/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules

# Set environment variables
ENV NODE_ENV=production
ENV WORKSPACE_ROOT=/tmp/ollama-turbo-workspaces

USER node

CMD ["node", "dist/index.js"]


