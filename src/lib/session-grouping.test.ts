import { test } from "node:test"
import assert from "node:assert/strict"
import { groupByDirectory } from "./session-grouping.ts"

test("groupByDirectory: buckets items by directory, preserving item order within a bucket", () => {
  const items = [
    { id: "1", directory: "/a" },
    { id: "2", directory: "/b" },
    { id: "3", directory: "/a" },
  ]
  const groups = groupByDirectory(items)
  assert.equal(groups.length, 2)
  assert.equal(groups[0].directory, "/a")
  assert.deepEqual(groups[0].items.map((i) => i.id), ["1", "3"])
  assert.equal(groups[1].directory, "/b")
  assert.deepEqual(groups[1].items.map((i) => i.id), ["2"])
})

test("groupByDirectory: orders groups by first-seen directory, not alphabetically", () => {
  const items = [
    { id: "1", directory: "/z" },
    { id: "2", directory: "/a" },
  ]
  const groups = groupByDirectory(items)
  assert.deepEqual(
    groups.map((g) => g.directory),
    ["/z", "/a"],
  )
})

test("groupByDirectory: empty input returns no groups", () => {
  assert.deepEqual(groupByDirectory([]), [])
})

test("groupByDirectory: single directory yields a single group with all items", () => {
  const items = [
    { id: "1", directory: "/a" },
    { id: "2", directory: "/a" },
  ]
  const groups = groupByDirectory(items)
  assert.equal(groups.length, 1)
  assert.equal(groups[0].items.length, 2)
})
