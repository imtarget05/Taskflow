# syntax=docker/dockerfile:1

# ---- Builder ----
FROM node:20-alpine AS builder

WORKDIR /app

# Workspace manifests first for layer caching
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci

# Source code
COPY server ./server

WORKDIR /app/server
RUN npx prisma generate
RUN rm -rf dist && npm run build

# ---- Runner ----
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# Prisma engine requirements on Alpine
RUN apk add --no-cache libc6-compat openssl

# Reproducible production-only install (pinned by root lockfile).
# prisma CLI is a runtime dependency because migrate deploy runs at startup.
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY server/prisma server/prisma
RUN npm ci --omit=dev -w server && npm cache clean --force \
  && cd server && npx prisma generate

COPY --from=builder /app/server/dist server/dist

# Run as non-root
RUN chown -R node:node /app
USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:4000/api/health || exit 1

CMD ["sh", "-c", "cd server && npx prisma migrate deploy && node dist/index.js"]