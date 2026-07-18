import { test } from "node:test"
import assert from "node:assert/strict"
import {
  buildDemoScript,
  buildDemoCompletionMessage,
  buildDemoDenialMessage,
  DEMO_SESSION_ID,
} from "./demo-script.ts"

test("buildDemoScript: returns one user message followed by one assistant message", () => {
  const { messages } = buildDemoScript(1_000_000)
  assert.equal(messages.length, 2)
  assert.equal(messages[0].role, "user")
  assert.equal(messages[1].role, "assistant")
  assert.ok(messages.every((m) => m.sessionID === DEMO_SESSION_ID))
})

test("buildDemoScript: user message time is before the assistant message's", () => {
  const { messages } = buildDemoScript(1_000_000)
  assert.ok(messages[0].time.created < messages[1].time.created)
})

test("buildDemoScript: assistant parts include reasoning, a search tool call, and an edit tool call with a diff", () => {
  const { messages, parts } = buildDemoScript(1_000_000)
  const assistantParts = parts[messages[1].id]
  assert.ok(assistantParts, "assistant message must have parts")

  const reasoning = assistantParts.filter((p) => p.type === "reasoning")
  assert.equal(reasoning.length, 1)

  const tools = assistantParts.filter((p) => p.type === "tool")
  assert.equal(tools.length, 2)
  assert.ok(tools.some((p) => p.tool === "grep"))

  const edit = tools.find((p) => p.tool === "edit")
  assert.ok(edit, "expected an edit tool call")
  const input = edit!.state?.input as { oldString?: string; newString?: string } | undefined
  assert.ok(typeof input?.oldString === "string" && input.oldString.length > 0)
  assert.ok(typeof input?.newString === "string" && input.newString.length > 0)
  assert.notEqual(input?.oldString, input?.newString)
})

test("buildDemoScript: every part references a real message id", () => {
  const { messages, parts } = buildDemoScript(1_000_000)
  const messageIDs = new Set(messages.map((m) => m.id))
  for (const [key, list] of Object.entries(parts)) {
    assert.ok(messageIDs.has(key))
    for (const part of list) assert.equal(part.messageID, key)
  }
})

test("buildDemoScript: permission has a non-empty type and pattern", () => {
  const { permission } = buildDemoScript(1_000_000)
  assert.ok(permission.id.length > 0)
  assert.ok(permission.permission.length > 0)
  assert.ok(permission.patterns.length > 0)
})

test("buildDemoScript: is deterministic for a fixed `now`", () => {
  const a = buildDemoScript(42)
  const b = buildDemoScript(42)
  assert.deepEqual(a, b)
})

test("buildDemoCompletionMessage and buildDemoDenialMessage produce distinct, non-empty text", () => {
  const completion = buildDemoCompletionMessage(1_000_000)
  const denial = buildDemoDenialMessage(1_000_000)
  assert.notEqual(completion.message.id, denial.message.id)
  assert.equal(completion.message.role, "assistant")
  assert.equal(denial.message.role, "assistant")
  assert.ok(completion.parts[0].text!.length > 0)
  assert.ok(denial.parts[0].text!.length > 0)
  assert.notEqual(completion.parts[0].text, denial.parts[0].text)
})
