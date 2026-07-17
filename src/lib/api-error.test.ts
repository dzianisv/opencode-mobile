import { test } from "node:test"
import assert from "node:assert/strict"
import { ApiAuthError, apiErrorFor, isAuthError, isAuthStatus } from "./api-error.ts"

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

test("apiErrorFor: 401/403 produce an ApiAuthError carrying the status", () => {
  const err401 = apiErrorFor(401, "API Error: 401 - Unauthorized")
  assert.ok(err401 instanceof ApiAuthError)
  assert.equal(err401.status, 401)
  assert.equal(err401.message, "API Error: 401 - Unauthorized")

  const err403 = apiErrorFor(403, "API Error: 403 - Forbidden")
  assert.ok(err403 instanceof ApiAuthError)
  assert.equal(err403.status, 403)
})

test("apiErrorFor: other statuses produce a plain Error, not ApiAuthError", () => {
  const err = apiErrorFor(500, "API Error: 500 - Internal Server Error")
  assert.ok(err instanceof Error)
  assert.equal(err instanceof ApiAuthError, false)
  assert.equal(err.message, "API Error: 500 - Internal Server Error")
})

test("isAuthError: type guard matches only ApiAuthError instances", () => {
  assert.equal(isAuthError(new ApiAuthError(401, "nope")), true)
  assert.equal(isAuthError(new Error("some other error")), false)
  assert.equal(isAuthError("401"), false)
  assert.equal(isAuthError(undefined), false)
  assert.equal(isAuthError(null), false)
})
