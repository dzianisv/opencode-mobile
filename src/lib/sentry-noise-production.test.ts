// Replay of REAL production Sentry data through the AGE-105 noise gate.
//
// `sentry-noise.test.ts` proves the gate behaves as specified. This file proves
// the specification was aimed at the right targets — that the patterns match the
// event signatures `opencode-mobile` actually emits, at the volumes it actually
// emits them, and therefore that the gate lands under the org quota gate.
//
// Why freeze a census instead of querying Sentry in a test: the numbers below
// are the *justification* for the pattern lists. If someone later edits
// TRANSPORT_NOISE_PATTERNS or ALWAYS_SEND_PATTERNS and the projected volume
// leaves budget — or a genuine crash class stops being allowlisted — that is a
// regression, and it should fail here rather than on next month's Sentry bill.
// A live query would move under our feet and could never fail.
//
// Census: every issue in the `opencode-mobile` Sentry project over the 90 days
// ending 2026-08-14, sorted by event count, taken from
// GET /organizations/vibetechnologies/issues/?statsPeriod=90d&sort=freq.
// Reproduce with `node scripts/sentry-volume-report.mjs` + the issues endpoint.
//
// Volume context measured the same day (see docs/analytics.md):
//   * `opencode-mobile` submitted = 2,812 events / 30d  (~2,750/month)
//   * org error quota 5,000/month, self-imposed gate 3,500/month (AGE-71)
//   * AGE-105 target for this project: under 1,500/month
//
// NOTE: server-side levers were tested and are NOT available on this Sentry
// plan — per-key rate limits accept a PUT with HTTP 200 and silently discard
// the value, custom inbound filters are absent, spike protection returns 403.
// This client-side gate is the only control that exists, so its coverage is the
// whole safety margin.

import { test } from "node:test"
import assert from "node:assert/strict"
import { eventText, isAlwaysSend, isTransportNoise } from "./sentry-noise.ts"

type Observed = {
  /** Sentry short id, so a failure is traceable to the real issue. */
  id: string
  /** exception type as Sentry grouped it */
  type: string
  /** exception value, verbatim (truncated exactly as Sentry stores it) */
  value: string
  /** events in the 90d window */
  count: number
  /** what the gate must decide, and why it is the correct decision */
  expect: "drop" | "always-send" | "capped"
}

/** Frozen 90d production census (648 events across 11 issues). */
const PRODUCTION_90D: Observed[] = [
  // --- client-side network conditions: already shown to the user as connection
  // UI and already trended in PostHog as connection_failed{error_class}. ---
  { id: "OPENCODE-MOBILE-3", type: "Error", value: "connect timeout", count: 462, expect: "drop" },
  { id: "OPENCODE-MOBILE-4", type: "Error", value: "connect server-unreachable", count: 157, expect: "drop" },
  { id: "OPENCODE-MOBILE-B", type: "Error", value: "Network request failed", count: 6, expect: "drop" },
  { id: "OPENCODE-MOBILE-7", type: "Error", value: "Request timed out after 30000ms", count: 3, expect: "drop" },

  // --- genuine crash classes: must survive whatever the quota says. ---
  {
    id: "OPENCODE-MOBILE-A",
    type: "Error",
    value:
      "Call to function 'ExponentImagePicker.launchImageLibraryAsync' has been rejected.\n→ Caused by: java.lang.IllegalStateException: Attempting to launch an unregistered ActivityResultLauncher with contract expo.modules.imagepicker.contracts.ImageLibraryC",
    count: 5,
    expect: "always-send",
  },
  {
    id: "OPENCODE-MOBILE-5",
    type: "OutOfMemoryError",
    value: "Failed to allocate a 126790640 byte allocation with 12451840 free bytes",
    count: 4,
    expect: "always-send",
  },
  {
    id: "OPENCODE-MOBILE-6",
    type: "OutOfMemoryError",
    value: "Failed to allocate a 8208 byte allocation with 1261584 free bytes",
    count: 1,
    expect: "always-send",
  },
  {
    id: "OPENCODE-MOBILE-8",
    type: "ApplicationNotResponding",
    value: "ANR",
    count: 1,
    expect: "always-send",
  },
  {
    id: "OPENCODE-MOBILE-9",
    type: "IllegalStateException",
    value: "The specified child already has a parent. You must call removeView() on the child's parent first.",
    count: 1,
    expect: "always-send",
  },
  {
    id: "OPENCODE-MOBILE-2",
    type: "IllegalStateException",
    value: "The specified child already has a parent. You must call removeView() on the child's parent first.",
    count: 1,
    expect: "always-send",
  },

  // --- reportable, but a storm of it must collapse: AGE-107 traced 498 of
  // these to one user re-tapping Connect with a wrong password. Dedup + rate
  // cap handle it; a hard drop would hide real server-side 401 regressions. ---
  { id: "OPENCODE-MOBILE-1", type: "Error", value: "API Error: 401 - ", count: 7, expect: "capped" },
]

const asEvent = (o: Observed) => ({
  exception: { values: [{ type: o.type, value: o.value, mechanism: { handled: true } }] },
})

function classify(o: Observed): Observed["expect"] {
  const text = eventText(asEvent(o))
  // Mirrors NoiseGate.admit() precedence: allowlist wins over the drop-list.
  if (isAlwaysSend(text)) return "always-send"
  if (isTransportNoise(text)) return "drop"
  return "capped"
}

test("production replay: every observed issue is classified as intended", () => {
  for (const o of PRODUCTION_90D) {
    assert.equal(
      classify(o),
      o.expect,
      `${o.id} (${o.count} events, ${o.type}: ${o.value.slice(0, 60)}) should be ${o.expect}`,
    )
  }
})

test("production replay: no genuine crash class is ever filtered", () => {
  // The failure mode this guards: hitting the volume target by silencing real
  // crashes. A zero here would make the quota win meaningless.
  const crashes = PRODUCTION_90D.filter((o) => o.expect === "always-send")
  assert.ok(crashes.length >= 6, "census should still contain the observed crash classes")
  for (const o of crashes) {
    assert.equal(isAlwaysSend(eventText(asEvent(o))), true, `${o.id} must be allowlisted`)
    assert.equal(classify(o), "always-send", `${o.id} must not be reachable by the drop-list`)
  }
})

test("production replay: gate drops >=95% of observed volume", () => {
  let dropped = 0
  let total = 0
  for (const o of PRODUCTION_90D) {
    total += o.count
    if (classify(o) === "drop") dropped += o.count
  }
  assert.equal(total, 648, "census total changed — re-derive the projections below")
  const share = dropped / total
  assert.ok(share >= 0.95, `expected >=95% of volume dropped, got ${(share * 100).toFixed(1)}%`)
})

test("production replay: projected monthly volume clears the AGE-105 target", () => {
  const SUBMITTED_PER_MONTH = 2750 // measured 2026-08-14, pre-v0.4.14-uptake
  const TARGET_PER_MONTH = 1500 // AGE-105 "done means"
  let survivingShare = 0
  let total = 0
  for (const o of PRODUCTION_90D) {
    total += o.count
    if (classify(o) !== "drop") survivingShare += o.count
  }
  // Upper bound: assumes dedup + the hourly cap never fire, which they will.
  const projected = SUBMITTED_PER_MONTH * (survivingShare / total)
  assert.ok(
    projected < TARGET_PER_MONTH,
    `projected ${Math.round(projected)}/month must stay under ${TARGET_PER_MONTH}/month`,
  )
})
