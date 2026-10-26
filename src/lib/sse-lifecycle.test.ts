import assert from "node:assert/strict"
import test from "node:test"
import { readWithIdleTimeout, reconnectDelayMs, sessionActivityFromMessages, shouldReconnectOnResume, shouldResetRetries } from "./sse-lifecycle.ts"

test("a half-open SSE read times out and cancels its reader", async () => {
  let cancelled = false
  const result = await readWithIdleTimeout({
    read: () => new Promise(() => {}),
    cancel: async () => { cancelled = true },
  }, 5)
  assert.equal(result, "idle")
  assert.equal(cancelled, true)
})

test("retry backoff is bounded and jittered", () => {
  assert.equal(reconnectDelayMs(1, () => 0), 750)
  assert.equal(reconnectDelayMs(2, () => 0.5), 2_000)
  assert.equal(reconnectDelayMs(99, () => 1), 15_000)
})

test("retry counter resets only after actual stream data", () => {
  assert.equal(shouldResetRetries(false), false)
  assert.equal(shouldResetRetries(true), true)
})

test("foreground reconnect is skipped for a live stream and in-flight attempt", () => {
  assert.equal(shouldReconnectOnResume({ transport: "live", attemptInFlight: false }), false)
  assert.equal(shouldReconnectOnResume({ transport: "connecting", attemptInFlight: true }), false)
  assert.equal(shouldReconnectOnResume({ transport: "backgrounded", attemptInFlight: false }), true)
  assert.equal(shouldReconnectOnResume({ transport: "reconnecting", attemptInFlight: false }), true)
})

test("session activity reconciliation distinguishes empty, active, and completed timelines", () => {
  assert.equal(sessionActivityFromMessages([]), "unknown")
  assert.equal(sessionActivityFromMessages([{ role: "user" }]), "busy")
  assert.equal(sessionActivityFromMessages([{ role: "assistant" }]), "busy")
  assert.equal(sessionActivityFromMessages([{ role: "assistant", time: { completed: 123 } }]), "idle")
  assert.equal(sessionActivityFromMessages([{ role: "assistant", error: { message: "failed" } }]), "idle")
})
