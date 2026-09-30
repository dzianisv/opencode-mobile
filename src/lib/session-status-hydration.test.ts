import assert from "node:assert/strict"
import test from "node:test"
import { isSessionWorking, mergeSessionStatusSnapshot } from "./session-status-hydration.ts"
import type { SessionStatus } from "./sdk.ts"

test("server status drives working state for tasks started elsewhere", () => {
  assert.equal(isSessionWorking({ type: "busy" }, false), true)
  assert.equal(isSessionWorking({ type: "retry", attempt: 1, message: "retrying" }, false), true)
  assert.equal(isSessionWorking({ type: "idle" }, false), false)
  assert.equal(isSessionWorking({ type: "idle" }, true), true)
  assert.equal(isSessionWorking(undefined, true), true)
  assert.equal(isSessionWorking(undefined, false), false)
})

test("hydrates current status without overwriting a newer SSE event", () => {
  const oldBusy: SessionStatus = { type: "busy" }
  const baseline = { stale: oldBusy, changed: oldBusy }
  const current = { ...baseline, changed: { type: "idle" } as SessionStatus }

  assert.deepEqual(
    mergeSessionStatusSnapshot(current, baseline, { stale: { type: "busy" }, changed: { type: "busy" } }, [
      "stale",
      "changed",
      "missing",
    ]),
    {
      stale: { type: "busy" },
      changed: { type: "idle" },
      missing: { type: "idle" },
    },
  )
})
