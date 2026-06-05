#!/bin/bash
set -e

# ==========================================
# Manual Rollback Script
# ==========================================

echo "Starting Manual Rollback..."

if [ -z "$1" ] || [ -z "$2" ]; then
    echo "Usage: ./rollback.sh <previous_backend_image_sha> <previous_frontend_image_sha>"
    echo "Example: ./rollback.sh ghcr.io/org/backend:abc1234 ghcr.io/org/frontend:abc1234"
    exit 1
fi

export BACKEND_IMAGE=$1
export FRONTEND_IMAGE=$2
export TRAEFIK_PRIORITY=300 # Ensure rollback always wins priority

# 1. Determine active environment (the one currently broken)
ACTIVE_ENV=$(docker ps --filter "name=growth-studio-backend-blue" --format "{{.Names}}" | grep -q "growth-studio-backend-blue" && echo "blue" || echo "green")

if [ "$ACTIVE_ENV" = "blue" ]; then
    TARGET_ENV="green"
    echo "Current active (failing) environment is BLUE. Rolling back to GREEN."
else
    TARGET_ENV="blue"
    echo "Current active (failing) environment is GREEN. Rolling back to BLUE."
fi

TARGET_SERVICES=(
  "backend-$TARGET_ENV"
  "frontend-$TARGET_ENV"
)

WORKERS=(
  "worker-content"
  "worker-image"
  "worker-video"
)

# 2. Pull the known-good images
echo "Pulling previous known-good images..."
docker compose pull "${TARGET_SERVICES[@]}" "${WORKERS[@]}"

# 3. Start the previous environment
echo "Starting $TARGET_ENV environment..."
docker compose --profile $TARGET_ENV up -d "${TARGET_SERVICES[@]}"
docker compose up -d "${WORKERS[@]}"

# 4. Wait for Node.js containers to stabilize
echo "Validating rollback environment health..."
ROLLBACK_HEALTHY=false
for i in $(seq 1 15); do
    STATUS=$(docker inspect --format='{{json .State.Health.Status}}' "growth-studio-backend-$TARGET_ENV" 2>/dev/null || echo '"starting"')
    
    if [ "$STATUS" = '"healthy"' ]; then
        ROLLBACK_HEALTHY=true
        break
    fi
    echo "Waiting... ($i/15)"
    sleep 5
done

if [ "$ROLLBACK_HEALTHY" = false ]; then
    echo "CRITICAL ERROR: Rollback environment also unhealthy! Manual intervention required."
    exit 1
fi

# 5. Traffic Switch and Teardown
echo "Rollback successful! $TARGET_ENV is healthy and taking traffic."
sleep 10

echo "Tearing down broken environment ($ACTIVE_ENV)..."
OLD_SERVICES=(
  "backend-$ACTIVE_ENV"
  "frontend-$ACTIVE_ENV"
)

docker compose --profile $ACTIVE_ENV stop "${OLD_SERVICES[@]}"
docker compose rm -f "${OLD_SERVICES[@]}"

echo "Rollback complete."
