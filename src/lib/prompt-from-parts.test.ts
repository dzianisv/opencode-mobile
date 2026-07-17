import { test } from "node:test"
import assert from "node:assert/strict"
import { extractPromptFromParts } from "./prompt-from-parts.ts"
import type { Part } from "./sdk.ts"

test("extractPromptFromParts: joins multiple text parts with newlines", () => {
  const parts: Part[] = [
    { id: "p1", messageID: "m1", type: "text", text: "hello" },
    { id: "p2", messageID: "m1", type: "text", text: "world" },
  ]
  assert.deepEqual(extractPromptFromParts(parts), { text: "hello\nworld", files: [] })
})

test("extractPromptFromParts: collects file parts separately from text", () => {
  const filePart: Part = { id: "p2", messageID: "m1", type: "file", mime: "image/jpeg", url: "data:..." }
  const parts: Part[] = [{ id: "p1", messageID: "m1", type: "text", text: "check this" }, filePart]
  assert.deepEqual(extractPromptFromParts(parts), { text: "check this", files: [filePart] })
})

test("extractPromptFromParts: ignores non-text/file parts (tool, reasoning)", () => {
  const parts: Part[] = [
    { id: "p1", messageID: "m1", type: "reasoning", text: "thinking..." },
    { id: "p2", messageID: "m1", type: "tool", tool: "bash" },
    { id: "p3", messageID: "m1", type: "text", text: "final answer" },
  ]
  assert.deepEqual(extractPromptFromParts(parts), { text: "final answer", files: [] })
})

test("extractPromptFromParts: handles undefined/empty input", () => {
  assert.deepEqual(extractPromptFromParts(undefined), { text: "", files: [] })
  assert.deepEqual(extractPromptFromParts([]), { text: "", files: [] })
})
