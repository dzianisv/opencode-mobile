import { test } from "node:test"
import assert from "node:assert/strict"
import { extractCopyText, extractReasoningText, hasCopyableText } from "./message-copy-text.ts"
import type { Part } from "./sdk.ts"

test("extractCopyText: joins multiple text parts with newlines", () => {
  const parts: Part[] = [
    { id: "p1", messageID: "m1", type: "text", text: "hello" },
    { id: "p2", messageID: "m1", type: "text", text: "world" },
  ]
  assert.equal(extractCopyText(parts), "hello\nworld")
})

test("extractCopyText: preserves markdown source rather than rendered output", () => {
  const parts: Part[] = [{ id: "p1", messageID: "m1", type: "text", text: "# Title\n\n**bold** and `code`" }]
  assert.equal(extractCopyText(parts), "# Title\n\n**bold** and `code`")
})

test("extractCopyText: excludes reasoning and tool parts", () => {
  const parts: Part[] = [
    { id: "p1", messageID: "m1", type: "reasoning", text: "thinking..." },
    { id: "p2", messageID: "m1", type: "tool", tool: "bash" },
    { id: "p3", messageID: "m1", type: "text", text: "final answer" },
  ]
  assert.equal(extractCopyText(parts), "final answer")
})

test("extractCopyText: skips text parts with empty/missing text", () => {
  const parts: Part[] = [
    { id: "p1", messageID: "m1", type: "text", text: "" },
    { id: "p2", messageID: "m1", type: "text" },
    { id: "p3", messageID: "m1", type: "text", text: "kept" },
  ]
  assert.equal(extractCopyText(parts), "kept")
})

test("extractCopyText: tolerates undefined and empty parts", () => {
  assert.equal(extractCopyText(undefined), "")
  assert.equal(extractCopyText([]), "")
})

test("extractReasoningText: collects only reasoning parts", () => {
  const parts: Part[] = [
    { id: "p1", messageID: "m1", type: "reasoning", text: "step one" },
    { id: "p2", messageID: "m1", type: "reasoning", text: "step two" },
    { id: "p3", messageID: "m1", type: "text", text: "answer" },
  ]
  assert.equal(extractReasoningText(parts), "step one\nstep two")
})

test("hasCopyableText: false for tool-only, whitespace-only, empty and undefined", () => {
  assert.equal(hasCopyableText([{ id: "p1", messageID: "m1", type: "tool", tool: "bash" }]), false)
  assert.equal(hasCopyableText([{ id: "p1", messageID: "m1", type: "text", text: "   \n\t " }]), false)
  assert.equal(hasCopyableText([]), false)
  assert.equal(hasCopyableText(undefined), false)
})

test("hasCopyableText: true when any text part has content", () => {
  const parts: Part[] = [
    { id: "p1", messageID: "m1", type: "tool", tool: "bash" },
    { id: "p2", messageID: "m1", type: "text", text: "answer" },
  ]
  assert.equal(hasCopyableText(parts), true)
})
