# OpenCode Mobile — Technical Design Document (TDD)

> Audience: engineers working on the app. For product-level context and user
> stories, see [`prd.md`](./prd.md).

## 1. Stack

| Layer | Choice | Notes |
| ----- | ------ | ----- |
| Runtime | React Native 0.81 + Hermes | New architecture / Fabric on by default via Expo SDK 54 |
| Framework | Expo SDK 54 + Expo Router 6 | File-based routing under `app/`; typed routes enabled |
| State | Zustand 5 | Plain stores, no provider tree. Avoids redux boilerplate. |
| Server data | TanStack Query 5 (cache) + custom `fetch`-based SDK | SSE is hand-rolled (RN's `EventSource` is unreliable). |
| Persistence | `expo-secure-store` (Keychain / Keystore) | All connection URLs + passwords. |
| Auth | `expo-local-authentication` | Optional biometric gate at startup and per-send. |
| Notifications | `expo-notifications` | Local + push; tap deep-links into session. |
| Crash reporting | `@sentry/react-native` 6.x | Opt-in via env DSN; full URL scrubbing in `beforeSend`. |

## 2. Repo Layout

```
app/                       Expo Router screens (file-based routes)
├── _layout.tsx            Root layout: Sentry init, ErrorBoundary, providers, SSE wiring
├── (tabs)/                Bottom tabs: sessions, connections, settings
├── session/[id].tsx       Chat screen
└── connection/            Add / edit connection screens

src/
├── components/
│   ├── ErrorBoundary.tsx  App-wide React error boundary with Share Report fallback
│   ├── AuthGate.tsx       Biometric prompt before app contents render
│   ├── chat/              Message bubbles, tool call cards, etc.
│   └── markdown/          react-native-marked wrapper + custom code-block
├── lib/
│   ├── sdk.ts             HTTP + SSE client for the opencode server API
│   ├── sentry.ts          Sentry wrapper + global JS/promise handlers + scrubbing
│   ├── diagnostics.ts     Active connection probes + crash report builder + share
│   ├── logbuffer.ts       200-line ring buffer mirroring console output
│   ├── notifications.ts   Notification setup + categories + dedupe
│   ├── speech.ts          Voice input via expo-speech-recognition (experimental; PRD §7 lists voice beyond OS dictation as out-of-scope for v0.x)
│   └── types.ts           Re-exported model/connection types
└── stores/
    ├── auth.ts            Biometric state
    ├── connections.ts     Server list, active client, project metadata
    ├── sessions.ts        Session list, messages, parts, optimistic sends
    ├── events.ts          SSE event loop, reconnect, status tracking
    ├── settings.ts        User preferences (notifications, biometrics)
    └── catalog.ts         Models / providers / commands catalog

docs/                      PRD + TDD (this file)
scripts/                   E2E test rig (LLM-driven CUA Android smoke)
```

## 3. Data Flow

```
+--------------+    HTTP    +-----------------+
|  React UI    | ---------> |  src/lib/sdk.ts |
+------+-------+            +--------+--------+
       ^                             |
       |                             | fetch / SSE
       |                             v
+------+-------+            +-----------------+
| Zustand      | <--------- |  opencode srv   |
| stores       |   events   +-----------------+
+--------------+
```

- The UI never calls `fetch` directly. It calls store actions, which call the SDK.
- SSE is owned by `stores/events.ts`. It dispatches events into `sessions.ts`, `connections.ts` and notification helpers — UI components only read derived state.
- Optimistic updates (e.g. `sendMessage`) are rolled back when the server's SSE truth disagrees.

## 4. Connection Lifecycle

1. `loadConnections()` reads stored connections from SecureStore at startup.
2. Active connection (if any) builds a `Client` via `createClient({ baseUrl, directory, auth })`.
3. `client.project.current()` and `client.path.get()` fill in project + server-home metadata; failures are non-fatal (server might be offline). `serverHome` is still consumed by the directory switcher for `~` expansion — but the former *session-scoping* use of this metadata (`sessionScope.ts`, which always resolved to the default client) was dead and removed in `472ff8d`.
4. The `useEffect` in `_layout.tsx` keyed on `client` starts the SSE event loop the moment a client exists, and stops it when the user removes/changes the connection.
5. **Active diagnostics on failure.** When a connection is added or tested and fails, `src/lib/diagnostics.ts:probeConnection` runs three parallel probes (health, server-root, public-internet) and classifies the cause (`tls-error`, `timeout`, `no-internet`, `server-unreachable`, `health-failed`, `malformed-url`, `unknown`). The result drives both the UI alert and the Sentry capture.

## 5. SSE & Reconnect

Implemented in `src/stores/events.ts` (`connect`):

- `AbortController` per connection attempt.
- Async iteration over `client.global.events(signal)`.
- A **stable-connection timer** (`STABLE_CONNECTION_MS = 10s`) resets the reconnect attempt counter once the stream has been alive long enough — this prevents a healthy stream from accumulating false-positive attempt history.
- Backoff: `[1s, 2s, 4s, 8s, 15s]` with ±25 % jitter, capped at 15 s.
- After `PROLONGED_DISCONNECT_MS = 30s` of being down, a notification fires once (deduped with a 60 s cooldown).
- Disconnect clears all in-flight sessionStatus / statusText / permissions / questions — SSE is the source of truth, never local cache.

## 6. Error Handling & Crash Reporting

We treat errors at three layers and route them differently:

| Layer | Mechanism | Sent to Sentry? |
| ----- | --------- | --------------- |
| Expected operational errors (timeout, biometric cancel, network blip) | Caught locally, stored in store `error` field, surfaced as `Alert` / inline UI | **No** — keeps signal high |
| Connection failures (specifically connect/test/add) | `probeConnection()` → `captureDiagnostic()` with classification + probe context | **Yes**, always, when DSN present |
| Unexpected crashes | Global handlers + React `ErrorBoundary` | **Yes**, always, when DSN present |

### 6.1 Sentry init (`src/lib/sentry.ts`)

- DSN comes from `EXPO_PUBLIC_SENTRY_DSN`; if missing, init is a no-op and a breadcrumb-free build is shipped.
- `release` and `dist` are set from `app.json.expo.version` so Sentry can correlate stack traces to source-map artifacts.
- `tracesSampleRate: 0` — performance tracing intentionally off.
- `enableNative: true`, `enableNativeCrashHandling: true` — native (Android NDK / iOS Mach) crashes are captured.
- `maxBreadcrumbs: 100`.
- `beforeSend` and `beforeBreadcrumb` run every outgoing event/breadcrumb through `scrubEvent` / `scrubString` / `scrubObject`. These strip basic-auth (`//user:pw@`) and known query-secret keys (`token`, `access_token`, `api_key`, `key`, `password`, `pwd`, `auth`) from any URL anywhere in the payload (request URL, exception value, breadcrumb data).

### 6.2 Global handlers

Even though `@sentry/react-native` wires its own `ReactNativeErrorHandlers` by default, we install our own thin handlers on top so:

1. The 200-line in-memory log buffer (`logbuffer.ts`) always sees the crash — so the *offline* "Share Report" path includes the stack trace even when telemetry is disabled.
2. Telemetry-disabled builds still leave a forensic trail.

Handlers wrap (not replace) the previous handler:

- `ErrorUtils.setGlobalHandler` — captures uncaught JS exceptions from the RN bridge. Tagged `crash.source=js-global`, `crash.fatal=true|false`.
- `globalThis.onunhandledrejection` — captures unhandled promise rejections. Tagged `crash.source=promise-rejection`.

### 6.3 React Error Boundary (`src/components/ErrorBoundary.tsx`)

A class component because `getDerivedStateFromError` / `componentDidCatch` have no hook equivalent. It:

- Catches render-phase exceptions anywhere in the tree.
- Calls `captureException(err, { level: 'fatal', tags: { 'crash.source': 'react-boundary' }, extra: { componentStack } })`.
- Renders a dark-themed recovery screen with the error message, top 6 stack frames, top 6 component-stack frames, and two buttons:
  - **Share Report** → `buildCrashReport(err, 'react-boundary')` → `shareReport()` (clipboard + native share sheet, fully offline).
  - **Try Again** → resets boundary state, remounting children.
- Wraps the entire app inside `_layout.tsx`, outside `GestureHandlerRootView`. `Sentry.wrap(RootLayout)` remains as a second layer of safety net but is rarely the visible one.

### 6.4 Breadcrumbs

Selective, high-signal — not on every action. Crash reports need *just enough* context to reconstruct what the user was doing:

| Site | Category | Message |
| ---- | -------- | ------- |
| `_layout.tsx` initial load | `app.lifecycle` | `app started` |
| `connections.setActiveConnection` | `connection` | `active connection set: <type>` / `…cleared` |
| `events.connect` | `sse` | `connecting` |
| `events.scheduleReconnect` | `sse` (warning) | `reconnect scheduled` (attempt, delay, reason) |
| `events.disconnect` | `sse` | `disconnected` |
| `sessions.selectSession` | `session` | `select` (sessionID, hasDirectory) |

Adding more breadcrumbs is encouraged when triaging a real bug — just keep them out of hot loops.

### 6.5 Diagnostic report (`src/lib/diagnostics.ts`)

A `DiagnosticReport` is the canonical shape both connection-failure flows and crash flows produce. The same `shareReport()` function copies it to the clipboard and opens the native share sheet, so users see one consistent UI regardless of error source.

`formatReport()` includes: classification, summary, target URL, per-probe results, device info, **and the full log-buffer dump**. That last bit is what makes user-shared reports actionable: we get a 200-line trace of what was happening immediately before the failure.

### 6.6 URL / secret scrubbing

Single source of truth: `scrubUrl(url)` in `sentry.ts`. Applied:

- in `captureDiagnostic` before attaching the URL to the Sentry context;
- in `beforeSend` to recurse over every `event.request.url`, `event.message`, every `exception.value`, every breadcrumb;
- in `beforeBreadcrumb` for breadcrumb data added between events.

A test for this would feed a basic-auth URL into a fake event and assert the scrubbed output. (Not yet written — TODO.)

## 7. Versioning & Releases

- Single source of truth for the human-facing version is `app.json` → `expo.version` (e.g. `0.4.6`). Since v0.4.6 the `package.json` `version` is kept in sync with it (both are bumped together on release); earlier builds left `package.json` untouched.
- Git tag `v<version>` triggers `.github/workflows/build.yml` which builds an APK and creates a GitHub Release.
- Sentry `release` is set to `opencode-mobile@<version>` so source maps (uploaded by `sentry-cli` during build) line up with reported stack frames.

## 8. Style Guide (from AGENTS.md)

- Prefer `const` over `let`.
- Early returns over `else`.
- Single-word variable names where reasonable.
- Avoid `any` — use `unknown` and narrow, or a defined type.
- Avoid `try/catch` where you can use `.catch` at the call site; reserve it for boundary points (init, fetch wrappers, event loops).

## 9. Known Gaps / Tech Debt

- **No automated tests for the error pipeline.** Unit tests for `scrubUrl`, `buildCrashReport`, and the global handlers would catch regressions in the privacy guarantees.
- **No fallback UI for SSE disconnect.** Today the user sees the existing chat with a (small) banner; a more deliberate "Reconnecting…" affordance would help.
- **Silent `.catch(() => null)` in stores.** Intentional today (these are non-critical fetches), but should be revisited once we have proper severity tiers for breadcrumbs.
- **PRD analytics.** No usage analytics; only crash telemetry. A future opt-in product-analytics provider could close that loop without compromising the privacy posture.

## 10. Continuous Product Intelligence

```text
Maintainer manual dispatch
        |
        v
scripts/product-intelligence.mjs
  | GitHub REST: releases, traffic, issues, Actions
  | Sentry REST: aggregate unresolved/new issue health
  | (future) Android Publisher: aggregate review and Play signals
        |
        v
sanitized Markdown report + JSON evidence
        |
        v
Actions summary + artifact per UTC day
        |
        v
material threshold -> deduplicated GitHub issue -> reviewed PR
```

### Components

| Component | Location | Purpose |
| --- | --- | --- |
| Product-intelligence workflow | `.github/workflows/product-intelligence.yml` | Starts with maintainer dispatch only. Enable its cron after the dedicated Sentry token passes a production run. Uses `actions: read`, `contents: read`, and `issues: write`. |
| Collector | `scripts/product-intelligence.mjs` | Validates sources, collects aggregate signals, renders a sanitized report, and fails visibly when a source is unavailable. |
| Material issue upsert | Workflow `actions/github-script` | Locates a stable signal fingerprint and creates or updates an issue only after a material threshold. |
| Sentry privacy implementation | `src/lib/sentry.ts`, `src/lib/scrub.ts` | Separate P1 prerequisite: remove user-controlled server data from events, breadcrumbs, tags, contexts, and span names before an event leaves device. |
| Screenshot source of truth | `distribution/reference-screenshots/play-v1/manifest.json` | Records Play asset provenance, checksum, dimensions, and page placement. |
| Vercel website | `website/` | Versioned Next.js source deployed to existing `opencode-mobile-site` project. |

### Data and Privacy Boundaries

- The initial collector contains numeric aggregates only. It must not publish
  Sentry issue titles, exception text, culprits, request URL, device metadata,
  raw review content, author names, or user-generated text.
- The material-issue upsert independently reconstructs its body from an
  allowlisted UTC date and allowlisted signal names. It rejects malformed
  report data and never uses collector-provided Markdown, URLs, or Sentry
  response fields.
- A missing credential or failed request is reported as unavailable and exits
  non-zero; it must never become a success-shaped zero.
- The first report supports only GitHub and Sentry aggregates. Every other
  metric-contract row is rendered as `deferred` with its source/access reason.
- The first delivery introduces no new analytics SDK or user identifier.
- Sentry remains explicitly opt-in. The consent UI, Settings UI, privacy
  policy, and runtime scrubber must agree on what leaves the device.
- Future activation and retention metrics require a separate product decision
  that updates consent language and Play Data Safety before code ships.
- The `SENTRY_PRODUCT_INTELLIGENCE_TOKEN` repository secret is a read-only,
  single-project Sentry token with only `project:read`, `event:read`, and
  `org:read` scopes; it is distinct from release-upload credentials. Any
  future Android Publisher credential is read-only and limited to
  reporting/reviews.

### Rollout

1. Provision the dedicated read-only Sentry repository secret, then manually
   run the daily workflow against production credentials and verify a
   sanitized Actions summary and artifact for its UTC date.
2. Enable the cron, then observe one scheduled run and verify it creates a new UTC-day artifact but
   no public issue unless a documented material threshold is crossed.
   Back-to-back manual and scheduled runs must update at most one open
   material-signal issue.
3. Merge the Sentry privacy boundary before exposing Sentry detail links.
4. Import and manifest Play screenshots, deploy versioned web source, and
   verify every screenshot loads at the public domain.
5. Enable Android Publisher review/Play data collection only after
   least-privilege credentials and real-data validation are complete.
