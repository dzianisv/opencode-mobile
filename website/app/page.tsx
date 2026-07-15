import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'OpenCode Mobile — The open source AI coding agent, on the go',
  description:
    'Free, open-source Android & iOS client for the opencode AI coding agent. Connect to your own server, stream diffs, and code from anywhere.',
  alternates: { canonical: 'https://opencode.agentlabs.cc' },
}

const features = [
  {
    bullet: '[*]',
    title: 'Multi-server',
    description: 'Switch between local, cloud, and team servers. Credentials stay on device.',
  },
  {
    bullet: '[*]',
    title: 'Streaming diffs',
    description: 'Watch AI changes in real time with syntax-highlighted diffs.',
  },
  {
    bullet: '[*]',
    title: 'Biometric unlock',
    description: 'Fingerprint or Face ID. No password typing.',
  },
  {
    bullet: '[*]',
    title: 'Any model',
    description: 'Claude, GPT, Gemini, local models — whatever your server runs.',
  },
  {
    bullet: '[*]',
    title: 'Session management',
    description: 'Create, resume, and switch between coding sessions.',
  },
  {
    bullet: '[*]',
    title: 'MIT licensed',
    description: 'Fully open source. Audit, fork, self-build. Diagnostics are opt-in.',
  },
]

const screenshots = [
  { file: '04', alt: 'Add an OpenCode server connection' },
  { file: '03', alt: 'Start a streaming coding task' },
  { file: '02', alt: 'Watch live tool activity' },
  { file: '05', alt: 'Browse coding sessions' },
  { file: '06', alt: 'Review an agent writing code' },
  { file: '07', alt: 'See a completed coding task' },
  { file: '01', alt: 'Choose a model and task settings' },
]

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="pt-24 pb-20 md:pt-36 md:pb-28">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold leading-[1.1] tracking-tight mb-6" style={{ color: 'var(--fg)' }}>
            The open source AI coding agent,<br />
            <span style={{ color: 'var(--muted)' }}>on the go</span>
          </h1>

          <p className="text-lg sm:text-xl leading-relaxed mb-10 max-w-2xl" style={{ color: 'var(--muted)' }}>
            Free mobile client for{' '}
            <a href="https://opencode.ai" target="_blank" rel="noopener noreferrer"
              className="underline underline-offset-3 decoration-1" style={{ color: 'var(--fg)' }}>
              opencode
            </a>
            . Connect to your own server, stream diffs in real time, and review AI changes from anywhere.
          </p>

          {/* Install / Download */}
          <div className="flex flex-wrap gap-3 mb-4">
            <a
              href="https://play.google.com/store/apps/details?id=cc.agentlabs.opencode"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary text-sm"
            >
              Download for Android
            </a>
            <a
              href="https://github.com/dzianisv/opencode-mobile/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary text-sm"
            >
              GitHub Releases
            </a>
            <a
              href="https://dzianisv.github.io/opencode-mobile/fdroid/repo"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary text-sm"
            >
              F-Droid
            </a>
          </div>

          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Android 8.0+ &nbsp;&middot;&nbsp; iOS coming soon
          </p>
        </div>
      </section>

      {/* Approved Google Play screenshots, ordered from connection to completed work. */}
      <section className="pb-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl font-bold mb-6 text-center" style={{ color: 'var(--fg)' }}>
            From connection to completed code
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
            {screenshots.map((screenshot) => (
              <div key={screenshot.file} className="relative rounded-2xl overflow-hidden"
                style={{ border: '1px solid var(--border)' }}>
                <img
                  src={`/screenshots/v0.4.7/${screenshot.file}.png`}
                  alt={screenshot.alt}
                  width={1280}
                  height={2560}
                  className="w-full h-auto object-contain"
                  style={{ display: 'block' }}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Showcase video */}
      <section className="pb-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl font-bold mb-6 text-center" style={{ color: 'var(--fg)' }}>
            See it in action
          </h2>
          <div className="relative rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            <video
              src="/cua-showcase.mp4"
              controls
              muted
              playsInline
              poster="/screenshots/v0.4.7/03.png"
              style={{ width: '100%', display: 'block' }}
            >
              Your browser does not support the video tag.
            </video>
          </div>
        </div>
      </section>

      {/* Features — opencode.ai style bullet list */}
      <section className="py-20 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-bold mb-12" style={{ color: 'var(--fg)' }}>
            What you get
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-8">
            {features.map((f) => (
              <div key={f.title} className="flex gap-4">
                <span className="text-sm font-mono shrink-0 mt-0.5" style={{ color: 'var(--muted)' }}>{f.bullet}</span>
                <div>
                  <h3 className="font-semibold mb-1" style={{ color: 'var(--fg)' }}>{f.title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>{f.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Open Source */}
      <section className="py-20 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-3" style={{ color: 'var(--fg)' }}>
                100% open source
              </h2>
              <p className="max-w-lg text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
                MIT-licensed. Audit the code, self-build, contribute features, or fork it.
                No telemetry without consent. No hidden servers. Your data stays yours.
              </p>
            </div>
            <a
              href="https://github.com/dzianisv/opencode-mobile"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary text-sm shrink-0"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4" style={{ color: 'var(--fg)' }}>
            Join the beta
          </h2>
          <p className="text-sm mb-8 max-w-lg mx-auto" style={{ color: 'var(--muted)' }}>
            We need 20 testers to unlock the public Google Play release.
            Sign up and get early access today.
          </p>
          <Link href="/beta" className="btn-primary text-sm">
            Join the closed beta
          </Link>
        </div>
      </section>
    </>
  )
}
