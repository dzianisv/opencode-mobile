import { test } from "node:test"
import assert from "node:assert/strict"
import { joinChunks, SECURE_STORE_LIMIT, splitChunks } from "./secure-chunk.ts"

test("values within the Android SecureStore limit stay a single chunk", () => {
  const value = "a".repeat(SECURE_STORE_LIMIT)
  const parts = splitChunks(value)
  assert.deepEqual(parts, [value])
})

test("values over 2048 bytes split into chunks each within the limit", () => {
  const value = "a".repeat(5000)
  const parts = splitChunks(value)
  assert.ok(parts.length > 1)
  for (const part of parts) {
    assert.ok(new TextEncoder().encode(part).length <= SECURE_STORE_LIMIT)
  }
  assert.equal(joinChunks(parts), value)
})

test("multi-byte characters are not split mid-code-unit and round-trip", () => {
  const value = "é".repeat(2000)
  const parts = splitChunks(value)
  assert.ok(new TextEncoder().encode(value).length > SECURE_STORE_LIMIT)
  assert.ok(parts.length > 1)
  for (const part of parts) {
    assert.ok(new TextEncoder().encode(part).length <= SECURE_STORE_LIMIT)
  }
  assert.equal(joinChunks(parts), value)
})
