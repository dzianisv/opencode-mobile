import { test } from "node:test"
import assert from "node:assert/strict"
import { wideTextSelection } from "./scroll-config.ts"

// wideTextSelection is the single place CodeBlock and DiffView decide whether
// their text is inline-selectable. See src/lib/scroll-config.ts for the gesture
// history behind the decision; wide-content-wrap.regression.test.ts is what proves
// both components actually call this helper rather than keeping a private copy.

test("android gets no inline selection in wide content", () => {
  assert.deepEqual(wideTextSelection("android"), { selectable: false })
})

test("ios keeps inline selection (no gesture conflict there)", () => {
  assert.deepEqual(wideTextSelection("ios"), { selectable: true })
})

test("every other platform falls back to non-selectable", () => {
  for (const platform of ["web", "windows", "macos", "unknown"]) {
    assert.deepEqual(wideTextSelection(platform), { selectable: false }, platform)
  }
})

test("the decision is only about selection", () => {
  // Wrapping replaced horizontal scrolling, so there is no scroll knob left to
  // freeze. `scrollEnabled` in this shape is what made the reverted 0.5.6 attempt
  // trade one bug for a worse one; it must not come back.
  assert.deepEqual(Object.keys(wideTextSelection("android")), ["selectable"])
  assert.deepEqual(Object.keys(wideTextSelection("ios")), ["selectable"])
})
