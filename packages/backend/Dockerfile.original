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
COPY packages/backend ./packages/backend

# Build the backend
WORKDIR /app/packages/backend
RUN bun run build

FROM node:20-alpine AS runner

WORKDIR /app

RUN apk add --no-cache curl

COPY --from=builder /app/packages/backend/dist ./dist
COPY --from=builder /app/packages/backend/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3001

USER node

CMD ["node", "dist/index.js"]
