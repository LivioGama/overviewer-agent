# Rate Limiting & Retry Logic Fix

## Problem
The runner service was crashing with `429 (Too Many Requests)` errors from multiple external APIs (OpenAI and GitHub). This caused complete job failures with no recovery mechanism.

```
LLM API call failed: AxiosError: Request failed with status code 429
```

## Solution Implemented

### 1. **LLM Client Resilience** (`apps/runner/src/agent/llm-client.ts`)

Added comprehensive retry logic with:

- **Exponential Backoff**: Retries with delays of 1s, 2s, 4s, 8s, 16s (configurable)
- **Jitter**: ±20% random variation to prevent thundering herd
- **Retry-After Header Support**: Respects server's `Retry-After` header when provided
- **Local Rate Limiting**: Enforces minimum 100ms between requests to avoid overwhelming the API
- **Timeout Protection**: 30 second request timeout to prevent hanging
- **Smart Retry Detection**: Only retries on transient errors:
  - `429`: Too Many Requests
  - `503`: Service Unavailable
  - `5xx`: Server errors
  - Network timeouts and connection resets

Key features:
```typescript
// Up to 5 retry attempts with exponential backoff
maxRetries: 5
initialDelayMs: 1000    // Start with 1 second
maxDelayMs: 60000       // Cap at 60 seconds
backoffMultiplier: 2    // Double the wait each attempt
```

### 2. **GitHub API Resilience** (`apps/runner/src/index.ts`)

Added retry logic to the `getInstallationToken()` method:

- **Rate Limit Handling**: Detects 429/503 errors
- **Exponential Backoff**: 1s → 2s → 4s → 8s delays (max 30s)
- **Max Retries**: 5 attempts before failing
- **Request Timeout**: 10 second protection

This ensures the runner can obtain GitHub installation tokens even under rate limiting.

### 3. **Tool-Level Rate Limiting** (`apps/runner/src/tools/comment-on-issue.ts`)

Added retry wrapper for Octokit API calls:

- **Generic Retry Utility**: `retryWithBackoff()` can wrap any Octokit call
- **Configurable Retries**: Default 3 attempts per tool call
- **Exponential Backoff**: Same pattern as other APIs
- **Error Classification**: Only retries on 429/503/5xx

Example:
```typescript
await retryWithBackoff(() =>
  context.octokit.rest.issues.createComment({...})
);
```

### 4. **Agent Loop Error Handling** (`apps/runner/src/agent/agent-loop.ts`)

Enhanced error handling to detect and gracefully report rate limiting:

- Catches rate limiting errors before crashing
- Returns appropriate error status for re-queueing
- Distinguishes between retryable and fatal errors
- Continues agent execution on transient failures

### 5. **Job Re-queueing System** (`apps/runner/src/index.ts`)

Implements intelligent job retry mechanism:

- **Automatic Re-queueing**: Failed jobs are re-added to the queue
- **Exponential Backoff**: Jobs are retried with increasing delays:
  - Attempt 1: 1 second
  - Attempt 2: 2 seconds
  - Attempt 3: 4 seconds
  - Attempt 4: 8 seconds
  - Attempt 5: 16 seconds (max 60 seconds)
- **Retry Tracking**: Retry count stored in Redis (`job:retry:{jobId}`)
- **Max Retries**: 5 attempts before marking as failed
- **Error Classification**: Only rate limiting and service errors trigger retries

## Multi-Layer Resilience

The fix implements resilience at **3 levels**:

1. **Request Level**: Individual API calls retry internally
2. **Tool Level**: Octokit operations wrapped with retry logic
3. **Job Level**: Failed jobs re-queued with backoff

This ensures the runner is resilient to transient failures at every stage.

## Testing the Fix

To verify the fix handles rate limiting:

```bash
# Build the runner
cd apps/runner
bun run build

# The runner will now handle rate limiting at 3 levels:
# 1. LLM API retries (5 attempts, up to 60s delay)
# 2. GitHub API retries (5 attempts, up to 30s delay)
# 3. Tool-level Octokit retries (3 attempts, up to 30s delay)
# 4. Job-level re-queueing (5 attempts, up to 60s delay)
```

## Log Output Example

When rate limiting occurs across all levels:

```
# Request level (LLM)
[Attempt 1/5] LLM API call failed: { status: 429 }
Retrying in 1.0s (attempt 2/5)...

# Request level (GitHub token)
[Attempt 1/5] GitHub API rate limited. Retrying in 1.0s...

# Tool level (Octokit)
[Attempt 1/3] GitHub API rate limited. Retrying in 1.0s...

# Job level
Re-queuing job abc-123 (attempt 1/5) after 1s

Job abc-123 completed successfully!
```

## Architecture Benefits

1. **Multi-Layer Resilience**: Protection at request, tool, and job levels
2. **Graceful Degradation**: Service continues functioning during API issues
3. **Rate Limit Compliance**: Respects API rate limits and backoff guidance
4. **User Experience**: Jobs complete despite temporary API issues
5. **Observability**: Detailed logging at all retry levels
6. **Scalability**: Exponential backoff prevents overwhelming APIs
7. **No Manual Intervention**: Automatic recovery without user action

## Files Changed

- `apps/runner/src/agent/llm-client.ts` - LLM API retry logic (5 retries)
- `apps/runner/src/index.ts` - GitHub API retry + job re-queueing (5 retries each)
- `apps/runner/src/agent/agent-loop.ts` - Error detection and handling
- `apps/runner/src/tools/comment-on-issue.ts` - Tool-level retry wrapper (3 retries)
- `apps/runner/dist/*` - Compiled JavaScript (auto-generated)

## Rollout Notes

- No breaking changes to API or types
- Existing deployments will automatically benefit from the fix
- Re-build the runner container to apply changes
- No database migrations required

## Future Considerations

Consider extracting `retryWithBackoff` to a shared utility module for other tools:
- `run_command.ts` - Might benefit from retries
- `search_code.ts` - Might make external API calls
- Additional GitHub API operations
