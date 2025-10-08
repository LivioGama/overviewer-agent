# Overviewer Agent Architecture

## Overview

Overviewer Agent is a **truly agentic** AI system that autonomously solves GitHub issues. Unlike traditional automation tools that follow predefined workflows, this agent **thinks, reasons, and decides** what to do based on the specific issue it encounters.

## Core Philosophy

**No hardcoded task types. No rigid workflows. Just pure autonomous reasoning.**

The agent receives an issue and uses a ReAct (Reasoning + Acting) loop to:
1. **Reason** about what needs to be done
2. **Act** by using available tools
3. **Observe** the results
4. **Repeat** until the issue is solved

## Architecture Components

### 1. Agent Loop (`packages/runner/src/agent/agent-loop.ts`)

The heart of the system. Implements the ReAct pattern:

```typescript
while (!finished && iterations < maxIterations) {
  // 1. Agent reasons about what to do next
  const thought = await llm.generateThought(systemPrompt, history);
  
  // 2. Agent decides to use a tool
  if (thought.action) {
    const result = await executeTool(thought.action);
    history.push(result);
  }
  
  // 3. Agent observes results and continues reasoning
}
```

### 2. LLM Client (`packages/runner/src/agent/llm-client.ts`)

Minimal abstraction for LLM communication:
- Builds system prompt with tool descriptions
- Sends conversation history to LLM
- Parses structured JSON responses (reasoning + action)
- No domain-specific logic - just facilitates agent reasoning

### 3. Tool System (`packages/runner/src/tools/`)

Generic tools that the agent can use:

| Tool | Purpose |
|------|---------|
| `read_file` | Read file contents |
| `write_file` | Create or modify files |
| `list_directory` | Explore repository structure |
| `move_file` | Move/rename files |
| `delete_file` | Remove files |
| `run_command` | Execute shell commands (tests, linting, etc.) |
| `search_code` | Find code patterns |
| `comment_on_issue` | Update GitHub issue with progress |

Each tool has:
- Clear description for the LLM
- Parameter specifications
- Execution logic
- Error handling

### 4. Runner Service (`packages/runner/src/index.ts`)

Orchestrates the entire workflow:
1. Polls Redis for new jobs
2. Clones repository into isolated workspace
3. Executes agent loop
4. Creates branch and PR if successful
5. Cleans up workspace

## Example Agent Flow

### Issue: "Move packages/web to apps/web"

**Iteration 1:**
```json
{
  "reasoning": "I need to understand the current project structure first",
  "action": {
    "tool": "list_directory",
    "parameters": { "path": ".", "recursive": true }
  }
}
```

**Iteration 2:**
```json
{
  "reasoning": "I can see packages/web exists. Let me check what's inside",
  "action": {
    "tool": "list_directory",
    "parameters": { "path": "packages/web", "recursive": true }
  }
}
```

**Iteration 3:**
```json
{
  "reasoning": "I need to move all files. Starting with package.json",
  "action": {
    "tool": "move_file",
    "parameters": { 
      "from": "packages/web/package.json",
      "to": "apps/web/package.json"
    }
  }
}
```

**...(continues moving all files)...**

**Final Iteration:**
```json
{
  "reasoning": "All files have been moved successfully",
  "finished": true,
  "finalAnswer": "Successfully moved packages/web to apps/web with all files and subdirectories"
}
```

## Key Differences from Traditional Automation

| Traditional Bot | Overviewer Agent |
|----------------|------------------|
| Hardcoded task types | No task types - agent decides |
| Rigid workflows | Flexible reasoning loop |
| Specific prompts per task | Generic tool-based system |
| Limited to predefined scenarios | Handles any issue type |
| Template-based responses | Contextual decision-making |

## Benefits

1. **Flexibility**: Can handle issues you didn't anticipate
2. **Adaptability**: Learns the repository structure on-the-fly
3. **Transparency**: Every decision is logged with reasoning
4. **Extensibility**: Add new tools without changing agent logic
5. **Robustness**: Recovers from errors and tries alternative approaches

## Adding New Tools

```typescript
export const myCustomTool: Tool = {
  name: "my_tool",
  description: "What this tool does",
  parameters: {
    param1: {
      type: "string",
      description: "Description of parameter",
      required: true
    }
  },
  async execute(params, context) {
    // Tool implementation
    return {
      success: true,
      output: "Tool result"
    };
  }
};
```

Register in `packages/runner/src/tools/index.ts`:
```typescript
export const getAllTools = (): Tool[] => [
  // ... existing tools
  myCustomTool,
];
```

The agent will automatically discover and use your new tool!

## Future Enhancements

- **Memory system**: Remember solutions across issues
- **Multi-agent collaboration**: Multiple agents working together
- **Learning from feedback**: Improve from PR reviews
- **Advanced reasoning**: Chain-of-thought, tree of thought
- **Cost optimization**: Smarter tool usage to reduce LLM calls

