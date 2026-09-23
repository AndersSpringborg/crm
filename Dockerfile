# syntax=docker/dockerfile:1

ARG BUN_VERSION=1.3.12
ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS node

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
RUN --mount=type=cache,target=/root/.bun/install/cache \
	bunx turbo run build --filter=agent \
	&& rm -rf node_modules apps/*/node_modules packages/*/node_modules \
	&& bun install --frozen-lockfile --ignore-scripts --filter=agent

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
COPY --from=agent-build --chown=bun:bun /repo /repo
USER bun
ENV PORT=2000
EXPOSE 2000
WORKDIR /repo/apps/agent
CMD ["bun", "run", "start"]
