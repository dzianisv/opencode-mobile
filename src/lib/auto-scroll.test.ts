import { test } from "node:test"
import assert from "node:assert/strict"
import {
  AT_BOTTOM_THRESHOLD_PX,
  isAtBottom,
  shouldAutoScroll,
  shouldShowScrollButton,
  transcriptSignature,
} from "./auto-scroll.ts"

test("isAtBottom treats offset 0 (newest message, inverted list) as the bottom", () => {
  assert.equal(isAtBottom(0), true)
  assert.equal(isAtBottom(AT_BOTTOM_THRESHOLD_PX), true)
  assert.equal(isAtBottom(AT_BOTTOM_THRESHOLD_PX + 1), false)
})

test("isAtBottom tolerates negative overscroll from bounce", () => {
  assert.equal(isAtBottom(-40), true)
})

test("the scroll button appears exactly when auto-follow stops", () => {
  for (const offset of [0, 50, 200, 201, 900]) {
    assert.equal(shouldShowScrollButton(offset), !isAtBottom(offset), `offset ${offset}`)
  }
})

// The reported bug: new content arrived and the view did not follow it.
test("scrolls when new content arrives and the user is at the bottom", () => {
  assert.equal(
    shouldAutoScroll({ offsetY: 0, previousSignature: "3:100", currentSignature: "4:0" }),
    true,
  )
})

test("follows a streaming reply as it grows, not just on completion", () => {
  assert.equal(
    shouldAutoScroll({ offsetY: 10, previousSignature: "4:120", currentSignature: "4:260" }),
    true,
  )
})

// The usual bug in naive fixes: yanking a reader back down.
test("does NOT scroll when the user has scrolled up to read history", () => {
  assert.equal(
    shouldAutoScroll({ offsetY: 5000, previousSignature: "3:100", currentSignature: "4:0" }),
    false,
  )
})

test("does not scroll when content is unchanged, so it can't fight a gesture", () => {
  assert.equal(
    shouldAutoScroll({ offsetY: 0, previousSignature: "4:260", currentSignature: "4:260" }),
    false,
  )
})

test("scrolls on the very first content (no previous signature)", () => {
  assert.equal(
    shouldAutoScroll({ offsetY: 0, previousSignature: null, currentSignature: "1:0" }),
    true,
  )
})

test("a custom threshold is honoured", () => {
  assert.equal(
    shouldAutoScroll({ offsetY: 300, previousSignature: "1:0", currentSignature: "2:0", threshold: 500 }),
    true,
  )
  assert.equal(
    shouldAutoScroll({ offsetY: 300, previousSignature: "1:0", currentSignature: "2:0", threshold: 100 }),
    false,
  )
})

test("transcriptSignature changes on new messages and on streaming growth", () => {
  assert.notEqual(transcriptSignature(3, 100), transcriptSignature(4, 100))
  assert.notEqual(transcriptSignature(4, 100), transcriptSignature(4, 250))
  assert.equal(transcriptSignature(4, 100), transcriptSignature(4, 100))
})
