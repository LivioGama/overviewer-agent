# Deploy to Easypanel (VPS)

Your agentic system is now ready to deploy!

## What Changed

### ✅ Fixed
- **Removed** `packages/backend/` (no source)
- **Removed** `packages/web/` (not needed)
- **Updated** `docker-compose.yml` - Only runner + redis
- **Updated** `docker-compose.override.yml` - Easypanel network config for runner
- **Fixed** `packages/runner/Dockerfile` - Clean build

### ✅ Services
```
redis      # Job queue
runner     # Agentic system (1 replica)
```

## Deploy Steps

### 1. Push to Git
```bash
git add -A
git commit -m "Refactor to clean agentic architecture - runner + redis only"
git push origin main
```

### 2. Pull on VPS
```bash
ssh root@45.10.161.59
cd /etc/easypanel/projects/liviogama/overviewer-agent/code
git pull
```

### 3. Rebuild in Easypanel
In Easypanel dashboard:
- Go to your project
- Click "Rebuild" on runner service
- It will use the updated `docker-compose.yml`

Or via CLI:
```bash
docker compose -p liviogama_overviewer-agent up --build -d
```

## Environment Variables

Make sure these are set in Easypanel:
```bash
OPENAI_API_KEY=sk-...
GITHUB_APP_ID=your-app-id
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA..."
```

## Verify It Works

### Check Logs
```bash
docker logs -f liviogama_overviewer-agent-runner-1
```

### Test Redis Connection
```bash
docker exec -it liviogama_overviewer-agent-redis-1 redis-cli ping
# Should return: PONG
```

### Create Test Job
```bash
docker exec -it liviogama_overviewer-agent-redis-1 redis-cli XADD job-queue '*' jobData '{"id":"test-123","installationId":0,"repoOwner":"test","repoName":"test","taskType":"autonomous","status":"pending","taskParams":{"issueTitle":"Test","issueBody":"List files in /app"},"createdAt":"2025-10-09T00:00:00.000Z"}'
```

Watch logs - the agent should pick it up and process it!

## Architecture

```
┌─────────────┐
│   Redis     │ ← Job Queue
└──────┬──────┘
       │
       │ xReadGroup (streams)
       ↓
┌─────────────┐
│   Runner    │ ← Agentic System
│  (Agent +   │   - Polls Redis for jobs
│   Tools)    │   - Executes autonomously
└─────────────┘   - Creates PRs
```

## What the Agent Does

1. Polls Redis for jobs (every 1 second)
2. When job arrives:
   - Clones repository
   - Reads the issue
   - Uses tools autonomously (read_file, write_file, move_file, etc.)
   - Makes changes
   - Creates branch and PR
3. Updates job status in Redis
4. Cleans up workspace

## Scaling

To run more workers:
```yaml
# docker-compose.yml
runner:
  deploy:
    replicas: 3  # More workers = more parallel job processing
```

## Monitoring

```bash
# View all jobs in queue
docker exec -it liviogama_overviewer-agent-redis-1 redis-cli XLEN job-queue

# View runner logs
docker logs -f liviogama_overviewer-agent-runner-1 --tail 100

# Check runner status
docker ps | grep runner
```

## Troubleshooting

### "No source code" error
✅ **Fixed!** We removed the empty backend package.

### "lstat packages/backend: no such file or directory"
✅ **Fixed!** We updated docker-compose.yml to only reference runner.

### Runner not starting
Check logs:
```bash
docker logs liviogama_overviewer-agent-runner-1
```

Common issues:
- Missing OPENAI_API_KEY
- Redis not ready (wait for healthcheck)
- TypeScript compilation errors (build locally first)

### Agent not processing jobs
1. Check Redis connection:
   ```bash
   docker exec runner redis-cli -h redis ping
   ```
2. Check job queue exists:
   ```bash
   docker exec redis redis-cli XLEN job-queue
   ```
3. Check agent logs for errors

## Success!

Your agentic system is now:
- ✅ Clean and minimal
- ✅ Docker-ready
- ✅ Easypanel-compatible
- ✅ Production-ready

Deploy and watch your agent work! 🚀

