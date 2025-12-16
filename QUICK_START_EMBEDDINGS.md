# Quick Start: Embeddings Integration

## Prerequisites

1. **OpenRouter API Key** (Required)
   - Go to https://openrouter.ai/
   - Sign up and create an API key
   - Cost: ~$0.10/month for typical usage

2. **Docker & Docker Compose** (Already installed)

## Setup (5 minutes)

### Step 1: Add API Key to Environment

```bash
# Edit your .env file
nano .env

# Add this line:
OPENROUTER_API_KEY=sk-or-v1-YOUR_KEY_HERE

# Save and exit
```

### Step 2: Start Services

```bash
# Start all services (includes Weaviate)
docker-compose up -d

# Verify Weaviate is running
curl http://localhost:8080/v1/meta
# Should return JSON with version info
```

### Step 3: Test the Integration

```bash
cd apps/runner

# Run embeddings test
bun run test-embeddings.ts
```

**Expected Output:**
```
Testing embeddings integration...

✓ Embedding service initialized
✓ Generated embedding with dimension: 2560
✓ Top tool matches for "show me a file"
  1. read_file (score: 89.2%)
  2. write_file (score: 45.1%)
  3. run_command (score: 23.4%)
✓ Stored test memory
✓ Found 1 similar solution(s):
  1. Fix null pointer exception in calculateTotal (similarity: 88.7%)

✓ All tests passed!
```

## That's It!

The embeddings system is now active. When you process jobs:

- **Tool hallucinations** will be auto-corrected
- **Code search** will use semantic understanding
- **Past solutions** will be suggested for similar issues  
- **Context overflow** will be prevented automatically

## Quick Verification

```bash
# Check running services
docker-compose ps

# Should show:
# - redis (running)
# - weaviate (running)  ← NEW
# - web (running)
# - runner (running)
```

## Costs

- Weaviate: $0 (self-hosted)
- Embeddings: ~$0.0001 per job
- 1000 jobs = ~$0.10

## Troubleshooting

### "Cannot connect to Weaviate"
```bash
docker-compose restart weaviate
docker-compose logs weaviate
```

### "Invalid OpenRouter API key"
```bash
# Verify key is set
env | grep OPENROUTER

# Test key manually
curl https://openrouter.ai/api/v1/models \
  -H "Authorization: Bearer $OPENROUTER_API_KEY"
```

### "Port 8080 already in use"
Edit `docker-compose.yml` and change Weaviate port:
```yaml
ports:
  - "8081:8080"  # Use 8081 instead
```

Then update `.env`:
```bash
WEAVIATE_URL=http://weaviate:8080  # Keep internal port
```

## What Changed?

| Component | Status |
|-----------|--------|
| Tool hallucination fix | ✅ Active |
| Semantic code search | ✅ Active |
| Memory system | ✅ Active |
| Context management | ✅ Active |
| Logging | ✅ Reduced (cleaner) |

## Next Steps

1. Process a real GitHub issue
2. Watch the logs for embeddings in action:
   ```bash
   docker-compose logs -f runner
   ```
3. Look for these messages:
   - "Indexing tools for semantic matching..."
   - "Indexing 47 code files..."
   - "Found similar solution (85.3% match)..."
   - "Context too large, compressing..."

Enjoy your smarter, more reliable agent! 🚀

