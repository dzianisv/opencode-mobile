import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="border-t mt-20" style={{ borderColor: 'var(--border)' }}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          {/* Links */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm" style={{ color: 'var(--muted)' }}>
            <a
              href="https://github.com/dzianisv/opencode-mobile"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:opacity-80 transition-colors"
            >
              GitHub
            </a>
            <a
              href="https://opencode.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:opacity-80 transition-colors"
            >
              Docs
            </a>
            <Link href="/privacy" className="hover:opacity-80 transition-colors">
              Privacy
            </Link>
            <Link href="/terms" className="hover:opacity-80 transition-colors">
              Terms
            </Link>
          </div>

          {/* Legal */}
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            &copy; 2026 VIBE TECHNOLOGIES, LLC
          </p>
        </div>
      </div>
    </footer>
  )
}
