import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'OpenCode Mobile terms of service. MIT-licensed open-source software provided as-is, no warranty. Governing law: Washington State.',
  alternates: { canonical: 'https://opencode.agentlabs.cc/terms' },
  openGraph: {
    title: 'Terms of Service | OpenCode Mobile',
    description: 'OpenCode Mobile terms of service — MIT-licensed, provided as-is.',
    url: 'https://opencode.agentlabs.cc/terms',
  },
}

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
      <header className="border-b pb-6 mb-10" style={{ borderColor: '#3B82F6' }}>
        <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--fg)' }}>
          OpenCode Mobile — Terms of Service
        </h1>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          Effective date: 2026-05-24&nbsp;&nbsp;|&nbsp;&nbsp;
          Operator: VIBE TECHNOLOGIES, LLC&nbsp;&nbsp;|&nbsp;&nbsp;
          App: OpenCode Mobile (<code className="text-xs px-1 rounded" style={{ background: 'var(--card)' }}>ai.opencode.mobile</code>)
        </p>
      </header>

      <div className="prose-site">
        <div className="rounded-xl p-5 mb-8" style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)' }}>
          <p className="!mb-0">
            <strong style={{ color: '#93C5FD' }}>Summary:</strong> OpenCode Mobile is free,
            open-source (MIT) software. It is provided as-is. You run it against your own opencode
            server. We owe you no support on the free tier, though we genuinely try to help.
            Governing law is Washington State, USA.
          </p>
        </div>

        <h2>1. Acceptance of Terms</h2>
        <p>
          By downloading, installing, or using OpenCode Mobile (the &ldquo;App&rdquo;), you agree to
          these Terms of Service (&ldquo;Terms&rdquo;). If you do not agree, do not use the App.
        </p>
        <p>
          These Terms apply to all versions of the App, including builds distributed via Google Play,
          F-Droid, Apple App Store, or directly from the GitHub repository.
        </p>

        <h2>2. Open-Source License</h2>
        <p>
          The App is released under the{' '}
          <a href="https://opensource.org/licenses/MIT" target="_blank" rel="noopener noreferrer">MIT License</a>.
          Source code is available at{' '}
          <a href="https://github.com/dzianisv/opencode-mobile" target="_blank" rel="noopener noreferrer">
            github.com/dzianisv/opencode-mobile
          </a>.
        </p>
        <p>
          The MIT License grants you broad rights to use, copy, modify, merge, publish, distribute,
          sublicense, and/or sell copies of the software, subject to the license&apos;s attribution
          requirement. These Terms supplement, but do not replace, the MIT License.
        </p>

        <h2>3. Description of Service</h2>
        <p>
          OpenCode Mobile is a mobile client application that connects to a self-hosted or
          third-party-hosted opencode server. The App does not itself provide AI services; all AI
          computation occurs on the server you configure. VIBE TECHNOLOGIES, LLC is not a party to
          the communication between the App and your server.
        </p>

        <h2>4. Your Responsibilities</h2>
        <ul>
          <li>
            <strong>Your server:</strong> You are solely responsible for the opencode server you
            connect to, including its security, uptime, costs, and compliance with applicable laws
            and the terms of any AI provider you use on that server.
          </li>
          <li>
            <strong>Your content:</strong> You are solely responsible for any code, prompts, or other
            content you submit through the App to your server.
          </li>
          <li>
            <strong>Lawful use:</strong> You agree to use the App only for lawful purposes and in
            accordance with applicable laws and regulations.
          </li>
          <li>
            <strong>Age:</strong> You must be at least 18 years old to use the App, as it is a
            developer tool not designed for minors.
          </li>
          <li>
            <strong>Account security:</strong> You are responsible for safeguarding any credentials,
            tokens, or API keys you configure in the App.
          </li>
        </ul>

        <h2>5. No Warranty</h2>
        <p>
          THE APP IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE,&rdquo; WITHOUT WARRANTY OF ANY KIND,
          EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR
          A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. VIBE TECHNOLOGIES, LLC DOES NOT WARRANT THAT
          THE APP WILL BE ERROR-FREE, UNINTERRUPTED, SECURE, OR MEET YOUR REQUIREMENTS.
        </p>
        <p>
          This disclaimer is consistent with the MIT License under which the App&apos;s source code is
          released.
        </p>

        <h2>6. Limitation of Liability</h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL VIBE TECHNOLOGIES,
          LLC, ITS OFFICERS, DIRECTORS, EMPLOYEES, OR AGENTS BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
          SPECIAL, CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES, INCLUDING LOSS OF PROFITS, DATA,
          BUSINESS, OR GOODWILL, ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF THE APP, EVEN IF
          ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
        </p>
        <p>
          IN JURISDICTIONS THAT DO NOT ALLOW THE EXCLUSION OR LIMITATION OF CERTAIN DAMAGES, OUR
          LIABILITY IS LIMITED TO THE GREATEST EXTENT PERMITTED BY LAW.
        </p>

        <h2>7. No Support Obligation (Free Tier)</h2>
        <p>
          VIBE TECHNOLOGIES, LLC provides OpenCode Mobile free of charge and has no obligation to
          provide technical support, maintenance, updates, or bug fixes. We genuinely try to respond
          to issues on{' '}
          <a href="https://github.com/dzianisv/opencode-mobile/issues" target="_blank" rel="noopener noreferrer">
            GitHub Issues
          </a>{' '}
          and via{' '}
          <a href="mailto:support@vibebrowser.app">support@vibebrowser.app</a>, but we make no
          guarantees about response times or resolution.
        </p>
        <p>
          Future paid &ldquo;opencode Cloud&rdquo; plans may include defined support terms; those plans will
          have separate agreements.
        </p>

        <h2>8. Updates and Changes to the App</h2>
        <p>
          We may release updates, patches, or new versions of the App at any time or discontinue the
          App without notice. We are not obligated to maintain backwards compatibility or provide
          migration paths.
        </p>

        <h2>9. Third-Party Services</h2>
        <p>
          The App may integrate with or link to third-party services (e.g., your opencode server,
          AI providers, Sentry for crash reporting). These third parties have their own terms and
          privacy policies. VIBE TECHNOLOGIES, LLC is not responsible for third-party services.
        </p>

        <h2>10. Intellectual Property</h2>
        <p>
          The App&apos;s source code is MIT-licensed (see Section 2). The &ldquo;OpenCode Mobile&rdquo; name, the
          Vibe Technologies name, and associated logos are trademarks of VIBE TECHNOLOGIES, LLC and
          may not be used without permission except as permitted by applicable law.
        </p>

        <h2>11. Governing Law and Dispute Resolution</h2>
        <p>
          These Terms are governed by and construed in accordance with the laws of the State of
          Washington, USA, without regard to its conflict-of-law provisions. Any dispute arising out
          of or relating to these Terms or the App shall be subject to the exclusive jurisdiction of
          the state and federal courts located in King County, Washington.
        </p>
        <p>
          If you are a consumer in a jurisdiction with mandatory consumer protection laws, nothing in
          these Terms limits rights you are entitled to by law.
        </p>

        <h2>12. Changes to These Terms</h2>
        <p>
          We may update these Terms from time to time. The most current version will always be
          available at{' '}
          <a href="https://opencode.agentlabs.cc/terms">opencode.agentlabs.cc/terms</a>.
          Continued use of the App after changes constitutes your acceptance of the new Terms.
          We will update the effective date at the top when changes are made.
        </p>

        <h2>13. Severability</h2>
        <p>
          If any provision of these Terms is found to be unenforceable, the remaining provisions
          will continue in full force and effect.
        </p>

        <h2>14. Contact</h2>
        <p>
          VIBE TECHNOLOGIES, LLC<br />
          519 S Henderson St<br />
          Seattle, WA 98108-4522<br />
          USA<br />
          Email:{' '}
          <a href="mailto:support@vibebrowser.app">support@vibebrowser.app</a>
        </p>
      </div>
    </div>
  )
}
