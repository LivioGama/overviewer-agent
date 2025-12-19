# Overviewer Agent 🤖

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Overviewer Agent** is a truly agentic AI system that autonomously solves GitHub issues. Unlike traditional automation tools that follow predefined workflows, this agent **thinks, reasons, and decides** what to do based on the specific issue it encounters.

## 🌟 Key Features

- **Autonomous Reasoning**: Uses ReAct (Reasoning + Acting) loop to solve issues without hardcoded workflows
- **GitHub Integration**: Automatically processes issues and creates pull requests with solutions
- **Flexible Tool System**: Extensible set of tools for file operations, code search, and command execution
- **Multi-LLM Support**: Compatible with Claude, OpenRouter, and other LLM providers
- **Semantic Understanding**: Embeddings-powered tool matching and code search using Weaviate
- **Memory System**: Learns from past solutions to improve future responses
- **Docker-Ready**: Easy deployment with Docker Compose

## 🎯 What Makes It Different?

| Traditional Bot | Overviewer Agent |
|----------------|------------------|
| Hardcoded task types | No task types - agent decides |
| Rigid workflows | Flexible reasoning loop |
| Specific prompts per task | Generic tool-based system |
| Limited to predefined scenarios | Handles any issue type |
| Template-based responses | Contextual decision-making |

## 🏗️ Architecture

Overviewer Agent consists of three main components:

1. **Web Service** (`apps/web`): Next.js-based control plane UI for managing automation
2. **Runner Service** (`apps/runner`): Agent execution engine with ReAct loop implementation
3. **Kilo Webhook** (`apps/kilo-webhook`): GitHub webhook handler for event processing

### Core Components

- **Agent Loop**: ReAct pattern implementation for autonomous reasoning
- **LLM Client**: Minimal abstraction for LLM communication with multiple providers
- **Tool System**: Extensible tools (read/write files, run commands, search code, etc.)
- **Embeddings**: Semantic search and tool matching using Weaviate vector database

For detailed architecture information, see [ARCHITECTURE.md](ARCHITECTURE.md).

## 📋 Prerequisites

- **Node.js** >= 18.0.0 or **Bun** >= 1.0.0
- **Docker** and **Docker Compose**
- **Redis** (included in Docker setup)
- **GitHub App** credentials:
  - App ID
  - Private Key (PEM format)
  - Webhook Secret
- **LLM Provider API Key**:
  - Claude API key (via Anthropic)
  - OpenRouter API key
  - Or custom LLM endpoint

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/LivioGama/overviewer-agent.git
cd overviewer-agent
```

### 2. Install Dependencies

```bash
bun install
# or
npm install
```

### 3. Configure Environment

Create a `.env` file in the root directory:

```bash
# GitHub App Configuration
GITHUB_APP_ID=your_app_id
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=your_webhook_secret

# LLM Provider (choose one)
LLM_PROVIDER=claude  # or openrouter

# Claude Configuration
CLAUDE_BRIDGE_URL=http://host.docker.internal:8001
CLAUDE_MODEL=claude-haiku-4-5-20251001

# OpenRouter Configuration (optional)
OPENROUTER_API_KEY=sk-or-v1-your_key_here

# Redis (default)
REDIS_URL=redis://redis:6379

# Weaviate (for embeddings)
WEAVIATE_URL=http://weaviate:8080

# Workspace
WORKSPACE_ROOT=/tmp/overviewer-workspaces
```

### 4. Start Services with Docker

```bash
# Start all services
docker-compose up -d

# Check service status
docker-compose ps

# View logs
docker-compose logs -f runner
```

### 5. Configure Your Repository

Add `.overviewer.yml` to your target repository:

```yaml
version: "1.0"
enabled: true

automation:
  triggers:
    - comment       # Manual commands via comments
    - issue_opened  # Automatic on issue creation
    - pr_opened     # Automatic on PR creation

  issue_processing:
    enabled: true
    auto_assign: true
    initial_comment: true
    progress_updates: true

  tasks:
    fix:
      model: "glm-4.6"
      max_tokens: 3000
      timeout: 300
      auto_fix: true
```

See [example-overviewer.yml](example-overviewer.yml) for a complete configuration example.

## 📖 Usage

### Automatic Issue Processing

Once configured, the agent automatically processes issues when they're opened:

1. User creates a GitHub issue
2. Overviewer Agent receives webhook event
3. Agent analyzes the issue and creates a plan
4. Agent executes the plan using available tools
5. Agent creates a pull request with the solution

### Manual Triggering

Comment on an issue with:
```
@overviewer-agent fix this
```

### Monitoring

View agent progress in real-time:

```bash
# Watch runner logs
docker-compose logs -f runner

# Check Redis queue
docker exec -it $(docker-compose ps -q redis) redis-cli XLEN job-queue
```

## 🛠️ Available Tools

The agent has access to the following tools:

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

## 🔧 Development

### Local Development Setup

```bash
# Install dependencies
bun install

# Build all packages
bun run build

# Type check
bun run type-check

# Lint code
bun run lint

# Run tests
bun run test
```

### Development with Docker

```bash
# Development mode with hot reload
docker-compose -f docker-compose.override.yml up

# Run specific service
docker-compose up web
```

### Testing Without Commits

For quick testing without GitHub commits:

```bash
# Start minimal services
docker-compose -f docker-compose.simple.yml up -d redis

# Queue a test job
./RUN_LOCAL_TEST.sh

# Or follow detailed guide
# See QUICK_RUN.md for step-by-step instructions
```

See [LOCAL_TEST_GUIDE.md](LOCAL_TEST_GUIDE.md) for comprehensive testing instructions.

## 🧩 Project Structure

```
overviewer-agent/
├── apps/
│   ├── web/              # Next.js control plane UI
│   ├── runner/           # Agent execution engine
│   └── kilo-webhook/     # GitHub webhook handler
├── packages/
│   └── shared/           # Shared types and utilities
├── docker-compose.yml    # Production deployment
├── .overviewer.yml       # Repository configuration
└── example-overviewer.yml # Configuration template
```

## 🐳 Deployment

### Docker Compose (Recommended)

```bash
# Production deployment
docker-compose up -d

# Scale runners
docker-compose up -d --scale runner=3
```

### EasyPanel Deployment

See [DEPLOY-EASYPANEL.md](DEPLOY-EASYPANEL.md) for EasyPanel-specific instructions.

### Environment Variables

Required environment variables for production:

- `GITHUB_APP_ID`: Your GitHub App ID
- `GITHUB_APP_PRIVATE_KEY`: GitHub App private key (PEM format)
- `GITHUB_WEBHOOK_SECRET`: Webhook secret for security
- `LLM_PROVIDER`: LLM provider (claude, openrouter, etc.)
- `REDIS_URL`: Redis connection URL
- `WEAVIATE_URL`: Weaviate vector database URL

## 📚 Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) - Detailed architecture overview
- [QUICK_START_EMBEDDINGS.md](QUICK_START_EMBEDDINGS.md) - Setup embeddings integration
- [LOCAL_TEST_GUIDE.md](LOCAL_TEST_GUIDE.md) - Testing guide
- [QUICK_RUN.md](QUICK_RUN.md) - Quick testing without commits
- [DEPLOY-EASYPANEL.md](DEPLOY-EASYPANEL.md) - EasyPanel deployment guide

## 🎛️ Configuration

### LLM Providers

#### Claude (via Bridge)

```bash
LLM_PROVIDER=claude
CLAUDE_BRIDGE_URL=http://host.docker.internal:8001
CLAUDE_MODEL=claude-haiku-4-5-20251001
```

#### OpenRouter

```bash
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-v1-your_key_here
```

### Repository Settings

Configure automation behavior in `.overviewer.yml`:

- **Triggers**: When to activate (comments, issue_opened, pr_opened)
- **Issue Processing**: Auto-assignment, comments, progress updates
- **Tasks**: Per-task model, token limits, timeouts
- **Approval**: Require approval before changes
- **Output**: PR creation, branch naming
- **Rate Limits**: Jobs per hour/day

## 🔐 Security

- Never commit secrets to version control
- Use environment variables for sensitive data
- Configure webhook secrets for GitHub integration
- Limit tool access in production environments
- Review PRs before merging agent changes

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Adding New Tools

Tools can be added to extend agent capabilities:

```typescript
// packages/runner/src/tools/my-tool.ts
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

## 📊 Costs

Typical usage costs (approximate):

- **Weaviate**: $0 (self-hosted)
- **Embeddings**: ~$0.0001 per job via OpenRouter
- **LLM Calls**: Varies by provider and model
  - Claude Haiku: ~$0.01-0.05 per issue
  - GPT-4: ~$0.10-0.50 per issue
- **Infrastructure**: Redis + Docker hosting costs

## 🐛 Troubleshooting

### Common Issues

**"Cannot connect to Redis"**
```bash
docker-compose restart redis
docker-compose logs redis
```

**"Cannot connect to Weaviate"**
```bash
docker-compose restart weaviate
curl http://localhost:8080/v1/meta
```

**"GitHub webhook not received"**
- Verify webhook URL is accessible
- Check webhook secret matches
- Review GitHub App permissions

**"LLM API errors"**
- Verify API key is correct
- Check rate limits
- Review model availability

### Debug Mode

Enable verbose logging:

```bash
# Set in docker-compose.yml or .env
LOG_LEVEL=debug
```

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Built with [Next.js](https://nextjs.org/), [Bun](https://bun.sh/), and [TypeScript](https://www.typescriptlang.org/)
- Uses [Weaviate](https://weaviate.io/) for vector embeddings
- Integrates with [Anthropic Claude](https://www.anthropic.com/), [OpenRouter](https://openrouter.ai/), and other LLM providers
- GitHub integration via [Octokit](https://github.com/octokit)

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/LivioGama/overviewer-agent/issues)
- **Discussions**: [GitHub Discussions](https://github.com/LivioGama/overviewer-agent/discussions)

---

**Made with ❤️ by the Overviewer Agent team**
