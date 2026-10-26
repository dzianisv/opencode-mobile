import assert from "node:assert/strict"
import { test } from "node:test"
import { normalizeSessionStatusResponse } from "./session-status.ts"

test("normalizes direct and enveloped v2 session status maps", () => {
  assert.deepEqual(normalizeSessionStatusResponse({ s1: { type: "idle" }, s2: { type: "running" } }), {
    s1: { type: "idle" },
    s2: { type: "busy" },
  })
  assert.deepEqual(normalizeSessionStatusResponse({ data: { s3: { type: "retry", attempt: 2, message: "wait" } } }), {
    s3: { type: "retry", attempt: 2, message: "wait" },
  })
})

test("ignores malformed and unknown status entries", () => {
  assert.deepEqual(normalizeSessionStatusResponse({ data: { bad: null, future: { type: "paused" } } }), {})
})
