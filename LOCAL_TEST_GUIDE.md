# Local Testing Guide - Run Agent Without Git Commits/Pushes

## Quick Start (5 minutes)

### Step 1: Set Environment Variables
```bash
export OLLAMA_API_KEY=your_api_key_from_ollama.com
export GITHUB_APP_ID=your_github_app_id
export GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
..."
```

### Step 2: Build
```bash
bun run build
```

### Step 3: Start Services
```bash
docker compose -f docker-compose.simple.yml up -d redis
docker compose -f docker-compose.simple.yml up -d web
```

### Step 4: Run Agent (No Commits!)
```bash
docker compose -f docker-compose.simple.yml run --rm \
  -e OLLAMA_API_KEY="$OLLAMA_API_KEY" \
  -e GITHUB_APP_ID="$GITHUB_APP_ID" \
  -e GITHUB_APP_PRIVATE_KEY="$GITHUB_APP_PRIVATE_KEY" \
  runner timeout 120 node /app/dist/index.js
```

## Detailed Testing Workflow

### Option A: Automated Script (Easiest)
```bash
chmod +x RUN_LOCAL_TEST.sh
./RUN_LOCAL_TEST.sh
```

### Option B: Manual Step-by-Step (Most Control)

#### 1. Setup Environment
```bash
# Export your credentials
export OLLAMA_API_KEY=your_key
export GITHUB_APP_ID=your_id
export GITHUB_APP_PRIVATE_KEY="your_private_key"

# Verify they're set
echo "API Key: $OLLAMA_API_KEY"
echo "App ID: $GITHUB_APP_ID"
```

#### 2. Build Project
```bash
cd /path/to/overviewer-agent
bun run build
```

#### 3. Start Infrastructure
```bash
# Start Redis (job queue)
docker compose -f docker-compose.simple.yml up -d redis

# Start Web UI (optional)
docker compose -f docker-compose.simple.yml up -d web

# Wait for Redis
docker compose -f docker-compose.simple.yml logs redis

# Check Redis is healthy
docker exec $(docker compose -f docker-compose.simple.yml ps -q redis) redis-cli ping
# Should output: PONG
```

#### 4. Queue a Test Job
```bash
# Get Redis container ID
REDIS_ID=$(docker compose -f docker-compose.simple.yml ps -q redis)

# Create a test job
docker exec $REDIS_ID redis-cli XADD job-queue '*' \
  jobData '{
    "id":"test-'$(date +%s)'",
    "installationId":0,
    "repoOwner":"test-user",
    "repoName":"test-repo",
    "taskType":"autonomous",
    "status":"pending",
    "taskParams":{
      "issueTitle":"Test Issue",
      "issueBody":"List all Python files in repo"
    },
    "createdAt":"'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'"
  }'

# Verify job was queued
docker exec $REDIS_ID redis-cli XLEN job-queue
# Should show: (integer) 1
```

#### 5. Run the Agent (NO Git Operations!)
```bash
# Run in foreground so you see logs in real-time
docker compose -f docker-compose.simple.yml run --rm \
  -e OLLAMA_API_KEY="$OLLAMA_API_KEY" \
  -e GITHUB_APP_ID="$GITHUB_APP_ID" \
  -e GITHUB_APP_PRIVATE_KEY="$GITHUB_APP_PRIVATE_KEY" \
  -e NODE_ENV=development \
  runner timeout 120 node /app/dist/index.js
```

The agent will:
- ✅ Connect to Ollama Turbo
- ✅ Process the job
- ✅ Analyze the repository
- ✅ Execute agent actions
- ❌ NOT commit changes
- ❌ NOT push to Git

#### 6. Monitor Logs
In another terminal:
```bash
# Watch real-time logs
docker logs -f $(docker compose -f docker-compose.simple.yml ps -q runner)

# Or view past logs
docker compose -f docker-compose.simple.yml logs runner --tail 100
```

#### 7. Check Job Status
```bash
REDIS_ID=$(docker compose -f docker-compose.simple.yml ps -q redis)

# Check remaining jobs
docker exec $REDIS_ID redis-cli XLEN job-queue

# View job details
docker exec $REDIS_ID redis-cli XRANGE job-queue - '+'
```

#### 8. Clean Up
```bash
# Stop all services
docker compose -f docker-compose.simple.yml down

# Or keep running for more tests
docker compose -f docker-compose.simple.yml stop
```

## Testing Different Scenarios

### Test 1: Simple Code Analysis
```bash
# Queue job asking to analyze a file
docker exec $(docker compose -f docker-compose.simple.yml ps -q redis) redis-cli XADD job-queue '*' \
  jobData '{
    "id":"test-analysis",
    "installationId":0,
    "repoOwner":"test",
    "repoName":"test",
    "taskType":"autonomous",
    "status":"pending",
    "taskParams":{
      "issueTitle":"Analyze Repository Structure",
      "issueBody":"Provide a summary of all files and their purposes"
    },
    "createdAt":"'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'"
  }'
```

### Test 2: Read Files
```bash
docker exec $(docker compose -f docker-compose.simple.yml ps -q redis) redis-cli XADD job-queue '*' \
  jobData '{
    "id":"test-read",
    "installationId":0,
    "repoOwner":"test",
    "repoName":"test",
    "taskType":"autonomous",
    "status":"pending",
    "taskParams":{
      "issueTitle":"Read Configuration",
      "issueBody":"Read and summarize the package.json file"
    },
    "createdAt":"'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'"
  }'
```

### Test 3: Execute Commands
```bash
docker exec $(docker compose -f docker-compose.simple.yml ps -q redis) redis-cli XADD job-queue '*' \
  jobData '{
    "id":"test-command",
    "installationId":0,
    "repoOwner":"test",
    "repoName":"test",
    "taskType":"autonomous",
    "status":"pending",
    "taskParams":{
      "issueTitle":"Run Tests",
      "issueBody":"Execute npm test and report results"
    },
    "createdAt":"'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'"
  }'
```

## Debugging Issues

### Issue: 404 Error from Ollama
```
[Attempt 1/5] LLM API call failed: {
  status: 404,
  message: 'Request failed with status code 404'
}
```

**Solution:**
- Verify `OLLAMA_API_URL` is correct: `https://ollama.com/api`
- Check `OLLAMA_API_KEY` is valid
- Verify internet connectivity

### Issue: No Jobs Being Processed
```bash
# Check Redis connection
docker exec $(docker compose -f docker-compose.simple.yml ps -q redis) redis-cli ping

# Check job queue
docker exec $(docker compose -f docker-compose.simple.yml ps -q redis) redis-cli XLEN job-queue

# Check job details
docker exec $(docker compose -f docker-compose.simple.yml ps -q redis) redis-cli XRANGE job-queue - '+'
```

### Issue: Runner Container Exits
```bash
# Check exit code
docker compose -f docker-compose.simple.yml logs runner

# Run with more verbose output
docker compose -f docker-compose.simple.yml run --rm \
  -e OLLAMA_API_KEY="$OLLAMA_API_KEY" \
  -e GITHUB_APP_ID="$GITHUB_APP_ID" \
  -e GITHUB_APP_PRIVATE_KEY="$GITHUB_APP_PRIVATE_KEY" \
  -e DEBUG=* \
  runner bash -c "node /app/dist/index.js 2>&1"
```

### Issue: Missing Environment Variables
```bash
# Check what's set
env | grep OLLAMA
env | grep GITHUB

# Set if missing
export OLLAMA_API_KEY=your_key
export GITHUB_APP_ID=your_id
export GITHUB_APP_PRIVATE_KEY="your_key"
```

## Monitoring Agent Output

### Real-time Logs
```bash
docker compose -f docker-compose.simple.yml logs -f runner
```

### Formatted Output
```bash
# See only agent iterations
docker compose -f docker-compose.simple.yml logs runner | grep "=== Agent"

# See only API calls
docker compose -f docker-compose.simple.yml logs runner | grep "LLM"

# See errors
docker compose -f docker-compose.simple.yml logs runner | grep -i error
```

## Key Points

✅ **What Works:**
- Agent analyzes code
- Agent reads files
- Agent executes commands
- Agent makes decisions
- Full retry logic works
- Rate limiting works

❌ **What Doesn't Happen:**
- No GitHub commits created
- No branches created
- No PRs created
- No pushes to origin
- No webhook events

## Performance Tips

### Faster Testing
```bash
# Set timeout to 30 seconds instead of 120
timeout 30 node /app/dist/index.js

# Skip web UI startup
docker compose -f docker-compose.simple.yml up -d redis only
```

### Monitor Resource Usage
```bash
# Watch CPU/Memory
docker stats $(docker compose -f docker-compose.simple.yml ps -q runner)

# Watch network
docker compose -f docker-compose.simple.yml logs runner | grep -i "request\|response"
```

## Common Commands Cheat Sheet

```bash
# Start services
docker compose -f docker-compose.simple.yml up -d redis

# Build
bun run build

# Run agent
docker compose -f docker-compose.simple.yml run --rm \
  -e OLLAMA_API_KEY="$OLLAMA_API_KEY" \
  -e GITHUB_APP_ID="$GITHUB_APP_ID" \
  -e GITHUB_APP_PRIVATE_KEY="$GITHUB_APP_PRIVATE_KEY" \
  runner timeout 120 node /app/dist/index.js

# Check logs
docker compose -f docker-compose.simple.yml logs -f runner

# Clean up
docker compose -f docker-compose.simple.yml down

# Check Redis
docker exec $(docker compose -f docker-compose.simple.yml ps -q redis) redis-cli XLEN job-queue
```

## Next Steps

1. Set your environment variables
2. Build the project
3. Start Redis
4. Queue a test job
5. Run the agent and watch the logs
6. No commits or pushes will happen! ✅

Happy testing! 🚀
