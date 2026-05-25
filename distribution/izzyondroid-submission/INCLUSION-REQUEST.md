# IzzyOnDroid Inclusion Request

**File this as a new issue at: https://codeberg.org/IzzyOnDroid/repodata/issues**

Use the text below (starting from "---") as the issue body. Replace all
`<PLACEHOLDER>` values before filing.

---

## App submission: OpenCode Mobile

**App name:** OpenCode Mobile
**Package / App ID:** `ai.opencode.mobile`
**License:** MIT
**Source code:** https://github.com/dzianisv/opencode-mobile
**GitHub releases:** https://github.com/dzianisv/opencode-mobile/releases

---

### Release URL pattern

APK attached to each GitHub release tag following the pattern:

```
https://github.com/dzianisv/opencode-mobile/releases/download/<TAG>/app-release.apk
```

Example (first production release):
```
https://github.com/dzianisv/opencode-mobile/releases/download/v0.2.4/app-release.apk
```

Note: IzzyOnDroid should use the GitHub releases tag pattern for auto-update
polling. The app uses semantic versioning (`vX.Y.Z` tags).

---

### Signing key SHA-256 fingerprint

```
0C:25:9D:94:E0:FF:EA:5D:63:19:61:4B:22:9D:4B:6B:DC:22:DE:1F:56:E3:8E:76:94:83:98:D2:DF:6A:A0:99
```

This is the production-release.jks key used for all distribution channels
(Play Store, F-Droid, and IzzyOnDroid use the same signing key — users can
update in-place across stores).

---

### Description

OpenCode Mobile is a free, open-source (MIT) client for the opencode AI coding
agent (sst/opencode). It lets developers connect to their self-hosted opencode
server and drive AI-powered coding sessions from their Android phone.

Key features include streaming chat with the AI agent, a file diff viewer for
reviewing proposed code changes before accepting them, multi-session management,
tool call approval gates, and biometric unlock. All AI traffic flows directly
from the app to the user's own server — no middleman, no mandatory accounts, no
vendor lock-in. Crash reporting via Sentry is opt-in with default OFF.

The app is aimed at developers who run opencode on a workstation or self-hosted
server (on-prem or any cloud VPS) and want a mobile companion for on-the-go
session management. An optional hosted "opencode Cloud" backend is planned as
a future paid service, but the client is and will remain free and open source.

---

### Anti-features acknowledgment

**NonFreeNet** applies: the app connects to a user-self-hosted opencode server
which may in turn connect to proprietary AI APIs (OpenAI, Anthropic, Google
Gemini). The app itself contains no proprietary network code and does not
require any specific provider.

No other anti-features apply:
- No ads (no ad SDK present)
- No tracking (Sentry opt-in, default OFF — user must explicitly enable)
- No non-free dependencies beyond FCM receiver classes compiled in by
  `expo-notifications` (local-only usage; `scheduleNotificationAsync` only;
  no `getExpoPushTokenAsync` / `getDevicePushTokenAsync` calls)
- No subscription / license checks in the client

---

### FOSS confirmation

- Source code is fully public: https://github.com/dzianisv/opencode-mobile
- License: MIT (https://github.com/dzianisv/opencode-mobile/blob/main/LICENSE
  or inferred from package.json `"license": "MIT"`)
- No proprietary SDKs are required for core functionality
- The APK on GitHub releases is signed with the key fingerprint above

---

### F-Droid mainline track note

A parallel F-Droid mainline submission (MR against fdroiddata) will be filed
after the first Play Store release is live. Per IzzyOnDroid policy, IzzyOnDroid
will auto-delist this app once the mainline F-Droid repository accepts it.
We will notify the IzzyOnDroid team via this issue when that happens.

---

### Contact

Developer: VIBE TECHNOLOGIES, LLC
Email: support@vibebrowser.app
Website: https://opencode.vibebrowser.app
Privacy policy: https://opencode.vibebrowser.app/privacy
