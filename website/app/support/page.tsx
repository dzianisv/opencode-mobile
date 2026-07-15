import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Support',
  description:
    'Get help with OpenCode Mobile. Contact us, browse GitHub Issues, and read the FAQ.',
  alternates: { canonical: 'https://opencode.agentlabs.cc/support' },
  openGraph: {
    title: 'Support | OpenCode Mobile',
    description: 'Contact, FAQ, and GitHub Issues for OpenCode Mobile.',
    url: 'https://opencode.agentlabs.cc/support',
  },
}

const faqs = [
  {
    q: 'How do I connect the app to my opencode server?',
    a: `Open the app, tap the "+" button on the connections screen, and enter your server URL (e.g., https://your-server.example.com or http://192.168.1.x:3000 for local). The app connects over HTTP/HTTPS to the standard opencode REST/WebSocket API. For remote access, we recommend running your server behind Tailscale or a reverse proxy with TLS.`,
  },
  {
    q: 'Is my code sent to Vibe Technologies?',
    a: `No. All AI traffic — your prompts, code, diffs, and AI responses — travels directly between the app and your own opencode server. VIBE TECHNOLOGIES, LLC never sees this data. The only optional data we receive is anonymous crash diagnostics via Sentry, and only if you opt in at first launch.`,
  },
  {
    q: 'Can I self-host the backend?',
    a: `Yes — that's the primary use case. OpenCode Mobile is a client for the open-source opencode server (github.com/sst/opencode). You run the server wherever you like: your laptop, a VPS, a home server, or a cloud VM. The app simply connects to whatever URL you configure.`,
  },
  {
    q: 'Is the app really free? What\'s the catch?',
    a: `The app is free and MIT-licensed with no catch. We pay for development out of Vibe Technologies revenue. In the future we plan to offer "opencode Cloud" — a managed, always-on backend for teams who don't want to run their own server. That will be a paid product. The mobile app itself will remain free and open source.`,
  },
  {
    q: 'The app crashes or I see an error. What should I do?',
    a: `Please open a GitHub Issue at github.com/dzianisv/opencode-mobile/issues with: your device model, Android/iOS version, app version (Settings → About), and a description of what happened. If you opted in to crash reporting, we may already have the stack trace — your issue report helps us match it to the right bug.`,
  },
]

export default function SupportPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
      <h1 className="text-3xl font-bold mb-4" style={{ color: 'var(--fg)' }}>
        Support
      </h1>
      <p className="text-lg mb-12" style={{ color: 'var(--muted)' }}>
        We&apos;re a small team, but we try to respond within a few business days.
      </p>

      {/* Contact cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-16">
        <a
          href="mailto:support@vibebrowser.app"
          className="card flex items-start gap-4 hover:border-blue-500/60 transition-colors"
          style={{ textDecoration: 'none' }}
        >
          <div className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: 'var(--accent)' }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <p className="font-semibold mb-1" style={{ color: 'var(--fg)' }}>Email Support</p>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>support@vibebrowser.app</p>
          </div>
        </a>

        <a
          href="https://github.com/dzianisv/opencode-mobile/issues"
          target="_blank"
          rel="noopener noreferrer"
          className="card flex items-start gap-4 hover:border-blue-500/60 transition-colors"
          style={{ textDecoration: 'none' }}
        >
          <div className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: 'var(--accent)' }}>
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" clipRule="evenodd"
                d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
          </div>
          <div>
            <p className="font-semibold mb-1" style={{ color: 'var(--fg)' }}>GitHub Issues</p>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>Bug reports & feature requests</p>
          </div>
        </a>
      </div>

      {/* FAQ */}
      <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--fg)', borderLeft: '4px solid var(--accent)', paddingLeft: 12 }}>
        Frequently Asked Questions
      </h2>

      <div className="space-y-5">
        {faqs.map((faq, i) => (
          <div key={i} className="card">
            <h3 className="font-semibold mb-3" style={{ color: 'var(--fg)' }}>
              {faq.q}
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: '#CBD5E1' }}>
              {faq.a}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-12 p-5 rounded-xl text-sm" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)', color: 'var(--muted)' }}>
        Still stuck? Open a{' '}
        <a href="https://github.com/dzianisv/opencode-mobile/issues/new" target="_blank"
          rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
          GitHub Issue
        </a>{' '}
        or email{' '}
        <a href="mailto:support@vibebrowser.app" style={{ color: 'var(--accent)' }}>
          support@vibebrowser.app
        </a>.
        Include your device, OS version, and app version for fastest resolution.
      </div>
    </div>
  )
}
