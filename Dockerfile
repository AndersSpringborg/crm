# syntax=docker/dockerfile:1

ARG BUN_VERSION=1.3.12
ARG NODE_VERSION=22
# The agent runs on Node: eve requires Node >= 24 (engines.node), and its bash
# and web_fetch tools fail under Bun (just-bash cannot patch
# Module._resolveFilename; Bun's built-in undici lacks Dispatcher1Wrapper).
ARG AGENT_NODE_VERSION=24

FROM node:${NODE_VERSION}-bookworm-slim AS node

FROM node:${AGENT_NODE_VERSION}-bookworm-slim AS agent-node

FROM oven/bun:${BUN_VERSION} AS source
WORKDIR /repo
ENV TURBO_TELEMETRY_DISABLED=1
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
COPY . .
RUN --mount=type=cache,target=/root/.bun/install/cache \
	bun install --frozen-lockfile
ENV NODE_ENV=production

FROM source AS api-build
RUN --mount=type=cache,target=/root/.bun/install/cache \
	bunx turbo run build --filter=api \
	&& rm -rf node_modules apps/*/node_modules packages/*/node_modules \
	&& bun install --frozen-lockfile --ignore-scripts --filter=api --filter=@crm/db

FROM source AS app-build
COPY --from=node /usr/local/bin/node /usr/local/bin/node
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
RUN bunx turbo run build --filter=app \
	&& rm -rf apps/app/.next/cache

FROM source AS agent-build
COPY --from=agent-node /usr/local/bin/node /usr/local/bin/node
ENV NITRO_PRESET=node-server
RUN --mount=type=cache,target=/root/.bun/install/cache \
	bunx turbo run build --filter=agent \
	&& rm -rf node_modules apps/*/node_modules packages/*/node_modules \
	&& bun install --frozen-lockfile --ignore-scripts --filter=agent \
	&& cd apps/agent && CRM_TELEMETRY_DISABLED=1 node scripts/prewarm-sandboxes.ts

FROM oven/bun:${BUN_VERSION}-slim AS runtime
WORKDIR /repo
ENV NODE_ENV=production

FROM runtime AS api
COPY --from=api-build --chown=bun:bun /repo /repo
USER bun
ENV PORT=3001
EXPOSE 3001
WORKDIR /repo/apps/api
CMD ["sh", "-c", "cd /repo/packages/db && bun run db:deploy && cd /repo/apps/api && exec bun run start:prod"]

FROM runtime AS app
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=app-build --chown=bun:bun /repo /repo
USER bun
ENV PORT=3000
EXPOSE 3000
WORKDIR /repo/apps/app
CMD ["bun", "run", "start"]

FROM runtime AS agent
COPY --from=agent-node /usr/local/bin/node /usr/local/bin/node
COPY --from=agent-build --chown=bun:bun /repo /repo
USER bun
ENV PORT=2000
ENV HOST=0.0.0.0
EXPOSE 2000
WORKDIR /repo/apps/agent
# Not `eve start`: it prewarms the sandbox in its own process and then keeps
# that process, and its 3 GB, alive next to the server. The template is
# prewarmed at build instead (scripts/prewarm-sandboxes.ts).
CMD ["node", ".output/server/index.mjs"]
