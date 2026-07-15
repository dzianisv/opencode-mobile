import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Join the Beta',
  description:
    'Sign up as a beta tester for OpenCode Mobile on Google Play. Help us test, find bugs, and shape the product before public launch.',
  alternates: { canonical: 'https://opencode.agentlabs.cc/beta' },
  openGraph: {
    title: 'Join the OpenCode Mobile Beta',
    description:
      'Get early access to OpenCode Mobile on Google Play. We need 20 testers to unlock the public release.',
    url: 'https://opencode.agentlabs.cc/beta',
  },
}

export default function BetaLayout({ children }: { children: React.ReactNode }) {
  return children
}
