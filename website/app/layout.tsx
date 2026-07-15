import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import './globals.css'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  metadataBase: new URL('https://opencode.agentlabs.cc'),
  title: {
    default: 'OpenCode Mobile — Your AI Coding Agent, On the Go',
    template: '%s | OpenCode Mobile',
  },
  description:
    'OpenCode Mobile is a free, open-source Android & iOS client for the opencode AI coding agent. Connect to your own server, stream diffs, and code from anywhere.',
  keywords: [
    'opencode mobile',
    'AI coding agent',
    'mobile coding',
    'self-hosted AI',
    'opencode client',
    'open source',
    'Android AI coding',
  ],
  authors: [{ name: 'Vibe Technologies' }],
  creator: 'Vibe Technologies',
  publisher: 'Vibe Technologies',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://opencode.agentlabs.cc',
    siteName: 'OpenCode Mobile',
    title: 'OpenCode Mobile — Your AI Coding Agent, On the Go',
    description:
      'Free, open-source mobile client for opencode. Multi-connection, biometric unlock, streaming diffs — code from anywhere.',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'OpenCode Mobile',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'OpenCode Mobile — Your AI Coding Agent, On the Go',
    description:
      'Free, open-source mobile client for opencode. Multi-connection, biometric unlock, streaming diffs.',
    images: ['/og.png'],
    creator: '@vibebrowserapp',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: 'https://opencode.agentlabs.cc',
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/favicon.svg',
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#000000',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen flex flex-col" style={{ fontFamily: 'var(--font-geist-sans), system-ui, sans-serif' }}>
        <Nav />
        <main className="flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  )
}
