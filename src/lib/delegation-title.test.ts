import { test } from "node:test"
import assert from "node:assert/strict"
import { delegationTitle, toolTitle } from "./delegation-title.ts"

test("state title is displayed verbatim before task heuristics", () => {
  assert.equal(
    toolTitle("task", " Server title ", { subagent_type: "engineer", description: "ignored" }),
    " Server title ",
  )
  assert.equal(toolTitle("task", "   ", { subagent_type: "engineer", description: "kept" }), "Task engineer: kept")
})

test("native task input wins over swarm fields", () => {
  assert.equal(
    delegationTitle({ subagent_type: "qa", description: "Run tests", role: "reviewer", prompt: "Review code" }),
    "Task qa: Run tests",
  )
})

test("native shape wins even when one native field is missing and stays authoritative", () => {
  assert.equal(
    delegationTitle({ subagent_type: "qa", role: "reviewer", prompt: "Do not use this" }),
    "Task qa: subagent",
  )
  const description = "A deliberately long native description ".repeat(3).trim()
  assert.equal(delegationTitle({ description, role: "reviewer", prompt: "Do not use this" }), `Task general: ${description}`)
})

test("swarm task uses the first non-boilerplate prompt line", () => {
  assert.equal(
    delegationTitle({
      role: "reviewer",
      prompt: "\nHIGHEST-PRIORITY HARD RULE: Ignore this\n\t Review   the\t diff  \nMore detail",
    }),
    "Task reviewer: Review the diff",
  )
})

test("swarm task filters exact optional instruction lines", () => {
  assert.equal(
    delegationTitle({
      role: "reviewer",
      instructions: "  Read the repository  \n\nDo not change files",
      prompt: "Read the repository\nDo not change files\nFind regressions",
    }),
    "Task reviewer: Find regressions",
  )
})

test("blank prompts keep the explicit role and fall back to delegation", () => {
  assert.equal(delegationTitle({ role: " reviewer ", prompt: " \n " }), "Task reviewer: delegation")
  assert.equal(
    delegationTitle({ role: "reviewer", prompt: "HIGHEST-PRIORITY HARD RULE: boilerplate only" }),
    "Task reviewer: delegation",
  )
})

test("incomplete task input never infers a role from prompt text", () => {
  assert.equal(delegationTitle({ prompt: "Review this" }), null)
  assert.equal(delegationTitle({}), null)
  assert.equal(toolTitle("task", undefined, {}), "task")
})

test("CRLF prompts are normalized and heuristic titles cap Unicode code points", () => {
  assert.equal(delegationTitle({ role: "qa", prompt: "\r\n  Run\t tests  \r\n" }), "Task qa: Run tests")
  const title = delegationTitle({ role: "x", prompt: "😀".repeat(80) })
  assert.equal(Array.from(title).length, 60)
  assert.equal(title, `${"Task x: "}${"😀".repeat(51)}…`)
})
