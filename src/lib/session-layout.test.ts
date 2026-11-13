import { test } from "node:test"
import assert from "node:assert/strict"
import {
  COMPOSER_MAX_HEIGHT,
  COMPOSER_MIN_HEIGHT,
  QUESTION_BODY_SCROLL_PROPS,
  composerMaxHeight,
} from "./session-layout.ts"

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
