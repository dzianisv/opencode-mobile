import assert from "node:assert/strict"
import { test } from "node:test"
import { formatMessageTimestamp } from "./message-timestamp.ts"

test("formats message timestamps with date and time in the requested locale", () => {
  const timestamp = Date.UTC(2026, 10, 8, 20, 5)
  const expected = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(timestamp),
  )

  assert.equal(formatMessageTimestamp(timestamp, "en-US"), expected)
  assert.notEqual(formatMessageTimestamp(timestamp, "ru"), formatMessageTimestamp(timestamp, "zh-Hans"))
})

test("does not render missing or invalid message timestamps", () => {
  assert.equal(formatMessageTimestamp(0), undefined)
  assert.equal(formatMessageTimestamp(Number.NaN), undefined)
  assert.equal(formatMessageTimestamp(Number.POSITIVE_INFINITY), undefined)
})
