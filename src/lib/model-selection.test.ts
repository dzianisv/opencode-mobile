import { test } from "node:test"
import assert from "node:assert/strict"
import { chooseModelSelection } from "./model-selection.ts"

const providers = [
  {
    id: "azure",
    models: [{ id: "gpt-5.4" }, { id: "gpt-5.2" }, { id: "claude-sonnet-4-6" }],
  },
]

test("keeps existing selection when still available", () => {
  const selected = chooseModelSelection({
    providers,
    defaults: { azure: "gpt-5.4" },
    existing: { providerID: "azure", modelID: "gpt-5.2" },
    agentModel: null,
  })
  assert.deepEqual(selected, { providerID: "azure", modelID: "gpt-5.2" })
})

test("returns null when no existing selection (let server decide)", () => {
  // Even though defaults and providers exist, we return null to let
  // the server use its own configured model from opencode.json
  const selected = chooseModelSelection({
    providers,
    defaults: { azure: "claude-sonnet-4-6" },
    existing: null,
    agentModel: { providerID: "azure", modelID: "claude-sonnet-4-6" },
  })
  assert.equal(selected, null)
})

test("returns null when existing selection no longer available", () => {
  const selected = chooseModelSelection({
    providers,
    defaults: { azure: "gpt-5.4" },
    existing: { providerID: "azure", modelID: "nonexistent-model" },
    agentModel: null,
  })
  assert.equal(selected, null)
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
