#!/bin/bash

# Load environment variables from .env
set -a
source .env
set +a

echo "═══════════════════════════════════════════════════════════════════════════════"
echo "🚀 Running Agent with .env Configuration"
echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""
echo "📋 Environment Variables Loaded:"
echo "  • OLLAMA_API_URL: $OLLAMA_API_URL"
echo "  • OLLAMA_API_KEY: ${OLLAMA_API_KEY:0:20}..."
echo "  • OLLAMA_MODEL: $OLLAMA_MODEL"
echo "  • GITHUB_APP_ID: $GITHUB_APP_ID"
echo "  • NODE_ENV: $NODE_ENV"
echo ""

# Cleanup previous containers
echo "🧹 Cleaning up previous containers..."
docker compose -f docker-compose.simple.yml down --remove-orphans 2>/dev/null || true
sleep 1

# Start Redis
echo "🐳 Starting Redis..."
docker compose -f docker-compose.simple.yml up -d redis
sleep 2

# Verify Redis is ready
echo "✅ Waiting for Redis to be ready..."
REDIS_ID=$(docker compose -f docker-compose.simple.yml ps -q redis)
for i in {1..30}; do
  if docker exec $REDIS_ID redis-cli ping >/dev/null 2>&1; then
    echo "✅ Redis is ready!"
    break
  fi
  echo -n "."
  sleep 1
done
echo ""

# Queue a test job
echo "📝 Queuing test job..."
docker exec $REDIS_ID redis-cli XADD job-queue '*' jobData '{
  "id":"test-'$(date +%s)'",
  "installationId":0,
  "repoOwner":"test",
  "repoName":"test",
  "taskType":"autonomous",
  "status":"pending",
  "taskParams":{
    "issueTitle":"Test with Ollama Turbo",
    "issueBody":"Analyze the repository structure and list all files"
  },
  "createdAt":"'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'"
}' > /dev/null

echo "✅ Job queued!"
echo ""

# Run the agent
echo "🤖 Starting Agent Runner..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

docker compose -f docker-compose.simple.yml run --rm \
  -e OLLAMA_API_URL="$OLLAMA_API_URL" \
  -e OLLAMA_API_KEY="$OLLAMA_API_KEY" \
  -e OLLAMA_MODEL="$OLLAMA_MODEL" \
  -e GITHUB_APP_ID="$GITHUB_APP_ID" \
  -e GITHUB_APP_PRIVATE_KEY="$GITHUB_APP_PRIVATE_KEY" \
  -e NODE_ENV="$NODE_ENV" \
  runner timeout 60 node /app/dist/index.js

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Agent run completed!"
echo ""
echo "📊 Cleanup:"
docker compose -f docker-compose.simple.yml down
echo "✅ Containers stopped and cleaned up"
