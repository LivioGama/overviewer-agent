# Ollama Turbo Agent

🚀 **AI-powered GitHub automation for code refactoring, testing, documentation, and more.**

A comprehensive GitHub App that leverages AI to automate common development tasks through intelligent code analysis and generation. Built with TypeScript, Next.js, and Ollama for local AI inference.

![Architecture](https://img.shields.io/badge/Architecture-Microservices-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)
![Next.js](https://img.shields.io/badge/Next.js-14-black)
![Ollama](https://img.shields.io/badge/Ollama-AI-green)

## ✨ Features

### 🔧 **AI-Powered Refactoring**
- Automatically improve code quality and readability
- Performance optimizations and best practices
- Security enhancements and error handling improvements

### 🧪 **Test Generation** 
- Generate comprehensive unit tests with AI
- Edge cases and boundary condition testing
- Mock dependencies and integration tests

### 📚 **Documentation**
- Automatic code documentation generation
- API documentation and usage examples
- Keep documentation in sync with code changes

### 🔒 **Security Audit**
- Identify security vulnerabilities automatically
- Fix common security issues with AI suggestions
- Generate security reports and recommendations

### 🐛 **Bug Fixes**
- AI-powered debugging and issue resolution
- Root cause analysis and fix suggestions
- Automated code corrections

### ✨ **Code Quality**
- Improve code readability and maintainability
- Enforce coding standards and conventions
- Performance optimizations and clean code practices

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   GitHub App    │    │     Backend     │    │   Task Runner   │
│                 │────│   (Webhooks)    │────│   (Workers)     │
│  Webhook Events │    │   Job Queue     │    │   AI Tasks      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web Dashboard │    │   PostgreSQL    │    │     Ollama      │
│   (Next.js UI) │    │   (Database)    │    │   (AI Models)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │      Redis      │
                       │   (Job Queue)   │
                       └─────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ and **Bun** 1.0+
- **PostgreSQL** 14+
- **Redis** 6+
- **Ollama** with CodeLlama model
- **GitHub App** credentials

### 1. Clone and Install

```bash
git clone https://github.com/your-org/ollama-turbo-agent.git
cd ollama-turbo-agent

# Install dependencies
bun install

# Build shared package
cd packages/shared && bun run build && cd ../..
```

### 2. Set Up GitHub App

1. Go to GitHub Settings → Developer settings → GitHub Apps
2. Create a new GitHub App with these settings:
   - **Webhook URL**: `https://ollama-turbo-agent.liviogama.com/webhooks/github`
   - **Permissions**:
     - Contents: Read & Write
     - Pull requests: Read & Write  
     - Issues: Read & Write
     - Checks: Read & Write
     - Metadata: Read
   - **Events**:
     - Issue comments
     - Issues
     - Pull requests
     - Pull request reviews
     - Check suites
     - Push
3. Generate and download the private key
4. Note your App ID and Installation ID

### 3. Environment Setup

Create `.env` files for each package:

#### Backend (packages/backend/.env)
```bash
NODE_ENV=development
PORT=3001

# GitHub App
GITHUB_APP_ID=your_app_id
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nyour_private_key\n-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=your_webhook_secret

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/ollama_turbo_agent

# Redis
REDIS_URL=redis://localhost:6379

# Ollama
OLLAMA_API_URL=http://localhost:11434
```

#### Runner (packages/runner/.env)
```bash
NODE_ENV=development

# GitHub App (same as backend)
GITHUB_APP_ID=your_app_id
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nyour_private_key\n-----END RSA PRIVATE KEY-----"

# Redis
REDIS_URL=redis://localhost:6379

# Ollama
OLLAMA_API_URL=http://localhost:11434

# Workspace
WORKSPACE_ROOT=/tmp/ollama-turbo-workspaces
```

#### Web (packages/web/.env)
```bash
NEXTAUTH_URL=https://ollama-turbo-agent.liviogama.com
NEXTAUTH_SECRET=development-secret-key

# GitHub OAuth (optional)
GITHUB_ID=your_oauth_app_id
GITHUB_SECRET=your_oauth_app_secret
```

### 4. Database Setup

```bash
# Create database
createdb ollama_turbo_agent

# Run migrations
cd packages/backend
bun run db:migrate
```

### 5. Install and Start Ollama

```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Start Ollama service
ollama serve

# Pull CodeLlama model
ollama pull codellama
```

### 6. Start Services

```bash
# Terminal 1: Backend
cd packages/backend
bun run dev

# Terminal 2: Runner
cd packages/runner  
bun run dev

# Terminal 3: Web Dashboard
cd packages/web
bun run dev
```

## 📝 Usage

### Commands

Comment on GitHub issues or pull requests with these commands:

- `/refactor [instructions]` - Refactor code with AI assistance
- `/test` - Generate comprehensive unit tests
- `/docs` - Add or update documentation
- `/security` - Run security audit and fixes
- `/fix [description]` - Fix bugs with AI assistance  
- `/quality` - Improve overall code quality

### Repository Configuration

Add `.ollama-turbo.yml` to your repository root:

```yaml
automation:
  triggers:
    - comment      # Commands in comments
    - pr_opened    # Automatic on PR open
    - schedule     # Scheduled automation
    
  tasks:
    refactor:
      model: "codellama"
      max_tokens: 4000
      timeout: 300
    test:
      model: "codellama"
      auto_fix: true
    security:
      model: "codellama"
      report_only: false
      
  approval:
    required: true           # Require approval for changes
    maintainers_only: true   # Only maintainers can approve
    
  output:
    open_pr: true           # Open PRs for changes
    push_direct: false      # Don't push directly to main
    branch_prefix: "automation/"
    
  rate_limits:
    max_jobs_per_hour: 10
    max_jobs_per_day: 50
```

## 🔧 Development

### Project Structure

```
ollama-turbo-agent/
├── packages/
│   ├── backend/           # Fastify API server
│   │   ├── src/
│   │   │   ├── routes/    # API routes
│   │   │   ├── services/  # Business logic
│   │   │   ├── database/  # Database schemas
│   │   │   └── middleware/# Auth & validation
│   │   └── package.json
│   │
│   ├── runner/            # Task execution workers
│   │   ├── src/
│   │   │   ├── tasks/     # Task implementations
│   │   │   ├── services/  # Ollama & GitHub APIs
│   │   │   └── utils/     # Helper functions
│   │   └── Dockerfile
│   │
│   ├── web/               # Next.js dashboard
│   │   ├── src/
│   │   │   ├── app/       # App router pages
│   │   │   ├── components/# React components
│   │   │   └── lib/       # Utilities
│   │   └── package.json
│   │
│   └── shared/            # Common types & utils
│       ├── src/
│       │   ├── types/     # TypeScript types
│       │   └── utils/     # Shared utilities
│       └── package.json
│
├── infrastructure/        # Infrastructure as code
├── docker/               # Docker configurations
└── docs/                 # Documentation
```

### Building

```bash
# Build all packages
bun run build

# Build specific package
cd packages/backend && bun run build
```

### Testing

```bash
# Run tests for all packages
bun run test

# Run tests for specific package
cd packages/shared && bun test
```

### Linting

```bash
# Lint all packages
bun run lint

# Fix linting issues
bun run lint --fix
```

## 🐳 Docker Deployment

### Using Docker Compose

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Individual Containers

```bash
# Build runner image
cd packages/runner
docker build -t ollama-turbo-runner .

# Run runner container
docker run -d \
  --name turbo-runner \
  -e REDIS_URL=redis://redis:6379 \
  -e GITHUB_APP_ID=your_app_id \
  -e GITHUB_APP_PRIVATE_KEY="$(cat private-key.pem)" \
  ollama-turbo-runner
```

## 🔐 Security

### Authentication & Authorization
- GitHub App private key rotation
- Installation token lifecycle management  
- User permission validation
- API rate limiting

### Runtime Security
- Container isolation for task execution
- Network restrictions and firewalls
- Resource limits and timeouts
- Code execution sandboxing

### Data Protection
- Minimal data retention policies
- Log sanitization and redaction
- Encrypted secrets storage
- GDPR compliance considerations

## 📊 Monitoring

### Health Checks

```bash
# Backend health
curl http://localhost:3001/health

# Webhook health  
curl http://localhost:3001/webhooks/health
```

### Metrics & Logs

- Job completion rates and timing
- Error rates and failure modes
- API response times
- Resource utilization

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and add tests
4. Commit your changes: `git commit -m 'Add amazing feature'`
5. Push to the branch: `git push origin feature/amazing-feature`
6. Open a Pull Request

### Development Guidelines

- Use TypeScript for all new code
- Follow existing code style and conventions
- Add tests for new features
- Update documentation as needed
- Ensure all checks pass before submitting

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Ollama](https://ollama.ai) for local AI inference
- [CodeLlama](https://github.com/facebookresearch/codellama) for code generation
- [Next.js](https://nextjs.org) for the web framework
- [Fastify](https://fastify.io) for the backend API
- GitHub for the comprehensive API and webhook system

## 📞 Support

- 🌐 [Live Demo](https://ollama-turbo-agent.liviogama.com)
- 📖 [Documentation](https://ollama-turbo-agent.liviogama.com/docs)
- 🐛 [Issue Tracker](https://github.com/your-org/ollama-turbo-agent/issues)
- 💬 [Discussions](https://github.com/your-org/ollama-turbo-agent/discussions)
- 📧 [Email Support](mailto:support@liviogama.com)

---

**Built with ❤️ by the Ollama Turbo Agent team**
