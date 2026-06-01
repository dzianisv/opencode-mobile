# App Store Listing — OpenCode (iOS)

Copy-paste reference for App Store Connect. Use this once the Apple Developer Program enrollment is approved and the app is created in App Store Connect.

---

## App Information

### App Name (max 30 chars)

```
OpenCode
```
(8 chars)

### Subtitle (max 30 chars)

```
AI Coding Agent, In Your Pocket
```
(31 chars — trim to:)

```
AI Coding Agent in Your Pocket
```
(30 chars exactly)

### Promotional Text (max 170 chars — appears above description, can be updated without a new review)

```
Drive your self-hosted AI coding agent from anywhere. Connect to opencode on your workstation and review, approve, and guide AI-generated code changes in real time.
```
(165 chars)

### Description (max 4000 chars)

```
OpenCode is an open-source mobile client for the opencode AI coding agent (github.com/sst/opencode). Connect to your self-hosted opencode server and drive AI-powered coding sessions directly from your iPhone or iPad.

KEY FEATURES

• Multiple connection types — local network (Wi-Fi), secure tunnels (Cloudflare Tunnel, ngrok), or cloud-hosted opencode instances
• Biometric unlock — Face ID / Touch ID to keep your sessions private
• Real-time streaming chat — watch your AI agent think and respond live as it works through your code
• File diff viewer — see exactly what code changes the agent proposes before you accept them
• Multi-session management — start, resume, and switch between coding sessions
• Tool call approval — review and approve file writes, shell commands, and other actions before the agent executes them on your code

WHO IT'S FOR

• Developers who run opencode on their workstation or a server and want to check in from their phone
• Engineers away from their desk who want to guide long-running AI coding sessions
• Teams who self-host AI dev tools and want a polished mobile companion

WHAT IT IS NOT

• Not an AI model — you bring your own opencode server (which connects to Claude, GPT-4, Gemini, or local models via your API keys)
• Not a code editor — pairs with your existing IDE and terminal workflow
• Not a subscription service — the app is free and open source

OPEN SOURCE

OpenCode Mobile is MIT licensed. Source code, issue tracker, and community discussion:
https://github.com/dzianisv/opencode-mobile

PRIVACY

OpenCode Mobile does not collect your code, prompts, or AI responses. All AI traffic goes directly from the app to YOUR opencode server — never through our infrastructure. We use Sentry for crash reporting only (no personally identifiable information, no message content). See our privacy policy for full details.

SELF-HOSTED FIRST

OpenCode requires you to run an opencode server:
1. Install: npm install -g opencode-ai
2. Run: opencode serve
3. Connect the app to the server URL

If you cannot self-host, contact support@vibebrowser.app and we will provide a temporary review endpoint.

SUPPORT

Email: support@vibebrowser.app
Issues: https://github.com/dzianisv/opencode-mobile/issues
```

(Character count: ~1,750 — well under 4,000 limit. Add more feature detail or FAQ if desired.)

---

## Keywords (max 100 chars, comma-separated)

```
opencode,AI coding,developer,LLM,Claude,GPT,coding agent,self-hosted,mobile dev,terminal
```
(89 chars)

Alternative / supplemental terms to rotate in A/B: `code review`, `AI assistant`, `remote dev`, `SSH`, `copilot`

---

## URLs

| Field | Value |
|---|---|
| Support URL | https://agentlabs.cc/opencode |
| Marketing URL | https://github.com/dzianisv/opencode-mobile |
| Privacy Policy URL | https://opencode.vibebrowser.app/privacy |

---

## App Category

| Field | Value |
|---|---|
| Primary Category | Developer Tools |
| Secondary Category | Productivity |

---

## Pricing & Availability

| Field | Value |
|---|---|
| Price | Free |
| In-App Purchases | None |
| Availability | All territories (no regional restrictions) |

---

## Age Rating Questionnaire

Apple uses a questionnaire to assign an age rating. Answer as follows for OpenCode Mobile:

| Question | Answer | Notes |
|---|---|---|
| Cartoon or fantasy violence | None | Dev tool — no violence content |
| Realistic violence | None | |
| Prolonged graphic violence | None | |
| Sexual content or nudity | None | |
| Profanity or crude humor | None | |
| Mature or suggestive themes | None | |
| Horror/fear-inducing content | None | |
| Medical/treatment information | None | |
| Alcohol, tobacco, drugs | None | |
| Gambling | None | |
| Contests | None | |
| Unrestricted web access | No | App connects to user-specified servers only, no general browser |
| Sharing location data | No | |
| User-generated content | No | Chat is between user and their own AI backend, not user-to-user |

**Expected rating: 4+** (no objectionable content; developer tool)

---

## Privacy Nutrition Label (App Privacy)

Apple requires you to declare what data the app collects. Fill the App Privacy section in App Store Connect as follows.

### Data Not Collected

OpenCode Mobile does NOT collect any of the following:
- Name, Email address, Phone number, Physical address, Other contact info
- Health/fitness data
- Financial info, payment info
- Precise or coarse location
- Contacts
- Emails or text messages
- Photos or videos
- Audio data
- Gameplay content
- Customer support data
- Browsing history, search history
- Sensitive info
- User content (code, prompts, AI responses are not sent to our servers)
- Identifiers (User ID, Device ID — Sentry uses an installation-scoped anonymous ID, see below)

### Data Linked to You: None

### Data Not Linked to You

| Data Type | Category | Purpose | Optional? |
|---|---|---|---|
| Crash Data | Diagnostics | App functionality | No — always on (see note) |
| Performance Data | Diagnostics | App functionality | No — always on (see note) |
| Other Diagnostic Data | Diagnostics | App functionality | No |

**Explanation**: Sentry crash reporting sends device model, OS version, app version, and stack traces. Sentry assigns an anonymous installation ID (not linked to any Apple ID or personal information). No user-generated content (code, prompts, responses) is ever sent.

**Sentry opt-in status**: As of v0.2.3, Sentry is **always on** when a DSN is configured. If you add a settings toggle for Sentry consent (planned), change Optional? to "Yes" and add a note that users who decline are in the "Data Not Collected" category. In App Store Connect, once opt-in is implemented, this section can be removed or marked optional.

**"Are you or your third-party partners using this data to track users?"**: No

**App Tracking Transparency (ATT)**: OpenCode Mobile does **not** use the ATT framework (`AppTrackingTransparency`) and does **not** access the IDFA (Identifier for Advertisers). No ad networks or cross-app tracking SDKs are present. No ATT permission prompt is shown to users.

---

## Export Compliance

Apple asks about encryption during submission. Answer:

| Question | Answer |
|---|---|
| Does the app use encryption beyond what is in the operating system? | No |
| Does the app qualify for any exemptions? | N/A |

**Rationale**: OpenCode Mobile uses only standard HTTPS/TLS provided by iOS networking APIs (URLSession via React Native's fetch). It does not implement any custom cryptographic algorithms. Per US Export Administration Regulations (EAR), apps using only standard OS-provided encryption and that do not modify the encryption are exempt from ERN requirements. Source: https://developer.apple.com/documentation/security/complying_with_encryption_export_regulations

**Action**: In App Store Connect > App Information > Export Compliance, select "No" when asked if the app uses non-exempt encryption.

---

## App Review Notes — ATS Justification

The app's `Info.plist` sets `NSAllowsArbitraryLoads: true` in `NSAppTransportSecurity`. Apple App Store review may ask for justification. Paste the following in the **App Review Notes** field in App Store Connect, or in the reviewer communication:

---

**Justification for NSAllowsArbitraryLoads:**

OpenCode is a developer tool that connects to user-self-hosted opencode CLI servers. These servers typically run on `localhost` or a LAN address (e.g. `http://192.168.1.100:4096`) over plain HTTP. Requiring TLS would prevent the app from functioning as designed for the dev-tool use case, because:

1. The opencode server (`opencode serve`) serves over plain HTTP by default. Requiring the user to configure TLS certificates for a localhost developer tool is an unreasonable burden.
2. The connection targets are the user's **own** machines, not third-party services. There is no user-to-user data exchange and no third-party server communication through this code path.
3. `NSAllowsArbitraryLoadsInWebContent` is explicitly set to `false` — we only relax ATS for the app's own network calls to the user-configured backend.

This is exactly the use case Apple's own documentation acknowledges when describing developer tools and enterprise apps that connect to custom internal servers. Reference: https://developer.apple.com/documentation/bundleresources/information_property_list/nsapptransportsecurity

We do not weaken security for any user-facing content delivered by third parties. If the reviewer requires additional justification or a demonstration, we are happy to provide a screen recording or a live server endpoint.

---

## App Review Information

### Sign-in Required

| Field | Value |
|---|---|
| Sign-in required? | No — the app does not have user accounts |

### App Access Notes

Paste the following in the "Notes" field of the App Review Information section:

```
OpenCode Mobile requires the reviewer to connect to an opencode server.

OPTION A — We provide a hosted review endpoint:
Contact support@vibebrowser.app before the review window and we will email a temporary server URL valid for 72 hours.

OPTION B — Self-host (5 minutes):
1. Install Node.js 20+ on any macOS/Linux machine
2. Run: npm install -g opencode-ai
3. Run: opencode serve --hostname 0.0.0.0
4. The terminal prints a URL like: http://192.168.x.x:4096
5. In the app: tap "Add Connection" → enter that URL → tap "Connect"
6. Tap "New Session" → type any prompt (e.g. "list files in current directory")
7. Observe streaming response and tool call approval flow

Note: The --hostname 0.0.0.0 flag makes the server listen on all interfaces
so the iOS device (or simulator) on the same Wi-Fi network can reach it.
Without it, the server only accepts connections from localhost.

The app has no hidden features or paywalls. All functionality is accessible after connecting to a server.
```

---

## Graphic Assets — Required Before Submission

All icons and screenshots must be provided before submitting for review.

### App Icon

| Asset | Size | Format | Notes |
|---|---|---|---|
| App Icon | 1024×1024 px | PNG, no alpha channel | Used for App Store; Xcode fans out all other sizes |

The 1024×1024 icon must NOT have rounded corners (Apple applies them). No transparency.

Current status: `assets/icon.json` is a placeholder — **real PNG required before submission**.

### iPhone Screenshots (REQUIRED)

Minimum 1 screenshot per device class. Recommended: 3–5 showing key flows.

| Device | Resolution | Size name in App Store Connect |
|---|---|---|
| iPhone 6.7" (iPhone 16 Pro Max / 15 Plus) | 1320×2868 or 1290×2796 | 6.7" Super Retina XDR Display |
| iPhone 6.5" (iPhone 14 Plus / 11 Pro Max) | 1242×2688 | 6.5" Super Retina XDR Display |
| iPhone 5.5" (iPhone 8 Plus) | 1242×2208 | 5.5" Retina HD Display |

Note: As of 2024, Apple only requires 6.7" and 6.5" for new submissions. 5.5" is optional but recommended for coverage.

Suggested screenshot subjects:
1. Connection setup screen (add server URL)
2. Active chat session — streaming AI response
3. File diff view — seeing a code change
4. Tool approval dialog
5. Session list / multi-session view
6. Biometric unlock (if possible to screenshot without triggering auth)

### iPad Screenshots (REQUIRED for Universal apps)

Since `supportsTablet: true`, iPad screenshots are required.

| Device | Resolution | Size name in App Store Connect |
|---|---|---|
| iPad 12.9" (iPad Pro 6th gen) | 2048×2732 | 12.9" iPad Pro (6th gen) |
| iPad 11" (iPad Pro M4) | 1668×2388 | 11" iPad Pro (M4) |

Minimum 1 per device class required. iPad screenshots can be the same content as iPhone.

### Preview Videos (Optional)

- Max 30 seconds
- Same resolution as screenshots for each device class
- MP4 or MOV
- No audio required

---

## TestFlight Beta App Description (shown to TestFlight testers)

```
OpenCode Mobile — iOS beta

Drive your self-hosted opencode AI coding agent from your iPhone or iPad. Connect to opencode running on your workstation (or any server) and guide AI coding sessions remotely.

This is an early beta. Please report issues via the TestFlight feedback button or email support@vibebrowser.app.

To use: you need opencode running somewhere accessible (local Wi-Fi, Tailscale, Cloudflare Tunnel, etc). Run `opencode serve` and enter the server URL in the app.
```

---

## Pending Before First Submission

- [ ] Apple Developer Program enrollment approved (D-U-N-S 142059652, VIBE TECHNOLOGIES LLC)
- [ ] App Store Connect app record created (bundle ID: ai.opencode.mobile)
- [ ] App icon 1024×1024 PNG (no alpha, no rounded corners)
- [ ] iPhone screenshots (6.7" minimum; 6.5" strongly recommended)
- [ ] iPad screenshots (12.9" minimum)
- [ ] Privacy policy live at https://opencode.vibebrowser.app/privacy
- [ ] App Store Connect API key created (for CI — Key ID, Issuer ID, .p8 file)
- [ ] Apple Distribution certificate + provisioning profile (or use EAS managed signing)
- [ ] Export compliance answered (No to custom encryption)
- [ ] App privacy nutrition label filled
- [ ] Age rating questionnaire completed (expected: 4+)
- [ ] TestFlight internal group created
- [ ] Review notes prepared with temporary server URL or self-host instructions
