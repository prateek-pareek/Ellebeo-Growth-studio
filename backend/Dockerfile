# STAGE 1: Builder
FROM node:20-slim AS builder
WORKDIR /app

# Install system dependencies for Prisma/native modules
RUN apt-get update && apt-get install -y openssl build-essential python3 ca-certificates && rm -rf /var/lib/apt/lists/*

# Layer-cache optimisation: copy only package files first
COPY package.json package-lock.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Copy Prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Strip devDependencies in-place — cuts image size dramatically
# This avoids a separate npm ci --omit=dev stage which breaks on lock file mismatches
RUN npm prune --omit=dev

# STAGE 2: Production Runner
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends openssl curl dumb-init ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Use non-root user for security
RUN groupadd -r -g 1001 nodejs && \
    useradd -r -u 1001 -g nodejs nestjs

# Copy only production artefacts from builder
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nestjs:nodejs /app/package.json ./package.json

USER nestjs

EXPOSE 3000

# Healthcheck to verify the API is running
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Default command with dumb-init for proper signal handling
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/main.js"]
