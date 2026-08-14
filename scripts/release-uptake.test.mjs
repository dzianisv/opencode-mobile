import assert from "node:assert/strict"
import test from "node:test"

import {
  compareVersions,
  dailySeries,
  gatedShareFromSessions,
  projectShare,
  staleLeader,
  versionOf,
} from "./release-uptake.mjs"

/** Shape of a Sentry sessions response, groupBy=release. */
function sessions(rows, intervals = []) {
  return {
    intervals,
    groups: rows.map(({ release, users, sessions: s, series }) => ({
      by: { release },
      totals: { "count_unique(user)": users, "sum(session)": s ?? users },
      series: series ? { "count_unique(user)": series } : undefined,
    })),
  }
}

test("0.4.9 sorts BELOW 0.4.10 — string compare would put the gate on the wrong side", () => {
  assert.equal(compareVersions("0.4.9", "0.4.10"), -1)
  assert.equal(compareVersions("0.4.10", "0.4.9"), 1)
  assert.equal(compareVersions("0.4.14", "0.4.14"), 0)
  assert.equal(compareVersions("1.0", "0.99.99"), 1)
  // A shorter version is not implicitly newer: 0.4 == 0.4.0.
  assert.equal(compareVersions("0.4", "0.4.0"), 0)
})

test("release names are parsed off the @, and junk is not silently coerced", () => {
  assert.equal(versionOf("opencode-mobile@0.4.14"), "0.4.14")
  assert.equal(versionOf("0.4.14"), "0.4.14")
  assert.equal(versionOf("opencode-mobile@nightly"), null)
  assert.equal(versionOf(null), null)
  assert.equal(versionOf(""), null)
})

test("the real 2026-08-14 reading: gate at 0.7% while one stale build holds 78%", () => {
  // Live numbers, 7d to 2026-08-14 (Sentry release health, opencode-mobile).
  const s = gatedShareFromSessions(
    sessions([
      { release: "opencode-mobile@0.4.10", users: 801, sessions: 8175 },
      { release: "opencode-mobile@0.4.12", users: 161, sessions: 2369 },
      { release: "opencode-mobile@0.4.13", users: 30, sessions: 139 },
      { release: "opencode-mobile@0.4.7", users: 6, sessions: 115 },
      { release: "opencode-mobile@0.4.4", users: 15, sessions: 38 },
      { release: "opencode-mobile@0.4.14", users: 7, sessions: 17 },
      { release: "opencode-mobile@0.4.3", users: 1, sessions: 2 },
    ]),
    "0.4.14",
  )
  assert.equal(s.users.gated, 7)
  assert.equal(s.users.total, 1021)
  assert.ok(s.share < 0.01, `expected sub-1% gated share, got ${s.share}`)

  const stale = staleLeader(s)
  assert.equal(stale.version, "0.4.10")
  assert.ok(stale.share > 0.75)
  // The number that actually decides this ticket: even a perfect gate cannot
  // remove more than ~22% of the volume while that cohort is ungated.
  assert.ok(1 - stale.share < 0.25)
})

test("unparseable releases stay in the denominator — dropping them inflates uptake", () => {
  const s = gatedShareFromSessions(
    sessions([
      { release: "opencode-mobile@0.4.14", users: 10 },
      { release: "opencode-mobile@nightly", users: 90 },
    ]),
    "0.4.14",
  )
  assert.equal(s.unknownUsers, 90)
  assert.equal(s.users.total, 100)
  assert.equal(s.share, 0.1) // not 1.0
})

test("an empty window is null, never 0 — 'no data' must not grade as 'nobody upgraded'", () => {
  const s = gatedShareFromSessions(sessions([]), "0.4.14")
  assert.equal(s.share, null)
  assert.equal(s.shareBySession, null)
  assert.equal(staleLeader(s), null)
})

test("user share and session share are both reported when they disagree", () => {
  // One gated power user with many sessions, many ungated light users.
  const s = gatedShareFromSessions(
    sessions([
      { release: "opencode-mobile@0.4.14", users: 1, sessions: 900 },
      { release: "opencode-mobile@0.4.10", users: 99, sessions: 100 },
    ]),
    "0.4.14",
  )
  assert.ok(s.share < 0.02, "user basis says the gate has barely landed")
  assert.ok(s.shareBySession > 0.85, "session basis says most activity is gated")
  // Quota is consumed per event, so a divergence this large must be visible
  // rather than resolved silently by whichever basis the caller picked.
  assert.ok(s.shareBySession - s.share > 0.8)
})

test("daily series tracks the share per interval, not just the total", () => {
  const s = dailySeries(
    sessions(
      [
        { release: "opencode-mobile@0.4.14", users: 3, series: [0, 1, 3] },
        { release: "opencode-mobile@0.4.10", users: 97, series: [100, 99, 97] },
      ],
      ["2026-08-12T00:00:00Z", "2026-08-13T00:00:00Z", "2026-08-14T00:00:00Z"],
    ),
    "0.4.14",
  )
  assert.equal(s.length, 3)
  assert.equal(s[0].share, 0)
  assert.ok(Math.abs(s[2].share - 3 / 100) < 1e-9)
  assert.equal(s[2].date, "2026-08-14")
})

test("projection refuses a horizon it cannot defend", () => {
  const series = [
    { date: "2026-08-13", share: 0.0 },
    { date: "2026-08-14", share: 0.01 },
  ]
  const now = new Date("2026-08-14T16:00:00Z")
  const far = projectShare(series, "2026-09-13", { now })
  assert.equal(far.share, null)
  assert.match(far.reason, /horizon/)

  const past = projectShare(series, "2026-08-01", { now })
  assert.equal(past.share, null)

  const thin = projectShare([{ date: "2026-08-14", share: 0.01 }], "2026-08-17", { now })
  assert.equal(thin.share, null)
})

test("projection extrapolates a rising share and never exceeds 1", () => {
  const now = new Date("2026-08-14T16:00:00Z")
  const p = projectShare(
    [
      { date: "2026-08-12", share: 0.1 },
      { date: "2026-08-14", share: 0.3 },
    ],
    "2026-08-17",
    { now },
  )
  // +0.1/day for ~3 more days => ~0.6.
  assert.ok(p.share > 0.5 && p.share < 0.7, `got ${p.share}`)

  const capped = projectShare(
    [
      { date: "2026-08-12", share: 0.2 },
      { date: "2026-08-14", share: 0.9 },
    ],
    "2026-08-17",
    { now },
  )
  assert.equal(capped.share, 1)
})

test("a flat series projects no further uptake instead of inventing growth", () => {
  // This is the observed v0.4.12 behaviour: ~17% share, unmoved for three weeks.
  const now = new Date("2026-08-14T16:00:00Z")
  const p = projectShare(
    [
      { date: "2026-08-12", share: 0.17 },
      { date: "2026-08-14", share: 0.17 },
    ],
    "2026-08-17",
    { now },
  )
  assert.equal(p.share, 0.17)
  assert.match(p.reason, /flat or falling/)
})
