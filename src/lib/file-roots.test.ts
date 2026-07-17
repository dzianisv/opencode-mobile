import { test } from "node:test"
import assert from "node:assert/strict"
import { normalizeRoots } from "./file-roots.ts"

test("normalizeRoots: passes through well-formed entries", () => {
  const result = normalizeRoots([
    { path: "/", label: "/" },
    { path: "/home/user", label: "Home" },
  ])
  assert.deepEqual(result, [
    { path: "/", label: "/" },
    { path: "/home/user", label: "Home" },
  ])
})

test("normalizeRoots: null input (unsupported server) normalizes to empty", () => {
  assert.deepEqual(normalizeRoots(null), [])
})

test("normalizeRoots: undefined input normalizes to empty", () => {
  assert.deepEqual(normalizeRoots(undefined), [])
})

test("normalizeRoots: non-array input normalizes to empty", () => {
  assert.deepEqual(normalizeRoots("not an array"), [])
  assert.deepEqual(normalizeRoots({ path: "/" }), [])
})

test("normalizeRoots: drops entries missing a path", () => {
  const result = normalizeRoots([{ label: "No path" }, { path: "", label: "Empty path" }, { path: "/valid" }])
  assert.deepEqual(result, [{ path: "/valid", label: "/valid" }])
})

test("normalizeRoots: drops entries where path is not a string", () => {
  const result = normalizeRoots([{ path: 42, label: "Bad type" }, { path: "/ok", label: "ok" }])
  assert.deepEqual(result, [{ path: "/ok", label: "ok" }])
})

test("normalizeRoots: falls back to path when label is missing or blank", () => {
  const result = normalizeRoots([{ path: "/mnt/data" }, { path: "/mnt/other", label: "   " }])
  assert.deepEqual(result, [
    { path: "/mnt/data", label: "/mnt/data" },
    { path: "/mnt/other", label: "/mnt/other" },
  ])
})

test("normalizeRoots: dedupes by path, keeping the first occurrence", () => {
  const result = normalizeRoots([
    { path: "/mnt/data", label: "First" },
    { path: "/mnt/data", label: "Second" },
  ])
  assert.deepEqual(result, [{ path: "/mnt/data", label: "First" }])
})

test("normalizeRoots: ignores non-object items in the array", () => {
  const result = normalizeRoots([null, "string", 42, { path: "/ok" }])
  assert.deepEqual(result, [{ path: "/ok", label: "/ok" }])
})
