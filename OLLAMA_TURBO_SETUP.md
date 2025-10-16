# Ollama Turbo Setup Guide - GLM-4.6 with API Key

## Quick Start (3 Steps)

### Step 1: Get API Key
1. Go to **https://ollama.com**
2. Sign up or log in
3. Navigate to **API** section in dashboard
4. Click **Generate API Key**
5. Copy the key (shown only once!)

### Step 2: Set Environment Variables
```bash
export OLLAMA_API_KEY=your_api_key_here
export GITHUB_APP_ID=your_github_app_id
export GITHUB_APP_PRIVATE_KEY="your_private_key"
```

### Step 3: Deploy
```bash
docker compose up --build
```

## What Changed?

### Before (OpenAI)
```
API Provider: OpenAI
API Key: sk-...
URL: https://api.openai.com/v1/chat/completions
Model: gpt-4o
```

### After (Ollama Turbo)
```
API Provider: Ollama (Hosted)
API Key: From https://ollama.com
URL: https://ollama.com/api/chat/completions
Model: glm-4.6
Auth: Bearer token in Authorization header
```

## Files Modified

| File | Changes |
|------|---------|
| `apps/runner/src/agent/llm-client.ts` | Added OLLAMA_API_KEY env var, Bearer auth, updated URL & model |
| `docker-compose.yml` | Added OLLAMA_API_KEY env var, removed local Ollama service |
| `docker-compose.simple.yml` | Same as above |
| `API_RETRY_SUMMARY.md` | Updated env var docs |
| `DEPLOY-EASYPANEL.md` | Updated env var docs & troubleshooting |
| `OLLAMA_TURBO_MIGRATION.md` | New comprehensive guide |

## Environment Variables

### Required
- `OLLAMA_API_KEY` - Your API key from https://ollama.com

### With Defaults (Optional)
- `OLLAMA_API_URL` - Defaults to `https://ollama.com/api`
- `OLLAMA_MODEL` - Defaults to `glm-4.6`

### Always Required
- `GITHUB_APP_ID` - Your GitHub App ID
- `GITHUB_APP_PRIVATE_KEY` - Your GitHub App private key
- `REDIS_URL` (in Docker) - Redis connection

## API Authentication

### Bearer Token Format
```
Authorization: Bearer YOUR_OLLAMA_API_KEY
```

### Example Request
```bash
curl -X POST https://ollama.com/api/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "glm-4.6",
    "messages": [
      {"role": "system", "content": "You are helpful"},
      {"role": "user", "content": "Hello"}
    ],
    "temperature": 0.1,
    "stream": false
  }'
```

## Deployment Options

### Option 1: Docker Compose (Simple)
```bash
export OLLAMA_API_KEY=your_key
export GITHUB_APP_ID=your_id
export GITHUB_APP_PRIVATE_KEY="your_key"

docker compose -f docker-compose.simple.yml up --build
```

### Option 2: Docker Compose (Production)
```bash
export OLLAMA_API_KEY=your_key
export GITHUB_APP_ID=your_id
export GITHUB_APP_PRIVATE_KEY="your_key"

docker compose up --build
```

### Option 3: With .env File
```bash
# Create .env
cat > .env << 'ENVEOF'
OLLAMA_API_KEY=your_key_here
OLLAMA_API_URL=https://ollama.com/api
OLLAMA_MODEL=glm-4.6
GITHUB_APP_ID=your_id
GITHUB_APP_PRIVATE_KEY=your_private_key
GITHUB_WEBHOOK_SECRET=your_webhook_secret
ENVEOF

# Deploy
docker --env-file .env compose up --build
```

### Option 4: Easypanel
1. In Easypanel UI, set environment variables:
   - `OLLAMA_API_KEY=your_key`
   - `OLLAMA_API_URL=https://ollama.com/api`
   - `OLLAMA_MODEL=glm-4.6`
2. Deploy with updated `docker-compose.yml`

## Supported Models

GLM-4.6 is the default, but you can use any Ollama Turbo model:

```bash
# Change model
export OLLAMA_MODEL=mistral
# or any other supported model from Ollama

# Restart runner
docker compose restart runner
```

Check available models on [Ollama docs](https://ollama.com)

## Verification

### 1. Check Build
```bash
cd apps/runner
bun run build
# Should complete without errors
```

### 2. Check Services
```bash
docker compose up --build
# Look for runner service to start successfully
```

### 3. Check Logs
```bash
docker logs -f runner
# Should NOT show:
#   - "Missing environment variable OLLAMA_API_KEY"
#   - "401 Unauthorized"
#   - "Connection refused"
```

### 4. Test API Call
```bash
# Runner should make successful API calls
docker logs runner | grep "LLM API call"
# Should show successful responses, not errors
```

## Troubleshooting

### Error: "401 Unauthorized"
**Problem:** API key is invalid or expired
**Solution:**
1. Verify key from Ollama dashboard
2. Ensure `OLLAMA_API_KEY` is set correctly
3. Generate new key if needed

### Error: "Failed to call LLM API after 5 attempts"
**Problem:** Multiple retry failures
**Solution:**
1. Check internet connectivity
2. Verify API key validity
3. Check if Ollama service is operational
4. View full logs: `docker logs runner --tail 50`

### Error: "Connection refused"
**Problem:** Cannot reach Ollama API
**Solution:**
1. Ensure you have internet access
2. Ollama Turbo requires HTTPS to `ollama.com`
3. Check firewall/proxy settings
4. Verify DNS resolution: `nslookup ollama.com`

### Error: "OLLAMA_API_KEY not set"
**Problem:** Environment variable not found
**Solution:**
1. Set variable: `export OLLAMA_API_KEY=your_key`
2. Or use `.env` file
3. Restart container: `docker compose restart runner`

### High Latency
**Problem:** API calls are slow
**Solution:**
1. Check internet speed
2. Check Ollama service status
3. Increase timeout if needed (currently 30s)

## Security Best Practices

### ✅ DO:
- Store API key in environment variables
- Use `.env` file for local development (not committed)
- Rotate keys regularly
- Use different keys for dev/prod
- Monitor API usage in Ollama dashboard

### ❌ DON'T:
- Commit API key to git
- Share key in logs or error messages
- Use same key everywhere
- Expose key in Docker images
- Leave key in default values

## Cost & Limits

- Ollama Turbo is a **paid service**
- Check pricing on https://ollama.com
- Monitor usage in your Ollama dashboard
- Rate limits apply based on your plan
- Built-in exponential backoff handles transient limits

## Performance

### Request Flow
1. Runner sends request to Ollama Turbo
2. Ollama processes with GLM-4.6
3. Response returned to runner
4. Runner processes agent action
5. Retry on failure (with exponential backoff)

### Timeouts
- Request timeout: 30 seconds
- Rate limit retry: Up to 5 attempts
- Backoff: 1s → 2s → 4s → 8s → 16s

### Rate Limiting
- Minimum 100ms between requests (local)
- Server rate limits via retry-after header
- Automatic exponential backoff

## Models Available

Check [Ollama models](https://ollama.com) for full list. Popular options:

- `glm-4.6` (default)
- `mistral`
- `llama2`
- `neural-chat`

Example: Use Mistral instead of GLM-4.6
```bash
export OLLAMA_MODEL=mistral
docker compose restart runner
```

## Monitoring

### View Logs
```bash
# Real-time logs
docker logs -f runner

# Last 50 lines
docker logs runner --tail 50

# Filter for API calls
docker logs runner | grep "LLM API"
```

### Monitor Resource Usage
```bash
# CPU, memory, network
docker stats runner
```

### Check Job Queue
```bash
# View pending jobs
docker exec redis redis-cli XLEN job-queue

# View job details
docker exec redis redis-cli XRANGE job-queue - +
```

## Support

- **Ollama Turbo:** https://ollama.com
- **API Issues:** Check Ollama status page
- **Integration Issues:** Review runner logs
- **GitHub:** Check repository issues

## Summary

✅ Migration complete with:
- Ollama Turbo (hosted service)
- GLM-4.6 model
- Bearer token authentication
- All reliability features preserved
- Ready for production deployment

**Next Action:** Get API key and set environment variable!
