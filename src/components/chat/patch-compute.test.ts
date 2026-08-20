import assert from "node:assert/strict"
import test from "node:test"
import { computePatchDiff, patchTextFromInput } from "./patch-compute.ts"

test("patchTextFromInput reads the apply_patch patchText field", () => {
  assert.equal(patchTextFromInput({ patchText: "*** Begin Patch" }), "*** Begin Patch")
  assert.equal(patchTextFromInput({ patch: "legacy" }), "legacy")
})

test("computePatchDiff parses OpenCode patches", () => {
  const result = computePatchDiff("*** Update File: app.ts\n@@\n const old = 1\n-const removed = true\n+const added = true\n*** End Patch")

  assert.deepEqual(result, [
    { type: "context", text: "*** Update File: app.ts" },
    { type: "context", text: "@@" },
    { type: "context", text: "const old = 1" },
    { type: "remove", text: "const removed = true" },
    { type: "add", text: "const added = true" },
  ])
})

test("computePatchDiff parses unified diff headers", () => {
  const result = computePatchDiff("--- a/app.ts\n+++ b/app.ts\n@@ -1 +1 @@\n-old\n+new")

  assert.deepEqual(result, [
    { type: "context", text: "--- a/app.ts" },
    { type: "context", text: "+++ b/app.ts" },
    { type: "context", text: "@@ -1 +1 @@" },
    { type: "remove", text: "old" },
    { type: "add", text: "new" },
  ])
})

test("computePatchDiff caps very long patches", () => {
  const patch = `*** Update File: large.ts\n@@\n${Array.from({ length: 700 }, (_, index) => `+line ${index}`).join("\n")}`
  const result = computePatchDiff(patch)

  assert.equal(result.length, 601)
  assert.match(result.at(-1)?.text ?? "", /diff too large to display in full/)
})
