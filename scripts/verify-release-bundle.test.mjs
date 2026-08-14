import assert from "node:assert/strict"
import test from "node:test"

import { GATE_MARKERS, checkAppConfig, checkBundle, dsnProjectId } from "./verify-release-bundle.mjs"

const DSN = "https://4f21a8b3c4d5e6f708192a3b4c5d6e7f@o4510132673511424.ingest.us.sentry.io/4511436292292608"
const PROJECT = "4511436292292608"

function goodBundle(extra = "") {
  return Buffer.from(`\u0000\u0001hermes${GATE_MARKERS.join("\u0000")}\u0000${DSN}${extra}`, "latin1")
}

test("a bundle with every gate marker and the right DSN passes", () => {
  assert.deepEqual(checkBundle(goodBundle(), { expectedProjectId: PROJECT }), [])
})

test("a bundle built without the gate fails and names the missing markers", () => {
  const stripped = Buffer.from(`hermes${DSN}`, "latin1")
  const problems = checkBundle(stripped, { expectedProjectId: PROJECT })
  assert.equal(problems.length, 1)
  for (const marker of GATE_MARKERS) assert.match(problems[0], new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
})

test("dropping a single marker is enough to fail — a partial gate is not a gate", () => {
  const partial = Buffer.from(`hermes${GATE_MARKERS.slice(1).join("|")}${DSN}`, "latin1")
  const problems = checkBundle(partial, { expectedProjectId: PROJECT })
  assert.equal(problems.length, 1)
  assert.match(problems[0], /transport-noise/)
})

test("a release built without EXPO_PUBLIC_SENTRY_DSN fails — Sentry would be a silent no-op", () => {
  const noDsn = Buffer.from(`hermes${GATE_MARKERS.join("|")}`, "latin1")
  const problems = checkBundle(noDsn, { expectedProjectId: PROJECT })
  assert.deepEqual(problems, ["no Sentry DSN baked into the bundle — telemetry would be a silent no-op"])
})

test("a DSN for the wrong project fails, and the failure never prints the key", () => {
  const wrong = goodBundle().toString("latin1").replace(PROJECT, "9999999999")
  const problems = checkBundle(Buffer.from(wrong, "latin1"), { expectedProjectId: PROJECT })
  assert.equal(problems.length, 1)
  assert.match(problems[0], /expected 4511436292292608/)
  assert.ok(!problems[0].includes("4f21a8b3c4d5e6f708192a3b4c5d6e7f"), "problem text must not leak the DSN key")
})

test("without an expected project id the DSN only has to exist", () => {
  assert.deepEqual(checkBundle(goodBundle(), {}), [])
})

test("dsnProjectId extracts the trailing id and tolerates junk", () => {
  assert.equal(dsnProjectId(DSN), PROJECT)
  assert.equal(dsnProjectId(`${DSN}/`), PROJECT)
  assert.equal(dsnProjectId(""), null)
  assert.equal(dsnProjectId(undefined), null)
  assert.equal(dsnProjectId("not-a-dsn"), null)
})

test("app.config version mismatch is reported, match is silent", () => {
  assert.deepEqual(checkAppConfig(JSON.stringify({ version: "0.4.14" }), "0.4.14"), [])
  assert.deepEqual(checkAppConfig(JSON.stringify({ version: "0.4.13" }), "0.4.14"), [
    "bundle app.config version 0.4.13, expected 0.4.14",
  ])
  assert.deepEqual(checkAppConfig("{", "0.4.14"), ["base/assets/app.config is not valid JSON"])
  assert.deepEqual(checkAppConfig("{", null), [])
})
