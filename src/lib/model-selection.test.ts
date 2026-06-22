import { test } from "node:test"
import assert from "node:assert/strict"
import { chooseModelSelection } from "./model-selection.ts"

const providers = [
  {
    id: "azure",
    models: [{ id: "gpt-5.4" }, { id: "gpt-5.2" }],
  },
]

test("keeps existing selection when still available", () => {
  const selected = chooseModelSelection({
    providers,
    defaults: { azure: "gpt-5.4" },
    existing: { providerID: "azure", modelID: "gpt-5.2" },
    agentModel: { providerID: "azure", modelID: "claude-sonnet-4-6" },
  })
  assert.deepEqual(selected, { providerID: "azure", modelID: "gpt-5.2" })
})

test("prefers provider default over unavailable agent model", () => {
  const selected = chooseModelSelection({
    providers,
    defaults: { azure: "gpt-5.4" },
    existing: null,
    agentModel: { providerID: "azure", modelID: "claude-sonnet-4-6" },
  })
  assert.deepEqual(selected, { providerID: "azure", modelID: "gpt-5.4" })
})

test("falls back to first connected provider model when default missing", () => {
  const selected = chooseModelSelection({
    providers,
    defaults: {},
    existing: null,
    agentModel: null,
  })
  assert.deepEqual(selected, { providerID: "azure", modelID: "gpt-5.4" })
})

test("returns null when no connected providers", () => {
  const selected = chooseModelSelection({
    providers: [],
    defaults: {},
    existing: null,
    agentModel: null,
  })
  assert.equal(selected, null)
})
