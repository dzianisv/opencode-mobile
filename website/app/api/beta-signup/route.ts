import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const normalized = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }

    // Log for Vercel Function Logs (always available)
    console.log(JSON.stringify({
      event: 'beta_signup',
      email: normalized,
      timestamp: new Date().toISOString(),
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
    }))

    // If a webhook URL is configured, forward the signup there
    const webhookUrl = process.env.BETA_SIGNUP_WEBHOOK_URL
    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: normalized, source: 'opencode-mobile-beta' }),
        })
      } catch (e) {
        console.error('[beta-signup] Webhook failed:', e)
      }
    }

    return NextResponse.json({ message: 'Signed up successfully' })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
