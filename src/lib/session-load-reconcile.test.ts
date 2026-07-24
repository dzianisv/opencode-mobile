import { test } from "node:test"
import assert from "node:assert/strict"
import { isColdSessionLoad, isLiveEventForSession } from "./session-load-reconcile.ts"

test("isColdSessionLoad: no session shown yet -> cold (needs the spinner)", () => {
  assert.equal(isColdSessionLoad(undefined, "s1"), true)
  assert.equal(isColdSessionLoad(null, "s1"), true)
})

test("isColdSessionLoad: switching to a different session -> cold", () => {
  assert.equal(isColdSessionLoad("s1", "s2"), true)
})

test("isColdSessionLoad: re-selecting the session already on screen -> not cold (background refresh)", () => {
  assert.equal(isColdSessionLoad("s1", "s1"), false)
})

test("isLiveEventForSession: matching ids -> true", () => {
  assert.equal(isLiveEventForSession("s1", "s1"), true)
})

test("isLiveEventForSession: mismatched ids -> false", () => {
  assert.equal(isLiveEventForSession("s1", "s2"), false)
})

test("isLiveEventForSession: missing event session id -> false", () => {
  assert.equal(isLiveEventForSession(undefined, "s1"), false)
  assert.equal(isLiveEventForSession(null, "s1"), false)
})

test("isLiveEventForSession: missing active session id -> false", () => {
  assert.equal(isLiveEventForSession("s1", undefined), false)
  assert.equal(isLiveEventForSession("s1", null), false)
})
