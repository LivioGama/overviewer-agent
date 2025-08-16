import { NextResponse } from 'next/server'

export async function GET() {
  // Mock data for now - replace with actual session management
  const user = {
    id: '1',
    login: 'demo-user',
    name: 'Demo User',
    email: 'demo@example.com',
    avatar_url: 'https://github.com/github.png'
  }

  return NextResponse.json(user)
}


