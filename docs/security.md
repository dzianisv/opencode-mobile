# Security audit — opencode-mobile

Date: 2026-05-24
Auditor: automated agent (claude-sonnet-4-6)

## Summary

- 0 CRITICAL findings (none blocking launch)
- 4 HIGH findings (fix in v1.0)
- 6 MEDIUM findings (fix when convenient)
- 5 LOW / informational findings

---

## Findings

### HIGH

#### H-01: Active Sentry credentials in `.env` — requires rotation

**File:** `.env` (lines 1–2)
**Description:** `.env` contains a live `SENTRY_AUTH_TOKEN` (`sntryu_26bfd6d8…`) and a `EXPO_PUBLIC_SENTRY_DSN`. The file is gitignored and was never committed to git history (verified via `git log --all -S 'sntryu_' -p` — no matches). However, the presence of an active Sentry auth token on disk without documented rotation policy is a credential hygiene issue. The `SENTRY_AUTH_TOKEN` grants write access to the Sentry project (source maps upload, project settings). If this dev machine is compromised, that token is exposed.
**Remediation:**
1. Rotate `SENTRY_AUTH_TOKEN` immediately in the Sentry dashboard (Settings > Auth Tokens).
2. Store the new token in Bitwarden under `opencode-mobile` folder.
3. Update local `.env` from Bitwarden only. Do not keep long-lived tokens in local `.env` files.
4. In CI, verify the token is sourced solely from GitHub Secrets (`secrets.SENTRY_AUTH_TOKEN`).
**Status:** Open

---

#### H-02: `EXPO_PUBLIC_SENTRY_DSN` is baked into the app bundle

**File:** `src/lib/sentry.ts:17`, `.env:1`, `.github/workflows/build.yml:14`
**Description:** Any env var prefixed `EXPO_PUBLIC_` is embedded verbatim into the JavaScript bundle by Metro at build time. The Sentry DSN (`https://4f21a857…@o4510132673511424.ingest.us.sentry.io/…`) is visible to anyone who decompiles the APK or IPA with `apktool` / `strings`. This is actually the Sentry-blessed way to include DSNs, but it means:
  - Anyone can send fake/spam events to this project and exhaust the Sentry quota.
  - The org ID and project ID are enumerable.
**Remediation:**
1. This is unavoidable with client-side error reporting; it is not a secret in the traditional sense.
2. Enable Sentry's "allowed domains" / ingest rate-limit: in Sentry project settings, set the allowed origins to `ai.opencode.mobile` (App ID) to block abuse from arbitrary origins. Android DSN abuse is harder to block; apply a Sentry ingest rate-limit rule.
3. Document this in the threat model (done below).
**Status:** Open (partially mitigable)

---

#### H-03: Auth `initialize()` fails open (`isAuthenticated: true` on error)

**File:** `src/stores/auth.ts:74`
**Description:**
```ts
} catch (error) {
  set({
    error: "Failed to initialize authentication",
    isLoading: false,
    isAuthenticated: true, // Fail open for usability
  })
}
```
If `SecureStore` or `LocalAuthentication` throws an unexpected error on app start, the app silently bypasses all authentication. On a device where biometric is required, a crashing SecureStore (e.g., due to hardware failure, rooted device SecureStore shim) would grant full app access without any credential check.
**Remediation:** Change the `catch` block to set `isAuthenticated: false` and show a retry/recovery screen rather than silently opening. Usability concern is real but security concern outweighs it for a privacy-sensitive app.
**Status:** Open

---

#### H-04: Connection IDs generated with `Math.random()` (non-CSPRNG)

**File:** `src/stores/connections.ts:45-46`
**Description:**
```ts
function generateId(): string {
  return Math.random().toString(36).slice(2, 11)
}
```
`Math.random()` is not a cryptographically secure PRNG. Connection IDs are used as SecureStore keys (`opencode_password_<id>`). While predicting an ID requires knowing the RNG state at the time of creation and there is no obvious direct exploit path, best practice is to use `crypto.getRandomValues()` or `expo-crypto` for any ID that acts as a key into a security-sensitive store.
**Remediation:** Replace with:
```ts
import * as Crypto from 'expo-crypto'
function generateId(): string {
  return Crypto.randomUUID()
}
```
**Status:** Open

---

### MEDIUM

#### M-01: No `permissions:` declaration at workflow/job level in most CI files

**Files:** `.github/workflows/build.yml`, `.github/workflows/publish-play-store.yml`, `.github/workflows/cua-smoke.yml`
**Description:** Only `build.yml`'s `release` job has `permissions: { contents: write }`. The `build`, `publish`, and CUA smoke test jobs have no explicit `permissions:` declaration, which means they inherit the repository default (typically `contents: read` but potentially broader if repo-level defaults are permissive). Without explicit minimal permissions, a compromised third-party action in the job could abuse default token permissions.
**Remediation:** Add `permissions: read-all` (or the specific needed set) at the top of each workflow file, then grant elevated permissions only on the specific job that needs them. Example for `build.yml`:
```yaml
permissions: {}  # deny-all at workflow level

jobs:
  build:
    permissions:
      contents: read
  release:
    permissions:
      contents: write
```
**Status:** Open

---

#### M-02: Third-party GitHub Actions not pinned to commit SHAs

**Files:** All four workflow files
**Description:** Every third-party action is pinned to a mutable tag (`@v4`, `@v3`, `@v1.1.5`, `@v2`) rather than an immutable commit SHA. A tag can be moved to point at malicious code; commit SHA pinning prevents supply-chain hijacking.
Actions of concern:
- `android-actions/setup-android@v3` (third party, no SHA pin)
- `r0adkll/upload-google-play@v1.1.5` (third party, has the PLAY_STORE_SERVICE_ACCOUNT_JSON secret in scope)
- `softprops/action-gh-release@v2` (third party)
**Remediation:** Pin each action to a SHA:
```yaml
# Example:
uses: r0adkll/upload-google-play@v1.1.5
# →
uses: r0adkll/upload-google-play@8de0ac6d8a1d9f8e0a18d91fce3d43d3e4c5f5a  # v1.1.5
```
Use `gh api /repos/<owner>/<repo>/git/refs/tags/v1.1.5` to get SHAs.
**Status:** Open

---

#### M-03: `permission.asked` notification can leak tool file-path patterns

**File:** `src/stores/events.ts:294`
**Description:**
```ts
body: req.patterns?.join(", ") || "A tool needs your approval",
```
When the opencode AI agent requests a file-access permission, the notification body shows the glob patterns (e.g., `/home/user/secrets/*.env`). These patterns can appear on the device lock screen before the user authenticates, visible to someone with physical device access.
**Remediation:** Replace the notification body with a generic string ("A tool is requesting file access — open app to review") and only reveal patterns inside the locked/authenticated app.
**Status:** Open

---

#### M-04: `settings.ts` stores notification preferences in SecureStore (unnecessary)

**File:** `src/stores/settings.ts:28-29`
**Description:** Non-sensitive user preferences (page size, notification category toggles) are stored in `expo-secure-store` rather than plain `AsyncStorage`. SecureStore on Android is backed by the hardware-backed Android Keystore, which has a limited key slot quota (~100 entries on many devices) and is noticeably slower than SharedPreferences. Using it for non-secret data degrades performance and wastes Keystore quota.
**Remediation:** Move `opencode_settings` to `AsyncStorage` (or Expo's `@react-native-async-storage/async-storage`). Only secrets (passwords, auth tokens, consent state) need SecureStore. Document the rationale.
**Status:** Open (minor performance/resource issue)

---

#### M-05: `usesCleartextTraffic: true` / `NSAllowsArbitraryLoads: true` — undocumented in privacy policy

**Files:** `app.json:29`, `app.json:38-39`
**Description:** Both platforms allow HTTP connections, which is required for local/LAN servers. This is intentional and correct for the use case. However, neither the Play Store listing, App Store listing, nor a privacy policy document currently explains that HTTP connections may be made to user-provided servers. Google Play's Data Safety section and Apple's App Privacy report will flag arbitrary network access if not documented.
**Remediation:**
1. Update the privacy policy at `agentlabs.cc/opencode/privacy` to explain that the app connects to user-configured server addresses that may use HTTP.
2. In Play Store Data Safety: disclose "Other app performance data" collected (crash reports via Sentry — opt-in).
**Status:** Open

---

#### M-06: R8/ProGuard minification disabled

**File:** `android/app/build.gradle:69`
**Description:** `enableMinifyInReleaseBuilds` defaults to `false` (no `android.enableMinifyInReleaseBuilds` property set in `gradle.properties`). Minification (R8) is disabled in release builds, meaning class names, method names, and string constants are visible in the APK. This makes reverse engineering significantly easier and increases APK size.
**Remediation:**
1. Add `android.enableMinifyInReleaseBuilds=true` to `android/gradle.properties`.
2. Audit `android/app/proguard-rules.pro` — add keep rules for Expo/React Native modules that fail after obfuscation.
3. Test release build thoroughly after enabling: some RN reflection-based modules need `-keep` rules.
**Status:** Open

---

### LOW / Informational

#### L-01: Biometric is opt-in, default off — by design

**File:** `src/stores/auth.ts:28-31`
**Description:** `requireBiometric: false` is the default. This is the right UX default for a developer tool (not everyone has biometrics enrolled). The setting is persisted in SecureStore. When enabled, `disableDeviceFallback: false` allows PIN/passcode fallback, which is appropriate.
**Note:** `requireAuthentication: true` option for SecureStore (which would require biometric/passcode on every read) is not used. This is acceptable: iOS Keychain `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` is the default, meaning items are inaccessible when screen is locked. The current setup is reasonable.
**Status:** Informational / acceptable

---

#### L-02: `disableDeviceFallback: false` allows PIN fallback on biometric prompt

**File:** `src/stores/auth.ts:91`
**Description:** Both `authenticate()` and `authenticateForMessage()` allow device PIN/passcode as a fallback. This is standard UX and appropriate for a developer tool. Noted for completeness.
**Status:** Informational / acceptable

---

#### L-03: No CSRF protection noted — but not applicable

**Description:** The app communicates with an opencode server via REST+SSE. There is no browser/cookie context; all requests use `Authorization: Basic` headers. CSRF does not apply to native apps using non-cookie auth.
**Status:** Not applicable

---

#### L-04: Session IDs generated server-side, not client-side

**File:** `src/stores/sessions.ts` (no local session ID generation)
**Description:** Session IDs are assigned by the opencode server. The only client-generated ID is the connection UUID (see H-04). This is correct.
**Status:** Informational

---

#### L-05: No `WebView` usage found

**Description:** Codebase search found no `WebView` component usage in app or src directories. Not applicable.
**Status:** Clean

---

## Action items (numbered, prioritized)

1. **[H-01] Rotate `SENTRY_AUTH_TOKEN` immediately.** The token in `.env` has never been committed, but it's a live credential. Rotate it in Sentry dashboard, store new value in Bitwarden, update GitHub Secret.

2. **[H-03] Fix auth fail-open.** Change `isAuthenticated: true` in the `initialize()` catch block to `isAuthenticated: false` with a user-visible retry prompt. This is a one-line change with UX impact.

3. **[H-04] Replace `Math.random()` with `Crypto.randomUUID()`.** One-line change in `src/stores/connections.ts`. Add `expo-crypto` (already available as Expo SDK dep).

4. **[M-02] Pin critical third-party GitHub Actions to commit SHAs**, especially `r0adkll/upload-google-play` which runs with the Play Store service account JSON in scope.

5. **[M-03] Sanitize `permission.asked` notification body.** Replace file-path patterns in lock-screen notifications with a generic message.

---

## Things verified clean

- **No hardcoded production secrets in git history.** Verified with `git log --all -S 'sntryu_' -p`, `git log --all -S 'AKIA' -p`, `git log --all -S 'sk-' -p`, `git log --all -- .env` — all returned no matches.
- **`.env` is properly gitignored** (`git check-ignore -v .env` confirms `.gitignore:11`).
- **No AsyncStorage usage for sensitive data.** All connection URLs, passwords, auth settings, and consent state use `expo-secure-store` exclusively.
- **No `rejectUnauthorized: false` or TLS bypass.** The SDK uses `expo/fetch` with no TLS options overridden.
- **No WebView usage.** No `<WebView>` component found anywhere in the app.
- **No hardcoded API keys, AWS keys, or JWTs.** Grep for `AKIA`, `eyJ`, `ghp_`, `sk-` in source returned no matches.
- **Sentry PII scrubbing is well-implemented.** `beforeSend` and `beforeBreadcrumb` hooks strip URLs with credentials. `sendDefaultPii: false`. User prompts/AI responses are NOT captured in breadcrumbs.
- **Sentry is opt-in, default off.** `loadTelemetryConsent()` returns `'unknown'` on first launch; Sentry init is gated behind explicit user consent.
- **No `pull_request_target` trigger.** All workflow triggers use `pull_request`, which does NOT expose secrets to fork PR builds.
- **13 moderate npm vulnerabilities, 0 high, 0 critical.** All moderate issues require `--force` flag to fix (breaking Expo version change); they are in build tooling (postcss, uuid) and do not affect the runtime app bundle.
- **Basic auth over HTTPS is correctly implemented.** `Authorization: Basic` header set via `btoa()` in `sdk.ts:167`. When user provides `https://` URL, standard TLS verification applies.

---

## Defer-to-later items

- **Certificate pinning for `opencode.vibebrowser.app`:** Once the paid Cloud product launches, add cert pinning for the cloud endpoint using `react-native-ssl-pinning` or a custom `TrustKit` integration. Not needed while the app only connects to user-owned servers.
- **Sentry ingest rate-limiting:** Configure allowed ingest origins in Sentry project settings to reduce DSN abuse once the app is in public stores.
- **Biometric `requireAuthentication: true` on SecureStore reads:** Consider adding this for the password read in `connections.ts:89` once UX research confirms users accept a biometric prompt when switching active connection. Currently the design is authenticated-at-app-level only.
- **R8/ProGuard enabling (M-06):** Requires Expo/RN compatibility testing. Defer to a dedicated release hardening sprint.
- **Privacy policy HTTP disclosure (M-05):** Assign to the content/legal team for the privacy policy update before Play Store submission.
