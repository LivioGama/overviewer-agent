# 🤖 How to Use Ollama Turbo Agent (Roomote Style)

## Quick Start Guide

### 1. 📊 Database Setup
Run the database migrations to add the new tables:
```bash
bun run db:migrate
```

### 2. 🏗️ Deploy the System
Build and start all services:
```bash
docker-compose up -d
```

### 3. ⚙️ Configure Your Repository

Add `.overviewer.yml` to your repository root:

```yaml
version: "1.0"
enabled: true

automation:
  triggers:
    - comment      # Manual commands
    - issue_opened # 🆕 Automatic issue processing
    - pr_opened    # Automatic PR review
  
  issue_processing:
    enabled: true
    auto_assign: true
    initial_comment: true
    progress_updates: true

  tasks:
    fix:
      model: "gpt-oss:120b"
      max_tokens: 3000
      timeout: 300
      auto_fix: true
```

## 🧪 Testing the System

### Create a Test Issue
Open an issue in your configured repository with realistic content:

**Title:** `Button click not working in mobile view`

**Body:**
```
When I click the submit button on mobile devices, nothing happens. 
The button should submit the form but it seems like the click event is not firing.

Steps to reproduce:
1. Open the app on mobile
2. Fill out the form  
3. Click submit button
4. Nothing happens

Expected: Form should submit and show success message
Actual: No response, button appears unresponsive
```

### Expected Bot Behavior

**Step 1: Immediate Response (< 30 seconds)**
The bot will automatically comment:

```
Hi! I'm here to help out the maintainers and am going to see if I can fix this issue. 
I'll investigate a bug fix for: Button click not working in mobile view. Thanks for reporting this!

🔍 **Analysis in progress...**
- Issue type: Bug Fix
- Estimated complexity: medium
- Task queued: bug_fix

I'll keep you updated on my progress!
```

**Step 2: Progress Updates**
```
📊 **Progress Update**

Scanning codebase and implementing fixes...

Current status: fixing
```

**Step 3: PR Creation (2-5 minutes)**
The bot creates a new branch and opens a PR with:

**Title:** `🐛 Fix: Button click not working in mobile view`

**Description:**
```
This PR fixes issue #123 Button click not working in mobile view

## Problem
When I click the submit button on mobile devices, nothing happens. The button should submit the form but it seems like the click event is not firing...

## Solution
Analyzed the issue and implemented targeted fixes to resolve the reported problem:
- Identified root cause through codebase analysis
- Applied minimal, focused changes to fix the issue
- Ensured backward compatibility and proper error handling

## Changes Made
- Fixed issues in `components/SubmitButton.tsx`
- Fixed issues in `styles/mobile.css`

### Bug Fixes Applied:
- ✅ Root cause analysis and resolution
- ✅ Error handling improvements  
- ✅ Logic corrections
- ✅ Edge case handling
- ✅ Validation enhancements

## Testing
All existing tests pass ✅
Manual testing recommended to verify issue resolution ✅
Linting and type checking pass ✅

Fixes #123
```

**Step 4: Self-Review**
The bot reviews its own PR and posts:
```
🤖 **AI Review Summary**

Reviewed 2 files with 15 total changes. Changes appear reasonable.

**Confidence**: 85%

### Suggestions:
- Manual testing recommended to verify fix
- Consider adding tests if none exist

✅ **This PR looks good to me!** The changes appear to address the issue appropriately.
```

**Step 5: Success Comment**
Back on the original issue:
```
I've successfully implemented a fix for this issue! 🎉

Fixed the reported issue by analyzing 2 files and implementing targeted improvements.

Solution implemented in PR #124: https://github.com/user/repo/pull/124

**Changes made:**
- Analyzed the issue and identified the root cause
- Implemented targeted fixes with minimal impact
- Added appropriate error handling and validation
- Ensured backward compatibility

All CI checks have passed ✅ and the fix is ready for review!
```

## 🎛️ Manual Commands (Still Available)

You can still use manual commands in comments:

```
/fix resolve the authentication issue
/refactor improve code quality and performance  
/test generate comprehensive unit tests
/docs add missing documentation
/security audit for vulnerabilities
/quality improve overall code quality
```

## 🔍 Monitoring & Debugging

### Check Webhook Status
```bash
curl https://your-domain.com/webhooks/health
```

### View Logs
```bash
docker-compose logs backend | grep "Issue #"
docker-compose logs runner | grep "BugFixTask"
```

### Dashboard
Visit your dashboard at `https://your-domain.com` to see:
- Recent issues processed
- Active jobs
- Bot performance metrics
- Job history and results

## 🚨 Troubleshooting

### Bot Not Responding to Issues
1. Check webhook configuration in GitHub App settings
2. Verify `.overviewer.yml` has `issue_opened` trigger
3. Check logs: `docker-compose logs backend`

### Issues Not Being Processed
1. Verify issue content is substantial (> 10 chars title, > 20 chars body)
2. Check if issue has "no-automation" or "wontfix" labels
3. Ensure issue is not created by a bot account

### PR Creation Failing
1. Check repository permissions for the GitHub App
2. Verify Ollama service is running: `docker-compose logs ollama`
3. Check runner logs: `docker-compose logs runner`

## ⚡ Performance Tips

- The system works best with clear, detailed issue descriptions
- Issues with error logs, stack traces, or reproduction steps get better results
- The bot skips very short or vague issues to avoid noise

## 🔒 Security & Permissions

The bot only processes issues when:
- Repository has proper `.overviewer.yml` configuration  
- User has appropriate permissions
- Issue meets minimum quality thresholds
- Rate limits are not exceeded

---

🎉 **Your repository is now equipped with roomote-style automated issue fixing!**
