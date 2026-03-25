# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22.14.0

FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY server.ts tsconfig.json ./
COPY data ./data
COPY scripts ./scripts
COPY src ./src
RUN npm run build

FROM node:${NODE_VERSION}-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:${NODE_VERSION}-alpine AS runtime
ARG APP_PORT=8080
ARG APP_HOST=0.0.0.0
ARG CORS_ALLOWED_ORIGINS=*

ENV NODE_ENV=production \
    NODE_OPTIONS=--enable-source-maps \
    PORT=${APP_PORT} \
    HOST=${APP_HOST} \
    CORS_ALLOWED_ORIGINS=${CORS_ALLOWED_ORIGINS}

WORKDIR /app

COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node --from=prod-deps /app/node_modules ./node_modules
COPY --chown=node:node package.json package-lock.json ./

USER node

EXPOSE ${APP_PORT}

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "const port = process.env.PORT || 8080; fetch('http://127.0.0.1:' + port + '/api/ai/status').then(response => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1));"]

CMD ["node", "dist/server.js"]
