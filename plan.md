# Implementation Plan: Transform Ollama-Turbo-Agent to RooCode-Style Bot

## Overview
Transform the current command-driven ollama-turbo-agent into a roomote-style bot that automatically processes GitHub issues, creates PRs, and provides self-review functionality.

## Current State Analysis

### What Works (Keep)
- ✅ GitHub App integration with webhooks
- ✅ Job queue system with multiple task types
- ✅ Automatic PR creation infrastructure
- ✅ Multiple AI task executors (BugFixTask, RefactorTask, etc.)
- ✅ Repository configuration via `.ollama-turbo.yml`

### What Needs to Change
- ❌ Only triggers on manual commands (`/fix`, `/refactor`)
- ❌ No automatic issue processing
- ❌ No issue commenting/communication
- ❌ No self-review mechanism
- ❌ Limited issue event handling

## Phase 1: Issue Auto-Detection & Processing

### 1.1 Add Issue Event Handler
**File**: `packages/backend/src/services/webhook.ts`

Add new case in `handleWebhook()`:
```typescript
case 'issues':
  return await this.handleIssueEvent(payload)
```

### 1.2 Create Issue Event Handler
**New Method**: `handleIssueEvent(payload: IssueEvent)`

Logic:
1. Check if action is 'opened'
2. Ignore bot-created issues
3. Analyze issue content to determine task type
4. Post initial bot comment
5. Queue appropriate job

### 1.3 Issue Content Analysis
**New Service**: `packages/backend/src/services/issue-analyzer.ts`

Features:
- Parse issue title/body for keywords
- Map to task types (bug → bug_fix, feature → refactor, etc.)
- Extract issue context and requirements
- Determine priority/complexity

### 1.4 Update Webhook Types
**File**: `packages/shared/src/types/webhook.ts`

Add:
```typescript
export const IssueEventSchema = z.object({
  action: z.enum(['opened', 'closed', 'edited', 'labeled']),
  issue: z.object({
    number: z.number(),
    title: z.string(),
    body: z.string().nullable(),
    // ... rest of issue structure
  }),
  // ... repository and installation info
})
```

## Phase 2: Bot Communication System

### 2.1 Bot Response Templates
**New File**: `packages/shared/src/templates/bot-responses.ts`

Templates for:
- Initial investigation comment
- Progress updates
- Success/failure notifications
- PR descriptions

Example:
```typescript
export const INITIAL_COMMENT_TEMPLATE = `Hi! I'm here to help out the maintainers and am going to see if I can fix this issue. I'll investigate {{issue_summary}}. Thanks for reporting this!

🔍 **Analysis in progress...**
- Issue type: {{issue_type}}
- Estimated complexity: {{complexity}}
- Task queued: {{task_type}}

I'll keep you updated on my progress!`
```

### 2.2 Update GitHub Service
**File**: `packages/backend/src/services/github.ts`

Add methods:
- `commentOnIssue()`
- `updateIssueComment()`
- `addIssueLabels()`
- `assignIssue()`

### 2.3 Bot Communication Service
**New File**: `packages/backend/src/services/bot-communication.ts`

Handles:
- Template rendering with variables
- Progress tracking and updates
- Error communication
- Success notifications

## Phase 3: Enhanced Task Execution

### 3.1 Update Base Task Executor
**File**: `packages/runner/src/tasks/executor.ts`

Add to `BaseTask`:
```typescript
protected async updateIssueProgress(
  job: Job,
  status: string,
  details?: string
): Promise<void>

protected async postInitialComment(job: Job): Promise<void>

protected async postSuccessComment(
  job: Job,
  prUrl: string,
  summary: string
): Promise<void>
```

### 3.2 Enhanced Bug Fix Task
**File**: `packages/runner/src/tasks/bug-fix.ts`

Updates:
- Post initial comment when starting
- Provide progress updates during analysis
- Use issue context for better fixes
- Generate detailed PR descriptions
- Post success comment with link to PR

### 3.3 Issue Context Analysis
**New Method**: `analyzeIssueContext()`

Features:
- Extract error logs/stack traces
- Identify affected files/components
- Understand reproduction steps
- Parse expected vs actual behavior

## Phase 4: Self-Review Mechanism

### 4.1 PR Review Service
**New File**: `packages/runner/src/services/pr-reviewer.ts`

Capabilities:
- Analyze generated code changes
- Check for potential issues
- Verify fix addresses original problem
- Generate review comments
- Suggest improvements

### 4.2 Review Task
**New File**: `packages/runner/src/tasks/review.ts`

Process:
1. Fetch PR diff
2. Analyze changes against issue requirements
3. Run static analysis
4. Check for common issues
5. Post review comments
6. Approve or request changes

### 4.3 Enhanced PR Creation
**Update**: `BaseTask.createPullRequest()`

Add:
- Auto-assign reviewers
- Add relevant labels
- Link to original issue
- Trigger self-review after creation
- Use roomote-style PR template

## Phase 5: Improved PR Templates

### 5.1 PR Description Templates
**File**: `packages/shared/src/templates/pr-templates.ts`

RooCode-style template:
```typescript
export const BUG_FIX_PR_TEMPLATE = `This PR fixes issue #{{issue_number}} {{issue_title}}

## Problem
{{problem_description}}

## Solution
{{solution_description}}

## Changes Made
{{changes_list}}

## Testing
{{testing_results}}

Fixes #{{issue_number}}`
```

### 5.2 Dynamic Template Rendering
**Service**: Template engine to populate variables:
- Issue details
- Analysis results
- File changes summary
- Test results

## Phase 6: Configuration & Policy Updates

### 6.1 Repository Configuration
**File**: `example-ollama-turbo.yml`

Add new options:
```yaml
automation:
  triggers:
    - issue_opened    # NEW: Auto-process issues
    - comment
    - pr_opened
  
  issue_processing:
    enabled: true
    auto_assign: true
    initial_comment: true
    progress_updates: true
  
  self_review:
    enabled: true
    auto_approve_simple: false
    review_criteria:
      - code_quality
      - test_coverage
      - security_check
```

### 6.2 Policy Service Updates
**File**: `packages/backend/src/services/policy.ts`

Add:
- Issue processing permissions
- Auto-assignment rules
- Review thresholds
- Bot behavior configuration

## Phase 7: Enhanced Workflow Integration

### 7.1 Job Queue Enhancements
**File**: `packages/backend/src/services/queue.ts`

Add:
- Job dependencies (review after PR creation)
- Progress tracking
- Issue linking
- Automatic retries

### 7.2 Runner Service Updates
**File**: `packages/runner/src/services/runner.ts`

Features:
- Clone repository for each job
- Maintain issue context throughout
- Coordinate multiple related tasks
- Handle cross-references between issues/PRs

## Phase 8: Database Schema Updates

### 8.1 Add Issue Tracking
**File**: `packages/backend/src/database/schema.ts`

New tables:
```sql
CREATE TABLE issues (
  id UUID PRIMARY KEY,
  github_issue_number INTEGER,
  repository_id INTEGER,
  issue_title TEXT,
  issue_body TEXT,
  analysis_result JSONB,
  status VARCHAR(50),
  assigned_job_id UUID REFERENCES jobs(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE pr_reviews (
  id UUID PRIMARY KEY,
  job_id UUID REFERENCES jobs(id),
  pr_number INTEGER,
  review_result JSONB,
  approved BOOLEAN,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Phase 9: Testing & Validation

### 9.1 Integration Tests
**New Directory**: `packages/backend/src/__tests__/integration/`

Test scenarios:
- Issue creation → bot comment → job creation
- Job execution → PR creation → self-review
- Error handling and edge cases
- Configuration validation

### 9.2 Mock GitHub Environment
**Setup**: Test environment with:
- Mock GitHub webhooks
- Simulated repositories
- Controlled issue/PR scenarios
- Ollama service mocking

## Phase 10: Monitoring & Analytics

### 10.1 Bot Performance Tracking
**New Service**: `packages/backend/src/services/analytics.ts`

Metrics:
- Issue processing time
- Success/failure rates
- Review accuracy
- User satisfaction (reactions/comments)

### 10.2 Dashboard Updates
**File**: `packages/web/src/components/dashboard/Dashboard.tsx`

Add sections:
- Recent issues processed
- Bot performance metrics
- Active jobs with issue links
- Review statistics

## Implementation Timeline

### Week 1-2: Foundation
- [ ] Issue event handling
- [ ] Basic bot communication
- [ ] Issue analysis service

### Week 3-4: Task Enhancement
- [ ] Enhanced task execution
- [ ] Progress tracking
- [ ] PR template improvements

### Week 5-6: Self-Review
- [ ] PR review service
- [ ] Review task implementation
- [ ] Approval workflows

### Week 7-8: Integration
- [ ] Database updates
- [ ] Configuration enhancements
- [ ] Testing framework

### Week 9-10: Polish
- [ ] Dashboard updates
- [ ] Documentation
- [ ] Performance optimization

## Risk Mitigation

### Bot Spam Prevention
- Rate limiting per repository
- Configurable bot behavior
- Manual override capabilities
- Issue type filtering

### Quality Assurance
- Comprehensive testing
- Staged rollout
- Performance monitoring
- Rollback procedures

### User Experience
- Clear bot communication
- Opt-out mechanisms
- Customizable templates
- Progress transparency

## Success Metrics

- **Automation Rate**: % of issues automatically processed
- **Fix Accuracy**: % of fixes that resolve issues correctly
- **Response Time**: Time from issue creation to initial bot response
- **PR Quality**: Review scores and approval rates
- **User Satisfaction**: Feedback and adoption metrics

## Conclusion

This plan transforms ollama-turbo-agent from a command-driven tool into a proactive roomote-style bot that automatically processes GitHub issues, creates PRs, and provides self-review capabilities. The implementation maintains the existing architecture while adding the necessary automation and communication layers.


