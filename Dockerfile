# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY index.html tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts ./
COPY public ./public
COPY src ./src
COPY runtime ./runtime
RUN npm run build && npm run runtime:build

FROM node:22-alpine AS runtime

ENV NODE_ENV=production \
    PORT=17870 \
    PROXYFLOW_RUNTIME_HOST=0.0.0.0 \
    PROXYFLOW_RUNTIME_DB=/data/proxyflow-runtime.sqlite \
    PROXYFLOW_WEB_ROOT=/app/dist \
    PROXYFLOW_SELF_HOSTED=true

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/runtime-dist ./runtime-dist
RUN mkdir -p /data && chown node:node /data

USER node
EXPOSE 17870
VOLUME ["/data"]
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=4 \
  CMD node -e "fetch('http://127.0.0.1:17870/health').then((response) => { if (!response.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["node", "runtime-dist/server.js"]
