# Compatibility and lifecycle

## Supported OpenCode versions

| Server line | Status | Notes |
| --- | --- | --- |
| opencode 1.18.x (v1) | **Supported** | The original transport in `src/lib/sdk-v1.ts`. Still the common case via `npm install -g opencode-ai`. |
| opencode 1.19.x (v1) | **Supported** | Same v1 transport; no breaking API changes observed. |
| opencode 2.x (v2) | **Supported (captured/live-probe tested)** | The v2 transport in `src/lib/sdk.ts` with `src/lib/v2-shape.ts` normalization. PR #209 verified v2.0.16; the current branch still requires a fresh end-to-end run against an available v2 server. |

## Version/capability detection

Detection is by **content type, never status code** — an unknown route on either
server falls through to the web SPA and answers `200 text/html`:

| probe | v2 server | v1 server |
| --- | --- | --- |
| `GET /api/info` | `401` unauthenticated / `200 application/json` | `200 text/html` (SPA) |
| `GET /global/health` | `200 text/html` (SPA) | `200 application/json` |

`src/lib/api-detect.ts` implements this probing. Unprobed saved connections
default to v1 behavior.

## Permission protocols

### v1 (legacy)

- Event: `permission.asked` with flat `Permission.Request` properties.
- Reply: `POST /session/{id}/permission/{requestID}/reply` with `{reply: "once"|"always"|"reject"}`.

### v2 (current)

- Event: `permission.v2.asked` with `source.callID` and nested `PermissionV2` shape.
- Reply: `POST /api/session/{id}/permission/{requestID}/reply`. v2.0.16 uses `{decision}`; newer PermissionV2 builds use `{reply}`. The client retries only 400/422 schema failures with the newer field.
- Some v2 builds also emit `permission.asked` / `permission.replied`; the translator accepts both shapes.

See [`v2-api-map.md`](v2-api-map.md) for the full protocol map.

## SSE lifecycle

### Connection states

The `TransportState` type in `src/lib/sse-lifecycle.ts` tracks:

- `idle` — no connection attempt in progress.
- `connecting` — initial connection attempt.
- `live` — SSE stream is open and receiving data.
- `reconnecting` — connection lost, backoff/retry in progress.
- `backgrounded` — app is backgrounded; stream may be frozen by Android.
- `auth-required` — server rejected credentials; no retry.

### Reconnection policy

- Exponential backoff with jitter: 1s, 2s, 4s, 8s, 15s (capped at 15s).
- Retry counter resets only after actual stream data is received (not just a successful connect).
- Foreground reconnect is skipped if a stream is already live or a reconnect attempt is in flight.
- Auth errors (401/403) stop the retry loop entirely.

### Background/foreground recovery

1. **Background**: `app/_layout.tsx` calls `useEvents.getState().background()` which sets transport to `backgrounded` and flushes drafts to SecureStore.
2. **Foreground**: `reconnectNow()` checks if a reconnect is needed (not already live, not auth-error), aborts any stale reader, and calls `connect()`.
3. **After reconnect**: `resyncBusySessions()` and `refreshAllPending()` reconcile state. `reconcileOpenSession()` fetches the current session's messages and authoritative status.

### Idle connection detection

A half-open SSE read times out after 45 seconds and cancels its reader. This allows three missed 15-second v2 heartbeats before treating the stream as dead.

## Session recovery

### Process recreation

- The last-selected session ID is persisted in SecureStore.
- On app launch, `app/_layout.tsx` restores the session reference and triggers a background refresh.
- Drafts are restored from encrypted per-session storage.

### Session switching

- Switching to a different session triggers a cold load (spinner shown).
- Re-selecting the current session triggers a background refresh (no spinner).

### Message reconciliation

- `refreshMessages()` fetches the latest messages from the server.
- `sessionActivityFromMessages()` derives activity from the last message type.
- `reconcileOpenSession()` combines server status with local message analysis to determine the true session state.

## Pending permission and question reconciliation

- On the first live event stream and after reconnect, `refreshAllPending()` fetches pending permissions and questions from the server.
- New items trigger notifications with generic lock-screen text.
- Existing items are deduplicated by ID.
- A revision guard prevents a stale list response from overwriting a newer SSE ask/reply.
- Reply failures reconcile with the server instead of restoring stale snapshots that another client may already have resolved.

## Draft persistence

- Drafts are stored per-session in SecureStore using encrypted keys.
- Keys follow the pattern `opencode_draft_{sessionID}`.
- Drafts are flushed on background and on submission.
- Empty text removes only that session's draft.
- Long Unicode, Markdown, and line-ending content is preserved exactly.

## Long-prompt behavior

- No arbitrary composer character limit (the old `maxLength={10000}` has been removed).
- Prompts up to 100,000 characters are preserved exactly.
- Submission uses `buildPromptRequest()` which serializes text without trimming.
- Failed or unaccepted submissions leave the prompt and attachments available for retry.
- Duplicate submissions are prevented via the `sending` state flag.

## Android background execution limitations

- Android does not guarantee permanent background execution. The app does not request `FOREGROUND_SERVICE` or `WAKE_LOCK`.
- When backgrounded, the SSE stream may be frozen or killed by the OS.
- Drafts are flushed to SecureStore on background to prevent data loss.
- On foreground, the app reconnects and reconciles state.
- The UI accurately represents `reconnecting`, `synchronizing`, `connected`, and `failed` states.
- A successful connection is not shown until the necessary state synchronization has completed.

## Known limitations requiring live-device testing

- **Clipboard integrity**: Unit tests verify prompt serialization, but actual Android clipboard round-trip (paste from external app) requires device testing.
- **Keyboard behavior**: Layout helpers are unit-tested, but actual IME interaction varies by device and keyboard app.
- **SSE lifecycle**: Reconnection logic is unit-tested with mocked streams, but real network interruption and server restart behavior requires device testing.
- **Process recreation**: Session restoration is implemented but requires device testing to verify across actual process death scenarios.
- **OpenCode v2 live compatibility**: PR #209 verified v2.0.16 and the user has connected this app to a 2.x server, but the current integration branch has not completed the full live matrix in this document.
- **Long-prompt server acceptance**: Client-side tests verify prompt integrity, but server-side acceptance of very long prompts depends on the server's configuration.
