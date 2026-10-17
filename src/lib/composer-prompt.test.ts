import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import test from "node:test"
import { buildPromptParts, legacyPromptBody, v2PromptBody } from "./composer-prompt.ts"

const phrase = "Follow the spec 🙂\r\n```json\n{\"greeting\":\"héllo\",\"count\":100}\n```\ne\u0301 — preserve every line.\n"
function promptOfCodePoints(length: number) {
  const points = Array.from(phrase)
  return Array.from({ length }, (_, index) => points[index % points.length]).join("")
}

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

for (const size of [1_000, 5_000, 10_000, 25_000, 50_000, 100_000]) {
  test(`preserves ${size.toLocaleString()} code points in v1 and v2 request bodies`, () => {
    const original = promptOfCodePoints(size)
    const parts = buildPromptParts(original)

    const legacyWire = JSON.stringify(legacyPromptBody({ parts }))
    const legacyRoundTrip = JSON.parse(legacyWire).parts[0].text as string
    const v2Wire = JSON.stringify(v2PromptBody(parts))
    const v2RoundTrip = JSON.parse(v2Wire).text as string

    assert.equal(Array.from(original).length, size)
    assert.equal(Array.from(legacyRoundTrip).length, size)
    assert.equal(Array.from(v2RoundTrip).length, size)
    assert.equal(digest(legacyRoundTrip), digest(original))
    assert.equal(digest(v2RoundTrip), digest(original))
    assert.equal(legacyRoundTrip, original)
    assert.equal(v2RoundTrip, original)
  })
}

test("preserves whitespace-only content when it is intentionally included", () => {
  const parts = buildPromptParts(" \t\r\n ")
  assert.deepEqual(parts, [{ type: "text", text: " \t\r\n " }])
})

test("keeps pasted text and attachments separate in both protocol bodies", () => {
  const parts = buildPromptParts("exact text\n", [{ uri: "file:///photo.jpg", mime: "image/jpeg", filename: "photo.jpg" }])
  assert.deepEqual(legacyPromptBody({ parts }), { parts })
  assert.deepEqual(v2PromptBody(parts), {
    text: "exact text\n",
    files: [{ uri: "file:///photo.jpg", name: "photo.jpg" }],
  })
})
