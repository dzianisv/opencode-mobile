import { test } from "node:test"
import assert from "node:assert/strict"
import {
  sanitizeBody,
  MAX_NOTIF_BODY,
  permissionNotificationBody,
  questionNotificationBody,
} from "./notify-format.ts"

// Notification bodies come from the server (and ultimately the AI). They must be
// neutralized before display: control chars stripped, whitespace trimmed, length capped.

test("returns the fallback for undefined or empty input", () => {
  assert.equal(sanitizeBody(undefined, "fb"), "fb")
  assert.equal(sanitizeBody("", "fb"), "fb")
})

test("returns the fallback when input is only whitespace/control chars", () => {
  assert.equal(sanitizeBody("   ", "fb"), "fb")
  assert.equal(sanitizeBody("\x00\x07\x1f", "fb"), "fb")
})

test("passes ordinary text through, trimmed", () => {
  assert.equal(sanitizeBody("  hello world  ", "fb"), "hello world")
})

test("replaces C0 control chars and DEL with spaces", () => {
  // newline, tab, bell, DEL between the words become spaces
  assert.equal(sanitizeBody("a\nb\tc\x07d\x7fe", "fb"), "a b c d e")
})

test("does not strip non-ASCII/emoji content", () => {
  assert.equal(sanitizeBody("café 🚀 プロジェクト", "fb"), "café 🚀 プロジェクト")
})

test("caps length at MAX_NOTIF_BODY", () => {
  const long = "x".repeat(500)
  const out = sanitizeBody(long, "fb")
  assert.equal(out.length, MAX_NOTIF_BODY)
  assert.equal(out, "x".repeat(MAX_NOTIF_BODY))
})

test("trims before slicing so leading whitespace doesn't eat the budget", () => {
  const out = sanitizeBody("   " + "y".repeat(250), "fb")
  assert.equal(out, "y".repeat(MAX_NOTIF_BODY))
})

test("permissionNotificationBody is a fixed constant (no server content channel)", () => {
  assert.equal(permissionNotificationBody(), "A tool needs your approval")
  // No arguments — callers cannot pass server-supplied text through.
  assert.equal(permissionNotificationBody.length, 0)
})

test("questionNotificationBody is a fixed constant (no server content channel)", () => {
  assert.equal(questionNotificationBody(), "The assistant has a question")
  assert.equal(questionNotificationBody.length, 0)
})
