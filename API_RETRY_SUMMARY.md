# API Retry & Rate Limiting - Complete Summary

## Overview

The runner service now has **three layers of retry logic** to handle rate limiting from external APIs:

```
┌─────────────────────────────────────────────────────────────┐
│                    JOB LEVEL (Layer 3)                      │
│  Re-queue failed jobs with exponential backoff (1-60s)      │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │
┌─────────────────────────────────────────────────────────────┐
│                   TOOL LEVEL (Layer 2)                      │
│  Retry Octokit API calls with backoff (1-30s)               │
│  (comment_on_issue, etc.)                                   │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │
┌─────────────────────────────────────────────────────────────┐
│                 REQUEST LEVEL (Layer 1)                     │
│  Retry individual API calls with backoff (1-60s)            │
│  • OpenAI LLM API                                           │
│  • GitHub Installation Token API                           │
└─────────────────────────────────────────────────────────────┘
```

## Retry Points Implemented

### 1. **LLM API** (OpenAI)
**Location:** `apps/runner/src/agent/llm-client.ts`
- **Max Retries:** 5
- **Delay Range:** 1s - 60s (exponential backoff)
- **Errors Handled:** 429, 503, 5xx, network timeouts
- **Features:**
  - Respects `Retry-After` header
  - Local rate limiting (100ms minimum between requests)
  - 30 second request timeout
  - Jitter to prevent thundering herd

### 2. **GitHub Installation Token API**
**Location:** `apps/runner/src/index.ts` (getInstallationToken method)
- **Max Retries:** 5
- **Delay Range:** 1s - 30s (exponential backoff)
- **Errors Handled:** 429, 503, 5xx
- **Features:**
  - 10 second request timeout
  - Only retries on transient errors
  - Logs retry attempts for debugging

### 3. **GitHub API (Octokit) - Tool Level**
**Location:** `apps/runner/src/tools/comment-on-issue.ts`
- **Max Retries:** 3 (configurable per tool)
- **Delay Range:** 1s - 30s (exponential backoff)
- **Errors Handled:** 429, 503, 5xx
- **Features:**
  - Generic `retryWithBackoff()` utility
  - Can wrap any Octokit operation
  - Type-safe async wrapper

### 4. **Job-Level Re-queueing**
**Location:** `apps/runner/src/index.ts` (processLoop method)
- **Max Retries:** 5 per job
- **Delay Range:** 1s - 16s (exponential backoff)
- **Errors Handled:** Rate limiting & service errors detected at agent level
- **Features:**
  - Automatic re-addition to Redis queue
  - Retry count stored in Redis (`job:retry:{jobId}`)
  - Last error tracked for logging
  - Only retryable errors trigger re-queueing

## Retry Timeline Example

**Scenario:** Job hits rate limiting on all levels

```
T=0s:     Job starts
T=1s:     LLM API call fails (429)
T=1s:     Retry LLM call (Attempt 2)
T=2s:     LLM call fails (429) 
T=2s:     Retry LLM call (Attempt 3)
T=4s:     LLM call succeeds
T=4.5s:   Tool calls Octokit API
T=4.5s:   Octokit fails (429)
T=4.5s:   Retry Octokit call (Attempt 2, Layer 2)
T=5.5s:   Octokit call succeeds
T=6s:     Agent completes
T=6s:     Job marked as completed

Total time: ~6 seconds (with retries)
Without retries: Immediate crash
```

**Scenario:** Rate limiting persists → Job re-queued

```
T=0s:     Job attempt 1 starts
T=65s:    All retries exhausted → Rate limited
T=65s:    Agent catches error, returns rate_limited status
T=65s:    Job re-queued with retry count=1
T=66s:    Job picks up (1s backoff)
T=66s:    Job attempt 2 starts
...
T=130s:   Job attempt 2 fails → re-queued with retry count=2
T=132s:   Job attempt 3 starts (2s backoff)
...
```

## Error Classification

### Retryable Errors (Will Retry)
- `429` - Too Many Requests
- `503` - Service Unavailable  
- `5xx` - All server errors
- Network timeouts
- Connection resets

### Non-Retryable Errors (Will Fail)
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `4xx` - Client errors

## Configuration

### Environment Variables
```bash
export OLLAMA_API_KEY=your_api_key_here               # Ollama Turbo API key (from https://ollama.com)
export OLLAMA_API_URL=https://ollama.com/api          # Ollama Turbo API endpoint
export OLLAMA_MODEL=glm-4.6                           # Model selection
export GITHUB_APP_ID=...                              # GitHub App ID
export GITHUB_APP_PRIVATE_KEY=...                     # GitHub App private key
export REDIS_URL=redis://...                          # Redis connection
```

### Hardcoded Retry Config (Can be made configurable)

**LLM Client:**
```typescript
maxRetries: 5
initialDelayMs: 1000
maxDelayMs: 60000
backoffMultiplier: 2
minRequestInterval: 100ms
```

**GitHub Token API:**
```typescript
maxRetries: 5
initialDelayMs: 1000
maxDelayMs: 30000
```

**Tool-Level Retries:**
```typescript
maxRetries: 3
initialDelayMs: 1000
maxDelayMs: 30000
```

**Job Re-queueing:**
```typescript
maxRetries: 5
backoffMultiplier: 2
minBackoff: 1s
maxBackoff: 60s
```

## Observability & Logging

### Log Examples

**Request-level retry:**
```
[Attempt 1/5] LLM API call failed: {
  status: 429,
  statusText: "Too Many Requests",
  message: "Request failed with status code 429",
  code: "ERR_BAD_REQUEST"
}
Retrying in 1.0s (attempt 2/5)...
```

**Tool-level retry:**
```
[Attempt 1/3] GitHub API rate limited. Retrying in 1.0s...
```

**Job-level re-queueing:**
```
Re-queuing job abc-123 (attempt 1/5) after 1s
```

## Testing

To test rate limiting handling:

```bash
# 1. Build the runner
cd apps/runner
bun run build

# 2. Simulate rate limiting by:
#    - Using a low-rate-limit API key
#    - Making requests rapidly
#    - Running multiple agents concurrently

# 3. Observe:
#    - Retry logs at each layer
#    - Proper backoff delays
#    - Jobs eventually succeeding or failing gracefully
```

## Performance Impact

- **No performance penalty** when APIs are healthy
- **Minimal overhead** during rate limiting (batched retries)
- **Network-bound** delays, not CPU-bound
- **Redis-based** tracking (efficient)

## Future Improvements

1. **Configurable Retry Policy:**
   - Environment variables for retry counts
   - Per-API timeout configuration
   - Custom backoff strategies

2. **Circuit Breaker Pattern:**
   - Temporarily skip retries if API repeatedly fails
   - Fallback to queue sleeping

3. **Metrics & Monitoring:**
   - Prometheus metrics for retry attempts
   - Alerting on repeated rate limits
   - Dashboard for API health

4. **Extended Tool Support:**
   - Apply `retryWithBackoff` to all tools
   - Shared retry utility module
   - Consistent error handling

5. **Adaptive Backoff:**
   - Learn from server's Retry-After headers
   - Adjust initial delay based on historical data
   - Implement token bucket algorithm
