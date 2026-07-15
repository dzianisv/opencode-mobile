'use client'

import { useState, FormEvent } from 'react'

export default function BetaPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setStatus('loading')

    try {
      const res = await fetch('/api/beta-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      if (res.ok) {
        setStatus('success')
        setMessage('You\'re in! We\'ll add you to the closed beta testers list.')
        setEmail('')
      } else {
        const data = await res.json()
        setStatus('error')
        setMessage(data.error || 'Something went wrong. Please try again.')
      }
    } catch {
      setStatus('error')
      setMessage('Network error. Please try again.')
    }
  }

  return (
    <>
      {/* Hero */}
      <section className="pt-24 pb-16 md:pt-36 md:pb-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <p className="text-xs font-mono uppercase tracking-wider mb-6" style={{ color: 'var(--muted)' }}>
            Closed beta &middot; Limited spots
          </p>

          <h1 className="text-4xl sm:text-5xl font-bold leading-[1.1] tracking-tight mb-6" style={{ color: 'var(--fg)' }}>
            Get early access
          </h1>

          <p className="text-lg leading-relaxed mb-10" style={{ color: 'var(--muted)' }}>
            Sign up to join the OpenCode Mobile closed beta on Google Play.
            We need <span style={{ color: 'var(--fg)' }}>20 testers</span> to unlock the public release.
          </p>

          {/* Signup Form */}
          {status === 'success' ? (
            <div className="card">
              <div className="flex items-center gap-3 mb-3">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--green)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <p className="font-semibold" style={{ color: 'var(--fg)' }}>You&apos;re on the list</p>
              </div>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>
                {message}
              </p>
              <p className="mt-3 text-sm" style={{ color: 'var(--muted)' }}>
                We&apos;ll send you a Google Play beta invite within 24 hours.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
              <input
                type="email"
                required
                placeholder="your@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1 px-4 py-3 rounded-lg text-sm outline-none transition-colors"
                style={{
                  backgroundColor: 'var(--card)',
                  border: '1px solid var(--border)',
                  color: 'var(--fg)',
                }}
                disabled={status === 'loading'}
              />
              <button
                type="submit"
                className="btn-primary whitespace-nowrap text-sm"
                disabled={status === 'loading'}
              >
                {status === 'loading' ? 'Signing up...' : 'Join beta'}
              </button>
            </form>
          )}

          {status === 'error' && (
            <p className="mt-3 text-sm" style={{ color: '#EF4444' }}>
              {message}
            </p>
          )}

          <p className="mt-4 text-xs" style={{ color: 'var(--muted)' }}>
            Use the Gmail linked to your Google Play account. No spam, no commitment.
          </p>
        </div>
      </section>

      {/* What you get */}
      <section className="py-20 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl font-bold mb-8" style={{ color: 'var(--fg)' }}>
            What beta testers get
          </h2>
          <div className="space-y-6">
            {[
              {
                title: 'Early access',
                desc: 'Install from Google Play before anyone else. Get updates as we ship them.',
              },
              {
                title: 'Direct feedback channel',
                desc: 'Report bugs and request features directly to the dev team.',
              },
              {
                title: 'Shape the product',
                desc: 'Your input decides what we build next. Beta feedback has outsized impact.',
              },
            ].map((item) => (
              <div key={item.title} className="flex gap-4">
                <span className="text-sm font-mono shrink-0 mt-0.5" style={{ color: 'var(--muted)' }}>[*]</span>
                <div>
                  <h3 className="font-semibold mb-1" style={{ color: 'var(--fg)' }}>{item.title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl font-bold mb-8" style={{ color: 'var(--fg)' }}>
            FAQ
          </h2>
          <div className="space-y-0">
            {[
              {
                q: 'What is OpenCode Mobile?',
                a: 'A free, open-source mobile client for the opencode AI coding agent. Connect to your own server and code from anywhere.',
              },
              {
                q: 'Why do you need my email?',
                a: 'Google Play requires us to add tester email addresses explicitly. We use the same Gmail you use on your Android device.',
              },
              {
                q: 'Is it free?',
                a: 'Yes. Free and open source, MIT license. No in-app purchases, no ads.',
              },
              {
                q: 'When does the public release happen?',
                a: 'Google requires 14 days of closed testing with at least 20 testers. The sooner we hit 20, the sooner we launch.',
              },
              {
                q: 'What Android version?',
                a: 'Android 8.0 (API 26) or newer.',
              },
            ].map((faq) => (
              <div key={faq.q} className="py-5 border-b" style={{ borderColor: 'var(--border)' }}>
                <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--fg)' }}>
                  {faq.q}
                </h3>
                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                  {faq.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
