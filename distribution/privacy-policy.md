# OpenCode Mobile — Privacy Policy

**Effective date:** 2026-05-24
**Operator:** VIBE TECHNOLOGIES, LLC
**App:** OpenCode Mobile (`cc.agentlabs.opencode`)

> **Summary:** OpenCode Mobile does not collect your code, prompts, AI responses, server URLs, or any chat content. All AI traffic goes directly from the app to your own opencode server. With your consent, we use Sentry for anonymous crash diagnostics, PostHog for anonymous usage analytics, and — only when you tap "Share Report" — deliver a scrubbed copy of that diagnostic report to our support inbox.

---

## 1. Who We Are

OpenCode Mobile is developed and distributed by **VIBE TECHNOLOGIES, LLC**, a Washington State limited liability company.

- Address: 519 S Henderson St, Seattle, WA 98108-4522, USA
- Contact: support@agentlabs.cc
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

## 3a. Data We Do Collect (Usage Analytics)

With the same explicit consent (there is a single opt-in covering both crash reporting and analytics), we collect a small set of anonymous usage events via **PostHog** to understand whether new users successfully connect to their server and start using the app (an "activation funnel").

Events collected, with their only properties:

| Event | When it fires | Properties |
|---|---|---|
| `app_opened` | Once per app session, after consent | `is_first_open` (true/false) |
| `connection_form_submitted` | You tap Connect/Save with a server URL entered | `mode` ("quick" or "advanced") |
| `connection_attempted` | A connection test starts | `source` ("onboarding" or "edit_test") |
| `connection_succeeded` | The connection test succeeds | `source` |
| `connection_failed` | The connection test fails | `source`, `error_class` (a coarse category such as "timeout" or "unauthorized" — never the raw error text) |
| `message_sent` | You send a message to an agent session | — |
| `response_received` | An agent response finishes | — |

What analytics events **never** contain: your server URL, hostname, IP address, or port; prompts, messages, or AI responses; code or file contents; tokens or credentials; raw error messages. Connection failures are reduced to a fixed list of coarse categories before being sent.

Analytics data is sent to PostHog's **EU region** (`eu.i.posthog.com`) and is identified only by a random, app-generated anonymous ID — not linked to your name, email, or any account.

If you decline consent, no analytics is initialised and nothing is sent. If you revoke consent later, analytics stops immediately and any events still buffered on the device are discarded, not uploaded.

---

## 3b. Data We Do Collect (Shared Support Reports)

When a connection fails or the app crashes, you can tap **Share Report** to open your device's normal share sheet with a diagnostic report. If you have granted the same consent that covers crash reporting and analytics, a copy of that report is *also* delivered directly to our support inbox, hosted on our own **Chatwoot** instance (`support.agentlabs.cc`) — this is infrastructure we operate ourselves, not a third-party SaaS vendor.

| Data type | What is included | What is NOT included |
|---|---|---|
| Diagnostic summary | Connection classification (e.g. "server unreachable"), probe results, timing | — |
| Device info | Device model, OS version, app version | Serial number, IMEI, advertising ID |
| Recent app logs | Recent internal log lines (screen names, function-level breadcrumbs) | Message bodies, prompts, AI responses |
| Your server address | — | Never included — every URL and every hostname/IP the app probed this session is redacted before the report leaves your device |

A random, per-install identifier (stored locally via secure device storage) links follow-up reports from the same install into the same support conversation so we can reply to an ongoing issue. This identifier is not linked to your name, email, or account — we only learn contact details if you volunteer them in your own reply.

Sharing a report is always a manual, explicit action — it is never sent automatically or in the background. It is only delivered to the support inbox if you have granted consent; if you decline or revoke consent, tapping **Share Report** still opens your device's normal share sheet, but nothing reaches our support inbox.

---

## 4. Consent and Control

Crash reporting, usage analytics, and support-inbox delivery of shared reports are all **opt-in and off by default**, controlled by a single consent decision. On first launch you will see a consent prompt. You can change this at any time:

- Open the app → **Settings** → **Privacy** → **Crash Reports & Usage Analytics** toggle.
- If you decline, neither Sentry nor PostHog is ever initialised, and shared reports are never delivered to our support inbox (only your device's normal share sheet is used). If you turn the toggle off later, both SDKs are shut down, no new events are captured, analytics events still buffered on the device are dropped without being sent, and future shared reports stop reaching the support inbox.

---

## 5. Third-Party Services

We use two third-party services, both consent-gated:

- **Sentry** — crash and error monitoring.
  - Privacy policy: https://sentry.io/privacy/
  - Data is sent to Sentry's US-based servers and retained for approximately 90 days per Sentry's default data-retention policy.
- **PostHog** — anonymous usage analytics (the activation-funnel events listed in section 3a).
  - Privacy policy: https://posthog.com/privacy
  - Data is sent to PostHog's EU-region servers (`eu.i.posthog.com`).

We use no advertising networks, social SDKs, or any other third-party data collection services. The app contains no ads and no ad SDKs.

We also operate our own **Chatwoot** support-inbox instance (`support.agentlabs.cc`, described in section 3b) to receive diagnostic reports you explicitly choose to share. Unlike Sentry and PostHog, this is infrastructure we run ourselves rather than a third-party vendor, but data sent to it still leaves your device and is retained by us as described below.

---

## 6. Data Retention

Crash reports sent to Sentry are retained for approximately 90 days, after which they are automatically deleted per Sentry's retention defaults. Usage analytics events sent to PostHog are retained per PostHog's standard retention policy. Shared support reports delivered to our Chatwoot inbox are retained until the associated support conversation is resolved and periodically purged thereafter; email support@agentlabs.cc to request earlier deletion of a specific report.

Beyond that support inbox, we do not operate our own servers that store your data; there is no other VIBE TECHNOLOGIES back end involved in normal app usage.

---

## 7. Your Rights

You have the right to:

- **Opt out** — disable crash reporting, usage analytics, and support-inbox delivery of shared reports at any time in Settings → Privacy.
- **Request deletion** — email support@agentlabs.cc with subject "Data deletion request" and we will request deletion of any crash events (Sentry), analytics events (PostHog), and shared support-report conversations (Chatwoot) associated with your device.
- **Access** — request a summary of what diagnostic data (if any) we hold about your device by emailing the same address.

Residents of the EU/EEA/UK may exercise rights under GDPR/UK GDPR. California residents may exercise rights under the CCPA.

---

## 8. Children

OpenCode Mobile is a developer tool intended for users aged 18 and over. We do not knowingly collect any data from children under 13 (or under 16 in the EU).

---

## 9. Security

All diagnostic and analytics data — including shared support reports — is transmitted over HTTPS (TLS 1.2+) to Sentry, PostHog, and our Chatwoot support inbox. We do not transmit any data over unencrypted connections.

---

## 10. Changes to This Policy

If we make material changes to this policy, we will update the effective date and, where feasible, notify users via an in-app notice. The latest version is always available at:
https://dzianisv.github.io/opencode-mobile/privacy/

---

## 11. Contact

VIBE TECHNOLOGIES, LLC
519 S Henderson St
Seattle, WA 98108-4522
USA
Email: support@agentlabs.cc

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
| Identifiers | Device ID | Yes (Sentry / PostHog anonymous IDs) | No — not linked to Apple ID or personal info | No |
| Purchases | Any | No | N/A | No |
| Usage Data | Product interaction | Yes (PostHog activation events, with consent) | No | No |
| Diagnostics | Crash Data | Yes (Sentry, with consent) | No | No |
| Diagnostics | Performance Data | Yes (Sentry, with consent) | No | No |
| Diagnostics | Other Diagnostic Data | Yes (shared support reports delivered to our Chatwoot inbox, only when the user taps "Share Report" with consent) | No | No |

**Summary for App Store Connect App Privacy section**:
- Data Linked to You: **None**
- Data Not Linked to You: **Crash Data, Performance Data** (Sentry diagnostics, when user consents), **Product Interaction** (PostHog activation events, when user consents), **Other Diagnostic Data** (shared support reports via Chatwoot, when user consents)
- Tracking: **No**
