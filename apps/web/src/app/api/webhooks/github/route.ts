import { randomUUID, createHmac, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from 'redis';
import { runKiloCode } from '@/lib/kilo-runner';

const getRedisClient = async () => {
  const client = createClient({
    url: process.env.REDIS_URL || 'redis://redis:6379',
  });
  await client.connect();
  return client;
};

const verifySignature = (payload: string, signature: string | null): boolean => {
  if (!signature) return false;
  
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('GITHUB_WEBHOOK_SECRET not set - skipping signature verification');
    return true;
  }

  const hmac = createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
  } catch {
    return false;
  }
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-hub-signature-256');
    
    if (!verifySignature(body, signature)) {
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    const payload = JSON.parse(body);
    const event = request.headers.get('x-github-event');
    
    if (!event || !payload.repository) {
      return NextResponse.json(
        { error: 'Invalid webhook payload' },
        { status: 400 }
      );
    }

    let shouldProcess = false;
    let issueNumber: number | undefined;
    let issueTitle = '';
    let issueBody = '';

    if (event === 'issues' && (payload.action === 'opened' || payload.action === 'labeled')) {
      shouldProcess = true;
      issueNumber = payload.issue.number;
      issueTitle = payload.issue.title;
      issueBody = payload.issue.body || '';
    } else if (event === 'issue_comment' && payload.action === 'created') {
      shouldProcess = payload.comment.body.includes('@overviewer');
      issueNumber = payload.issue.number;
      issueTitle = payload.issue.title;
      issueBody = payload.comment.body;
    }

    if (!shouldProcess) {
      return NextResponse.json({ message: 'Event ignored' });
    }

    const llmProvider = process.env.LLM_PROVIDER?.toLowerCase() || 'claude';
    const useKiloCode = llmProvider !== 'claude';

    if (useKiloCode && issueNumber) {
      const prompt = `Issue #${issueNumber}: ${issueTitle}

${issueBody}`;
      
      console.log(`Using Kilo Code (LLM_PROVIDER=${llmProvider}) for issue #${issueNumber}`);
      
      try {
        runKiloCode(prompt, issueNumber).catch(error => {
          console.error(`Kilo Code error for issue #${issueNumber}:`, error);
        });
        
        return NextResponse.json({ 
          message: 'Kilo Code execution started',
          issueNumber,
          provider: llmProvider
        });
      } catch (error) {
        console.error('Failed to trigger Kilo Code:', error);
      }
    }
    
    console.log(`Using Cloud Runner (LLM_PROVIDER=${llmProvider}) for issue #${issueNumber}`);

    const job = {
      id: randomUUID(),
      installationId: payload.installation?.id || 0,
      repoOwner: payload.repository.owner.login,
      repoName: payload.repository.name,
      triggerType: event === 'issues' ? 'issue_opened' : 'comment',
      triggerPayload: payload,
      taskType: 'bug_fix',
      taskParams: {
        issueNumber,
        issueTitle,
        issueBody,
      },
      status: 'queued',
      createdAt: new Date().toISOString(),
    };

    const redis = await getRedisClient();
    await redis.xAdd('job-queue', '*', {
      jobData: JSON.stringify(job),
    });
    await redis.quit();

    return NextResponse.json({ 
      message: 'Job created',
      jobId: job.id 
    });
  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}
