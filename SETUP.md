# Ollama Turbo Agent - Setup Guide

Complete setup instructions for deploying Ollama Turbo Agent with domain `https://overviewer-agent.liviogama.com`.

## 🔧 **1. GitHub App Configuration**

### Create GitHub App

1. **Navigate to GitHub App Settings**
   ```
   GitHub → Settings → Developer settings → GitHub Apps → New GitHub App
   ```

2. **Basic Information**
   - **GitHub App name**: `overviewer-agent`
   - **Description**: `AI-powered GitHub automation for code refactoring, testing, documentation, and more`
   - **Homepage URL**: `https://overviewer-agent.liviogama.com`
   - **User authorization callback URL**: `https://overviewer-agent.liviogama.com/auth/callback`
   - **Setup URL**: `https://overviewer-agent.liviogama.com/setup` (optional)

3. **Webhook Configuration**
   - **Webhook URL**: `https://overviewer-agent.liviogama.com/webhooks/github`
   - **Webhook secret**: Generate a secure random string
   ```bash
   openssl rand -hex 32
   ```

4. **Repository Permissions** (set to "Read & write"):
   - ✅ **Contents**: Read & write
   - ✅ **Pull requests**: Read & write
   - ✅ **Issues**: Read & write
   - ✅ **Checks**: Read & write
   - ✅ **Metadata**: Read

5. **Subscribe to Events**:
   - ✅ **Issue comments**
   - ✅ **Issues**
   - ✅ **Pull requests**
   - ✅ **Pull request reviews**
   - ✅ **Check suites**
   - ✅ **Push**

6. **Generate Private Key** and save the App ID

## 🔐 **2. Environment Configuration**

### Create Production Environment File

```bash
# Create .env file in project root
cat > .env << 'EOF'
# GitHub App Configuration
GITHUB_APP_ID=your_app_id_here
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=your_webhook_secret
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret

# Database Configuration
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/overviewer_agent

# Redis Configuration  
REDIS_URL=redis://redis:6379

# OpenAI Configuration
OPENAI_API_KEY=sk-your-openai-api-key-here

# Authentication
NEXTAUTH_URL=https://overviewer-agent.liviogama.com
NEXTAUTH_SECRET=your_production_secret_here

# Application Configuration
NODE_ENV=production
LOG_LEVEL=info
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=1 minute
EOF
```

### Generate Required Secrets

```bash
# Generate NextAuth secret
echo "NEXTAUTH_SECRET=$(openssl rand -base64 32)"

# Generate webhook secret
echo "GITHUB_WEBHOOK_SECRET=\"V6pjTkx(PcDG\\\"bq(2D?Z+akP27Q*O\\\\|vHskr}+(Z/\\\$N_hhqJE\\\$<:tXguM,rgKMC\""
```

## 🐳 **3. Docker Deployment**

### Deploy with Docker Compose

```bash
# Clone the repository
git clone <your-repo-url>
cd overviewer-agent

# Create environment file (use the .env created above)

# Deploy services
docker-compose up -d postgres redis
sleep 30  # Wait for services to start

# Deploy application services (backend, runner, web)
docker-compose up -d backend runner web

# Check deployment
docker-compose ps
docker-compose logs -f
```

### Verify Deployment

```bash
# Check service health
curl https://overviewer-agent.liviogama.com/health
curl https://overviewer-agent.liviogama.com/webhooks/health

# Test webhook endpoint
curl -X POST https://overviewer-agent.liviogama.com/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: ping" \
  -H "X-Hub-Signature-256: sha256=test" \
  -d '{"zen":"test"}'
```

## 📱 **5. Repository Installation**

### Install GitHub App

1. **Get Installation URL**
   ```
   https://github.com/apps/overviewer-agent/installations/new
   ```

2. **Install on Repositories**
   - Visit the installation URL
   - Select repositories to install on
   - Grant permissions

3. **Configure Repository**

   Add `.overviewer.yml` to repository root:
   ```yaml
   version: "1.0"
   enabled: true
   
   automation:
     triggers:
       - comment
       - pr_opened
     
     tasks:
       refactor:
         model: "codellama"
         max_tokens: 4000
         timeout: 300
       test:
         model: "codellama"
         max_tokens: 2000
         timeout: 180
     
     approval:
       required: true
       maintainers_only: true
     
     output:
       open_pr: true
       push_direct: false
       branch_prefix: "automation/"
   ```

## 🎯 **6. Usage Examples**

### Test Commands

Comment on issues or PRs:

```
/refactor improve code quality and performance
/test generate comprehensive unit tests  
/docs add missing documentation
/security audit for vulnerabilities
/fix resolve the authentication issue
/quality improve overall code standards
```

### Monitor Operations

- **Dashboard**: https://overviewer-agent.liviogama.com
- **Health Check**: https://overviewer-agent.liviogama.com/health
- **Webhook Status**: GitHub App → Advanced → Recent Deliveries

## 🔍 **Troubleshooting**

### Common Issues

**Webhook Not Receiving:**
```bash
# Check webhook configuration
curl -H "Authorization: Bearer YOUR_GITHUB_TOKEN" \
  https://api.github.com/app/hook/deliveries

# Check logs
docker-compose logs backend | grep webhook
```

**Ollama Model Issues:**
```bash
# Restart Ollama service
docker-compose restart ollama

# Re-pull models
docker-compose exec ollama ollama pull codellama

# Test model
docker-compose exec ollama ollama run codellama "console.log('test')"
```

**Database Connection:**
```bash
# Check database
docker-compose exec postgres psql -U postgres -d overviewer_agent -c "\dt"

# Run migrations
docker-compose exec backend bun run db:migrate
```

## 🚀 **Production Deployment**

For production deployment:

1. **Set up monitoring and logging**
2. **Configure backup for PostgreSQL**
3. **Set up CI/CD pipeline for updates**

### Port Configuration

The application runs on custom ports:
- **Web Dashboard**: http://localhost:1435
- **Backend API**: http://localhost:1434

🎉 **Your Overviewer Agent is now deployed and ready!**
