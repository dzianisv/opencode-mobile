// Liveness policy for the global SSE stream.
//
// Three separate defects made a mobile client look connected while its
// transport was dead, and made recovery slow or unbounded:
//
//  1. **No read timeout.** `sdk.ts`'s reader awaits `reader.read()` forever. A
//     half-open socket — routine when a phone moves between Wi-Fi and cellular,
//     or resumes from doze — produces no bytes, no `done`, and no error, so the
//     loop parks indefinitely and nothing ever triggers a reconnect.
//  2. **`connected` meant "we tried".** `events.ts` set `connected: true` at the
//     moment it began connecting, before a single byte arrived, so the green UI
//     reflected an intention rather than a verified stream.
//  3. **Retry backoff reset on a timer.** A 10-second `setTimeout` cleared
//     `reconnectAttempts` whether or not anything was ever received, so a
//     connection that was failing silently kept resetting its own backoff and
//     looked healthy.
//
// The server emits heartbeats every ~10s, so silence well past that is evidence
// of a dead stream rather than an idle one. Everything here is pure so the
// policy can be tested without a socket.

/**
 * How long a stream may produce nothing before it is presumed dead.
 *
 * Three missed ~10s heartbeats. Long enough not to churn on a brief stall,
 * short enough that recovery is bounded rather than "eventually".
 */
export const LIVENESS_TIMEOUT_MS = 35_000

/** Reconnect backoff, unchanged from the existing ladder. */
export const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 15000] as const

export type TransportState =
  /** No attempt in flight and nothing live. */
  | "idle"
  /** Attempting; nothing received yet. NOT the same as connected. */
  | "connecting"
  /** At least one event/heartbeat received on this attempt. */
  | "live"

/**
 * Has the stream gone silent long enough to presume it dead?
 *
 * `lastEventAt` is when a byte last arrived on the current attempt, or the
 * attempt's start if nothing has arrived yet — so a stream that never delivers
 * anything is also caught, not just one that goes quiet later.
 */
export function isStreamStale(input: {
  lastEventAt: number
  now: number
  timeoutMs?: number
}): boolean {
  const timeout = input.timeoutMs ?? LIVENESS_TIMEOUT_MS
  return input.now - input.lastEventAt >= timeout
}

/**
 * Should the retry counter reset?
 *
 * Only on demonstrated liveness. Resetting on a timer let a silently-failing
 * connection keep declaring itself stable.
 */
export function shouldResetRetries(input: { receivedEvent: boolean }): boolean {
  return input.receivedEvent
}

/** Jittered backoff for the given attempt (1-based). */
export function reconnectDelayMs(attempt: number, random: () => number = Math.random): number {
  const index = Math.min(Math.max(attempt, 1) - 1, RECONNECT_DELAYS_MS.length - 1)
  const base = RECONNECT_DELAYS_MS[index]
  return Math.min(15_000, Math.round(base * (0.75 + random() * 0.5)))
}

/**
 * Should a foreground/network-restore event trigger an immediate reconnect?
 *
 * Deduplicated deliberately: a foreground transition often arrives alongside a
 * network-change event, and both would otherwise each start an attempt, opening
 * duplicate streams and double-handling every event.
 */
export function shouldReconnectOnResume(input: {
  transport: TransportState
  attemptInFlight: boolean
}): boolean {
  if (input.transport === "live") return false
  // Already dialling — let it finish or time out rather than racing it.
  if (input.attemptInFlight) return false
  return true
}

/**
 * Is the connection indicator allowed to read as healthy?
 *
 * Only "live" counts. "connecting" previously rendered as connected, which is
 * how the UI came to show green over a stream that had never delivered a byte.
 */
export function isHealthy(transport: TransportState): boolean {
  return transport === "live"
}
