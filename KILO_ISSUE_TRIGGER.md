# Kilo Cloud Agent - Issue Trigger

This repository is configured to automatically trigger Kilo Cloud Agents when GitHub issues are created or labeled with the `kilo-agent` label.

## How It Works

The GitHub Actions workflow `.github/workflows/kilo-issue-trigger.yml` automatically:

1. Triggers when an issue is **opened** or **labeled**
2. Checks if the issue has the `kilo-agent` label
3. Installs Kilo Code CLI
4. Passes the issue title and body to Kilo Code
5. Kilo Code processes the request and commits changes to a new branch
6. Adds a comment to the issue confirming the agent has been triggered

## Setup Instructions

### 1. Add Repository Secrets

You need to add API keys for the AI models you want to use:

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Add one or both of these secrets:
   - `ANTHROPIC_API_KEY` - for Claude models
   - `OPENAI_API_KEY` - for OpenAI models

### 2. Enable GitHub Actions

1. Go to **Settings** → **Actions** → **General**
2. Ensure "Allow all actions and reusable workflows" is enabled
3. Under "Workflow permissions", select "Read and write permissions"

## Usage

### Option 1: Add Label to New Issue

When creating a new issue, add the `kilo-agent` label to automatically trigger the workflow.

### Option 2: Add Label to Existing Issue

Add the `kilo-agent` label to any existing issue to trigger the workflow.

## Example Issue

**Title:** Add error handling to API endpoint

**Body:**
```
Please add proper error handling to the /api/users endpoint. 
It should:
- Return 400 for invalid input
- Return 404 when user not found
- Return 500 for server errors
- Include error messages in the response
```

**Label:** `kilo-agent`

## What Happens Next

1. The workflow runs automatically
2. Kilo Code analyzes your issue
3. Changes are committed to a new branch
4. You'll receive a comment on the issue confirming the agent is working
5. Review the changes in the new branch
6. Create a PR from the branch when ready

## Configuration

You can modify the workflow in `.github/workflows/kilo-issue-trigger.yml` to:

- Change the trigger label (default: `kilo-agent`)
- Adjust the timeout (default: 600 seconds)
- Add additional environment variables
- Customize the comment message

## Troubleshooting

### Workflow doesn't trigger
- Ensure the `kilo-agent` label exists in your repository
- Check that GitHub Actions is enabled
- Verify workflow permissions are set correctly

### API errors
- Ensure you've added the correct API keys as secrets
- Check that your API keys have sufficient credits/quota
- Review the Actions logs for detailed error messages

## Notes

- The workflow uses Kilo Code CLI in `--auto` mode for fully automated execution
- All changes are committed automatically to a new branch
- The workflow runs on Ubuntu and uses Node.js 20
- Timeout is set to 600 seconds (10 minutes) per run

## Learn More

- [Kilo Code Documentation](https://kilo.ai/docs)
- [Kilo Code CLI](https://kilo.ai/docs/cli)
- [Cloud Agents](https://kilo.ai/features/cloud-agents)
