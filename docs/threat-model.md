# Threat model — opencode-mobile

Date: 2026-05-24
Version: 0.2.3

---

## Assets we protect

| Asset | Sensitivity | Storage |
|---|---|---|
| opencode server URL | Medium — reveals network topology | `expo-secure-store` (`opencode_connections`) |
| HTTP Basic auth password for opencode server | High — grants full server access | `expo-secure-store` (`opencode_password_<id>`) |
| User prompts sent to the AI model | High — may contain proprietary code or PII | Sent prompts remain server-side; the unsent composer draft is encrypted in `expo-secure-store` per session and deleted after accepted submission |
| AI responses / generated code | High — proprietary output | In-flight only (not persisted on device) |
| Sentry DSN | Low — public by design; quota-abuse risk | Bundle (EXPO_PUBLIC_) + SecureStore (consent state) |
| Biometric/PIN auth settings | Low | `expo-secure-store` (`opencode_auth_settings`) |
| Telemetry consent decision | Low | `expo-secure-store` (`opencode_telemetry_consent`) |
| Session IDs | Low — server-assigned | Current last-selected session reference in `expo-secure-store`; no transcript is stored |
| Notification preferences | Low | `expo-secure-store` (`opencode_settings`) |

---

## Attackers and attack scenarios

### 1. Network observer (passive MitM)

**Capability:** Can observe network traffic between phone and opencode server.

**Attack scenarios:**
- Intercept HTTP traffic on local LAN (e.g., corporate Wi-Fi, coffee shop).
- Read user prompts and AI responses in cleartext if server is accessed via `http://`.

**Defenses:**
- HTTPS: When user provides an `https://` URL, standard TLS verification via `expo/fetch` applies. No `rejectUnauthorized` overrides.
- Documentation: App UI explicitly recommends using `https://` when TLS is configured; the quick-connect form defaults to `http://` only for LAN/Tailscale where the user has a trusted network path.
- Tailscale: Most users access local servers over Tailscale (encrypted mesh VPN), making cleartext HTTP safe in practice.

**Residual risk:** Users who expose their opencode server on a public IP via HTTP (not HTTPS) without Tailscale have no transport-layer protection. This is documented as user responsibility.

---

### 2. Malicious deep link (`opencode://`)

**Capability:** Any installed app or web page can fire `opencode://` deep links at the app.

**Attack scenarios:**
- Inject a malicious server URL via deep link to phish the user into connecting to an attacker-controlled opencode server.
- Cause the app to navigate to an attacker-controlled session ID.

**Defenses:**
- Current deep link handling uses `expo-router`. The only parameterized routes are `/session/[id]` and `/connection/[id]`. Neither auto-connects to an external URL via deep link; server URLs are only stored via the explicit "Add Connection" UI.
- No deep link handler was found that auto-creates a connection from URL parameters.
- Notifications navigation (`router.push('/session/${data.sessionId}')`) uses server-assigned session IDs only, not user-supplied URLs.

**Residual risk:** Low. No auto-connect-from-deep-link path exists. If this is added in future, validate scheme+host against stored connections before navigating.

---

### 3. Lost or stolen device

**Capability:** Physical access to a locked device.

**Attack scenarios:**
- Read server URL and password from device storage.
- View AI session content / conversation history from lock screen notifications.
- Bypass app authentication.

**Defenses:**
- All sensitive data in `expo-secure-store` (iOS Keychain with `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`; Android Keystore-backed EncryptedSharedPreferences). Data is inaccessible when the device is locked.
- Optional biometric app lock (`requireBiometric` setting). Default off for UX; users with sensitive servers should enable it.
- Notification lock-screen preview: session titles may appear in "Task completed" notifications. No prompt content or AI response content is included in notification bodies.
- Permission/question notifications use generic lock-screen text; tool resources and form content remain in the authenticated in-app prompt (M-03 addressed).

**Residual risk:** Medium. Without biometric lock enabled, a device that auto-unlocks (e.g., trusted location) exposes app contents. Users should be prompted to enable biometric lock during onboarding when a server is added.

---

### 4. Compromised opencode server

**Capability:** Attacker controls the opencode server the app connects to (e.g., via supply-chain, server compromise, or DNS hijacking to an HTTPS server).

**Attack scenarios:**
- Server returns malicious tool permission requests designed to trick user into approving harmful file operations.
- Server returns crafted SSE events to cause client-side errors and exfiltrate stack traces.

**Defenses:**
- App renders server data (session titles, tool permission descriptions) as text only — no `eval()`, no `dangerouslySetInnerHTML`, no JavaScript injection surface.
- Sentry reports are scrubbed of URLs and query params before upload.
- Tool permission requests require explicit in-app user approval. The `permission.asked` UI shows the user what patterns the tool wants to access.

**Residual risk:** Medium. The app trusts the connected server by design. Users are responsible for connecting only to servers they control. This is documented in the UX.

---

### 5. Sentry DSN abuse

**Capability:** Attacker extracts the DSN from the APK/IPA (trivially readable via `strings`).

**Attack scenarios:**
- Flood the Sentry project with fake events, exhausting quota and masking real errors.
- Enumerate org/project metadata via the public DSN.

**Defenses:**
- The Sentry DSN is `EXPO_PUBLIC_` and therefore intentionally public (this is Sentry's documented model).
- `sendDefaultPii: false` ensures device identifiers are not sent.
- Sentry ingest rate-limiting can be configured per-project (deferred enhancement).

**Residual risk:** Low. Quota exhaustion is a nuisance, not a security breach. No user data flows from DSN exposure.

---

### 6. CI/CD supply chain attack

**Capability:** Attacker compromises a third-party GitHub Action used in the build pipeline.

**Attack scenarios:**
- Malicious action exfiltrates `PLAY_STORE_SERVICE_ACCOUNT_JSON` or keystore secrets.
- Tampered action injects malicious code into the APK.

**Defenses:**
- Secrets are stored as GitHub Secrets, not in code.
- `pull_request` trigger (not `pull_request_target`) prevents fork PRs from accessing secrets.
- `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD` are separate from `KEYSTORE_BASE64`, minimizing damage from any single secret leak.

**Residual risk:** Medium. Third-party actions are pinned to tags, not commit SHAs (see H audit finding M-02). SHA pinning is the recommended fix.

---

## Out of scope

- **Security of the user's opencode server itself.** The server is user-managed; its authentication, file access controls, and model provider secrets are outside this app's threat model.
- **Model provider security.** API keys for Anthropic, OpenAI, etc. are held by the opencode server, not the mobile app. The app never sees model provider credentials.
- **Tailscale or VPN security.** Users connecting via Tailscale rely on Tailscale's security model for transport protection.
- **Device operating system integrity.** Rooted/jailbroken devices can bypass `expo-secure-store`. This is a platform-level threat outside app scope.

---

## Security architecture summary

```
[Phone] ──(HTTPS or HTTP-via-Tailscale)──> [opencode server (user-owned)]
   │                                               │
   │  expo-secure-store (Keychain/Keystore)        │── AI model provider (user's keys)
   │  • server URL + auth password                 │
   │  • biometric settings                         │
   │  • telemetry consent                          │
   │                                               │
   │  opt-in only                                  │
   └──(HTTPS)──> [Sentry ingest] (scrubbed, no PII, no prompts)
```
