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

# su-exec for the entrypoint's privilege drop; the entrypoint fixes ownership
# of the data volume (bind mounts are root-owned by default) before starting
# the server as the unprivileged node user (or PUID:PGID when overridden).
RUN apk add --no-cache su-exec
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Standalone server + static assets; SQLite lives in /app/data (mount a volume).
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
RUN mkdir -p /app/data && chown node:node /app/data

# Runs as root ONLY so the entrypoint can chown the data volume; it drops to
# node (100:100) — or PUID:PGID — before exec'ing the server.
ENTRYPOINT ["docker-entrypoint.sh"]
EXPOSE 3000
VOLUME /app/data
CMD ["node", "server.js"]
