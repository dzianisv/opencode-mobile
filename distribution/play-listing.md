# Google Play Store Listing — OpenCode Mobile

Copy-paste reference for completing the Play Console store listing for `cc.agentlabs.opencode`.
Paste these values directly into Play Console. Fields are validated against Play limits.

---

## Main store listing

### App name (max 30 chars)

```
OpenCode: AI Coding Agent
```
(25/30 chars)

> Supersedes: `OpenCode` (8/30 chars — brand-only title with no keyword value).

### Short description (max 80 chars)

```
AI coding agent on your phone. Control opencode sessions, free & open source.
```
(77/80 chars)

> Note: type a literal `&` in Play Console — not `&amp;`.
> Supersedes: `Drive your self-hosted AI coding agent from your phone.` (55/80 chars).

### Full description (max 4000 chars)

```
OpenCode Mobile is the AI coding agent companion for developers who self-host opencode. Connect your Android phone to your opencode server and run AI-powered coding sessions from anywhere — review file diffs, approve tool calls, and guide Claude, GPT, or Gemini in real time.

<b>WHAT IT DOES</b>
OpenCode Mobile is a thin client for the opencode CLI (github.com/sst/opencode). It speaks the opencode HTTP + SSE API so every AI coding session running on your workstation or server is accessible from your phone. All AI model calls go through your own server — your API keys, your code, your infrastructure.

<b>KEY FEATURES</b>
• Real-time streaming chat — watch your AI coding agent think and respond token by token
• File diff viewer — see every code change the agent proposes before you approve it
• Tool call approval — review and approve file writes, shell commands, and other actions
• Multi-session management — start, resume, and switch between coding sessions
• Multiple connection types — local Wi-Fi, Cloudflare Tunnel, ngrok, Tailscale, or opencode Cloud (coming soon)
• Biometric unlock — fingerprint / Face ID keeps your sessions private

<b>WHO IT'S FOR</b>
• Developers running opencode on their workstation who want to check in from their phone
• Engineers away from their desk who want to review or guide long-running AI coding jobs
• Teams who self-host AI developer tools and want a polished mobile interface
• Open-source contributors who want a free, MIT-licensed alternative to proprietary AI coding apps

<b>WHAT IT IS NOT</b>
• Not a standalone AI model — you bring your own opencode server (which connects to Claude, GPT-4, Gemini, or local LLMs via your API keys)
• Not a code editor — it pairs with your existing IDE and terminal workflow
• Not a subscription app — free, open-source, MIT licensed, no ads, no telemetry you did not opt into

<b>SELF-HOSTED AI CODING</b>
Install opencode on any machine: npm install -g opencode-ai, then run opencode serve. Enter the server URL in the app. That's it — your AI coding agent is now on your phone.

<b>OPEN SOURCE</b>
OpenCode Mobile is MIT licensed. Source code, issue tracker, and community discussion at github.com/dzianisv/opencode-mobile. Contributions welcome.

<b>PRIVACY</b>
OpenCode Mobile does not collect your code, prompts, or AI responses. All traffic goes directly from the app to YOUR opencode server — never through our infrastructure. We use Sentry for crash diagnostics only (no PII, no message content, opt-in available).

Support: support@vibebrowser.app
Issues: github.com/dzianisv/opencode-mobile/issues
```
(2600/4000 chars)

---

## Keywords (not a Play Console field — guides copy and ASO)

### Primary keywords (title + short desc + first 3 lines of description)

| Keyword | Priority |
|---|---|
| `AI coding agent` | High |
| `coding assistant` | High |
| `opencode` | High |
| `developer tools` | Medium |
| `self-hosted AI` | High |

### Secondary keywords (weave into description body)

| Keyword | Rationale |
|---|---|
| `AI code review` | Maps to the diff viewer feature |
| `remote development` | Captures devs working off-device |
| `LLM client` | Early-adopter / technically precise audience |
| `Claude mobile` | Brand-transfer from Anthropic Claude users |
| `GPT coding` | Brand-transfer from OpenAI users |
| `coding on phone` | Low-competition long-tail |
| `AI terminal` | CLI-oriented devs |
| `Tailscale` / `Cloudflare Tunnel` | Appears naturally in description; captures tunnel-search users |

### Keywords to avoid

| Keyword | Reason |
|---|---|
| `Copilot`, `Cursor` | Competitor brand names — policy violation |
| `#1 AI coding app` | Superlative claims prohibited by Play policy |
| `free AI` | "Free" in title/short desc is prohibited; fine in body |
| `ChatGPT` | OpenAI brand — avoid unless describing a supported model |

---

## Categorization

| Field | Value | Notes |
|---|---|---|
| App or game | App | |
| Category | Tools | 36.8% CVR on Play vs 27.3% average. Productivity rejected — higher competition, less precise. |
| Tags | developer, ai, coding, open-source, productivity | Submit all five in Play Console. |
| Email | support@vibebrowser.app | Already verified during signup. |
| Phone | +1 360-504-8967 | Optional public; matches developer profile. |
| Website | https://agentlabs.cc/opencode | Already verified. |

---

## Graphic assets — REQUIRED before publishing

| Asset | Spec | Status | Notes |
|---|---|---|---|
| App icon | 512×512 PNG, 32-bit, ≤1 MB | ❌ placeholder | `assets/icon.json` is `{"placeholder":true}` — need real PNG |
| Adaptive icon (foreground) | 432×432 PNG, transparent bg | ❌ placeholder | `assets/adaptive-icon.json` placeholder |
| Feature graphic | 1024×500 PNG/JPG | ❌ missing | Required for editorial featuring placements |
| Phone screenshots | 2–8 images, 16:9 or 9:16, 1080×1920 or similar | ❌ missing | Required min 2; blocks all tracks beyond Internal |
| 7-inch tablet screenshots | optional | ❌ missing | Recommended |
| 10-inch tablet screenshots | optional | ❌ missing | Recommended |
| Promo video | YouTube URL, optional | ⏸ skip for first release | Low ROI for dev-tool audience |

**Recommended screenshot order:**
1. Connection setup — "Connect to your opencode server"
2. Active streaming chat session — AI agent responding token by token
3. File diff viewer — code change before approval
4. Tool call approval dialog
5. Session list / multi-session view
6. Biometric unlock screen

---

## Privacy policy URL

**Required.** Must be a public URL.

Suggested path: `https://opencode.vibebrowser.app/privacy`

Privacy policy must cover:
- What data is collected (Sentry crash diagnostics: device model, OS version, stack trace; no user content)
- How data is used (debugging crashes only)
- Third-party SDKs (Sentry — link to https://sentry.io/privacy/)
- Data retention (Sentry default 90 days)
- User rights (delete request via email, contact us)
- Contact: support@vibebrowser.app

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

Google requires this before publishing. Answers for OpenCode Mobile current state.

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

Questionnaire answers (all "No" — no violence / sexual / drugs / gambling content; app is a dev tool):
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

Wired in CI: `distribution/whatsnew/whatsnew-en-US`.

Bump this file before tagging a release. Keep it under 500 chars. Per-language variants supported (`whatsnew-fr-FR`, `whatsnew-de-DE`, etc.).

---

## First release strategy

1. **Internal testing** track first (up to 100 testers, no review) — what CI is wired for.
2. **Closed testing** — 14+ days, 12+ testers required for new org accounts before promoting to production (Google's 2023 policy).
3. **Open testing** — optional intermediate step.
4. **Production** — only after Closed testing requirements met.

CI currently publishes to `internal` track. ✅

---

## Pending before first publish

- [ ] Identity verification (government ID upload, Google review)
- [ ] App icon (real PNG, not placeholder)
- [ ] Adaptive icon (real PNG)
- [ ] Feature graphic 1024×500
- [ ] At least 2 phone screenshots
- [ ] Privacy policy live at https://opencode.vibebrowser.app/privacy
- [ ] Decide pricing model
- [ ] Run IARC content rating questionnaire (after app created in Play Console)
- [ ] Complete Data safety form (after app created in Play Console)
