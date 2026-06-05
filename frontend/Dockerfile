# Stage 1: Build the Vite application
FROM node:20-slim AS builder

WORKDIR /app

# No need for libc6-compat on Debian based images

# Install dependencies first for better caching
COPY package.json package-lock.json ./
RUN npm ci

# Copy the rest of the source code
COPY . .

# Pass in environment variables if needed at build time
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

# Build the application
RUN npm run build

# Stage 2: Serve with Node.js
FROM node:20-slim AS runner

WORKDIR /app

# Install the 'serve' package globally to serve static files
RUN npm install -g serve

# Create a non-root user
RUN groupadd -r -g 1001 nodejs && \
    useradd -r -u 1001 -g nodejs reactjs

# Copy the build output from the builder stage
COPY --from=builder --chown=reactjs:nodejs /app/dist ./dist

# Set user
USER reactjs

# Expose port (default for serve is 3000)
EXPOSE 3000

# Healthcheck to ensure the server is responding
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Start the static file server
CMD ["serve", "-s", "dist", "-l", "3000"]
