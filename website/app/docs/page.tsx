import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Documentation',
  description:
    'OpenCode Mobile documentation. Quick start guide, API reference, and self-hosting instructions.',
  alternates: { canonical: 'https://opencode.agentlabs.cc/docs' },
  openGraph: {
    title: 'Documentation | OpenCode Mobile',
    description: 'OpenCode Mobile docs — coming soon. See README on GitHub for now.',
    url: 'https://opencode.agentlabs.cc/docs',
  },
}

const quickLinks = [
  {
    title: 'README',
    description: 'Installation, building from source, and quick start guide.',
    href: 'https://github.com/dzianisv/opencode-mobile#readme',
    external: true,
  },
  {
    title: 'Releases',
    description: 'Download APKs and view changelog for every release.',
    href: 'https://github.com/dzianisv/opencode-mobile/releases',
    external: true,
  },
  {
    title: 'Bug Reports',
    description: 'Found a bug? Open an issue on GitHub.',
    href: 'https://github.com/dzianisv/opencode-mobile/issues/new',
    external: true,
  },
  {
    title: 'Contributing',
    description: 'Want to contribute? See CONTRIBUTING.md in the repo.',
    href: 'https://github.com/dzianisv/opencode-mobile/blob/main/CONTRIBUTING.md',
    external: true,
  },
]

export default function DocsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
      <div className="text-center mb-16">
        <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6"
          style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: 'var(--accent)' }}>
          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold mb-4" style={{ color: 'var(--fg)' }}>
          Documentation
        </h1>
        <p className="text-lg max-w-xl mx-auto" style={{ color: 'var(--muted)' }}>
          A full documentation site is in progress. For now, everything you need is in the
          GitHub repository.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-16">
        {quickLinks.map((link) => (
          <a
            key={link.href}
            href={link.href}
            target={link.external ? '_blank' : undefined}
            rel={link.external ? 'noopener noreferrer' : undefined}
            className="card hover:border-blue-500/60 transition-colors"
            style={{ textDecoration: 'none' }}
          >
            <h3 className="font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--fg)' }}>
              {link.title}
              {link.external && (
                <svg className="w-3.5 h-3.5 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              )}
            </h3>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>{link.description}</p>
          </a>
        ))}
      </div>

      <div className="rounded-xl p-6 text-center" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)' }}>
        <h2 className="font-semibold mb-2" style={{ color: 'var(--fg)' }}>
          Full docs site coming soon
        </h2>
        <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
          We&apos;re building a proper docs site with guides for connecting, self-hosting, contributing,
          and the opencode Cloud. Want to help write docs?
        </p>
        <a
          href="https://github.com/dzianisv/opencode-mobile/discussions"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary text-sm"
        >
          Join the Discussion
        </a>
      </div>
    </div>
  )
}
