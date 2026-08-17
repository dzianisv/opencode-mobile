import { test } from "node:test"
import assert from "node:assert/strict"
import {
  CLAIM_MIN_DX,
  DOMINANCE_RATIO,
  dragOffset,
  flingTarget,
  isHorizontalIntent,
} from "./horizontal-intent.ts"

// --- claiming ---

test("a clean sideways drag claims", () => {
  assert.equal(isHorizontalIntent(20, 0), true)
  assert.equal(isHorizontalIntent(-20, 2), true)
})

// The reported annoyance: only near-perfect axis swipes worked. A diagonal
// that is merely horizontal-dominant must claim too.
test("a sloppy diagonal still claims when horizontal dominates", () => {
  assert.equal(isHorizontalIntent(20, 18), true) // ~42° off axis
  assert.equal(isHorizontalIntent(-15, 12), true)
})

test("a vertical-dominant drag is left to the transcript", () => {
  assert.equal(isHorizontalIntent(5, 30), false)
  assert.equal(isHorizontalIntent(10, 20), false)
})

test("jitter below the minimum never claims", () => {
  assert.equal(isHorizontalIntent(CLAIM_MIN_DX - 1, 0), false)
  assert.equal(isHorizontalIntent(0, 0), false)
})

test("the dominance ratio is forgiving, not absolute", () => {
  // dx exactly at the ratio boundary of dy fails; just above passes.
  const dy = 20
  const boundary = dy * DOMINANCE_RATIO
  assert.equal(isHorizontalIntent(boundary, dy), false)
  assert.equal(isHorizontalIntent(boundary + 0.1, dy), true)
})

// --- drag ---

test("dragging right moves content left and clamps at zero", () => {
  assert.equal(dragOffset(50, 30, 500), 20)
  assert.equal(dragOffset(50, 200, 500), 0)
})

test("dragging left clamps at the end of content", () => {
  assert.equal(dragOffset(450, -30, 500), 480)
  assert.equal(dragOffset(450, -200, 500), 500)
})

// --- fling ---

test("a flick projects past the finger, clamped to the edges", () => {
  const target = flingTarget(100, -1, 500) // slow leftward flick
  assert.ok(target > 100 && target <= 500)
  assert.equal(flingTarget(100, -100, 500), 500)
  assert.equal(flingTarget(100, 100, 500), 0)
})

test("zero velocity stays put", () => {
  assert.equal(flingTarget(120, 0, 500), 120)
})
