# OpenCode Mobile — Privacy Policy

**Effective date:** 2026-05-24
**Operator:** VIBE TECHNOLOGIES, LLC
**App:** OpenCode Mobile (`ai.opencode.mobile`)

> **Summary:** OpenCode Mobile does not collect your code, prompts, AI responses, server URLs, or any chat content. All AI traffic goes directly from the app to your own opencode server. We use Sentry only for anonymous crash diagnostics, and only with your consent.

---

## 1. Who We Are

OpenCode Mobile is developed and distributed by **VIBE TECHNOLOGIES, LLC**, a Washington State limited liability company.

- Address: 519 S Henderson St, Seattle, WA 98108-4522, USA
- Contact: support@vibebrowser.app
- Source code: https://github.com/dzianisv/opencode-mobile (MIT license)

---

## 2. Data We Do NOT Collect

We never collect, transmit to our servers, or share with third parties:

- Your code, files, or repository content
- Your prompts, chat messages, or AI responses
- Your opencode server URL, IP address, or hostname
- Authentication tokens, API keys, or credentials you enter
- Account information, email addresses, or names
- Location data
- Photos, microphone recordings, or camera data (these go only to your own server if you attach them to a message)
- Contacts, calendar, or any other personal data

All communication between the app and your AI coding agent travels directly between your device and your self-hosted opencode server. VIBE TECHNOLOGIES, LLC never sees this traffic.

---

## 3. Data We Do Collect (Crash Diagnostics)

With your explicit consent (shown at first launch), we collect anonymous crash diagnostic data via **Sentry** to help us identify and fix bugs.

| Data type | What is captured | What is NOT captured |
|---|---|---|
| Device info | Device model, OS version, screen resolution, app version | Serial number, IMEI, advertising ID |
| Crash / error reports | Stack traces, exception types and messages, source file names and line numbers | Variable values; no user data in scope |
| Breadcrumbs | Screen names and function call sequence leading to the crash | Message bodies, server URLs, prompt text — all stripped by our URL-scrubbing filter |
| App version | Version string and build number | — |

URL scrubbing: before any event is sent to Sentry, our code strips all server URLs, authentication tokens, and query parameters. No server hostname or port number ever leaves your device via Sentry.

---

## 4. Consent and Control

Crash reporting is **opt-in and off by default**. On first launch you will see a consent prompt. You can change this at any time:

- Open the app → **Settings** → **Privacy** → **Crash reporting** toggle.
- When the toggle is off, Sentry is never initialised and no data leaves your device.

---

## 5. Third-Party Services

We use one third-party service for diagnostics:

- **Sentry** — crash and error monitoring.
  - Privacy policy: https://sentry.io/privacy/
  - Data is sent to Sentry's US-based servers and retained for approximately 90 days per Sentry's default data-retention policy.

We use no advertising networks, analytics platforms, social SDKs, or any other third-party data collection services. The app contains no ads and no ad SDKs.

---

## 6. Data Retention

Crash reports sent to Sentry are retained for approximately 90 days, after which they are automatically deleted per Sentry's retention defaults.

We do not operate our own servers that store your data; there is no VIBE TECHNOLOGIES back end involved in normal app usage.

---

## 7. Your Rights

You have the right to:

- **Opt out** — disable crash reporting at any time in Settings → Privacy.
- **Request deletion** — email support@vibebrowser.app with subject "Data deletion request" and we will request deletion of any crash events associated with your device from Sentry.
- **Access** — request a summary of what diagnostic data (if any) we hold about your device by emailing the same address.

Residents of the EU/EEA/UK may exercise rights under GDPR/UK GDPR. California residents may exercise rights under the CCPA.

---

## 8. Children

OpenCode Mobile is a developer tool intended for users aged 18 and over. We do not knowingly collect any data from children under 13 (or under 16 in the EU).

---

## 9. Security

All diagnostic data is transmitted over HTTPS (TLS 1.2+) to Sentry. We do not transmit any data over unencrypted connections.

---

## 10. Changes to This Policy

If we make material changes to this policy, we will update the effective date and, where feasible, notify users via an in-app notice. The latest version is always available at:
https://agentlabs.cc/opencode/privacy

---

## 11. Contact

VIBE TECHNOLOGIES, LLC
519 S Henderson St
Seattle, WA 98108-4522
USA
Email: support@vibebrowser.app

---

## Apple-Specific Addendum (iOS / App Store)

This addendum addresses Apple's specific privacy disclosure requirements for iOS apps distributed through the Apple App Store.

### App Tracking Transparency (ATT)

OpenCode Mobile does **not** use Apple's App Tracking Transparency (`AppTrackingTransparency`) framework. The app does **not**:

- Access the IDFA (Identifier for Advertisers)
- Use any cross-app or cross-website tracking
- Participate in any advertising network
- Profile users for advertising or marketing purposes

No ATT permission prompt is ever shown to users because there is nothing to track.

### Apple Privacy Nutrition Label Data Categories

The following table maps our data practices to Apple's official App Privacy categories (as required in App Store Connect):

| Apple Category | Sub-category | Collected? | Linked to identity? | Used for tracking? |
|---|---|---|---|---|
| Contact Info | Name, email, phone, address | No | N/A | No |
| Health & Fitness | Any | No | N/A | No |
| Financial Info | Any | No | N/A | No |
| Location | Precise or coarse | No | N/A | No |
| Sensitive Info | Any | No | N/A | No |
| Contacts | Any | No | N/A | No |
| User Content | Emails, messages, audio, gameplay, other | No | N/A | No |
| Browsing History | Any | No | N/A | No |
| Search History | Any | No | N/A | No |
| Identifiers | User ID | No | N/A | No |
| Identifiers | Device ID | Yes (Sentry anonymous ID) | No — not linked to Apple ID or personal info | No |
| Purchases | Any | No | N/A | No |
| Usage Data | Product interaction | No | N/A | No |
| Diagnostics | Crash Data | Yes (Sentry, with consent) | No | No |
| Diagnostics | Performance Data | Yes (Sentry, with consent) | No | No |
| Diagnostics | Other Diagnostic Data | No | N/A | No |

**Summary for App Store Connect App Privacy section**:
- Data Linked to You: **None**
- Data Not Linked to You: **Crash Data, Performance Data** (Sentry diagnostics, when user consents)
- Tracking: **No**
