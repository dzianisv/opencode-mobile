'use client'
import Link from 'next/link'
import { useState } from 'react'

export default function Nav() {
  const [open, setOpen] = useState(false)

  return (
    <nav
      className="sticky top-0 z-50 border-b"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.9)', borderColor: 'var(--border)', backdropFilter: 'blur(12px)' }}
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg tracking-tight" style={{ color: 'var(--fg)' }}>
          opencode<span className="font-normal" style={{ color: 'var(--muted)' }}>/mobile</span>
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-6">
          {[
            { href: 'https://opencode.ai', label: 'Docs', external: true },
            { href: 'https://github.com/dzianisv/opencode-mobile', label: 'GitHub', external: true },
            { href: '/beta', label: 'Beta' },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm transition-colors hover:opacity-80"
              style={{ color: 'var(--muted)' }}
              {...('external' in link ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              {link.label}
            </Link>
          ))}
          <a
            href="https://play.google.com/store/apps/details?id=cc.agentlabs.opencode"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium px-4 py-2 rounded-lg transition-all"
            style={{ backgroundColor: 'var(--fg)', color: 'var(--bg)' }}
          >
            Download
          </a>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 rounded-lg"
          style={{ color: 'var(--muted)' }}
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
        >
          {open ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t px-4 py-4 space-y-3" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg)' }}>
          {[
            { href: 'https://opencode.ai', label: 'Docs', external: true },
            { href: 'https://github.com/dzianisv/opencode-mobile', label: 'GitHub', external: true },
            { href: '/beta', label: 'Join Beta' },
            { href: 'https://play.google.com/store/apps/details?id=cc.agentlabs.opencode', label: 'Download', external: true },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="block text-sm py-2 transition-colors hover:opacity-80"
              style={{ color: 'var(--muted)' }}
              onClick={() => setOpen(false)}
              {...('external' in link ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  )
}
