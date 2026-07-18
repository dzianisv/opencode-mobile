import { test } from "node:test"
import assert from "node:assert/strict"
import { computeDiff } from "./diff-compute.ts"

// GitHub bug: computeDiff split on a literal "\n", so a CRLF `before` diffed
// against an LF `after` treated every line as changed (each "line\r" !==
// "line") even when only one line actually changed. Normalizing both sides
// with /\r?\n/ before diffing fixes this.
test("computeDiff normalizes CRLF vs LF so only the actually-changed line diffs", () => {
  const before = "line1\r\nline2\r\nline3"
  const after = "line1\nCHANGED\nline3"

  const result = computeDiff(before, after)

  const removed = result.filter((l) => l.type === "remove")
  const added = result.filter((l) => l.type === "add")

  assert.equal(removed.length, 1, "expected exactly one removed line, not a whole-file diff")
  assert.equal(added.length, 1, "expected exactly one added line, not a whole-file diff")
  assert.equal(removed[0]?.text, "line2")
  assert.equal(added[0]?.text, "CHANGED")

  // Unchanged lines must still show up as context, proving they matched
  // across the CRLF/LF boundary instead of being treated as changed.
  const contextTexts = result.filter((l) => l.type === "context").map((l) => l.text)
  assert.ok(contextTexts.includes("line1"))
  assert.ok(contextTexts.includes("line3"))
})

// GitHub bug: the unbounded O(a.length * b.length) LCS table + backtrack is
// an OOM/ANR risk for large diffs. Above the size guard, computeDiff must
// skip the DP table and fall back to a truncated remove/add rendering
// instead of hanging or building a huge table.
test("computeDiff falls back to a truncated diff for huge inputs instead of hanging", () => {
  const lineCount = 2000
  const before = Array.from({ length: lineCount }, (_, i) => `before line ${i}`).join("\n")
  const after = Array.from({ length: lineCount }, (_, i) => `after line ${i}`).join("\n")

  const start = Date.now()
  const result = computeDiff(before, after)
  const elapsedMs = Date.now() - start

  // Generous bound: a correct truncated fallback is near-instant; a
  // regression back to the unbounded O(n*m) table over 2000x2000 lines
  // would take drastically longer than this.
  assert.ok(elapsedMs < 2000, `computeDiff took ${elapsedMs}ms, expected a fast truncated fallback`)

  // Truncated to at most 400 lines per side plus one synthetic marker line.
  assert.ok(result.length <= 801, `expected truncated output, got ${result.length} lines`)

  const last = result[result.length - 1]
  assert.equal(last?.type, "context")
  assert.match(last?.text ?? "", /diff too large to display in full/)
})
