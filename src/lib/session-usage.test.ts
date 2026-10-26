import assert from "node:assert/strict"
import { test } from "node:test"
import type { Message, Session } from "./sdk.ts"
import { summarizeSessionUsage } from "./session-usage.ts"

const session = (cost?: number): Session => ({
  id: "s1",
  slug: "",
  projectID: "p1",
  directory: "/project",
  title: "Usage test",
  version: "",
  time: { created: 1, updated: 2 },
  cost,
})

const assistant = (id: string, cost: number, input: number, output: number): Message => ({
  id,
  sessionID: "s1",
  role: "assistant",
  time: { created: Number(id.slice(1)) },
  cost,
  tokens: { input, output },
})

test("authoritative session cost is not added to historical message costs", () => {
  const stats = summarizeSessionUsage(session(56.01), [
    assistant("m1", 56, 30_000_000, 999_900),
    assistant("m2", 0.01, 80, 20),
  ])

  assert.equal(stats.cost, 56.01)
  assert.equal(stats.total, 100)
})

test("v1 sessions fall back to summing per-message costs exactly once", () => {
  const stats = summarizeSessionUsage(session(), [assistant("m1", 1.25, 10, 2), assistant("m2", 0.75, 20, 3)])
  assert.equal(stats.cost, 2)
  assert.equal(stats.total, 23)
})
