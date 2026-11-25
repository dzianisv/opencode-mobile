import { test } from "node:test"
import assert from "node:assert/strict"
import { clampPageSize, mergeStoredSettings } from "./settings-merge.ts"

const DEFAULTS = {
  pageSize: 25,
  notifications: { idle: true, error: true, permission: false },
  showMessageTimestamps: false,
}

test("clampPageSize keeps in-range values unchanged", () => {
  assert.equal(clampPageSize(25), 25)
  assert.equal(clampPageSize(10), 10)
  assert.equal(clampPageSize(200), 200)
})

test("clampPageSize floors below 10 and caps above 200", () => {
  assert.equal(clampPageSize(0), 10)
  assert.equal(clampPageSize(-5), 10)
  assert.equal(clampPageSize(9), 10)
  assert.equal(clampPageSize(201), 200)
  assert.equal(clampPageSize(99999), 200)
})

test("empty stored settings yield the defaults", () => {
  assert.deepEqual(mergeStoredSettings(DEFAULTS, {}), DEFAULTS)
})

test("stored values override defaults", () => {
  const merged = mergeStoredSettings(DEFAULTS, { pageSize: 50, showMessageTimestamps: true })
  assert.equal(merged.pageSize, 50)
  assert.equal(merged.showMessageTimestamps, true)
  assert.deepEqual(merged.notifications, DEFAULTS.notifications)
})

test("settings from before message timestamps default the new preference to off", () => {
  const merged = mergeStoredSettings(DEFAULTS, { pageSize: 50 })
  assert.equal(merged.showMessageTimestamps, false)
})

test("upgrade path: a category missing from storage gets its default", () => {
  // Stored data predates the "permission" category — it must come back as the default (false),
  // not undefined, while the user's stored choices are preserved.
  const merged = mergeStoredSettings(DEFAULTS, { notifications: { idle: false, error: true } })
  assert.equal(merged.notifications.idle, false) // user's stored choice kept
  assert.equal(merged.notifications.error, true)
  assert.equal(merged.notifications.permission, false) // new category -> default
  assert.equal("permission" in merged.notifications, true)
})

test("does not mutate the inputs", () => {
  const defaults = { pageSize: 25, notifications: { a: true } }
  const parsed = { notifications: { a: false } }
  const merged = mergeStoredSettings(defaults, parsed)
  assert.equal(defaults.notifications.a, true) // untouched
  assert.equal(parsed.notifications.a, false) // untouched
  assert.equal(merged.notifications.a, false)
  assert.notEqual(merged.notifications, defaults.notifications)
})
