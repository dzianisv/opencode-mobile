import { test } from "node:test"
import assert from "node:assert/strict"
import { statusFromPart, TOOL_STATUS } from "./status-labels.ts"
import type { Part } from "./sdk.ts"

// These labels are shown live while the agent works. A new tool type must degrade
// to a sensible "Running <tool>..." rather than a blank or wrong status.

const part = (over: Record<string, unknown>) => over as Part

test("reasoning parts show Thinking", () => {
  assert.equal(statusFromPart(part({ type: "reasoning" })), "Thinking...")
})

test("text parts show Writing", () => {
  assert.equal(statusFromPart(part({ type: "text" })), "Writing...")
})

test("known tools map to their friendly label", () => {
  assert.equal(statusFromPart(part({ type: "tool", tool: "grep" })), "Searching codebase...")
  assert.equal(statusFromPart(part({ type: "tool", tool: "bash" })), "Running command...")
  assert.equal(statusFromPart(part({ type: "tool", tool: "edit" })), "Making edits...")
})

test("read/list/grep/glob and edit/write/apply_patch share labels", () => {
  for (const t of ["list", "grep", "glob"]) {
    assert.equal(statusFromPart(part({ type: "tool", tool: t })), "Searching codebase...")
  }
  for (const t of ["edit", "write", "apply_patch"]) {
    assert.equal(statusFromPart(part({ type: "tool", tool: t })), "Making edits...")
  }
})

test("an unknown tool degrades to 'Running <tool>...'", () => {
  assert.equal(statusFromPart(part({ type: "tool", tool: "frobnicate" })), "Running frobnicate...")
})

test("a tool part with no tool name falls through to the generic label", () => {
  assert.equal(statusFromPart(part({ type: "tool" })), "Working...")
})

test("an unrecognized part type falls through to Working", () => {
  assert.equal(statusFromPart(part({ type: "file" })), "Working...")
})

test("every TOOL_STATUS entry is reachable via statusFromPart", () => {
  for (const [tool, label] of Object.entries(TOOL_STATUS)) {
    assert.equal(statusFromPart(part({ type: "tool", tool })), label)
  }
})
