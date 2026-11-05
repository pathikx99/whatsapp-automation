# Multi-stage production Dockerfile
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@12.16.1 --activate
WORKDIR /app

# 1. Dependencies stage
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/marketing-engine/package.json ./apps/marketing-engine/
COPY apps/support-engine/package.json ./apps/support-engine/
COPY apps/worker/package.json ./apps/worker/
COPY packages/config/package.json ./packages/config/
COPY packages/shared/package.json ./packages/shared/
COPY packages/database/package.json ./packages/database/
COPY packages/ecommerce-adapter/package.json ./packages/ecommerce-adapter/
COPY packages/whatsapp/package.json ./packages/whatsapp/
COPY packages/ai/package.json ./packages/ai/

RUN pnpm install --frozen-lockfile

# 2. Build stage
FROM deps AS builder
COPY . .
RUN pnpm -r build

# 3. Production runner
FROM base AS runner
ENV NODE_ENV=production
ENV APP_ENV=production
ENV API_PORT=3000
ENV API_HOST=0.0.0.0

WORKDIR /app
COPY --from=builder /app /app

EXPOSE 3000

CMD ["node", "apps/api/dist/index.js"]
