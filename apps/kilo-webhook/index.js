import express from 'express';
import { Webhooks, createNodeMiddleware } from '@octokit/webhooks';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';

const exec = promisify(execCallback);

const app = express();
const webhooks = new Webhooks({
  secret: process.env.GITHUB_WEBHOOK_SECRET || 'your-webhook-secret'
});

const REPO_PATH = process.env.REPO_PATH || '/app/repo';
const KILOCODE_TOKEN = process.env.KILOCODE_API_KEY;
const TIMEOUT = parseInt(process.env.KILO_TIMEOUT || '600', 10);

const runKiloCode = async (prompt, issueNumber) => {
  console.log(`[${new Date().toISOString()}] Running Kilo Code for issue #${issueNumber}`);
  
  return new Promise((resolve, reject) => {
    const kiloProcess = spawn('kilocode', [
      '--auto',
      '--yolo',
      '--timeout', TIMEOUT.toString(),
      prompt
    ], {
      cwd: REPO_PATH,
      env: {
        ...process.env,
        KILOCODE_TOKEN,
        KILOCODE_MODEL: 'x-ai/grok-code-fast-1',
        KILOCODE_BASE_URL: 'https://api.kilocode.ai'
      },
      stdio: 'pipe'
    });

    let output = '';
    let errorOutput = '';

    kiloProcess.stdout.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      process.stdout.write(chunk);
    });

    kiloProcess.stderr.on('data', (data) => {
      const chunk = data.toString();
      errorOutput += chunk;
      process.stderr.write(chunk);
    });

    kiloProcess.on('close', (code) => {
      console.log(`[${new Date().toISOString()}] Kilo Code exited with code ${code}`);
      if (code === 0 || code === 124) {
        resolve({ success: true, output, code });
      } else {
        reject(new Error(`Kilo Code failed with exit code ${code}: ${errorOutput}`));
      }
    });

    kiloProcess.on('error', (error) => {
      console.error(`[${new Date().toISOString()}] Failed to spawn Kilo Code:`, error);
      reject(error);
    });
  });
};

webhooks.on('issues.opened', async ({ payload }) => {
  const hasLabel = payload.issue.labels?.some(l => l.name === 'kilo-agent');
  if (!hasLabel) {
    console.log(`[${new Date().toISOString()}] Issue #${payload.issue.number} does not have kilo-agent label, skipping`);
    return;
  }

  const prompt = `Issue #${payload.issue.number}: ${payload.issue.title}

${payload.issue.body}`;

  try {
    await runKiloCode(prompt, payload.issue.number);
    console.log(`[${new Date().toISOString()}] Successfully processed issue #${payload.issue.number}`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error processing issue #${payload.issue.number}:`, error);
  }
});

webhooks.on('issues.labeled', async ({ payload }) => {
  if (payload.label?.name !== 'kilo-agent') {
    console.log(`[${new Date().toISOString()}] Label is not kilo-agent, skipping`);
    return;
  }

  const prompt = `Issue #${payload.issue.number}: ${payload.issue.title}

${payload.issue.body}`;

  try {
    await runKiloCode(prompt, payload.issue.number);
    console.log(`[${new Date().toISOString()}] Successfully processed issue #${payload.issue.number}`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error processing issue #${payload.issue.number}:`, error);
  }
});

app.use('/api/webhooks/github', createNodeMiddleware(webhooks));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] Kilo webhook service listening on port ${PORT}`);
});

