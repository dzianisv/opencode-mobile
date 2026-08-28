import { test } from "node:test"
import assert from "node:assert/strict"
import {
  IOS_KEYBOARD_VERTICAL_OFFSET,
  keyboardPadding,
  keyboardVerticalOffset,
} from "./keyboard-offset.ts"

test("Android uses the IME-reported height as bottom padding", () => {
  assert.equal(keyboardPadding("android", 351.28), 351.28)
})

test("Android hide and invalid metrics produce zero padding", () => {
  assert.equal(keyboardPadding("android", 0), 0)
  assert.equal(keyboardPadding("android", -20), 0)
})

test("iOS does not receive Android's explicit keyboard padding", () => {
  assert.equal(keyboardPadding("ios", 351.28), 0)
})

test("iOS keeps its existing empirical offset", () => {
  assert.equal(keyboardVerticalOffset("ios", 0), IOS_KEYBOARD_VERTICAL_OFFSET)
  assert.equal(keyboardVerticalOffset("ios", 61.29), IOS_KEYBOARD_VERTICAL_OFFSET)
})

test("Android does not use KeyboardAvoidingView's vertical offset", () => {
  assert.equal(keyboardVerticalOffset("android", 61.293), 0)
})

test("Pixel 11 Pro measurement maps directly to the required padding", () => {
  const keyboardHeight = 1168 / (1280 / 393)
  assert.equal(keyboardPadding("android", keyboardHeight), keyboardHeight)
})
