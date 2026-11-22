import assert from "node:assert/strict"
import test from "node:test"

import { buildUpdatedTrack } from "./play-rollout.mjs"

// Cases from the Stage 2 design comment on #296 (amended 2026-11-23 ~00:42
// WITA — versionCode ordering is NUMERIC). Case 6 (--dry-run rehearsal) is
// a LIVE alpha check, not a unit test: it must run against a real track
// holding a completed release, so it is deliberately NOT faked here —
// see the PR body for that step.

const release = (name, versionCodes, status, extra = {}) => ({
  name,
  versionCodes: versionCodes.map(String),
  status,
  ...extra,
})

const completedOf = (track) => (track.releases || []).filter((r) => r.status === "completed")

test("case 1: complete with an older completed release present drops it, leaving exactly one completed (the target)", () => {
  const track = {
    track: "production",
    releases: [
      release("v0.4.24", [164], "completed"),
      release("v0.4.25", [165], "inProgress", { userFraction: 0.5 }),
    ],
  }
  const { updatedTrack, dropped } = buildUpdatedTrack(track, "165", "complete")
  assert.equal(completedOf(updatedTrack).length, 1)
  assert.deepEqual(completedOf(updatedTrack)[0].versionCodes, ["165"])
  assert.equal(completedOf(updatedTrack)[0].userFraction, undefined)
  assert.ok(!updatedTrack.releases.some((r) => (r.versionCodes || []).includes("164")))
  assert.equal(dropped.length, 1)
  assert.equal(dropped[0].name, "v0.4.24")
  assert.deepEqual(dropped[0].versionCodes, ["164"])

  // Numeric ordering, not lexicographic: 99 < 165 numerically ("99" > "165"
  // as strings) — the older release must still be dropped, not fail closed.
  const old = {
    track: "production",
    releases: [
      release("v0.4.10", [99], "completed"),
      release("v0.4.25", [165], "inProgress", { userFraction: 0.5 }),
    ],
  }
  const out = buildUpdatedTrack(old, "165", "complete")
  assert.equal(completedOf(out.updatedTrack).length, 1)
  assert.deepEqual(completedOf(out.updatedTrack)[0].versionCodes, ["165"])
  assert.equal(out.dropped.length, 1)
  assert.equal(out.dropped[0].name, "v0.4.10")
})

test("case 2: complete with no pre-existing completed release is byte-identical to the old verbatim behaviour", () => {
  const track = {
    track: "production",
    releases: [release("v0.4.25", [165], "inProgress", { userFraction: 0.5 })],
  }
  const { updatedTrack, dropped } = buildUpdatedTrack(track, "165", "complete")
  // The old code: verbatim track except the target (status -> completed,
  // userFraction deleted). Rebuild that expectation independently.
  const expected = {
    track: "production",
    releases: [release("v0.4.25", [165], "completed")],
  }
  assert.equal(JSON.stringify(updatedTrack), JSON.stringify(expected))
  assert.deepEqual(dropped, [])
})

test("case 3: complete with a NEWER completed release present fails closed — nothing dropped, no payload", () => {
  const track = {
    track: "production",
    releases: [
      release("v0.4.26", [166], "completed"),
      release("v0.4.25", [165], "inProgress", { userFraction: 0.5 }),
    ],
  }
  assert.throws(() => buildUpdatedTrack(track, "165", "complete"), /166.*>= target|newer version was published/)
  // The input track is untouched (no payload was produced, nothing dropped).
  assert.equal(track.releases.length, 2)

  // Numeric ordering, not lexicographic: 1000 > 999 numerically ("1000" <
  // "999" as strings) — the newer release must fail closed, never be dropped.
  const wide = {
    track: "production",
    releases: [
      release("v0.5.0", [1000], "completed"),
      release("v0.4.25", [999], "inProgress", { userFraction: 0.5 }),
    ],
  }
  assert.throws(() => buildUpdatedTrack(wide, "999", "complete"), /1000.*>= target|newer version was published/)
  assert.equal(wide.releases.length, 2)
})

test("case 4: halt and resume with a completed release present leave the payload verbatim", () => {
  const track = {
    track: "production",
    releases: [
      release("v0.4.24", [164], "completed"),
      release("v0.4.25", [165], "inProgress", { userFraction: 0.5 }),
    ],
  }
  const halted = buildUpdatedTrack(track, "165", "halt")
  assert.deepEqual(halted.dropped, [])
  assert.equal(completedOf(halted.updatedTrack).length, 1)
  assert.deepEqual(completedOf(halted.updatedTrack)[0].versionCodes, ["164"])
  assert.equal(halted.updatedTrack.releases[1].status, "halted")
  assert.equal(halted.updatedTrack.releases[1].userFraction, 0.5)

  const resumed = buildUpdatedTrack(
    { track: "production", releases: [release("v0.4.24", [164], "completed"), release("v0.4.25", [165], "halted", { userFraction: 0.5 })] },
    "165",
    "resume",
  )
  assert.deepEqual(resumed.dropped, [])
  assert.equal(completedOf(resumed.updatedTrack).length, 1)
  assert.deepEqual(completedOf(resumed.updatedTrack)[0].versionCodes, ["164"])
  assert.equal(resumed.updatedTrack.releases[1].status, "inProgress")
})

test("case 5: complete from halted with an older completed release present drops it, same as case 1", () => {
  const track = {
    track: "production",
    releases: [
      release("v0.4.24", [164], "completed"),
      release("v0.4.25", [165], "halted", { userFraction: 0.5 }),
    ],
  }
  const { updatedTrack, dropped } = buildUpdatedTrack(track, "165", "complete")
  assert.equal(completedOf(updatedTrack).length, 1)
  assert.deepEqual(completedOf(updatedTrack)[0].versionCodes, ["165"])
  assert.equal(completedOf(updatedTrack)[0].userFraction, undefined)
  assert.equal(dropped.length, 1)
  assert.equal(dropped[0].name, "v0.4.24")
})

test("case 7: target already completed fails closed via the VALID_FROM gate — no payload", () => {
  const track = {
    track: "production",
    releases: [
      release("v0.4.24", [164], "completed"),
      release("v0.4.25", [165], "completed"),
    ],
  }
  assert.throws(() => buildUpdatedTrack(track, "165", "complete"), /status is "completed".*valid source: inProgress \| halted/)
  assert.equal(track.releases.length, 2)
})
