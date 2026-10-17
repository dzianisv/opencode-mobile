# Upstream integration ledger

This branch was compared against all 19 open upstream pull requests in
`dzianisv/opencode-mobile` as of 2026-10-17. The purpose was to carry over
fixes addressing Android reliability, prompt retention, and OpenCode API
compatibility without replacing the fork's PR #216 base.

## Integrated

| PR | Purpose | Status | Implementation |
| --- | --- | --- | --- |
| #209 | OpenCode v2 server support with v1 compatibility | **Integrated** | Commit `4bf0380` plus working-tree extensions. The app detects v1/v2 transports via content-type probing and maps v2 session, message, event, form, provider, and permission shapes onto existing interfaces. PermissionV2 uses current event names (`permission.v2.asked`/`permission.v2.replied`), `source.callID`, and `{reply}` wire body. See [`v2-api-map.md`](v2-api-map.md). |
| #211 | Distinguish 401 with no credentials from rejected credentials | **Integrated** | Commit `83da1ac`. Diagnostics differentiate an authentication challenge when no credentials were sent from a rejection of supplied credentials. |
| #191 | Preserve per-session message drafts | **Adapted** | `src/lib/session-drafts.ts` and `src/stores/sessions.ts` implement encrypted per-session draft storage using SecureStore. Drafts flush on background and restore after process recreation. |

## Adapted (relevant pieces extracted)

| PR | Purpose | Status | Decision |
| --- | --- | --- | --- |
| #182 | Keyboard/composer, auto-scroll, dead SSE, stale transcripts, etc. | **Adapted** | Reviewed for lifecycle, SSE recovery, draft, and message-copy concerns. Adapted the lifecycle and draft pieces to the existing stores rather than transplanting the wider patch, which overlaps this fork's session and transport behavior. |
| #193 | Prevent keyboard overlap across input screens | **Adapted** | Kept the existing IME/window-inset approach and made targeted composer layout changes (`src/lib/session-layout.ts`) rather than taking conflicting manifest/windowSoftInputMode changes. |
| #208 | Keep IME prompts usable | **Adapted** | Reviewed; the existing `adjustResize` + `react-native-keyboard-controller` approach already addresses the core issue. No additional changes needed. |
| #206 | Restore adjustResize for edge-to-edge displays | **Adapted** | Reviewed; the fork's `MainActivity.kt` already applies IME insets on Android 15+ via `ViewCompat.setOnApplyWindowInsetsListener`. No transplant needed. |
| #201 | Keep composer synchronized with IME | **Adapted** | Reviewed; `src/lib/session-layout.ts` provides keyboard-aware composer sizing that keeps the input visible. |
| #203 | Keyboard cover input + blank card | **Adapted** | Reviewed; the existing keyboard-controller integration and composer layout helpers address the input-covering issue. The blank-card rendering fix is covered by existing message-list logic. |

## Reviewed, not integrated

| PR | Purpose | Status | Decision |
| --- | --- | --- | --- |
| #217 | Never lose Play review feedback to a missing label | **Rejected** | Play Store tooling concern; unrelated to app stability or API compatibility. |
| #215 | Navigate previous and next message starts | **Rejected** | Chat navigation feature; orthogonal to stability/API work. |
| #200 | Title swarm delegation rows | **Rejected** | Chat UI label fix; unrelated to this branch's scope. |
| #199 | Link repository and publisher on F-Droid and in Settings | **Rejected** | Metadata/branding change; not a stability fix. |
| #196 | Label delegated task tool calls | **Rejected** | Chat UI label fix; unrelated. |
| #195 | Post the AGE-100 after-number | **Rejected** | Documentation only; no code change. |
| #192 | Fullscreen diffs and task change review | **Rejected** | Feature addition; unrelated to stability. |
| #185 | Add Italian locale | **Rejected** | i18n contribution; unrelated to this branch. |
| #161 | Notification lock-screen leaks, settings persistence + bugs | **Deferred** | Notification privacy is already addressed by the generic notification text in `src/lib/notify-format.ts`. Settings persistence bugs are unrelated to this branch's scope. |

## Verification status

- `npm run typecheck` passes.
- The Node 22 test run passes all 395 tests.
- `./gradlew assembleRelease` succeeds with Node 22 and Sentry auto-upload disabled. The resulting APK reports application ID `cc.agentlabs.opencode.test`, keeping it installable alongside the production app.
- No Android device was attached during this run, so the APK has not been installed or lifecycle-tested on-device. Live OpenCode v2 server interoperability also remains to be exercised against a running v2 server.
