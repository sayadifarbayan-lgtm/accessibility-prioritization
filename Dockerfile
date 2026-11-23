# syntax=docker/dockerfile:1
#
# Production image for the Pa11y Dashboard (used by Railway, works anywhere Docker runs).
#
# - One process: the dashboard plus the embedded Pa11y Webservice (see index.js).
# - MongoDB is NOT included. Supply it with WEBSERVICE_DATABASE.
# - Chromium comes from the operating system package so the same image builds on
#   amd64 (Railway) and arm64 (Apple Silicon / Windows on ARM). Puppeteer's own
#   Chrome download has no Linux arm64 build.
# - Runs as the unprivileged "node" user.
#
# All secrets and connection strings are supplied at runtime via environment
# variables. Nothing sensitive is baked into the image.

# --- Build stage: install production dependencies only ---
FROM node:24-slim AS build
WORKDIR /app

# Chromium is installed from apt in the runtime stage, so skip Puppeteer's download.
ENV PUPPETEER_SKIP_DOWNLOAD=true

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# .dockerignore keeps tests, local config, scan data and runtime files out of the image.
COPY . .


# --- Runtime stage ---
FROM node:24-slim

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        chromium \
        fonts-liberation \
        ca-certificates \
        tini \
    && rm -rf /var/lib/apt/lists/*

# Defaults that make the container safe and runnable. Every one can be overridden
# with a Railway service variable.
#
# - CHROMIUM_*: use the system Chromium. --no-sandbox is the standard choice inside
#   containers (see "Running in Docker" in README.md); --disable-dev-shm-usage avoids
#   crashes caused by the small /dev/shm in containers.
# - WEBSERVICE_HOST/PORT: keep the embedded webservice on loopback so it is never
#   reachable from the platform's private network or the internet. Only the dashboard
#   (PORT, injected by Railway) is public.
# - OVERRIDES_FILE: where manual priority overrides are stored. Mount a volume at /data
#   to keep them across deployments.
# - REQUIRE_ACCESS_CONTROL: the process refuses to start unless BASIC_AUTH_* is set or
#   READONLY=true, so a public instance cannot accidentally allow anonymous writes.
# - DISABLE_SCHEDULED_SCANS: the embedded webservice otherwise ALWAYS runs a nightly scan of
#   every task (it cannot be turned off by configuration). Disabled by default here; set it to
#   false only if you want that, and then run exactly ONE replica.
ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    CHROMIUM_EXECUTABLE=/usr/bin/chromium \
    CHROMIUM_FLAGS=--no-sandbox,--disable-setuid-sandbox,--disable-dev-shm-usage,--disable-gpu \
    WEBSERVICE_HOST=127.0.0.1 \
    WEBSERVICE_PORT=3100 \
    OVERRIDES_FILE=/data/overrides.json \
    REQUIRE_ACCESS_CONTROL=true \
    DISABLE_SCHEDULED_SCANS=true

WORKDIR /app
COPY --from=build --chown=node:node /app /app

# Writable location for the override store (a mounted volume replaces this directory).
RUN mkdir -p /data && chown node:node /data

USER node

EXPOSE 4000

# Used by Docker locally. Railway uses the "Healthcheck Path" service setting instead.
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# tini reaps the Chromium child processes that Pa11y leaves behind.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "index.js"]