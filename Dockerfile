# ── Stage 1: builder ──────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Build tools needed to compile better-sqlite3 native bindings
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: runner ───────────────────────────────────────────────────────────
FROM node:20-slim AS runner

WORKDIR /app

# Runtime dependencies:
#   chromium         — for Puppeteer PDF generation (package name on Debian Bookworm, both amd64 + arm64)
#   python3/pip      — for apprise notification CLI
#   --break-system-packages is required on Debian Bookworm+ (PEP 668)
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    python3 python3-pip \
    && pip install --break-system-packages apprise \
    && rm -rf /var/lib/apt/lists/*

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs \
    && mkdir -p /data && chown nextjs:nodejs /data

# Copy Next.js standalone output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Copy better-sqlite3 native bindings — not included in standalone output automatically
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/better-sqlite3/build/Release/ ./node_modules/better-sqlite3/build/Release/

ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
# DB_PATH baked in so the /data volume is always used without extra user config
ENV DB_PATH=/data/db.sqlite

VOLUME ["/data"]
EXPOSE 3000

USER nextjs

CMD ["node", "server.js"]
