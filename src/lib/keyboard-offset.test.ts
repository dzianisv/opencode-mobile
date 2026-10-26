import { test } from "node:test"
import assert from "node:assert/strict"
import { IOS_KEYBOARD_VERTICAL_OFFSET, keyboardVerticalOffset } from "./keyboard-offset.ts"

test("iOS keeps its existing empirical offset regardless of inset", () => {
  assert.equal(keyboardVerticalOffset("ios", 0), IOS_KEYBOARD_VERTICAL_OFFSET)
  assert.equal(keyboardVerticalOffset("ios", 48.857), IOS_KEYBOARD_VERTICAL_OFFSET)
})

test("Android offsets by the status-bar inset to reconcile window vs screen coords", () => {
  // Measured on an Android 12 emulator: this exact value closes the 48.857dp
  // shortfall that left the composer behind the keyboard.
  assert.equal(keyboardVerticalOffset("android", 48.857), 48.857)
})

test("Android with no status-bar inset needs no correction", () => {
  assert.equal(keyboardVerticalOffset("android", 0), 0)
})

test("a negative/bogus inset never pushes content down", () => {
  assert.equal(keyboardVerticalOffset("android", -20), 0)
})

// Regression guard for the arithmetic the offset exists to fix.
test("offset makes computed padding equal the real keyboard height", () => {
  const windowBottom = 748.857 // frame.y + frame.height, window coords
  const keyboardScreenY = 511.714 // screen coords
  const keyboardHeight = 286
  const insetTop = 48.857

  const withoutFix = windowBottom - keyboardScreenY
  assert.ok(withoutFix < keyboardHeight, "precondition: unfixed padding is short")

  const offset = keyboardVerticalOffset("android", insetTop)
  const withFix = windowBottom - (keyboardScreenY - offset)
  assert.ok(Math.abs(withFix - keyboardHeight) < 0.01, `expected ~${keyboardHeight}, got ${withFix}`)
})
