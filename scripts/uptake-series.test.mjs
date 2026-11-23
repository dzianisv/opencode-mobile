import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { emptyStore, mergeDaily, recordSnapshot, renderMarkdown, serialize, sortedDays, trend } from "./uptake-series.mjs"

/** Shape of `release-uptake.mjs --json`, trimmed to what the series reads. */
function report({ series = [], gateVersion = "0.4.14", summary, stale, days = 7 } = {}) {
  return { gateVersion, days, series, summary, stale }
}

test("today's datapoint is stored partial — the day is still accumulating", () => {
  const s = mergeDaily(emptyStore(), report({ series: [{ date: "2026-08-14", gated: 10, total: 154, share: 0.065 }] }), {
    observedAt: "2026-08-14T18:00:00Z",
  })
  assert.equal(s.days["2026-08-14"].partial, true)
})

test("a later observation completes yesterday's partial point", () => {
  let s = mergeDaily(emptyStore(), report({ series: [{ date: "2026-08-14", gated: 10, total: 154, share: 0.065 }] }), {
    observedAt: "2026-08-14T18:00:00Z",
  })
  s = mergeDaily(s, report({ series: [{ date: "2026-08-14", gated: 18, total: 200, share: 0.09 }] }), {
    observedAt: "2026-08-15T15:00:00Z",
  })
  assert.equal(s.days["2026-08-14"].partial, false)
  assert.equal(s.days["2026-08-14"].gated, 18)
})

test("a complete day is never downgraded back to partial", () => {
  // Guards against a clock-skewed or replayed run rewriting settled history.
  let s = mergeDaily(emptyStore(), report({ series: [{ date: "2026-08-14", gated: 18, total: 200, share: 0.09 }] }), {
    observedAt: "2026-08-15T15:00:00Z",
  })
  s = mergeDaily(s, report({ series: [{ date: "2026-08-14", gated: 1, total: 5, share: 0.2 }] }), {
    observedAt: "2026-08-14T09:00:00Z",
  })
  assert.equal(s.days["2026-08-14"].partial, false)
  assert.equal(s.days["2026-08-14"].gated, 18, "the settled value survives")
})

test("a missed run backfills instead of leaving a hole", () => {
  // The whole reason the daily series is stored rather than the 7d average:
  // one run carries a week, so skipping days costs nothing.
  let s = mergeDaily(emptyStore(), report({ series: [{ date: "2026-08-14", gated: 10, total: 100, share: 0.1 }] }), {
    observedAt: "2026-08-14T18:00:00Z",
  })
  s = mergeDaily(
    s,
    report({
      series: [
        { date: "2026-08-15", gated: 20, total: 100, share: 0.2 },
        { date: "2026-08-16", gated: 30, total: 100, share: 0.3 },
        { date: "2026-08-17", gated: 40, total: 100, share: 0.4 },
      ],
    }),
    { observedAt: "2026-08-18T15:00:00Z" },
  )
  assert.deepEqual(
    sortedDays(s).map((d) => d.date),
    ["2026-08-14", "2026-08-15", "2026-08-16", "2026-08-17"],
  )
})

test("existing history is never dropped by a report that does not mention it", () => {
  let s = mergeDaily(emptyStore(), report({ series: [{ date: "2026-07-01", gated: 0, total: 100, share: 0 }] }), {
    observedAt: "2026-07-02T00:00:00Z",
  })
  s = mergeDaily(s, report({ series: [{ date: "2026-08-14", gated: 10, total: 100, share: 0.1 }] }), {
    observedAt: "2026-08-15T00:00:00Z",
  })
  assert.ok(s.days["2026-07-01"], "the 90d Sentry retention window is why old points must survive")
})

test("junk dates are dropped rather than poisoning the key space", () => {
  const s = mergeDaily(emptyStore(), report({ series: [{ date: "not-a-date", gated: 1, total: 2, share: 0.5 }, { date: null }] }), {
    observedAt: "2026-08-15T00:00:00Z",
  })
  assert.equal(Object.keys(s.days).length, 0)
})

test("trend ignores partial days — a half-finished day reads as a dip that isn't there", () => {
  let s = emptyStore()
  s = mergeDaily(
    s,
    report({
      series: [
        { date: "2026-08-12", gated: 0, total: 100, share: 0 },
        { date: "2026-08-13", gated: 0, total: 100, share: 0 },
        { date: "2026-08-15", gated: 20, total: 100, share: 0.2 },
        { date: "2026-08-16", gated: 30, total: 100, share: 0.3 },
      ],
    }),
    { observedAt: "2026-08-17T00:00:00Z" },
  )
  // A partial today at 1% must not drag the "after" mean down.
  s = mergeDaily(s, report({ series: [{ date: "2026-08-17", gated: 1, total: 100, share: 0.01 }] }), {
    observedAt: "2026-08-17T01:00:00Z",
  })
  const t = trend(s, { baseline: "2026-08-14" })
  assert.equal(t.verdict, "rising")
  assert.equal(t.pre, 0)
  assert.equal(t.post, 0.25, "only the two complete post-baseline days count")
})

test("a move inside the noise floor is called flat, not rising", () => {
  const s = mergeDaily(
    emptyStore(),
    report({
      series: [
        { date: "2026-08-12", gated: 10, total: 100, share: 0.1 },
        { date: "2026-08-16", gated: 10.5, total: 100, share: 0.105 },
      ],
    }),
    { observedAt: "2026-08-17T00:00:00Z" },
  )
  assert.equal(trend(s, { baseline: "2026-08-14" }).verdict, "flat")
})

test("no post-baseline data is reported as such, never as flat", () => {
  const s = mergeDaily(emptyStore(), report({ series: [{ date: "2026-08-12", gated: 0, total: 100, share: 0 }] }), {
    observedAt: "2026-08-13T00:00:00Z",
  })
  assert.equal(trend(s, { baseline: "2026-08-14" }).verdict, "no-post-data")
  assert.equal(trend(s, {}).verdict, "insufficient-data")
})

test("the snapshot keeps the largest ungated cohort, which is a separate claim from gated share", () => {
  const s = recordSnapshot(
    emptyStore(),
    report({
      summary: { share: 0.01, shareBySession: 0.002, users: { gated: 10, total: 1032 }, sessions: { gated: 23, total: 11004 } },
      stale: { version: "0.4.10", share: 0.776 },
    }),
    { observedAt: "2026-08-14T18:00:00Z" },
  )
  const snap = s.snapshots["2026-08-14"]
  assert.equal(snap.staleVersion, "0.4.10")
  assert.equal(snap.staleShare, 0.776)
  assert.equal(snap.users.total, 1032)
})

test("serialize sorts keys so a daily commit diffs as one added line", () => {
  const s = {
    schema: 1,
    gateVersion: "0.4.14",
    days: { "2026-08-16": { gated: 1 }, "2026-08-14": { gated: 2 }, "2026-08-15": { gated: 3 } },
    snapshots: {},
  }
  const keys = Object.keys(JSON.parse(serialize(s)).days)
  assert.deepEqual(keys, ["2026-08-14", "2026-08-15", "2026-08-16"])
  assert.ok(serialize(s).endsWith("\n"))
})

test("the implementation file does not run main() under the test runner with stdin held open (#306)", async () => {
  // Regression test for #306: `node --test scripts/uptake-series.mjs` used to
  // run main(), which blocks on stdin until EOF. Under the test runner stdin
  // is not a TTY and never reaches EOF, so the step hung past the job timeout.
  // The runner executes a test file exactly as `node <file>` with
  // NODE_TEST_CONTEXT set, so spawn it that way: stdin a pipe that is never
  // written to or closed (the CI shape) and assert the child exits 0 promptly.
  // (Spawning a nested `node --test` cannot reproduce this: the nested runner
  // hands its test-file child a fresh stdin that EOFs immediately.)
  const repoRoot = fileURLToPath(new URL("..", import.meta.url))
  const child = spawn(process.execPath, ["scripts/uptake-series.mjs"], {
    cwd: repoRoot,
    stdio: ["pipe", "ignore", "pipe"],
    env: { ...process.env, NODE_TEST_CONTEXT: "child-v8" },
  })
  // Never write to or close child.stdin — that is the point of the test.
  const exit = new Promise((resolve) => child.once("exit", (code, signal) => resolve({ code, signal })))
  const timedOut = await Promise.race([
    exit.then((r) => ({ ...r, timedOut: false })),
    new Promise((resolve) => setTimeout(() => resolve({ timedOut: true }), 10_000)),
  ])
  if (timedOut.timedOut) {
    child.kill("SIGKILL")
    await exit
    assert.fail("scripts/uptake-series.mjs did not exit within 10s under NODE_TEST_CONTEXT with stdin held open (hangs on stdin, #306)")
  }
  assert.equal(timedOut.signal, null)
  assert.equal(timedOut.code, 0)
})

test("markdown marks partial rows and shows the per-day delta", () => {
  let s = mergeDaily(
    emptyStore(),
    report({
      series: [
        { date: "2026-08-14", gated: 10, total: 100, share: 0.1 },
        { date: "2026-08-15", gated: 20, total: 100, share: 0.2 },
      ],
    }),
    { observedAt: "2026-08-15T18:00:00Z" },
  )
  s = recordSnapshot(
    s,
    report({
      summary: { share: 0.15, shareBySession: 0.1, users: { gated: 30, total: 200 }, sessions: { gated: 1, total: 10 } },
      stale: { version: "0.4.10", share: 0.7 },
    }),
    { observedAt: "2026-08-15T18:00:00Z" },
  )
  const md = renderMarkdown(s, { baseline: "2026-08-14" })
  assert.match(md, /2026-08-15 \*\(partial\)\*/)
  assert.match(md, /\+10\.0pp/)
  assert.match(md, /v0\.4\.10 @ 70\.0%/)
})
