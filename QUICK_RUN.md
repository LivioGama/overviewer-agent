# Quick Run - Agent Testing Without Commits

## TL;DR - Copy & Paste These Commands

### Setup (One Time)
```bash
# 1. Set your credentials
export OLLAMA_API_KEY=your_key_from_ollama.com
export GITHUB_APP_ID=your_github_app_id
export GITHUB_APP_PRIVATE_KEY="your_github_private_key"

# 2. Build
bun run build

# 3. Start Redis
docker compose -f docker-compose.simple.yml up -d redis
```

### Test Run (Each Time You Want to Test)
```bash
# 1. Queue a job
REDIS_ID=$(docker compose -f docker-compose.simple.yml ps -q redis)
docker exec $REDIS_ID redis-cli XADD job-queue '*' jobData '{"id":"test-'$(date +%s)'","installationId":0,"repoOwner":"test","repoName":"test","taskType":"autonomous","status":"pending","taskParams":{"issueTitle":"Analyze Code","issueBody":"List all files"},"createdAt":"'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'"}'

# 2. Run agent (120 second timeout, no commits!)
docker compose -f docker-compose.simple.yml run --rm \
  -e OLLAMA_API_KEY="$OLLAMA_API_KEY" \
  -e GITHUB_APP_ID="$GITHUB_APP_ID" \
  -e GITHUB_APP_PRIVATE_KEY="$GITHUB_APP_PRIVATE_KEY" \
  runner timeout 120 node /app/dist/index.js

# 3. View results in real-time (other terminal)
docker compose -f docker-compose.simple.yml logs -f runner
```

### Cleanup
```bash
docker compose -f docker-compose.simple.yml down
```

---

## What This Does

✅ Processes a job without GitHub commits  
✅ Calls Ollama Turbo API (GLM-4.6 model)  
✅ Executes agent actions autonomously  
✅ Shows all logs in terminal  

❌ Does NOT push to GitHub  
❌ Does NOT create PRs  
❌ Does NOT modify your repo  

---

## Variables You Need

```bash
OLLAMA_API_KEY         # From https://ollama.com (API section → Generate API Key)
GITHUB_APP_ID          # From your GitHub App settings
GITHUB_APP_PRIVATE_KEY # From your GitHub App settings (PEM format)
```

---

## Troubleshooting

**404 Error:**
```
→ Check OLLAMA_API_URL is: https://ollama.com/api
→ Check OLLAMA_API_KEY is valid
→ Check internet connectivity
```

**No jobs processed:**
```bash
# Check Redis
docker exec $(docker compose -f docker-compose.simple.yml ps -q redis) redis-cli XLEN job-queue
# Should show: (integer) 1
```

**Container exits immediately:**
```bash
docker compose -f docker-compose.simple.yml logs runner --tail 50
```

---

## Full Documentation

See `LOCAL_TEST_GUIDE.md` for detailed instructions and more test scenarios.
