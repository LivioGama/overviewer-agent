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

COPY --from=builder /app/apps/runner/dist ./dist
COPY --from=builder /app/apps/runner/package.json ./package.json
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/node_modules ./node_modules

# Fix broken symlinks from copying - repoint them to .bun structure
RUN cd /app/node_modules && \
    for link in $(find . -maxdepth 1 -type l 2>/dev/null); do \
        target=$(readlink "$link" 2>/dev/null || true); \
        if [[ "$target" == "../../../node_modules/.bun"* ]]; then \
            newlink="${target#../../../node_modules/}"; \
            rm "$link"; \
            ln -s "$newlink" "$link"; \
        fi; \
    done && \
    # Create necessary symlinks for production packages from .bun
    mkdir -p @octokit && \
    ln -sf ../.bun/@octokit+rest@20.1.2/node_modules/@octokit/rest @octokit/rest && \
    for pkg in .bun/*redis* .bun/*axios* .bun/*simple-git*; do \
        if [ -d "$pkg" ] && [ -d "$pkg/node_modules" ]; then \
            for subpkg in "$pkg/node_modules"/*; do \
                name=$(basename "$subpkg"); \
                link_path="./$name"; \
                if [ ! -e "$link_path" ]; then \
                    relpath="$(echo "$pkg" | cut -d'/' -f1,2)"; \
                    ln -s "$relpath/node_modules/$name" "$link_path" 2>/dev/null || true; \
                fi; \
            done; \
        fi; \
    done

RUN mkdir -p /tmp/overviewer-workspaces && chown -R node:node /tmp/overviewer-workspaces

ENV NODE_ENV=production
ENV WORKSPACE_ROOT=/tmp/overviewer-workspaces
ENV NODE_PATH=/app/node_modules

USER node

RUN git config --global user.email "bot@overviewer-agent.local" && \
    git config --global user.name "Overviewer Agent" && \
    git config --global init.defaultBranch main

CMD ["node", "dist/index.js"]
