# syntax=docker/dockerfile:1

# --- build -------------------------------------------------------------------
FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
# --ignore-scripts: better-sqlite3 bundles prebuilt binaries for every platform
# (loaded at runtime); npm 10 would otherwise auto-run node-gyp for its
# binding.gyp and fail — alpine has no make/g++.
RUN npm ci --ignore-scripts

COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- runtime -----------------------------------------------------------------
FROM node:24-alpine
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

# Standalone server + static assets; SQLite lives in /app/data (mount a volume).
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
RUN mkdir -p /app/data && chown node:node /app/data

USER node
EXPOSE 3000
VOLUME /app/data
CMD ["node", "server.js"]
