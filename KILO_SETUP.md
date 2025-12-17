# Kilo Agent Setup on VPS

## Configuration

Create a `.env` file in the root with:

```bash
GITHUB_WEBHOOK_SECRET=your-webhook-secret-here
KILOCODE_API_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbnYiOiJwcm9kdWN0aW9uIiwia2lsb1VzZXJJZCI6IjFlMjZiNzE2LTIwZTktNDZjZS1hYjUxLTU5ODZlMzU0YjE0NCIsImFwaVRva2VuUGVwcGVyIjpudWxsLCJ2ZXJzaW9uIjozLCJpYXQiOjE3NjU5MzM5NTUsImV4cCI6MTkyMzcyMTk1NX0.PDg03ClvjGoYqQoEr9tAwukFMe46T2iE1Ekq9Bj0EMY
```

## Deploy on VPS

```bash
# On your VPS
cd /path/to/overviewer-agent
docker compose -f docker-compose.kilo.yml up -d

# Check logs
docker logs -f kilo-webhook
```

## Configure GitHub Webhook

1. Go to `https://github.com/LivioGama/overviewer-agent/settings/hooks`
2. Click "Add webhook"
3. Payload URL: `http://YOUR_VPS_IP:3001/api/webhooks/github`
4. Content type: `application/json`
5. Secret: The value from `GITHUB_WEBHOOK_SECRET`
6. Events: Select "Issues"
7. Click "Add webhook"

## Usage

Add the `kilo-agent` label to any issue, and Kilo Code will automatically work on it!

