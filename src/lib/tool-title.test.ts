import assert from "node:assert/strict"
import { test } from "node:test"
import { taskToolTitle } from "./tool-title.ts"

test("native Task input wins over a swarm-shaped fallback", () => {
  assert.equal(
    taskToolTitle({
      subagent_type: "explore",
      description: "Trace the session pipeline",
      role: "Architect",
      prompt: "Ignore this fallback",
    }),
    "Task explore: Trace the session pipeline",
  )
})

test("swarm delegation uses its role and first non-empty prompt line", () => {
  assert.equal(
    taskToolTitle({ role: "Goomba - QA", prompt: "\n  Verify reconnect behavior   across clients\nIgnore later lines" }),
    "Task Goomba - QA: Verify reconnect behavior across clients",
  )
})

test("title is at most 60 visible characters including its ellipsis", () => {
  const title = taskToolTitle({ role: "Architecture", prompt: "a".repeat(100) })!
  assert.equal([...title].length, 60)
  assert.equal(title.endsWith("…"), true)
})

test("unknown input leaves the card fallback intact", () => {
  assert.equal(taskToolTitle({ prompt: "No role" }), undefined)
  assert.equal(taskToolTitle(undefined), undefined)
})
