import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://backend:3001';

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const headers = new Headers();
    
    request.headers.forEach((value, key) => {
      if (key.toLowerCase().startsWith('x-github-') || 
          key.toLowerCase().startsWith('x-hub-') ||
          key.toLowerCase() === 'content-type') {
        headers.set(key, value);
      }
    });

    const response = await fetch(`${BACKEND_URL}/webhooks/github`, {
      method: 'POST',
      headers,
      body,
    });

    const responseBody = await response.text();
    
    return new NextResponse(responseBody, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
      },
    });
  } catch (error) {
    console.error('Webhook proxy error:', error);
    return NextResponse.json(
      { error: 'Webhook proxy failed' },
      { status: 500 }
    );
  }
}
