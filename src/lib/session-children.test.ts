// Unit tests for the three new pure helpers in session-children.ts (#187).
// Recorded exception (issue #187, comment 6857247200): AC-mapped cases for
// genuinely new behavior — selectChildren (AC1, AC3), deriveChildStatus
// (AC2, AC4), summarizeChildren (AC2). No mock-based tests. The session.created
// routing is covered via the existing integration/e2e surface, not here.
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  selectChildren,
  deriveChildStatus,
  summarizeChildren,
  type ChildSessionStatus,
} from "./session-children.ts"
import type { Session } from "./sdk.ts"

// Minimal Session factory — only the fields the helpers read.
function session(over: Partial<Session> & { id: string }): Session {
  return {
    id: over.id,
    slug: over.slug ?? over.id,
    projectID: "p",
    directory: "/dir",
    title: over.title ?? over.id,
    version: "1",
    time: over.time ?? { created: 0, updated: 0 },
    ...over,
  } as Session
}

const parent = session({ id: "parent", title: "Parent" })
const childA = session({ id: "child-a", parentID: "parent", time: { created: 10, updated: 30 } })
const childB = session({ id: "child-b", parentID: "parent", time: { created: 10, updated: 20 } })
const otherChild = session({ id: "child-other", parentID: "other-parent" })

const emptyStatus: Record<string, ChildSessionStatus> = {}
const emptyErrors: Record<string, string> = {}

// --- selectChildren (AC1: child list on the parent detail screen) ---

test("selectChildren (AC1): returns only the parent's own children", () => {
  const out = selectChildren([parent, childA, childB, otherChild], "parent")
  assert.deepEqual(
    out.map((s) => s.id),
    ["child-a", "child-b"],
  )
})

test("selectChildren (AC1): newest-first by time.updated", () => {
  const out = selectChildren([childB, childA], "parent")
  assert.equal(out[0].id, "child-a")
  assert.equal(out[1].id, "child-b")
})

test("selectChildren (AC1): a parent with no children yields the empty state, not an error", () => {
  assert.deepEqual(selectChildren([parent, otherChild], "parent"), [])
  assert.deepEqual(selectChildren([], "parent"), [])
})

// --- selectChildren (AC3: root list stays roots-only) ---

test("selectChildren (AC3): roots and other parents' children are never selected", () => {
  const out = selectChildren([parent, childA, otherChild], "other-parent")
  assert.deepEqual(
    out.map((s) => s.id),
    ["child-other"],
  )
  assert.ok(!out.some((s) => s.id === "parent"), "a root session is never a child row")
})

// --- deriveChildStatus (AC2: live status badge) ---

test("deriveChildStatus (AC2): busy is Running, retry is Running", () => {
  assert.equal(deriveChildStatus(childA, { "child-a": { type: "busy" } }, emptyErrors), "running")
  assert.equal(
    deriveChildStatus(childA, { "child-a": { type: "retry", attempt: 2, message: "retrying" } }, emptyErrors),
    "running",
  )
})

test("deriveChildStatus (AC2): time.idle present means Done for a cold-loaded child", () => {
  const finished = session({ id: "child-done", parentID: "parent", time: { created: 10, updated: 20, idle: 15 } })
  assert.equal(deriveChildStatus(finished, emptyStatus, emptyErrors), "done")
})

test("deriveChildStatus (AC2): an observed busy -> idle transition means Done", () => {
  // A sessionStatus entry exists ONLY when a status event arrived this app
  // session, so an idle entry is proof the transition was observed live.
  assert.equal(deriveChildStatus(childA, { "child-a": { type: "idle" } }, emptyErrors), "done")
})

test("deriveChildStatus (AC2): no status event and no time.idle is Idle, not Done", () => {
  // A child that finished before app start on a server that never sends
  // time.idle must not claim a completion it cannot prove.
  assert.equal(deriveChildStatus(childA, emptyStatus, emptyErrors), "idle")
})

// --- deriveChildStatus (AC4: child errors visible) ---

test("deriveChildStatus (AC4): a recorded session error means Failed", () => {
  assert.equal(deriveChildStatus(childA, emptyStatus, { "child-a": "boom" }), "failed")
})

test("deriveChildStatus (AC4): an error outranks a live status", () => {
  assert.equal(
    deriveChildStatus(childA, { "child-a": { type: "busy" } }, { "child-a": "boom" }),
    "failed",
  )
  assert.equal(
    deriveChildStatus(childA, { "child-a": { type: "idle" } }, { "child-a": "boom" }),
    "failed",
  )
})

test("deriveChildStatus (AC4): an error for another session does not fail this child", () => {
  assert.equal(deriveChildStatus(childA, emptyStatus, { "child-b": "boom" }), "idle")
})

// --- summarizeChildren (AC2: parent summary badge) ---

test("summarizeChildren (AC2): counts per state and worst is failed when any child failed", () => {
  const summary = summarizeChildren(
    [childA, childB],
    { "child-a": { type: "busy" } },
    { "child-b": "boom" },
  )
  assert.equal(summary.total, 2)
  assert.equal(summary.running, 1)
  assert.equal(summary.failed, 1)
  assert.equal(summary.done, 0)
  assert.equal(summary.idle, 0)
  assert.equal(summary.worst, "failed")
})

test("summarizeChildren (AC2): worst is running when any child runs and none failed", () => {
  const summary = summarizeChildren([childA, childB], { "child-a": { type: "busy" } }, emptyErrors)
  assert.equal(summary.worst, "running")
})

test("summarizeChildren (AC2): all done when every child is done", () => {
  const done = session({ id: "child-done", parentID: "parent", time: { created: 10, updated: 20, idle: 15 } })
  const summary = summarizeChildren([done], emptyStatus, emptyErrors)
  assert.equal(summary.total, 1)
  assert.equal(summary.done, 1)
  assert.equal(summary.worst, "done")
})

test("summarizeChildren (AC2): no children is the empty summary, worst none", () => {
  const summary = summarizeChildren([], emptyStatus, emptyErrors)
  assert.deepEqual(summary, { total: 0, running: 0, done: 0, failed: 0, idle: 0, worst: "none" })
})
