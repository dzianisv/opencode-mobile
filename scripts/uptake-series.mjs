#!/usr/bin/env node
/**
 * Turn one-shot `release-uptake.mjs --json` output into a DURABLE, committed
 * time series — so "did the uptake curve move?" is answerable from the repo
 * instead of from whoever happened to run the script that week.
 *
 * WHY THIS EXISTS
 * ---------------
 * `release-uptake.mjs` answers "what is the gated share right now". AGE-111 asks
 * a different question: "is it RISING". Answering that needs datapoints taken
 * days apart, and the way that was being done — an agent wakes up, runs the
 * script with a local Sentry token, pastes the output into a ticket comment —
 * fails in three specific ways:
 *
 *   1. The token is a GitHub secret. An agent measuring locally may not have it,
 *      and pasted terminal output is not a series anyone can re-derive.
 *   2. Sentry release health only retains a 90d window. A datapoint not written
 *      down when it is taken is gone. The baseline this issue depends on
 *      (2026-08-14, tag day) cannot be recovered later at all.
 *   3. A missed week silently becomes a hole in the curve, and a hole is
 *      indistinguishable from "flat" when you are trying to prove movement.
 *
 * WHAT IT DOES
 * ------------
 * Merges the DAILY series (not the 7d average) into a keyed-by-date store.
 * Three consequences of that choice, all deliberate:
 *
 *   - SELF-HEALING. Each run carries the trailing 7 days, so a run that does not
 *     happen costs nothing as long as another lands within 7 days. Missed runs
 *     backfill instead of leaving holes.
 *   - REVISABLE TODAY. The datapoint for the day a run happens is incomplete —
 *     the day is still accumulating sessions. It is stored `partial: true` and
 *     overwritten by any later observation. Trend math ignores partial points,
 *     because a half-finished day reads as a dip that isn't there.
 *   - THE AVERAGE LIES EARLY. A trailing-7d average on rollout day is ~6/7
 *     pre-rollout data. The daily series turned off 0.0% the same day the 7d
 *     average still read 1.0%. Grading a rollout on the average punishes it for
 *     the week before it existed.
 *
 * Cohort snapshots (per run: gated share, largest ungated cohort) are kept
 * alongside, because "gated share up" and "the stale cohort shrank" are two
 * different claims and a rollout can show the first without the second.
 *
 * USAGE
 *   node scripts/release-uptake.mjs --json --days 7 > report.json
 *   node scripts/uptake-series.mjs --in report.json --write     # merge + persist
 *   node scripts/uptake-series.mjs --markdown                   # render the curve
 *   ... --file docs/metrics/release-uptake.json                 # store location
 *   ... --baseline 2026-08-14                                   # trend anchor
 *
 * Reads the report from stdin when --in is absent. Exit code 0 for any readable
 * result: a flat curve is a finding, not a crash.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import { dirname } from "node:path"

export const DEFAULT_FILE = "docs/metrics/release-uptake.json"

/** Empty store. Version field so a later shape change is detectable, not guessed. */
export function emptyStore() {
  return { schema: 1, gateVersion: null, days: {}, snapshots: {} }
}

const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s)

/**
 * Merge one report's daily series into the store.
 *
 * `observedAt` is when the numbers were READ, which is not the same as the date
 * they describe — that distinction is the whole reason a partial today-point can
 * be corrected tomorrow instead of being frozen wrong.
 */
export function mergeDaily(store, report, { observedAt } = {}) {
  const at = observedAt ?? new Date().toISOString()
  const today = at.slice(0, 10)
  const next = { ...store, days: { ...store.days } }
  if (report?.gateVersion) next.gateVersion = report.gateVersion

  for (const point of report?.series ?? []) {
    if (!isDate(point?.date)) continue
    const partial = point.date >= today
    const prev = next.days[point.date]
    // A complete observation is never overwritten by a partial one: re-running on
    // a later date must not re-mark a finished day as still accumulating.
    if (prev && prev.partial === false && partial) continue
    next.days[point.date] = {
      gated: Number(point.gated ?? 0),
      total: Number(point.total ?? 0),
      share: point.share ?? null,
      partial,
      observedAt: at,
    }
  }
  return next
}

/** Record the run-level cohort snapshot: gated share + the largest ungated cohort. */
export function recordSnapshot(store, report, { observedAt } = {}) {
  const at = observedAt ?? new Date().toISOString()
  const s = report?.summary
  if (!s) return store
  return {
    ...store,
    snapshots: {
      ...store.snapshots,
      [at.slice(0, 10)]: {
        observedAt: at,
        windowDays: report.days ?? null,
        share: s.share ?? null,
        shareBySession: s.shareBySession ?? null,
        users: { gated: s.users?.gated ?? 0, total: s.users?.total ?? 0 },
        sessions: { gated: s.sessions?.gated ?? 0, total: s.sessions?.total ?? 0 },
        staleVersion: report.stale?.version ?? null,
        staleShare: report.stale?.share ?? null,
      },
    },
  }
}

/** Dates ascending. Object key order is not a contract; sort explicitly. */
export function sortedDays(store) {
  return Object.keys(store?.days ?? {})
    .sort()
    .map((date) => ({ date, ...store.days[date] }))
}

/**
 * Did the curve move?
 *
 * Compares the mean daily gated share BEFORE the baseline date against the mean
 * AFTER it, using complete days only. A single-day comparison is too noisy to
 * carry a verdict — daily user counts here are in the low hundreds, so one
 * quiet day swings the share by points.
 */
export function trend(store, { baseline } = {}) {
  const days = sortedDays(store).filter((d) => !d.partial && d.share != null)
  if (!baseline || days.length === 0) return { verdict: "insufficient-data", days: days.length }

  const before = days.filter((d) => d.date < baseline)
  const after = days.filter((d) => d.date > baseline)
  const mean = (xs) => (xs.length ? xs.reduce((a, d) => a + d.share, 0) / xs.length : null)
  const pre = mean(before)
  const post = mean(after)

  if (after.length === 0) return { verdict: "no-post-data", pre, post: null, before: before.length, after: 0 }
  if (pre == null) return { verdict: "no-pre-data", pre: null, post, before: 0, after: after.length }

  const delta = post - pre
  // 1pp: below that, with a few hundred daily users, the move is inside the noise.
  const verdict = delta >= 0.01 ? "rising" : delta <= -0.01 ? "falling" : "flat"
  return { verdict, pre, post, delta, before: before.length, after: after.length, latest: days[days.length - 1] }
}

const pct = (x) => (x == null ? "n/a" : `${(x * 100).toFixed(1)}%`)

/** Human-readable curve for a job summary or a ticket comment. */
export function renderMarkdown(store, { baseline } = {}) {
  const days = sortedDays(store)
  const t = trend(store, { baseline })
  const out = []

  out.push(`### Install-base uptake curve — gate v${store.gateVersion ?? "?"}+`)
  out.push("")
  if (baseline) out.push(`Baseline (rollout) date: **${baseline}**`)
  out.push(
    t.verdict === "rising" || t.verdict === "falling" || t.verdict === "flat"
      ? `Verdict: **${t.verdict}** — daily gated share ${pct(t.pre)} before -> ${pct(t.post)} after (${t.before}d / ${t.after}d, complete days only)`
      : `Verdict: **${t.verdict}** (${days.length} datapoints)`,
  )
  out.push("")
  out.push("| date | gated | active | share | Δ |")
  out.push("|---|---:|---:|---:|---:|")
  let prev = null
  for (const d of days) {
    const delta = prev != null && d.share != null ? `${d.share - prev >= 0 ? "+" : ""}${((d.share - prev) * 100).toFixed(1)}pp` : ""
    out.push(`| ${d.date}${d.partial ? " *(partial)*" : ""} | ${d.gated} | ${d.total} | ${pct(d.share)} | ${delta} |`)
    if (d.share != null && !d.partial) prev = d.share
  }

  const snaps = Object.keys(store?.snapshots ?? {}).sort()
  if (snaps.length) {
    out.push("")
    out.push("| observed | gated (users) | gated (sessions) | largest ungated cohort |")
    out.push("|---|---:|---:|---|")
    for (const k of snaps) {
      const s = store.snapshots[k]
      const stale = s.staleVersion ? `v${s.staleVersion} @ ${pct(s.staleShare)}` : "n/a"
      out.push(`| ${k} | ${pct(s.share)} (${s.users.gated}/${s.users.total}) | ${pct(s.shareBySession)} | ${stale} |`)
    }
  }
  return out.join("\n")
}

/** Stable key order so a daily commit diffs as one added line, not a reshuffle. */
export function serialize(store) {
  const ordered = {
    schema: store.schema ?? 1,
    gateVersion: store.gateVersion ?? null,
    days: Object.fromEntries(Object.keys(store.days ?? {}).sort().map((k) => [k, store.days[k]])),
    snapshots: Object.fromEntries(Object.keys(store.snapshots ?? {}).sort().map((k) => [k, store.snapshots[k]])),
  }
  return `${JSON.stringify(ordered, null, 2)}\n`
}

export function loadStore(file) {
  if (!existsSync(file)) return emptyStore()
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"))
    return { ...emptyStore(), ...parsed }
  } catch {
    // A corrupt store must not silently reset the history to empty.
    throw new Error(`${file} exists but is not valid JSON; refusing to overwrite the series`)
  }
}

function parseArgs(argv) {
  const out = { file: DEFAULT_FILE }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--in") out.in = argv[++i]
    else if (a === "--file") out.file = argv[++i]
    else if (a === "--baseline") out.baseline = argv[++i]
    else if (a === "--write") out.write = true
    else if (a === "--markdown") out.markdown = true
  }
  return out
}

function readStdin() {
  try {
    return readFileSync(0, "utf8")
  } catch {
    return ""
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  let store = loadStore(args.file)

  const raw = args.in ? readFileSync(args.in, "utf8") : args.markdown && process.stdin.isTTY ? "" : readStdin()
  if (raw.trim()) {
    const report = JSON.parse(raw)
    const observedAt = new Date().toISOString()
    store = recordSnapshot(mergeDaily(store, report, { observedAt }), report, { observedAt })
    if (args.write) {
      mkdirSync(dirname(args.file), { recursive: true })
      writeFileSync(args.file, serialize(store))
      console.error(`wrote ${args.file} (${Object.keys(store.days).length} days)`)
    }
  }

  if (args.markdown || !args.write) console.log(renderMarkdown(store, { baseline: args.baseline }))
}

// Do not run main() under the node test runner: `node --test` executes this
// file as a test file too, and main() blocks on stdin (readStdin) until EOF,
// which the runner's stdin never reaches — that hung CI past the job timeout
// (#306). NODE_TEST_CONTEXT is set by the runner for its test files and is
// inherited by every process they spawn, so a CLI run descended from a
// `node --test` process also sees it and skips main() — do not shell out to
// this CLI from a test harness without clearing the variable first.
// Piped-stdin use from a normal shell
// (`release-uptake.mjs --json | uptake-series.mjs --write`) is unaffected.
if (import.meta.url === `file://${process.argv[1]}` && process.env.NODE_TEST_CONTEXT == null) {
  main().catch((err) => {
    console.error(String(err?.message ?? err))
    process.exit(1)
  })
}
