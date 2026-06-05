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

ARG VITE_FIREBASE_API_KEY
ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY

ARG VITE_FIREBASE_AUTH_DOMAIN
ENV VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN

ARG VITE_FIREBASE_PROJECT_ID
ENV VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID

ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ENV VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID

ARG VITE_FIREBASE_APP_ID
ENV VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID

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

# Healthcheck to ensure the server is responding.
# node:20-slim ships neither wget nor curl, so use Node's built-in http client.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["node", "-e", "require('http').get('http://localhost:3000/', r => process.exit(r.statusCode < 400 ? 0 : 1)).on('error', () => process.exit(1))"]

# Start the static file server
CMD ["serve", "-s", "dist", "-l", "3000"]
