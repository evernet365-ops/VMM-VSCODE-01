# syntax=docker/dockerfile:1
FROM node:24-alpine

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY scripts ./scripts
COPY db ./db
COPY config ./config
COPY assets ./assets
COPY openapi ./openapi

RUN pnpm install --recursive --no-frozen-lockfile

ENV NODE_ENV=production

CMD ["pnpm", "--filter", "@evernet/notification-gateway", "start"]
