# OpenAI to Ollama Turbo Migration

## Summary

Successfully replaced OpenAI API implementation with Ollama Turbo (hosted service) using the GLM-4.6 model with Bearer token authentication.

## Changes Made

### 1. **LLM Client** (`apps/runner/src/agent/llm-client.ts`)

**Changes:**
- Replaced OpenAI with Ollama Turbo
- Updated environment variables:
  - `OPENAI_API_KEY` → `OLLAMA_API_KEY` (Bearer token from Ollama)
  - `LLM_MODEL` → `OLLAMA_MODEL`
  - Added `OLLAMA_API_URL` (defaults to `https://ollama.com/api`)
  - Default model: `glm-4.6`

**API Configuration:**
- Base URL: `https://ollama.com/api` (Ollama Turbo hosted service)
- Endpoint: `/api/chat/completions` (OpenAI-compatible)
- Authorization: Bearer token via `Authorization` header
- Same OpenAI-compatible request/response format

**Benefits:**
- No local infrastructure needed
- Hosted service reliability
- Ollama's OpenAI-compatible API maintains same request format
- All retry logic preserved

### 2. **Docker Compose Files**

#### `docker-compose.yml`
- Removed local Ollama service (no longer needed)
- Added environment variables:
  - `OLLAMA_API_KEY=${OLLAMA_API_KEY}` (required)
  - `OLLAMA_API_URL=${OLLAMA_API_URL:-https://ollama.com/api}`
  - `OLLAMA_MODEL=${OLLAMA_MODEL:-glm-4.6}`
- Only Redis and web app included

#### `docker-compose.simple.yml`
- Same updates as production
- No Ollama service to run locally

### 3. **Documentation**

Updated all references:
- `API_RETRY_SUMMARY.md` - Configuration section
- `DEPLOY-EASYPANEL.md` - Environment variables and troubleshooting

## Getting Started

### 1. Create Ollama Turbo Account

Visit [https://ollama.com](https://ollama.com) and create an account.

### 2. Generate API Key

1. Log in to your Ollama account
2. Go to "API" or "API Keys" section in dashboard
3. Click "Generate API Key"
4. Copy and save the API key (displayed only once)
5. Never share this key or commit it to version control

### 3. Environment Variables

```bash
# Required
export OLLAMA_API_KEY=your_api_key_here

# Optional (defaults shown)
export OLLAMA_API_URL=https://ollama.com/api
export OLLAMA_MODEL=glm-4.6
```

### 4. Deploy

```bash
# Set required environment variables
export OLLAMA_API_KEY=your_api_key
export GITHUB_APP_ID=your_github_app_id
export GITHUB_APP_PRIVATE_KEY="your_private_key"

# Start services (no local Ollama needed!)
docker compose up --build

# Or with environment file
docker --env-file .env compose up --build
```

## API Details

### Ollama Turbo API Endpoint
```
https://ollama.com/api/chat/completions
```

### Request Format
```javascript
{
  "model": "glm-4.6",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ],
  "temperature": 0.1,
  "stream": false
}
```

### Headers
```javascript
{
  "Authorization": "Bearer YOUR_API_KEY",
  "Content-Type": "application/json"
}
```

### Response Format
```javascript
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "Response text..."
      }
    }
  ]
}
```

## Supported Models

The default is GLM-4.6, but Ollama Turbo supports other models. Check [Ollama documentation](https://ollama.com) for available models.

To use a different model:
```bash
export OLLAMA_MODEL=mistral
# or any other supported model
```

## Features Preserved

All existing reliability features remain intact:

- ✅ Exponential backoff with jitter (1s → 2s → 4s → 8s → 16s)
- ✅ Smart error retry logic (up to 5 attempts)
- ✅ Rate limiting with jitter (100ms between requests)
- ✅ 30-second request timeout
- ✅ Retry-After header support
- ✅ Comprehensive error logging

## Retry Logic

The client automatically retries on transient errors:

**Retryable Errors:**
- `429` - Too Many Requests
- `503` - Service Unavailable
- `5xx` - Server errors
- Network timeouts
- Connection resets

**Non-Retryable Errors:**
- `401` - Unauthorized (check API key)
- `403` - Forbidden
- `404` - Not Found
- `4xx` - Client errors

## Troubleshooting

### "401 Unauthorized"
- Check your API key is correct
- Verify `OLLAMA_API_KEY` environment variable is set
- Generate a new API key from Ollama dashboard if needed

### "Failed to call LLM API after 5 attempts"
- Check your API key validity
- Verify network connectivity
- Check Ollama service status
- View detailed logs: `docker logs runner`

### "Connection refused"
- Verify you have internet connectivity
- Ollama Turbo requires outbound HTTPS access to `ollama.com`
- Check firewall/proxy settings

### Rate Limiting
- If you see persistent 429 errors, you may be hitting rate limits
- Exponential backoff is automatically applied
- Contact Ollama support if limits are too restrictive

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OLLAMA_API_KEY` | ✅ Yes | - | API key from ollama.com |
| `OLLAMA_API_URL` | ❌ No | `https://ollama.com/api` | Ollama Turbo API endpoint |
| `OLLAMA_MODEL` | ❌ No | `glm-4.6` | Model to use |
| `REDIS_URL` | ✅ Yes (in Docker) | `redis://redis:6379` | Redis connection |
| `GITHUB_APP_ID` | ✅ Yes | - | GitHub App ID |
| `GITHUB_APP_PRIVATE_KEY` | ✅ Yes | - | GitHub App private key |

## Deployment Checklist

- [ ] Create Ollama account at https://ollama.com
- [ ] Generate API key from dashboard
- [ ] Set `OLLAMA_API_KEY` environment variable
- [ ] Set `GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY`
- [ ] Build Docker images: `docker compose build`
- [ ] Start services: `docker compose up -d`
- [ ] Check logs: `docker logs -f runner`
- [ ] Test with a GitHub issue

## Production Considerations

1. **API Key Security**
   - Never commit API key to version control
   - Use secrets management (EasyPanel, Kubernetes Secrets, etc.)
   - Rotate keys regularly
   - Use different keys for dev/prod environments

2. **Rate Limiting**
   - Ollama Turbo has rate limits based on your plan
   - Built-in exponential backoff handles transient limits
   - Monitor error logs for persistent rate limit issues

3. **Monitoring**
   - Watch logs for API errors
   - Monitor job processing times
   - Alert on repeated failures

4. **Cost**
   - Ollama Turbo is a paid service
   - Monitor usage in Ollama dashboard
   - Adjust retry settings if costs are high

## Support

- Ollama Turbo Documentation: https://ollama.com
- API Issues: Check Ollama status page
- Integration Issues: Review runner logs with `docker logs runner`

---

**Migration Status:** ✅ COMPLETE  
**API Type:** ✅ HOSTED (Ollama Turbo)  
**Authentication:** ✅ BEARER TOKEN  
**Build Status:** ✅ SUCCESS  
**Ready for Deployment:** ✅ YES
