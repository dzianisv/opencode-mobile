import { test } from "node:test"
import assert from "node:assert/strict"
import { ApiAuthError, isAuthError, isAuthStatus } from "./api-error.ts"

test("isAuthStatus: 401 and 403 are auth failures", () => {
  assert.equal(isAuthStatus(401), true)
  assert.equal(isAuthStatus(403), true)
})

test("isAuthStatus: other statuses are not auth failures", () => {
  assert.equal(isAuthStatus(200), false)
  assert.equal(isAuthStatus(404), false)
  assert.equal(isAuthStatus(500), false)
  assert.equal(isAuthStatus(503), false)
  assert.equal(isAuthStatus(0), false)
})

test("isAuthError: type guard matches only ApiAuthError instances", () => {
  assert.equal(isAuthError(new ApiAuthError(401, "nope")), true)
  assert.equal(isAuthError(new Error("some other error")), false)
  assert.equal(isAuthError("401"), false)
  assert.equal(isAuthError(undefined), false)
  assert.equal(isAuthError(null), false)
})
