import { test } from "node:test"
import assert from "node:assert/strict"
import { messageUsage } from "./message-usage.ts"

test("zero-only usage is hidden", () => {
  assert.equal(messageUsage({ input: 0, output: 0 }, 0), null)
  assert.equal(messageUsage({ input: 0, output: 0 }, undefined), null)
})

test("positive token or cost usage is retained", () => {
  assert.equal(messageUsage({ input: 3, output: 4 }, 0), "7 tokens")
  assert.equal(messageUsage({ input: 0, output: 0 }, 0.0123), "$0.0123")
  assert.equal(messageUsage({ input: 3, output: 4 }, 0.0123), "7 tokens · $0.0123")
})
