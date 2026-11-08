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
//   node scripts/verify-release-bundle.mjs <aab> <release-source-map>
//     With the optional second argument (issue #232) the AAB bundle's
//     `sentry-dbid-<uuid>` marker is cross-checked against the Debug ID of
//     the built release source map, and any mismatch or missing marker
//     fails the check. Without it, behavior is exactly the noise gate above.
//
// Optional env:
//   EXPO_PUBLIC_SENTRY_DSN  when set, the DSN baked into the bundle must point
//                           at the same project id (never printed).
//
// Read-only, dependency-free (uses the `unzip` CLI, present on the runner).

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"

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


const UUID_PATTERN = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"

/** The Debug ID the shipped bundle carries. The Sentry Metro serializer
 *  embeds it as a `sentry-dbid-<uuid>` string literal (that exact marker is
 *  what Sentry's own tooling greps for); Hermes keeps the literal in the
 *  bytecode, so it survives compilation into the AAB. Strict UUID shape:
 *  the bytecode packs string literals back to back, so a loose hex run
 *  would over-match into the neighbouring literal. */
export function bundleDebugId(bundle) {
  const text = Buffer.isBuffer(bundle) ? bundle.toString("latin1") : String(bundle)
  const m = new RegExp(`sentry-dbid-(${UUID_PATTERN})`).exec(text)
  return m ? m[1].toLowerCase() : null
}

/** The Debug ID of a built release source map. Depending on the serializer
 *  version it is recorded as a `debugId`/`debug_id` JSON field, a
 *  `sentry-dbid-` marker, or a `//# debugId=` comment; accept any of them. */
export function sourceMapDebugId(sourceMap) {
  const text = Buffer.isBuffer(sourceMap) ? sourceMap.toString("utf8") : String(sourceMap)
  const patterns = [
    new RegExp(`"debugId"\\s*:\\s*"(${UUID_PATTERN})"`),
    new RegExp(`"debug_id"\\s*:\\s*"(${UUID_PATTERN})"`),
    new RegExp(`sentry-dbid-(${UUID_PATTERN})`),
    new RegExp(`//# debugId=(${UUID_PATTERN})`),
  ]
  for (const re of patterns) {
    const m = re.exec(text)
    if (m) return m[1].toLowerCase()
  }
  return null
}

/** Pure check: the AAB bundle's Debug ID must equal the release source
 *  map's Debug ID (issue #232). Source-map symbolication is Debug-ID
 *  based, so a mismatch means the uploaded map can never resolve the
 *  shipped bundle's frames — v0.4.17 matched; this keeps it that way. */
export function checkDebugId(bundle, sourceMap) {
  const problems = []
  const fromBundle = bundleDebugId(bundle)
  const fromMap = sourceMapDebugId(sourceMap)
  if (!fromBundle) {
    problems.push("no sentry-dbid-<uuid> marker in the shipped bundle — no Debug ID to symbolicate against")
  }
  if (!fromMap) {
    problems.push("no Debug ID found in the release source map")
  }
  if (fromBundle && fromMap && fromBundle !== fromMap) {
    problems.push(`Debug ID mismatch — bundle ${fromBundle}, source map ${fromMap}`)
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

  const sourceMapPath = process.argv[3]
  if (sourceMapPath) {
    if (!existsSync(sourceMapPath)) {
      console.error(`FAIL: source map argument given but not found: ${sourceMapPath}`)
      process.exit(1)
    }
    const sourceMap = readFileSync(sourceMapPath)
    console.log(`debug id: bundle ${bundleDebugId(bundle) ?? "MISSING"}, source map ${sourceMapDebugId(sourceMap) ?? "MISSING"}`)
    problems.push(...checkDebugId(bundle, sourceMap))
  }

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
