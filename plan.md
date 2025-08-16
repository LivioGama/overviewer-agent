# Ollama Turbo Agent - Implementation Plan

## Project Overview

A GitHub App that runs automation/agent tasks against repositories in the cloud, similar to Roomote. The system will execute AI-powered code changes, automated refactoring, testing, and other repository tasks triggered by GitHub events.

## Architecture Components

### Core System
- **GitHub App**: Installs on orgs/repos, receives webhooks, uses installation tokens
- **Cloud Backend**: Receives webhooks, authenticates, queues work, executes tasks
- **Task Runners**: Stateless Docker containers that execute jobs
- **Control Plane**: Stores configs, policies, audit logs, provides web UI

### Tech Stack Selection
- **Backend**: TypeScript/Node.js with Fastify
- **Queue**: Redis Streams
- **Runners**: Docker on AWS ECS/Fargate
- **Database**: PostgreSQL for jobs and audit trails
- **Cache**: Redis for rate limiting and deduplication
- **Secrets**: AWS Secrets Manager
- **Web UI**: Next.js with server actions
- **Package Manager**: Bun (as per user preferences)

## Implementation Phases

### Phase 1: GitHub App Foundation
**Timeline: Week 1-2**

#### 1.1 GitHub App Setup
- [ ] Create GitHub App in GitHub Developer Settings
- [ ] Configure webhook URL (will be cloud endpoint)
- [ ] Set initial permissions:
  - Contents: read/write
  - Pull requests: read/write
  - Issues: read/write
  - Checks: read/write
  - Metadata: read
- [ ] Subscribe to events:
  - issue_comment
  - issues
  - pull_request
  - pull_request_review
  - check_suite
  - check_run
  - push
- [ ] Generate and securely store private key
- [ ] Create App installation page

#### 1.2 Project Structure Setup
```
ollama-turbo-agent/
├── packages/
│   ├── backend/           # Webhook receiver & API
│   ├── runner/           # Task execution engine
│   ├── web/              # Control plane UI
│   └── shared/           # Common types & utilities
├── infrastructure/       # AWS CDK/Terraform
├── docker/              # Container definitions
└── docs/                # Documentation
```

#### 1.3 Backend Core
- [ ] Initialize TypeScript project with Fastify
- [ ] Set up GitHub webhook signature verification
- [ ] Implement JWT creation for GitHub App authentication
- [ ] Create installation token minting system
- [ ] Basic webhook event parsing and routing

### Phase 2: Task Orchestration & Queue System
**Timeline: Week 3-4**

#### 2.1 Database Schema
```sql
-- Jobs table
CREATE TABLE jobs (
  id UUID PRIMARY KEY,
  installation_id BIGINT NOT NULL,
  repo_owner VARCHAR(255) NOT NULL,
  repo_name VARCHAR(255) NOT NULL,
  commit_sha VARCHAR(40),
  ref_name VARCHAR(255),
  trigger_type VARCHAR(50) NOT NULL,
  trigger_payload JSONB,
  task_type VARCHAR(100) NOT NULL,
  task_params JSONB,
  status VARCHAR(50) DEFAULT 'queued',
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  result JSONB,
  logs TEXT
);

-- Installations table
CREATE TABLE installations (
  id BIGINT PRIMARY KEY,
  account_id BIGINT NOT NULL,
  account_login VARCHAR(255) NOT NULL,
  account_type VARCHAR(50) NOT NULL,
  permissions JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Policies table
CREATE TABLE policies (
  id UUID PRIMARY KEY,
  installation_id BIGINT NOT NULL,
  repo_pattern VARCHAR(255),
  allowed_triggers TEXT[],
  allowed_users TEXT[],
  require_approval BOOLEAN DEFAULT true,
  max_runtime_seconds INTEGER DEFAULT 300,
  config JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### 2.2 Queue Implementation
- [ ] Set up Redis Streams for job queue
- [ ] Implement job enqueue/dequeue logic
- [ ] Add job retry mechanism with exponential backoff
- [ ] Create job status tracking system
- [ ] Implement dead letter queue for failed jobs

#### 2.3 Policy Engine
- [ ] Create policy validation system
- [ ] Implement permission checking (who can trigger what)
- [ ] Add rate limiting per installation/user
- [ ] Create approval workflow system

### Phase 3: Task Runner System
**Timeline: Week 5-6**

#### 3.1 Docker Runner Base
- [ ] Create base Docker image with:
  - Node.js runtime
  - Git CLI
  - GitHub CLI
  - Ollama client
  - Common development tools
- [ ] Implement secure repository cloning with installation tokens
- [ ] Create isolated workspace management
- [ ] Add resource limits and timeouts

#### 3.2 Task Execution Engine
- [ ] Create task definition system
- [ ] Implement common task types:
  - AI-powered code refactoring
  - Automated testing
  - Documentation generation
  - Dependency updates
  - Code quality fixes
- [ ] Add result collection and formatting
- [ ] Implement safe branch creation and PR opening

#### 3.3 Ollama Integration
- [ ] Set up Ollama server infrastructure
- [ ] Create AI agent task runners for:
  - Code analysis and suggestions
  - Automated bug fixes
  - Code review comments
  - Documentation writing
- [ ] Implement context-aware prompting with repository knowledge

### Phase 4: GitHub Integration & Reporting
**Timeline: Week 7-8**

#### 4.1 GitHub Checks API
- [ ] Create Check Run for each job
- [ ] Stream real-time logs to Check Run
- [ ] Add summary with links to full logs
- [ ] Implement status updates (queued, in_progress, completed, failed)

#### 4.2 PR and Comment Management
- [ ] Automated PR creation for task results
- [ ] Result summary comments
- [ ] Interactive command parsing (/run, /approve, /cancel)
- [ ] Label management (automation:pending, automation:applied)

#### 4.3 Repository Configuration
- [ ] Implement `.ollama-turbo.yml` config file support
```yaml
# Example config
automation:
  triggers:
    - comment
    - pr_opened
    - schedule
  tasks:
    refactor:
      command: "ollama-refactor"
      model: "codellama"
      max_tokens: 4000
      timeout: 300
    test:
      command: "npm test"
      auto_fix: true
  approval:
    required: true
    maintainers_only: true
  output:
    open_pr: true
    push_direct: false
```

### Phase 5: Web UI & Control Plane
**Timeline: Week 9-10**

#### 5.1 Next.js Dashboard
- [ ] Authentication with GitHub OAuth
- [ ] Job listing and filtering
- [ ] Job detail view with logs and artifacts
- [ ] Real-time job status updates
- [ ] Installation management

#### 5.2 Admin Features
- [ ] Installation settings
- [ ] Policy management UI
- [ ] Audit log viewer
- [ ] Rate limit configuration
- [ ] Token rotation tools

### Phase 6: Advanced Features
**Timeline: Week 11-12**

#### 6.1 Scheduling System
- [ ] Cron-based task scheduling
- [ ] Recurring maintenance tasks
- [ ] Dependency update automation
- [ ] Code health monitoring

#### 6.2 Multi-repo Support
- [ ] Bulk operations across repositories
- [ ] Monorepo path filtering
- [ ] Cross-repo dependency tracking
- [ ] Organization-wide policies

#### 6.3 Enhanced Security
- [ ] Code scanning before execution
- [ ] Sandbox environment isolation
- [ ] Audit trail for all operations
- [ ] Secrets management integration

### Phase 7: Deployment & Production
**Timeline: Week 13-14**

#### 7.1 Infrastructure as Code
- [ ] AWS CDK or Terraform templates
- [ ] ECS/Fargate service definitions
- [ ] RDS PostgreSQL setup
- [ ] ElastiCache Redis configuration
- [ ] ALB and security groups

#### 7.2 CI/CD Pipeline
- [ ] GitHub Actions workflows
- [ ] Automated testing
- [ ] Container image building
- [ ] Deployment automation
- [ ] Rollback procedures

#### 7.3 Monitoring & Observability
- [ ] CloudWatch logs and metrics
- [ ] Application performance monitoring
- [ ] Error tracking and alerting
- [ ] Cost monitoring and optimization

## Security Considerations

### Authentication & Authorization
- [ ] GitHub App private key rotation
- [ ] Installation token lifecycle management
- [ ] User permission validation
- [ ] API rate limiting

### Runtime Security
- [ ] Container isolation
- [ ] Network restrictions
- [ ] Resource limits
- [ ] Code execution sandboxing

### Data Protection
- [ ] Minimal data retention
- [ ] Log sanitization
- [ ] Encrypted secrets storage
- [ ] GDPR compliance considerations

## Example Workflows

### AI-Powered Refactoring
1. User comments: `/ollama refactor auth module for better security`
2. Webhook triggers job creation
3. Runner clones repository
4. Ollama analyzes code and generates improvements
5. Changes committed to new branch
6. PR opened with detailed explanation
7. Check run shows analysis and changes
8. Maintainer reviews and approves
9. Changes merged automatically

### Automated Testing
1. PR opened with new feature
2. Automated test generation triggered
3. Ollama analyzes code and creates comprehensive tests
4. Tests run and results reported
5. Coverage analysis provided
6. Suggestions for additional test cases

### Documentation Updates
1. Code changes detected in PR
2. Documentation sync job triggered
3. Ollama updates relevant documentation
4. Consistency checks performed
5. Documentation PR opened
6. Link back to original changes

## Risk Assessment & Mitigation

### High Priority Risks
- **Security vulnerabilities in code execution**
  - Mitigation: Strict sandboxing, code review, security scanning
- **GitHub API rate limiting**
  - Mitigation: Intelligent queuing, request optimization, multiple tokens
- **Cost overruns from AI model usage**
  - Mitigation: Usage monitoring, budget alerts, request optimization

### Medium Priority Risks
- **Database performance under load**
  - Mitigation: Connection pooling, read replicas, query optimization
- **Container resource exhaustion**
  - Mitigation: Resource limits, auto-scaling, monitoring

## Success Metrics

### Technical Metrics
- Job completion rate >95%
- Average job execution time <5 minutes
- API response time <200ms
- System uptime >99.9%

### User Experience Metrics
- User adoption rate
- Task success rate
- User satisfaction scores
- Feature usage analytics

## Next Steps

1. **Immediate Actions**:
   - Set up development environment
   - Create GitHub App
   - Initialize project structure

2. **Week 1 Goals**:
   - Basic webhook handling
   - GitHub authentication working
   - Database schema implemented

3. **MVP Definition**:
   - Simple code refactoring tasks
   - Basic PR creation
   - Approval workflow
   - Web dashboard

This plan provides a comprehensive roadmap for building the Ollama Turbo Agent while maintaining security, scalability, and user experience as primary concerns.


