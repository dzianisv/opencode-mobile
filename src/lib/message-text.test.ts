import assert from "node:assert/strict"
import test from "node:test"

import { hasSelectableContent, messagePartsToSelectableText } from "./message-text.ts"

import type { Part } from "./sdk.ts"

test("flattens text, reasoning and tool parts in order", () => {
  const parts: Part[] = [
    { id: "t1", messageID: "m1", type: "text", text: "Working on it." },
    { id: "r1", messageID: "m1", type: "reasoning", text: "Need to read the file first." },
    {
      id: "tool1",
      messageID: "m1",
      type: "tool",
      tool: "read",
      callID: "call_1",
      state: { status: "completed", input: { path: "a.ts" }, output: "file contents" },
    },
    { id: "t2", messageID: "m1", type: "text", text: "Done." },
  ]

  const text = messagePartsToSelectableText(parts)
  assert.equal(
    text,
    [
      "Working on it.",
      "Thinking:\nNeed to read the file first.",
      'Tool: read\nInput:\n{\n  "path": "a.ts"\n}\nResult:\nfile contents',
      "Done.",
    ].join("\n\n"),
  )
})

test("tool errors render as Error blocks", () => {
  const parts: Part[] = [
    {
      id: "tool1",
      messageID: "m1",
      type: "tool",
      tool: "bash",
      state: { status: "error", input: { command: "exit 1" }, error: { message: "exit code 1" } },
    },
  ]

  const text = messagePartsToSelectableText(parts)
  assert.equal(text, "Tool: bash\nInput:\n{\n  \"command\": \"exit 1\"\n}\nError:\nexit code 1")
})

test("custom labels are used (i18n)", () => {
  const parts: Part[] = [{ id: "r1", messageID: "m1", type: "reasoning", text: "hmm" }]
  const text = messagePartsToSelectableText(parts, {
    thinking: "思考过程",
    tool: "工具",
    input: "输入",
    result: "结果",
    error: "错误",
    file: "文件",
  })
  assert.equal(text, "思考过程:\nhmm")
})

test("empty and non-content parts produce empty text", () => {
  const parts: Part[] = [
    { id: "s1", messageID: "m1", type: "step-start" },
    { id: "t1", messageID: "m1", type: "text", text: "" },
  ]
  assert.equal(messagePartsToSelectableText(parts), "")
  assert.equal(hasSelectableContent(parts), false)
})

test("hasSelectableContent detects reasoning-only and tool-only messages", () => {
  assert.equal(hasSelectableContent([{ id: "r", messageID: "m", type: "reasoning", text: "x" }]), true)
  assert.equal(hasSelectableContent([{ id: "t", messageID: "m", type: "tool", tool: "read" }]), true)
  assert.equal(hasSelectableContent([{ id: "f", messageID: "m", type: "file", filename: "shot.png" }]), true)
})
