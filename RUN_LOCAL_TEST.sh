#!/bin/bash

# ============================================================================
# Local Testing Script - Test the agent without git commits/pushes
# ============================================================================
# Usage: 
#   chmod +x RUN_LOCAL_TEST.sh
#   ./RUN_LOCAL_TEST.sh
# ============================================================================

set -e

echo "🚀 Starting Local Agent Test..."
echo ""

# Step 1: Check environment variables
echo "📋 Step 1: Checking Environment Variables..."
if [ -z "$OLLAMA_API_KEY" ]; then
    echo "❌ ERROR: OLLAMA_API_KEY not set"
    echo "   Set it: export OLLAMA_API_KEY=your_key_here"
    exit 1
fi

if [ -z "$GITHUB_APP_ID" ]; then
    echo "❌ ERROR: GITHUB_APP_ID not set"
    exit 1
fi

if [ -z "$GITHUB_APP_PRIVATE_KEY" ]; then
    echo "❌ ERROR: GITHUB_APP_PRIVATE_KEY not set"
    exit 1
fi

echo "✅ Environment variables set"
echo ""

# Step 2: Build the project
echo "🔨 Step 2: Building Project..."
bun run build
echo "✅ Build successful"
echo ""

# Step 3: Start Docker services
echo "🐳 Step 3: Starting Docker Services..."
echo "   (Make sure Docker is running!)"

docker compose down --remove-orphans 2>/dev/null || true
sleep 1

docker compose -f docker-compose.simple.yml up -d redis
docker compose -f docker-compose.simple.yml up -d web

# Wait for Redis to be healthy
echo "   Waiting for Redis to start..."
for i in {1..30}; do
    if docker exec $(docker compose -f docker-compose.simple.yml ps -q redis) redis-cli ping >/dev/null 2>&1; then
        echo "✅ Redis is ready"
        break
    fi
    echo -n "."
    sleep 1
done
echo ""

# Step 4: Create a test job in Redis
echo "📝 Step 4: Creating Test Job in Redis..."

TEST_JOB_ID="test-$(date +%s)"

REDIS_CONTAINER=$(docker compose -f docker-compose.simple.yml ps -q redis)

# Create test job JSON
TEST_JOB='{
  "id":"'"$TEST_JOB_ID"'",
  "installationId":0,
  "repoOwner":"test-owner",
  "repoName":"test-repo",
  "taskType":"autonomous",
  "status":"pending",
  "taskParams":{
    "issueTitle":"Test Issue",
    "issueBody":"List all files in the current directory"
  },
  "createdAt":"'"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"'"
}'

echo "   Test Job: $TEST_JOB"
echo ""

# Queue the job
docker exec $REDIS_CONTAINER redis-cli \
    XADD job-queue '*' \
    jobData "$TEST_JOB" > /dev/null

echo "✅ Job queued with ID: $TEST_JOB_ID"
echo ""

# Step 5: Run the runner in foreground (no commit/push)
echo "🤖 Step 5: Starting Agent Runner (Local Mode)..."
echo "   The agent will process the job WITHOUT making commits or pushes"
echo ""
echo "   Logs:"
echo "   ======"

# Build and run the runner container with environment variables
docker compose -f docker-compose.simple.yml run --rm \
    -e OLLAMA_API_KEY="$OLLAMA_API_KEY" \
    -e GITHUB_APP_ID="$GITHUB_APP_ID" \
    -e GITHUB_APP_PRIVATE_KEY="$GITHUB_APP_PRIVATE_KEY" \
    -e NODE_ENV=development \
    runner timeout 60 node /app/dist/index.js

echo ""
echo "✅ Agent test completed!"
echo ""

# Step 6: Check results
echo "📊 Step 6: Results..."

# Get job status from Redis
JOB_RESULT=$(docker exec $REDIS_CONTAINER redis-cli \
    XRANGE job-queue - '+' | grep -A 20 "$TEST_JOB_ID" || echo "")

if [ -z "$JOB_RESULT" ]; then
    echo "   Job not found in queue (likely processed)"
else
    echo "   Job still in queue"
fi

echo ""
echo "✨ To see detailed logs, run:"
echo "   docker logs -f $(docker compose -f docker-compose.simple.yml ps -q runner 2>/dev/null || echo 'runner-container')"
echo ""
echo "✨ To clean up, run:"
echo "   docker compose -f docker-compose.simple.yml down"

