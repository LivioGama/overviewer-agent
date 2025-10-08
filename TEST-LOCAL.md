# Local Testing Tool - Create PR from Prompt

This tool lets you test the **full Overviewer Agent workflow** locally:

**Prompt → AI Analysis → Code Generation → Branch + Commit**

## Quick Start

```bash
# 1. Create your test input
cp test-create-input.example.json test-create-input.json

# 2. Edit test-create-input.json with your issue/prompt

# 3. Run the test
bun run test:create-pr
```

## What It Does

1. **Analyzes** your issue description using AI
2. **Scans** your repository structure and code
3. **Generates** code changes to fix the issue
4. **Creates** a new git branch
5. **Commits** the changes
6. **Shows** you the diff and next steps

## Input Format

```json
{
  "taskType": "bug_fix",
  "issueTitle": "Short description",
  "issueBody": "Detailed description with context...",
  "targetRepo": ".",
  "targetBranch": "main"
}
```

### Task Types

- `feature` - Implement new features/functionality
- `bug_fix` - Fix bugs
- `refactor` - Improve code structure
- `code_quality` - Enhance code quality
- `documentation` - Add/improve docs
- `security_audit` - Security fixes
- `test_generation` - Generate tests
- `structure_refactor` - Major refactoring

## Example Session

```bash
$ bun run test:create-pr

🚀 Starting PR Creation Test

📋 Test Configuration:
Task Type: bug_fix
Issue: Fix null pointer in authentication
Target: .
Branch: main

🌿 Creating branch: overviewer-agent/bug_fix-1234567890

🔄 Step 1: Analyzing issue...
  Task Type: bug_fix
  Confidence: 85%

🔄 Step 2: Analyzing repository...
  Repository analyzed

🔄 Step 3: Generating code changes...
  Changes generated for 2 file(s)

🔄 Step 4: Applying changes...
  ✓ modify: src/auth/middleware.ts
  ✓ create: src/auth/middleware.test.ts

✅ CHANGES APPLIED

Summary: Added null check for user object...

📝 Files Changed:
  - src/auth/middleware.ts
  - src/auth/middleware.test.ts

💾 Committing changes...
✅ Created commit: abc1234

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Branch: overviewer-agent/bug_fix-1234567890
Commit: abc1234...
Files: 2

🔍 View changes:
  git diff main..overviewer-agent/bug_fix-1234567890

📤 To create a PR (if you have GitHub CLI):
  gh pr create --title "bug_fix: Fix null pointer..."

🔄 To reset:
  git checkout main && git branch -D overviewer-agent/bug_fix-1234567890

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 DIFF PREVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Shows first 50 lines of diff]
```

## Requirements

- `OPENAI_API_KEY` environment variable
- Git repository
- Internet connection

## Example Use Cases

### 1. **Implement a New Feature**
```json
{
  "taskType": "feature",
  "issueTitle": "Add logging middleware",
  "issueBody": "Add HTTP request logging with timestamp, method, path, and response time. Configurable via ENABLE_REQUEST_LOGGING env var."
}
```

### 2. **Fix a Bug**
```json
{
  "taskType": "bug_fix",
  "issueTitle": "Null pointer crash",
  "issueBody": "App crashes when user is null in requireAuth middleware. Should return 401 instead."
}
```

### 3. **Architectural Discovery (Vague Prompt)**
```json
{
  "taskType": "refactor",
  "issueTitle": "wrong archi",
  "issueBody": "The project structure doesn't follow best practices"
}
```
The AI will discover structural issues like apps in `packages/` and propose moving them to `apps/`.

### 4. **Code Quality**
```json
{
  "taskType": "code_quality",
  "issueTitle": "Improve error handling",
  "issueBody": "Add proper try-catch blocks and error messages to all API routes"
}
```

### 5. **Add Documentation**
```json
{
  "taskType": "documentation",
  "issueTitle": "Document API endpoints",
  "issueBody": "Add JSDoc comments and README documentation for all REST endpoints in the backend"
}
```

## Tips

- **Be specific in the body** - it's the primary specification
- Start with small, focused features/fixes to test
- Review the generated code before pushing
- The AI works best with clear, detailed descriptions
- Include expected behavior and acceptance criteria
- For bugs: include steps to reproduce

## Next Steps After Running

1. **Review the changes**: `git diff main..branch-name`
2. **Test the changes**: Run your tests, try the fix manually
3. **Create a PR**: Use `gh pr create` or push and use GitHub UI
4. **Or rollback**: `git checkout main && git branch -D branch-name`

