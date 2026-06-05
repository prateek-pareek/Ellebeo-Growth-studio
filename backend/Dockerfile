# Stage 1: Dependencies and Build
FROM node:20-slim AS builder

# Install OpenSSL for Prisma and necessary build tools
RUN apt-get update && apt-get install -y openssl build-essential python3

WORKDIR /app

# Copy package files for build
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies)
RUN npm ci

# Copy Prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy source code for deployment
COPY . .

# Build the application
RUN npm run build

# Stage 2: Production Dependencies
FROM node:20-slim AS deps

RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy generated Prisma client from builder
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Stage 3: Production Runner
FROM node:20-slim AS runner

# Install required runtime dependencies for Prisma and dumb-init
RUN apt-get update && apt-get install -y openssl curl dumb-init ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Use non-root user for security
RUN groupadd -r -g 1001 nodejs && \
    useradd -r -u 1001 -g nodejs nestjs

# Copy from deps and builder
COPY --from=deps --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/package.json ./

# Prisma schema + CLI + engines so `prisma migrate deploy` can run at deploy time.
# (prisma CLI is a devDependency, so it is absent from the prod-only deps stage.)
COPY --from=builder --chown=nestjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nestjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=nestjs:nodejs /app/node_modules/@prisma/engines ./node_modules/@prisma/engines

# Expose API port
EXPOSE 3000

# Set user
USER nestjs

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Healthcheck to verify the API is running
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/api/v1/health || exit 1

# Default command with dumb-init for proper signal handling
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/main.js"]
