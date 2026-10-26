import { test } from "node:test"
import assert from "node:assert/strict"
import {
  LIVENESS_TIMEOUT_MS,
  isHealthy,
  isStreamStale,
  reconnectDelayMs,
  shouldReconnectOnResume,
  shouldResetRetries,
} from "./sse-liveness.ts"

const NOW = 1_000_000

test("a stream that just delivered is not stale", () => {
  assert.equal(isStreamStale({ lastEventAt: NOW, now: NOW }), false)
  assert.equal(isStreamStale({ lastEventAt: NOW, now: NOW + LIVENESS_TIMEOUT_MS - 1 }), false)
})

test("silence past the timeout is stale", () => {
  assert.equal(isStreamStale({ lastEventAt: NOW, now: NOW + LIVENESS_TIMEOUT_MS }), true)
})

// The half-open case: connected, never delivered anything, hangs forever.
test("a stream that never delivered anything still goes stale", () => {
  const attemptStartedAt = NOW
  assert.equal(isStreamStale({ lastEventAt: attemptStartedAt, now: NOW + LIVENESS_TIMEOUT_MS + 1 }), true)
})

test("the timeout tolerates a missed heartbeat or two", () => {
  // Server heartbeats are ~10s; a single late one must not trigger a reconnect.
  assert.equal(isStreamStale({ lastEventAt: NOW, now: NOW + 12_000 }), false)
  assert.equal(isStreamStale({ lastEventAt: NOW, now: NOW + 21_000 }), false)
})

// The bug: a timer reset backoff whether or not anything arrived.
test("retries reset only on a received event", () => {
  assert.equal(shouldResetRetries({ receivedEvent: true }), true)
  assert.equal(shouldResetRetries({ receivedEvent: false }), false)
})

test("backoff climbs and is capped", () => {
  const fixed = () => 0.5 // no jitter
  assert.equal(reconnectDelayMs(1, fixed), 1000)
  assert.equal(reconnectDelayMs(2, fixed), 2000)
  assert.equal(reconnectDelayMs(5, fixed), 15000)
  assert.equal(reconnectDelayMs(99, fixed), 15000)
})

test("backoff jitter stays within bounds", () => {
  for (const r of [0, 0.999]) {
    const d = reconnectDelayMs(3, () => r)
    assert.ok(d >= 3000 && d <= 6000, `attempt 3 delay out of range: ${d}`)
  }
})

test("attempt 0 or negative is treated as the first attempt", () => {
  const fixed = () => 0.5
  assert.equal(reconnectDelayMs(0, fixed), 1000)
  assert.equal(reconnectDelayMs(-3, fixed), 1000)
})

test("resume does not reconnect a live stream", () => {
  assert.equal(shouldReconnectOnResume({ transport: "live", attemptInFlight: false }), false)
})

// Foreground and network-restore often fire together; two attempts would open
// duplicate streams and double-handle every event.
test("resume does not race an attempt already in flight", () => {
  assert.equal(shouldReconnectOnResume({ transport: "connecting", attemptInFlight: true }), false)
  assert.equal(shouldReconnectOnResume({ transport: "idle", attemptInFlight: true }), false)
})

test("resume reconnects when idle and nothing is dialling", () => {
  assert.equal(shouldReconnectOnResume({ transport: "idle", attemptInFlight: false }), true)
})

test("resume reconnects a stalled 'connecting' with no attempt in flight", () => {
  assert.equal(shouldReconnectOnResume({ transport: "connecting", attemptInFlight: false }), true)
})

// The green-UI-over-a-dead-stream bug.
test("only a live transport reads as healthy", () => {
  assert.equal(isHealthy("live"), true)
  assert.equal(isHealthy("connecting"), false)
  assert.equal(isHealthy("idle"), false)
})
