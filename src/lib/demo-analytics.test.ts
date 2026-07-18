import { test } from "node:test"
import assert from "node:assert/strict"
import {
  DEMO_STEP_PERMISSION_REPLIED,
  demoStepAdvancedProps,
  demoCompletedOutcome,
  demoExitedToConnectProps,
} from "./demo-analytics.ts"

test("demoStepAdvancedProps: includes the step index/name constant and the reply", () => {
  const props = demoStepAdvancedProps("once")
  assert.equal(props.step_index, DEMO_STEP_PERMISSION_REPLIED.index)
  assert.equal(props.step_name, DEMO_STEP_PERMISSION_REPLIED.name)
  assert.equal(props.reply, "once")
})

test("demoStepAdvancedProps: reply is passed through verbatim for each variant", () => {
  assert.equal(demoStepAdvancedProps("always").reply, "always")
  assert.equal(demoStepAdvancedProps("reject").reply, "reject")
})

test("demoStepAdvancedProps: properties are flat primitives only (no nested objects)", () => {
  const props = demoStepAdvancedProps("once")
  for (const value of Object.values(props)) {
    assert.ok(["string", "number", "boolean"].includes(typeof value) || value === null)
  }
})

test("demoCompletedOutcome: reject maps to denied", () => {
  assert.equal(demoCompletedOutcome("reject"), "denied")
})

test("demoCompletedOutcome: once and always map to completed", () => {
  assert.equal(demoCompletedOutcome("once"), "completed")
  assert.equal(demoCompletedOutcome("always"), "completed")
})

test("demoExitedToConnectProps: reflects whether the demo reached completion first", () => {
  assert.deepEqual(demoExitedToConnectProps(true), { reached_completion: true })
  assert.deepEqual(demoExitedToConnectProps(false), { reached_completion: false })
})
