import assert from "node:assert/strict"
import test from "node:test"

import {
  GATE_EFFICACY,
  ORG_MONTHLY_GATE,
  gatedShareFromPlay,
  BASELINE_WINDOW,
  resolveWindows,
  grade,
  orgOutlook,
} from "./noise-gate-report.mjs"

const MONTH_HOURS = 730
const BASELINE = 4.71 // measured pre-rollout rate for opencode-mobile, 2026-08-14 07:00-14:00Z

test("partial uptake is not gate failure — the mistake this script exists to prevent", () => {
  // A third of users upgraded. A naive read ("still ~2,200/mo, target is 1,500")
  // would call this a failure; with 33% uptake it is exactly on model.
  const g = grade({
    baselinePerHour: BASELINE,
    actualPerHour: BASELINE * (1 - 0.33 * GATE_EFFICACY),
    gatedShare: 0.33,
  })
  assert.equal(g.verdict, "ON_TRACK")
  assert.ok(g.actualPerMonth > 2000, "the raw number is still far above the 1,500/mo target")
  assert.ok(Math.abs(g.impliedEfficacy - GATE_EFFICACY) < 0.01)
})

test("full uptake at the replayed efficacy lands under the project target", () => {
  const g = grade({
    baselinePerHour: BASELINE,
    actualPerHour: BASELINE * (1 - GATE_EFFICACY),
    gatedShare: 1,
  })
  assert.equal(g.verdict, "ON_TRACK")
  assert.ok(g.meetsProjectTargetAtFullUptake)
  assert.ok(g.fullUptakeProjection < 150, `expected ~107/mo, got ${g.fullUptakeProjection}`)
})

test("a real regression still fails even when uptake is low enough to excuse a lot", () => {
  // 10% uptake excuses almost nothing; volume that did not move at all is fine,
  // but volume that GREW is a finding.
  const flat = grade({
    baselinePerHour: BASELINE,
    actualPerHour: BASELINE,
    gatedShare: 0.1,
  })
  assert.equal(flat.verdict, "ON_TRACK", "flat volume at 10% uptake is within tolerance")
  const worse = grade({
    baselinePerHour: BASELINE,
    actualPerHour: BASELINE * 1.6,
    gatedShare: 0.1,
  })
  assert.equal(worse.verdict, "OFF_TRACK")
  assert.match(worse.because, /new\s+noise class|not dropping/)
})

test("a gate that does nothing on device is caught once uptake is high", () => {
  const g = grade({
    baselinePerHour: BASELINE,
    actualPerHour: BASELINE,
    gatedShare: 0.9,
  })
  assert.equal(g.verdict, "OFF_TRACK")
  assert.equal(g.impliedEfficacy, 0, "0% of the drop happened, so implied efficacy is 0")
})

test("no before_send discards means the window measures nothing — refuse to grade it", () => {
  const g = grade({
    baselinePerHour: BASELINE,
    actualPerHour: 0.01,
    gatedShare: 0.9,
    gateLive: false,
  })
  assert.equal(g.verdict, "UNGRADED")
  assert.match(g.because, /before_send/)
})

test("zero uptake is ungraded, not a pass — a quiet weekend is not efficacy", () => {
  const g = grade({
    baselinePerHour: BASELINE,
    actualPerHour: 0.2,
    gatedShare: 0,
  })
  assert.equal(g.verdict, "UNGRADED")
  assert.equal(g.impliedEfficacy, null)
})

test("uptake share counts only builds that contain the gate", () => {
  const play = {
    versions: [
      { versionCode: 151, users: 30 },
      { versionCode: 150, users: 10 },
      { versionCode: 149, users: 50 },
      { versionCode: 146, users: 10 },
    ],
    window: { start: "2026-08-10", end: "2026-08-16" },
  }
  const s = gatedShareFromPlay(play)
  assert.equal(s.gated, 40)
  assert.equal(s.total, 100)
  assert.equal(s.share, 0.4)
})

test("no Play rows at all reads as 0% uptake, never as a divide-by-zero pass", () => {
  const s = gatedShareFromPlay({ versions: [] })
  assert.equal(s.share, 0)
  assert.equal(grade({ baselinePerHour: BASELINE, actualPerHour: 0, gatedShare: s.share }).verdict, "UNGRADED")
})

test("org outlook subtracts this project before projecting it forward", () => {
  // org 5.43/h of which mobile is 4.71/h -> other projects 0.72/h ~= 526/mo
  const g = grade({
    baselinePerHour: BASELINE,
    actualPerHour: BASELINE,
    gatedShare: 0.5,
  })
  const o = orgOutlook({
    orgPerHour: 5.43,
    projectPerHour: BASELINE,
    projectFullUptakePerMonth: g.fullUptakeProjection,
  })
  assert.ok(Math.abs(o.otherProjectsPerMonth - 0.72 * MONTH_HOURS) < 1)
  assert.ok(o.clearsOrgGate)
  assert.ok(o.projectedOrgPerMonthAtFullUptake < ORG_MONTHLY_GATE)
})

test("org gate can still be missed by other projects even with a perfect mobile gate", () => {
  const o = orgOutlook({
    orgPerHour: 6,
    projectPerHour: 0.5,
    projectFullUptakePerMonth: 100,
  })
  assert.equal(o.clearsOrgGate, false)
  assert.ok(o.headroom < 0)
})

test("a post window that straddles the rollout is UNGRADED, not a failing grade", () => {
  // The old default post window (now-7d..now) started before the 08-14 14:22Z
  // rollout on every run until 08-21, mixing devices that could not have run
  // the gate into the "after" rate — which biases the verdict toward failure.
  const g = grade({
    baselinePerHour: BASELINE,
    actualPerHour: BASELINE * 0.9,
    gatedShare: 0.4,
    postPhase: "mixed",
  })
  assert.equal(g.verdict, "UNGRADED")
  assert.match(g.because, /mixes gated and ungated/)
})

test("an unrecorded rollout is UNGRADED — never assumed to be post-gate", () => {
  const g = grade({
    baselinePerHour: BASELINE,
    actualPerHour: 0.1,
    gatedShare: 0.9,
    postPhase: "unknown",
  })
  assert.equal(g.verdict, "UNGRADED", "a great-looking number from an unattributable window is not a pass")
})

test("resolveWindows never starts the post window before the gate reached production", () => {
  const rollout = new Date("2026-08-14T14:22:00Z")
  // Run three days in: a naive 7d lookback would reach back to 08-10, four days
  // before any device could have had the gate.
  const w = resolveWindows({}, rollout, new Date("2026-08-17T00:00:00Z"))
  assert.equal(w.post, `${rollout.toISOString()}..now`)

  // Well after rollout, a 7d lookback is entirely post-gate and is preferred:
  // a longer window is what makes the other projects' background rate visible.
  const later = resolveWindows({}, rollout, new Date("2026-09-01T00:00:00Z"))
  assert.equal(later.post, "2026-08-25T00:00:00.000Z..now")
})

test("no rollout on record and no explicit post window is an error, not a default", () => {
  assert.throws(() => resolveWindows({}, null), /--post/)
})

test("the default baseline excludes the box-bot era, which would swamp the org outlook", () => {
  // A "7 days before the rollout" baseline spans the AGE-55 box-bot fix
  // (2026-08-14 06:19Z) and drags ~22k/mo of already-fixed volume into the
  // background estimate, so the org outlook MISSES for a dead reason.
  const w = resolveWindows({}, new Date("2026-08-14T14:22:00Z"), new Date("2026-08-17T00:00:00Z"))
  assert.equal(w.pre, BASELINE_WINDOW)
  const [start, end] = BASELINE_WINDOW.split("..").map((s) => new Date(s))
  assert.ok(start >= new Date("2026-08-14T06:19:00Z"), "baseline must start after the box-bot fix")
  assert.ok(end <= new Date("2026-08-14T14:22:00Z"), "baseline must end before the gate rollout")
})
