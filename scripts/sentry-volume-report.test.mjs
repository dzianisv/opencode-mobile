import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { GATE_FIRST_VERSION_CODE, classifyWindow, gateRollout, parseRolloutHistory } from "./sentry-volume-report.mjs"

const win = (start, end) => ({
  start: new Date(start),
  end: new Date(end),
  hours: (new Date(end) - new Date(start)) / 3_600_000,
})

const ROLLOUT = new Date("2026-08-14T14:22:00Z")

test("the real docs/playstore.md yields the gate's production rollout instant", () => {
  const rows = parseRolloutHistory(readFileSync(new URL("../docs/playstore.md", import.meta.url), "utf8"))
  assert.ok(rows.length >= 2, "release history table should parse")
  const gate = gateRollout(rows)
  assert.ok(gate, "a production release >= the gate versionCode must be recorded")
  assert.ok(gate.versionCode >= GATE_FIRST_VERSION_CODE)
  assert.equal(gate.at.toISOString(), ROLLOUT.toISOString())
  assert.equal(gate.version, "v0.4.14")
})

test("production versionCode is read, not the internal tag-push one", () => {
  // The bold production code (151) is what reached users; 150 only ever went to
  // the internal track. Reading column 1 would date the rollout to the wrong row.
  const rows = parseRolloutHistory(`
| Version | Internal versionCode | Production versionCode | Production rollout (UTC) | Notes |
|---|---|---|---|---|
| v0.4.14 | 150 (run 50) | **151** (run 51) | 2026-08-14 14:22 | gate |
`)
  assert.deepEqual(
    rows.map((r) => [r.version, r.versionCode]),
    [["v0.4.14", 151]],
  )
})

test("a build that never reached production is not a rollout", () => {
  // No production versionCode and no rollout instant -> it reached no device.
  const rows = parseRolloutHistory(`
| v0.4.15 | 152 (run 52) | — | — | internal only |
| v0.4.14 | 150 (run 50) | **151** (run 51) | 2026-08-14 14:22 | gate |
`)
  assert.equal(rows.length, 1)
  assert.equal(gateRollout(rows).version, "v0.4.14")
})

test("a later gated release does not re-start the measurement window", () => {
  const rows = parseRolloutHistory(`
| v0.4.15 | 152 (run 52) | **153** (run 53) | 2026-08-20 09:00 | later |
| v0.4.14 | 150 (run 50) | **151** (run 51) | 2026-08-14 14:22 | gate |
`)
  assert.equal(gateRollout(rows).at.toISOString(), ROLLOUT.toISOString())
})

test("the mistake this guard exists for: a 'post' window that predates the rollout", () => {
  // Actually run on 2026-08-14: --window post=07:00Z..now, rollout was 14:22Z.
  // 84% of it was pre-gate traffic, and it reported opencode-mobile *rising*.
  const c = classifyWindow(win("2026-08-14T07:00:00Z", "2026-08-14T15:41:00Z"), ROLLOUT)
  assert.equal(c.phase, "mixed")
  assert.ok(c.gatedFraction < 0.2, `only ${(c.gatedFraction * 100).toFixed(0)}% is post-gate`)
})

test("clean pre/post windows classify, and the boundary belongs to neither side twice", () => {
  assert.equal(classifyWindow(win("2026-08-13T14:22:00Z", "2026-08-14T14:22:00Z"), ROLLOUT).phase, "pre")
  const post = classifyWindow(win("2026-08-14T14:22:00Z", "2026-08-15T14:22:00Z"), ROLLOUT)
  assert.equal(post.phase, "post")
  assert.equal(post.gatedFraction, 1)
  assert.equal(post.postHours, 24)
})

test("a fresh post window reports its age, so before_send == 0 is not read as failure", () => {
  const c = classifyWindow(win("2026-08-14T14:22:00Z", "2026-08-14T15:43:00Z"), ROLLOUT)
  assert.equal(c.phase, "post")
  assert.ok(c.postHours < 24, "under a day of uptake cannot certify anything")
})

test("no known rollout is 'unknown', never silently 'post'", () => {
  // Absence of the record must not be reported as a clean post-gate reading.
  assert.equal(classifyWindow(win("2026-08-14T14:22:00Z", "2026-08-15T14:22:00Z"), null).phase, "unknown")
  assert.equal(gateRollout(parseRolloutHistory("no table here")), null)
  assert.equal(gateRollout(parseRolloutHistory("| v0.4.13 | 148 | **149** | 2026-08-14 09:20 | pre-gate |")), null)
})
