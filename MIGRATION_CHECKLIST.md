# OpenAI → Ollama Migration Checklist

## ✅ Completed Changes

### Core Implementation
- [x] **LLM Client** (`apps/runner/src/agent/llm-client.ts`)
  - Replaced OpenAI API with Ollama OpenAI-compatible API
  - Updated environment variables: `OPENAI_API_KEY` → removed, added `OLLAMA_API_URL` and `OLLAMA_MODEL`
  - Default model: `glm-4.6`
  - Default URL: `http://localhost:11434/api`
  - All retry logic preserved (exponential backoff, jitter, rate limiting)

### Docker Configuration
- [x] **docker-compose.yml**
  - Added Ollama service with healthcheck
  - Updated runner environment variables with defaults
  - Added `ollama_data` volume
  - Runner depends on Ollama service health

- [x] **docker-compose.simple.yml**
  - Same updates as production compose
  - Ollama port 11434 exposed for local development

### Configuration Files
- [x] **.overviewer.yml** - Updated model to `glm-4.6`
- [x] **example-overviewer.yml** - All models updated to `glm-4.6`

### Documentation
- [x] **API_RETRY_SUMMARY.md** - Updated environment variables
- [x] **DEPLOY-EASYPANEL.md** - Updated env vars and troubleshooting
- [x] **OLLAMA_MIGRATION.md** - Comprehensive migration guide (new)
- [x] **MIGRATION_CHECKLIST.md** - This checklist (new)

### Build Verification
- [x] TypeScript compilation successful
- [x] All packages built without errors
- [x] No linting issues

---

## 📋 Before You Deploy

### Pull the Model
```bash
ollama pull glm-4.6
```

### Verify Ollama is Running
```bash
curl http://localhost:11434/api/tags
# Expected: {"models":[{"name":"glm-4.6:latest",...}]}
```

### Local Testing
```bash
# Start services
docker compose -f docker-compose.simple.yml up --build

# In another terminal, check runner logs
docker logs -f runner

# Run a test job (optional)
docker exec redis redis-cli XADD job-queue '*' jobData '{...}'
```

---

## 🌍 Deployment Scenarios

### Development (Local)
```bash
docker compose -f docker-compose.simple.yml up --build
```

### Production (Docker Compose)
```bash
# With environment variables
OLLAMA_API_URL=http://ollama:11434/api \
OLLAMA_MODEL=glm-4.6 \
docker compose up --build
```

### Production (Easypanel)
1. Set environment variables:
   - `OLLAMA_API_URL=http://ollama:11434/api`
   - `OLLAMA_MODEL=glm-4.6`
2. Deploy with updated `docker-compose.yml`

### Kubernetes
Use the docker images from updated compose configuration with proper ConfigMaps/Secrets for:
- `OLLAMA_API_URL`
- `OLLAMA_MODEL`

---

## 🔄 Switching Models

If you want to use a different Ollama model:

```bash
# Pull desired model
ollama pull mistral     # or llama2, neural-chat, etc.

# Update environment
export OLLAMA_MODEL=mistral

# Restart services
docker compose restart runner
```

Available models: https://ollama.ai/library

---

## 🧪 Testing After Deployment

### Check Model Availability
```bash
curl http://localhost:11434/api/tags
```

### Check Runner Health
```bash
docker logs runner --tail 50

# Look for successful connection messages
# Should NOT see: "Failed to call LLM API after ... attempts"
```

### Process a Test Job
```bash
# Create a simple test job
docker exec redis redis-cli XADD job-queue '*' \
  jobData '{"id":"test-1","installationId":0,"repoOwner":"test","repoName":"test","taskType":"autonomous","status":"pending","taskParams":{"issueTitle":"Test","issueBody":"List files"},"createdAt":"2025-01-01T00:00:00.000Z"}'

# Monitor logs
docker logs -f runner

# Should see agent attempting to process
```

---

## ⚠️ Troubleshooting

### "Connection refused" on port 11434
- Ollama service might not be running
- Check: `docker ps | grep ollama`
- Restart: `docker compose up ollama -d`

### "Failed to call LLM API" errors
- Check Ollama healthcheck: `curl http://localhost:11434/api/tags`
- Verify model is loaded: `ollama list | grep glm-4.6`
- Check runner logs: `docker logs runner --tail 20`

### High memory usage
- Ollama loads models into memory
- Ensure sufficient RAM for GLM-4.6 (typically 8-16GB)
- Monitor: `docker stats ollama`

### Rate limiting despite retry logic
- Check runner logs for exhausted retries
- May indicate Ollama is overloaded
- Try increasing `initialDelayMs` in llm-client.ts if needed

---

## 📊 Environment Variable Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_API_URL` | `http://localhost:11434/api` | Ollama API endpoint |
| `OLLAMA_MODEL` | `glm-4.6` | Model to use |
| `REDIS_URL` | `redis://redis:6379` | Redis connection |
| `GITHUB_APP_ID` | Required | GitHub App ID |
| `GITHUB_APP_PRIVATE_KEY` | Required | GitHub App private key |

---

## ✨ What's Preserved

All existing reliability features remain intact:
- ✅ Exponential backoff with jitter
- ✅ Smart error retry logic
- ✅ Rate limiting between requests
- ✅ Request timeout protection
- ✅ Comprehensive error logging
- ✅ GitHub integration

---

## 📚 Additional Resources

- [Ollama Documentation](https://ollama.ai)
- [GLM-4 Model Info](https://ollama.ai/library/glm-4)
- [OLLAMA_MIGRATION.md](./OLLAMA_MIGRATION.md) - Detailed migration guide
- [API_RETRY_SUMMARY.md](./API_RETRY_SUMMARY.md) - Retry logic details

---

**Migration Status:** ✅ COMPLETE  
**Build Status:** ✅ SUCCESS  
**Ready for Deployment:** ✅ YES
