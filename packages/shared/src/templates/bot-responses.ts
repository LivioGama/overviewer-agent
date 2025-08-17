export const INITIAL_COMMENT_TEMPLATE = `Hi! I'm here to help out the maintainers and am going to see if I can fix this issue. I'll investigate \`{{issue_summary}}\`. Thanks for reporting this!

🔍 **Analysis in progress...**
- Issue type: {{issue_type}}
- Estimated complexity: {{complexity}}
- Task queued: {{task_type}}

I'll keep you updated on my progress!`;

export const PROGRESS_UPDATE_TEMPLATE = `📊 **Progress Update**

{{status_message}}

Current status: {{status}}
{{details}}`;

export const SUCCESS_COMMENT_TEMPLATE = `I've successfully implemented a fix for this issue! 🎉

{{problem_summary}}

Solution implemented in PR #{{pr_number}}

**Changes made:**
{{changes_summary}}

All CI checks have passed ✅ and the fix is ready for review!`;

export const ERROR_COMMENT_TEMPLATE = `❌ I encountered an issue while trying to fix this problem.

**Error**: {{error_message}}

{{retry_info}}

The maintainers have been notified and will investigate further.`;

export const BUG_FIX_PR_TEMPLATE = `This PR fixes issue #{{issue_number}} {{issue_title}}

## Problem
{{problem_description}}

## Solution
{{solution_description}}

## Changes Made
{{changes_list}}

## Testing
{{testing_results}}

Fixes #{{issue_number}}`;

export const REFACTOR_PR_TEMPLATE = `This PR addresses refactoring request in issue #{{issue_number}} {{issue_title}}

## Objective
{{refactor_objective}}

## Improvements Made
{{improvements_list}}

## Changes Made
{{changes_list}}

## Testing
{{testing_results}}

Fixes #{{issue_number}}`;

export const FEATURE_PR_TEMPLATE = `This PR implements feature request from issue #{{issue_number}} {{issue_title}}

## Feature Description
{{feature_description}}

## Implementation
{{implementation_details}}

## Changes Made
{{changes_list}}

## Testing
{{testing_results}}

Fixes #{{issue_number}}`;

export interface TemplateVariables {
  issue_number?: number;
  issue_title?: string;
  issue_summary?: string;
  issue_type?: string;
  complexity?: string;
  task_type?: string;
  status?: string;
  status_message?: string;
  details?: string;
  problem_summary?: string;
  pr_number?: number;
  pr_url?: string;
  changes_summary?: string;
  error_message?: string;
  retry_info?: string;
  problem_description?: string;
  solution_description?: string;
  changes_list?: string;
  testing_results?: string;
  refactor_objective?: string;
  improvements_list?: string;
  feature_description?: string;
  implementation_details?: string;
}

export const renderTemplate = (
  template: string,
  variables: TemplateVariables,
): string => {
  let result = template;

  for (const [key, value] of Object.entries(variables)) {
    if (value !== undefined) {
      const placeholder = `{{${key}}}`;
      result = result.replace(new RegExp(placeholder, "g"), String(value));
    }
  }

  // Clean up any remaining placeholders
  result = result.replace(/\{\{[^}]+\}\}/g, "[Not Available]");

  return result;
};
