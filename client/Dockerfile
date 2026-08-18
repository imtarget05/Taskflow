# syntax=docker/dockerfile:1

# ---- Builder ----
FROM node:20-alpine AS builder

WORKDIR /app

# Workspace manifests first for layer caching
COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci

# Source code
COPY client ./client

WORKDIR /app/client
ARG VITE_API_URL=/api
ARG VITE_SOCKET_URL=
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL
RUN npm run build

# ---- Runner: nginx (unprivileged, non-root) ----
FROM nginxinc/nginx-unprivileged:1.27-alpine

# Template rendered by the official nginx entrypoint (envsubst).
# Only BACKEND_URL is substituted; see NGINX_ENVSUBST_FILTER in docker-compose.yml.
COPY client/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=builder /app/client/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1