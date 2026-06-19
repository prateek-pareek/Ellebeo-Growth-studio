#!/bin/bash
set -e

# ==========================================
# Blue-Green Deployment Script
# ==========================================

echo "Starting Deployment Process..."

# 1. Determine active environment
ACTIVE_ENV=$(docker ps --filter "name=growth-studio-backend-blue" --format "{{.Names}}" | grep -q "growth-studio-backend-blue" && echo "blue" || echo "green")

if [ "$ACTIVE_ENV" = "blue" ]; then
    TARGET_ENV="green"
else
    TARGET_ENV="blue"
fi

# Ensure the new environment strictly outranks the currently active one so
# Traefik routes to it immediately (avoids an equal-priority tie during overlap).
ACTIVE_PRIORITY=$(docker inspect \
    --format "{{ index .Config.Labels \"traefik.http.routers.growth-studio-api-${ACTIVE_ENV}.priority\" }}" \
    "growth-studio-backend-${ACTIVE_ENV}" 2>/dev/null || echo "")
if ! [[ "$ACTIVE_PRIORITY" =~ ^[0-9]+$ ]]; then
    ACTIVE_PRIORITY=500
fi
export TRAEFIK_PRIORITY=$((ACTIVE_PRIORITY + 10))

echo "Current active environment is ${ACTIVE_ENV^^} (priority $ACTIVE_PRIORITY)."
echo "Deploying to ${TARGET_ENV^^} with priority $TRAEFIK_PRIORITY."

# 2. Export environment variables for Docker Compose
export BACKEND_IMAGE=$1
export FRONTEND_IMAGE=$2

if [ -z "$BACKEND_IMAGE" ] || [ -z "$FRONTEND_IMAGE" ]; then
    echo "Usage: ./deploy.sh <backend_image_sha> <frontend_image_sha>"
    exit 1
fi

echo "Deploying Backend: $BACKEND_IMAGE"
echo "Deploying Frontend: $FRONTEND_IMAGE"

SERVICES=(
  "backend-$TARGET_ENV"
  "frontend-$TARGET_ENV"
)

WORKERS=(
  "worker-image"
  "worker-video"
)

# 3. Pull new images
echo "Pulling images..."
docker compose pull "${SERVICES[@]}" "${WORKERS[@]}"

# 3b. Apply database migrations before routing traffic to new code.
# Runs as a one-off container off the new backend image; `set -e` aborts the
# deploy (leaving the active env untouched) if migrations fail.
echo "Applying database migrations..."
docker compose run --rm migrate

# 4. Start new environment and workers
echo "Starting $TARGET_ENV environment..."
docker compose --profile $TARGET_ENV up -d "${SERVICES[@]}"
docker compose up -d --force-recreate "${WORKERS[@]}"

# 5. Wait and Validate Health
echo "Waiting for health checks on backend-$TARGET_ENV..."
ATTEMPTS=0
MAX_ATTEMPTS=15
HEALTHY=false

while [ $ATTEMPTS -lt $MAX_ATTEMPTS ]; do
    STATUS=$(docker inspect --format='{{json .State.Health.Status}}' "growth-studio-backend-$TARGET_ENV" 2>/dev/null || echo '"starting"')
    
    if [ "$STATUS" = '"healthy"' ]; then
        HEALTHY=true
        break
    elif [ "$STATUS" = '"unhealthy"' ]; then
        echo "Container explicitly unhealthy — stopping deployment."
        break
    fi
    
    echo "Attempt $((ATTEMPTS+1))/$MAX_ATTEMPTS: Status is $STATUS... Waiting 5s."
    sleep 5
    ATTEMPTS=$((ATTEMPTS+1))
done

# 6. Traffic Switch and Teardown
if [ "$HEALTHY" = true ]; then
    echo "Deployment successful! $TARGET_ENV is healthy."
    echo "Traefik is automatically routing traffic to $TARGET_ENV (priority $TRAEFIK_PRIORITY)."
    
    # Wait a few seconds for Traefik to pick up the changes and drain old connections
    sleep 10 
    
    echo "Tearing down old environment ($ACTIVE_ENV)..."
    OLD_SERVICES=(
      "backend-$ACTIVE_ENV"
      "frontend-$ACTIVE_ENV"
    )
    
    docker compose --profile $ACTIVE_ENV stop "${OLD_SERVICES[@]}"
    docker compose rm -f "${OLD_SERVICES[@]}"
    
    echo "Deployment complete."
else
    echo "ERROR: Health check failed for $TARGET_ENV."
    echo "Initiating automatic rollback..."
    
    # Stop the failed deployment
    docker compose --profile $TARGET_ENV stop "${SERVICES[@]}"
    
    echo "Rollback complete. System is stable on $ACTIVE_ENV."
    exit 1
fi
