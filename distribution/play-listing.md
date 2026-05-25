# Google Play Store Listing — OpenCode

Copy-paste reference for completing the Play Console store listing for `ai.opencode.mobile`.
Once identity verification is approved and the app is created, paste these values directly.

---

## Main store listing

### App name (max 30 chars)

```
OpenCode
```
(8 chars — well under limit)

### Short description (max 80 chars)

```
Drive your self-hosted AI coding agent from your phone.
```
(55 chars)

### Full description (max 4000 chars)

```
OpenCode is an open-source mobile client for the opencode AI coding agent (sst/opencode). Connect to your self-hosted opencode server and drive AI-powered coding sessions from your phone.

KEY FEATURES

• Multiple connection types — local network, secure tunnels (Cloudflare, ngrok), or cloud-hosted opencode instances
• Biometric unlock — Face ID / Touch ID / fingerprint to keep your sessions private
• Real-time streaming chat — watch your AI agent think and respond live
• File diff viewer — see exactly what code changes the agent is making before you accept
• Multi-session management — start, resume, and switch between coding sessions
• Tool call approval — review and approve actions before the agent runs them on your code

WHO IT'S FOR

• Developers who run opencode (sst/opencode) on their workstation or a server
• Engineers who want to check in on long-running coding sessions away from their desk
• Teams who self-host AI dev tools and want a polished mobile companion

WHAT IT IS NOT

• Not an AI model — you bring your own opencode server (which connects to Claude, GPT, Gemini, or local models)
• Not a code editor — pair with your existing IDE/terminal workflow
• Not a Google Play exclusive — also available on F-Droid (open source build)

OPEN SOURCE

OpenCode Mobile is MIT licensed. Source code, issue tracker, and community discussion:
https://github.com/dzianisv/opencode-mobile

PRIVACY

OpenCode Mobile does not collect your code or prompts. All AI traffic goes directly from the app to YOUR opencode server. We use Sentry for crash reporting only (no PII, no message content). See our privacy policy for details.

SUPPORT

Email: support@vibebrowser.app
Issues: https://github.com/dzianisv/opencode-mobile/issues
```

---

## Graphic assets — REQUIRED before publishing

| Asset | Spec | Status | Notes |
|---|---|---|---|
| App icon | 512×512 PNG, 32-bit, ≤1 MB | ❌ placeholder | `assets/icon.json` is `{"placeholder":true}` — need real PNG |
| Adaptive icon (foreground) | 432×432 PNG, transparent bg | ❌ placeholder | `assets/adaptive-icon.json` placeholder |
| Feature graphic | 1024×500 PNG/JPG | ❌ missing | For Play Store top banner — required for publishing |
| Phone screenshots | 2–8 images, 16:9 or 9:16, 1080×1920 or similar | ❌ missing | Required min 2 |
| 7-inch tablet screenshots | optional | ❌ missing | Recommended |
| 10-inch tablet screenshots | optional | ❌ missing | Recommended |
| Promo video | YouTube URL, optional | ⏸ skip for first release | |

**Action**: design + generate assets. Suggested tools:
- Icon: Figma → 1024×1024 → export to `assets/icon.png` + run `npx expo prebuild` to fan out per-density.
- Screenshots: run app on emulator, capture via Android Studio screenshot, or use Fastlane's snapshot tooling.

---

## Categorization

| Field | Value | Notes |
|---|---|---|
| App or game | App | |
| Category | Tools | Best fit. Alternatives: Productivity, Communication. |
| Tags | productivity, developer, ai, coding | Free tags. |
| Email | support@vibebrowser.app | Already verified during signup. |
| Phone | +1 360-504-8967 | Optional public; matches developer profile. |
| Website | https://www.vibebrowser.app/ | Already verified. |

---

## Privacy policy URL

**Required.** Must be a public URL.

Suggested path: `https://opencode.vibebrowser.app/privacy`

Privacy policy must cover (per Google requirements):
- What data is collected (Sentry crash diagnostics: device model, OS version, stack trace; nothing user-content)
- How data is used (debugging crashes only)
- Third-party SDKs (Sentry — link to https://sentry.io/privacy/)
- Data retention (Sentry default 90 days)
- User rights (delete account, contact us)
- Contact: support@vibebrowser.app

**Action**: write a privacy policy at the URL above. Template draft below.

```
OpenCode Mobile Privacy Policy
Effective: 2026-05-24
Operator: VIBE TECHNOLOGIES, LLC, 519 S Henderson St, Seattle WA 98108-4522 USA

We do not collect your code, prompts, AI responses, server URLs, or chat history.

We collect (via Sentry SDK for crash reporting):
- Device model, OS version, app version
- Stack traces of crashes and unhandled errors
- App breadcrumbs (function names, screen names — no message bodies)

Data is sent to Sentry (sentry.io) and retained per Sentry defaults (~90 days).

Third-party services:
- Sentry — crash reporting. https://sentry.io/privacy/

Data sharing: none beyond Sentry.

User rights:
- Email support@vibebrowser.app to request deletion of crash records associated with your device.

Contact: support@vibebrowser.app
```

---

## Data safety form

Google requires this before publishing. Answers below for OpenCode Mobile current state.

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | Yes |
| Is all of the user data collected by your app encrypted in transit? | Yes (HTTPS to Sentry) |
| Do you provide a way for users to request that their data is deleted? | Yes — via support@vibebrowser.app |

### Data types collected

| Data type | Collected? | Shared? | Optional? | Purpose | Encrypted in transit? |
|---|---|---|---|---|---|
| App crash logs (Diagnostics) | Yes | Yes (Sentry) | **Yes (opt-in, default OFF)** | App functionality, diagnostics | Yes |
| App performance / interactions | No | – | – | – | – |
| Device or other IDs | No | – | – | – | – |
| Personal info (name, email, etc.) | No | – | – | – | – |
| Financial info | No | – | – | – | – |
| Health / fitness | No | – | – | – | – |
| Messages | No | – | – | – | – |
| Photos / videos | No | – | – | – | – |
| Audio | No | – | – | – | – |
| Files and docs | No | – | – | – | – |
| Calendar | No | – | – | – | – |
| Contacts | No | – | – | – | – |
| App activity (searches, viewed content) | No | – | – | – | – |
| Web browsing | No | – | – | – | – |
| App info and performance (other than crash logs) | No | – | – | – | – |

---

## Content rating

Run the IARC questionnaire on Play Console. Expected outcome based on app content:

| Region | Expected rating |
|---|---|
| ESRB (US) | Everyone |
| PEGI (EU) | 3 |
| USK (Germany) | 0 |
| Australia | G |

Questionnaire answers (all "No" since no violence / sexual / drugs / gambling / etc. content; app is a dev tool):
- Does it contain violence? No
- Does it contain sexual content? No
- Does it contain crude humor? No
- Does it use drugs/alcohol/tobacco? No
- Does it contain gambling? No
- Does it share user location? No
- Does it share user-generated content? No (private user → user-self only)
- Does it allow users to interact / chat? Yes (with their OWN backend, not other users)

If "interact with other users" is asked: answer NO — the chat is between the user and their own AI agent, not user-to-user.

---

## Target audience and content

| Field | Value |
|---|---|
| Target age group | 18+ (developer tool) |
| Appeals to children? | No |
| Ads? | No |
| In-app purchases? | (TBD — see monetization decision) |

---

## App access

| Field | Value |
|---|---|
| All functionality available without restrictions? | No — requires user to provide their own opencode server URL |
| Provide test credentials? | Yes — provide Google reviewer with a temporary opencode server URL or instructions to spin one up |

Reviewer instructions (paste in App Access form):

```
OpenCode Mobile requires the user to bring their own opencode server (https://opencode.ai). To review the app:

1. Install opencode on any machine: `npm install -g opencode-ai`
2. Run `opencode serve` — prints a local URL like http://localhost:4096
3. In the app, tap "Connect" → enter the URL → connect.
4. Start a session, type a prompt, observe streaming response.

If reviewers cannot self-host, contact support@vibebrowser.app and we will provide a temporary hosted opencode endpoint for review.
```

---

## Release notes / "What's new" per release

Already wired in CI: `distribution/whatsnew/whatsnew-en-US`.

Bump this file before tagging a release. Keep it under 500 chars. Per-language variants supported (`whatsnew-fr-FR`, `whatsnew-de-DE`, etc.).

---

## First release strategy

1. **Internal testing** track first (up to 100 testers, no review) — what CI is wired for.
2. **Closed testing** — 14+ days, 12+ testers required for new org accounts before promoting to production (Google's 2023 policy).
3. **Open testing** — optional intermediate step.
4. **Production** — only after Closed testing requirements met.

CI currently publishes to `internal` track ✅ correct for first release.

---

## Pending before first publish

- [ ] Identity verification (governor ID upload, Google review days)
- [ ] App icon (real PNG, not placeholder)
- [ ] Adaptive icon (real PNG)
- [ ] Feature graphic 1024×500
- [ ] At least 2 phone screenshots
- [ ] Privacy policy live at https://opencode.vibebrowser.app/privacy
- [ ] Decide pricing model (see monetization research)
- [ ] Run IARC content rating questionnaire (after app created)
- [ ] Complete Data safety form (after app created)
