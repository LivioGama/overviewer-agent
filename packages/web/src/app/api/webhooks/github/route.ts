import { NextRequest, NextResponse } from 'next/server';
import { createClient } from 'redis';
import { randomUUID } from 'crypto';

const getRedisClient = async () => {
  const client = createClient({
    url: process.env.REDIS_URL || 'redis://redis:6379',
  });
  await client.connect();
  return client;
};

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
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

    if (event === 'issues' && payload.action === 'opened') {
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
