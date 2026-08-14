#!/usr/bin/env node
// Verify that a release AAB actually ships the Sentry noise gate (AGE-105).
//
// Why this exists: the entire quota fix is client-side. Sentry's server-side
// levers were checked and are all dead on this plan (per-key rate limit returns
// HTTP 200 and silently drops the field; custom inbound filters absent; spike
// protection 403). So if a build ever ships without the gate — a Metro entry
// change, a refactor that stops importing sentry-noise, a release built without
// EXPO_PUBLIC_SENTRY_DSN — the org quietly goes back over quota and nobody
// finds out until the monthly reset.
//
// It also can't be caught by watching Sentry: while the org is over quota,
// events are rejected at ingest and never stored, so release tags stop
// updating (opencode-mobile's stop at 0.4.12 / 2026-08-08 while clients keep
// submitting ~4.7/h). A `release:0.4.14` query returns EMPTY, which reads like
// "no errors from the new build" but actually means "no data at all".
//
// The binary itself is the only same-day evidence. Hermes bytecode keeps string
// literals, so the gate's own reason strings and the drop-list regex are
// greppable in base/assets/index.android.bundle.
//
// Usage:
//   node scripts/verify-release-bundle.mjs android/app/build/outputs/bundle/release/app-release.aab
//
// Optional env:
//   EXPO_PUBLIC_SENTRY_DSN  when set, the DSN baked into the bundle must point
//                           at the same project id (never printed).
//
// Read-only, dependency-free (uses the `unzip` CLI, present on the runner).

import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"

/** Literals that only exist because the noise gate is in the bundle graph.
 *  Each is unique to our code, not the Sentry SDK. */
export const GATE_MARKERS = [
  // NoiseGate reason codes (src/lib/sentry-noise.ts)
  "transport-noise",
  "new-fingerprint-cap",
  "hourly-cap",
  "always-send",
  // the transport drop-list regex source — the single biggest volume cut
  "connect (?:timeout",
  // applyNoiseGate() in src/lib/sentry.ts, i.e. the gate is wired to beforeSend
  "noise.dropped_since_last",
]

const DSN_RE = /https:\/\/[0-9a-f]{16,64}@[a-z0-9.-]*ingest[a-z0-9.-]*\/(\d+)/g

/** Pure check over the raw JS/Hermes bundle bytes. Returns a list of problems;
 *  empty means the artifact is good. Never returns the DSN itself. */
export function checkBundle(bundle, opts = {}) {
  const text = Buffer.isBuffer(bundle) ? bundle.toString("latin1") : String(bundle)
  const problems = []

  const missing = GATE_MARKERS.filter((marker) => !text.includes(marker))
  if (missing.length) {
    problems.push(`noise gate missing from bundle — absent markers: ${missing.join(", ")}`)
  }

  const projectIds = [...text.matchAll(DSN_RE)].map((m) => m[1])
  if (projectIds.length === 0) {
    // No DSN => Sentry.init() is a no-op => the gate never runs and no telemetry
    // arrives at all. A release build must never be in this state.
    problems.push("no Sentry DSN baked into the bundle — telemetry would be a silent no-op")
  } else if (opts.expectedProjectId && !projectIds.includes(String(opts.expectedProjectId))) {
    problems.push(
      `bundled DSN points at project ${projectIds.join("/")}, expected ${opts.expectedProjectId}`,
    )
  }

  return problems
}

/** Extract the project id from a DSN without leaking the key. */
export function dsnProjectId(dsn) {
  if (!dsn) return null
  const m = /\/(\d+)\/?$/.exec(String(dsn).trim())
  return m ? m[1] : null
}

export function checkAppConfig(configJson, expectedVersion) {
  if (!expectedVersion) return []
  let version
  try {
    version = JSON.parse(configJson)?.version
  } catch {
    return ["base/assets/app.config is not valid JSON"]
  }
  return version === expectedVersion ? [] : [`bundle app.config version ${version}, expected ${expectedVersion}`]
}

function unzipEntry(archive, entry) {
  return execFileSync("unzip", ["-p", archive, entry], { maxBuffer: 256 * 1024 * 1024 })
}

function main() {
  const aab = process.argv[2]
  if (!aab || !existsSync(aab)) {
    console.error("usage: node scripts/verify-release-bundle.mjs <path-to.aab|.apk>")
    process.exit(2)
  }

  let bundle
  try {
    bundle = unzipEntry(aab, "base/assets/index.android.bundle")
  } catch {
    console.error(`FAIL ${aab}: no base/assets/index.android.bundle inside the archive`)
    process.exit(1)
  }

  const problems = checkBundle(bundle, { expectedProjectId: dsnProjectId(process.env.EXPO_PUBLIC_SENTRY_DSN) })

  let version = null
  try {
    const config = unzipEntry(aab, "base/assets/app.config").toString("utf8")
    version = JSON.parse(config)?.version ?? null
  } catch {
    problems.push("could not read base/assets/app.config")
  }

  console.log(`artifact: ${aab}`)
  console.log(`bundle:   ${(bundle.length / 1024 / 1024).toFixed(2)} MiB, app version ${version ?? "unknown"}`)
  for (const marker of GATE_MARKERS) {
    const ok = bundle.toString("latin1").includes(marker)
    console.log(`  ${ok ? "ok  " : "MISS"} ${marker}`)
  }

  if (problems.length) {
    console.error("\nFAIL — this build must not go to Play:")
    for (const p of problems) console.error(`  - ${p}`)
    process.exit(1)
  }
  console.log("\nOK — Sentry noise gate is present and pointed at the expected project.")
}

if (import.meta.url === `file://${process.argv[1]}`) main()
