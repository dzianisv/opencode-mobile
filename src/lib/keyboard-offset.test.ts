import { test } from "node:test"
import assert from "node:assert/strict"
import {
  ANDROID_HEADER_CONTENT_HEIGHT,
  IOS_KEYBOARD_VERTICAL_OFFSET,
  keyboardVerticalOffset,
} from "./keyboard-offset.ts"

test("iOS keeps its existing empirical offset", () => {
  assert.equal(keyboardVerticalOffset("ios", 0), IOS_KEYBOARD_VERTICAL_OFFSET)
  assert.equal(keyboardVerticalOffset("ios", 61.29), IOS_KEYBOARD_VERTICAL_OFFSET)
})

test("Android offsets by the complete native header height", () => {
  assert.equal(keyboardVerticalOffset("android", 61.293), 117.293)
})

test("Android includes header content when the top inset is zero or invalid", () => {
  assert.equal(keyboardVerticalOffset("android", 0), ANDROID_HEADER_CONTENT_HEIGHT)
  assert.equal(keyboardVerticalOffset("android", -20), ANDROID_HEADER_CONTENT_HEIGHT)
})

// Pixel 11 Pro / Android 17 regression guard. With only the 61.29 dp safe-area
// inset, the input overlapped the custom Trime IME by 106 px. Adding the
// standard 56 dp header content makes the computed padding equal IME height.
test("Android offset reconciles route-local and screen coordinates", () => {
  const routeBottom = 741.65
  const keyboardScreenY = 507.67
  const keyboardHeight = 351.28
  const offset = keyboardVerticalOffset("android", 61.29)
  const padding = routeBottom - (keyboardScreenY - offset)

  assert.ok(Math.abs(padding - keyboardHeight) < 0.01, `expected ~${keyboardHeight}, got ${padding}`)
})
