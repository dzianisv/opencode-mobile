import assert from "node:assert/strict"
import test from "node:test"
import {
  COMPOSER_MAX_HEIGHT,
  COMPOSER_MIN_HEIGHT,
  composerMaxHeight,
  IOS_KEYBOARD_VERTICAL_OFFSET,
  keyboardVerticalOffset,
  QUESTION_BODY_SCROLL_PROPS,
} from "./session-layout.ts"

test("keyboard offset uses the top inset only on Android", () => {
  assert.equal(keyboardVerticalOffset("ios", 10), IOS_KEYBOARD_VERTICAL_OFFSET)
  assert.equal(keyboardVerticalOffset("android", 80), 80)
  assert.equal(keyboardVerticalOffset("android", -1), 0)
})

test("composer height stays bounded while keeping two scaled lines usable", () => {
  assert.equal(composerMaxHeight("ios", 900, 400, 40), COMPOSER_MAX_HEIGHT)
  assert.equal(composerMaxHeight("android", 900, null, 40), COMPOSER_MAX_HEIGHT)
  assert.equal(composerMaxHeight("android", 900, 500, 40, 1), COMPOSER_MAX_HEIGHT)
  assert.equal(composerMaxHeight("android", 900, 280, 40, 1), COMPOSER_MIN_HEIGHT)
})

test("interactive form body keeps taps and nested scrolling available", () => {
  assert.deepEqual(QUESTION_BODY_SCROLL_PROPS, {
    keyboardShouldPersistTaps: "handled",
    nestedScrollEnabled: true,
    showsVerticalScrollIndicator: true,
  })
})
