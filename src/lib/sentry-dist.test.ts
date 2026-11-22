import { test } from "node:test"
import assert from "node:assert/strict"
import { buildSentryDist } from "./sentry-dist.ts"

test("buildSentryDist: F-Droid repo code", () => {
  assert.equal(buildSentryDist("0.4.24", 51), "0.4.24.51")
})

test("buildSentryDist: CI code (1_000_000 + run_number)", () => {
  assert.equal(buildSentryDist("0.4.24", 1000062), "0.4.24.1000062")
})

test("buildSentryDist: Play code (run_number + 100)", () => {
  assert.equal(buildSentryDist("0.4.24", 162), "0.4.24.162")
})

test("buildSentryDist: string versionCode from app.json", () => {
  assert.equal(buildSentryDist("0.4.24", "51"), "0.4.24.51")
})

test("buildSentryDist: missing/non-numeric code falls back to version-only dist", () => {
  assert.equal(buildSentryDist("0.4.24", undefined), "0.4.24")
  assert.equal(buildSentryDist("0.4.24", null), "0.4.24")
  assert.equal(buildSentryDist("0.4.24"), "0.4.24")
  assert.equal(buildSentryDist("0.4.24", "abc"), "0.4.24")
  assert.equal(buildSentryDist("0.4.24", 1.5), "0.4.24")
  assert.equal(buildSentryDist("0.4.24", -1), "0.4.24")
})
