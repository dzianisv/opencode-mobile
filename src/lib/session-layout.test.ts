import { test } from "node:test"
import assert from "node:assert/strict"
import {
  COMPOSER_MAX_HEIGHT,
  COMPOSER_MIN_HEIGHT,
  IOS_KEYBOARD_VERTICAL_OFFSET,
  QUESTION_BODY_SCROLL_PROPS,
  composerMaxHeight,
  keyboardVerticalOffset,
} from "./session-layout.ts"

test("Android keyboard offset reconciles edge-to-edge screen and window coordinates", () => {
  assert.equal(keyboardVerticalOffset("android", 48.857), 48.857)
  assert.equal(keyboardVerticalOffset("android", 0), 0)
  assert.equal(keyboardVerticalOffset("android", -20), 0)
})

test("iOS retains its established keyboard offset", () => {
  assert.equal(keyboardVerticalOffset("ios", 0), IOS_KEYBOARD_VERTICAL_OFFSET)
  assert.equal(keyboardVerticalOffset("ios", 48.857), IOS_KEYBOARD_VERTICAL_OFFSET)
})

test("composer keeps its established cap while the Android IME is hidden", () => {
  assert.equal(composerMaxHeight("android", 768, null, 39), COMPOSER_MAX_HEIGHT)
  assert.equal(composerMaxHeight("ios", 768, 377, 39), COMPOSER_MAX_HEIGHT)
})

test("composer keeps multiple lines visible on compact Android IME geometry", () => {
  assert.equal(composerMaxHeight("android", 768, 377, 39), COMPOSER_MIN_HEIGHT)
  assert.equal(composerMaxHeight("android", 480, 250, 24), COMPOSER_MIN_HEIGHT)
})

test("composer preserves multiple draft lines at Android accessibility text scaling", () => {
  assert.equal(composerMaxHeight("android", 768, 377, 39, 1.5), COMPOSER_MIN_HEIGHT)
  assert.equal(composerMaxHeight("android", 768, 377, 39, 2), 100)
})

test("composer responds to keyboard resize without exceeding the established cap", () => {
  assert.equal(composerMaxHeight("android", 900, 700, 24), COMPOSER_MAX_HEIGHT)
  assert.equal(composerMaxHeight("android", 700, 380, 24), 106)
})

test("question body uses the only vertical overflow owner and retains navigation taps", () => {
  assert.deepEqual(QUESTION_BODY_SCROLL_PROPS, {
    keyboardShouldPersistTaps: "handled",
    nestedScrollEnabled: true,
    showsVerticalScrollIndicator: true,
  })
})
