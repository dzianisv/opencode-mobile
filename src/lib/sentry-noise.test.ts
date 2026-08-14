import { test } from "node:test"
import assert from "node:assert/strict"
import {
  DEFAULT_GATE_LIMITS,
  NoiseGate,
  eventText,
  fingerprint,
  isAlwaysSend,
  isFatalEvent,
  isTransportNoise,
} from "./sentry-noise.ts"

const T0 = 1_786_700_000_000 // fixed clock; every test drives time explicitly
const MIN = 60_000
const HOUR = 60 * MIN

// --- pattern lists -------------------------------------------------------

test("isTransportNoise: the three top AGE-105 noise producers are noise", () => {
  assert.equal(isTransportNoise("connect timeout"), true)
  assert.equal(isTransportNoise("connect server-unreachable"), true)
  assert.equal(isTransportNoise("Network request failed"), true)
  assert.equal(isTransportNoise("connect no-internet"), true)
  assert.equal(isTransportNoise("Request timed out after 10000ms"), true)
  assert.equal(isTransportNoise("fetch error: ECONNREFUSED"), true)
})

test("isTransportNoise: server-side and app-side failures are NOT noise", () => {
  // health-failed means the box answered but is unhealthy — that is actionable.
  assert.equal(isTransportNoise("connect health-failed"), false)
  assert.equal(isTransportNoise("connect tls-error"), false)
  assert.equal(isTransportNoise("API Error: 500 - boom"), false)
  assert.equal(isTransportNoise("TypeError: undefined is not a function"), false)
  assert.equal(isTransportNoise(""), false)
})

test("isAlwaysSend: genuine crash classes bypass the gate", () => {
  assert.equal(isAlwaysSend("OutOfMemoryError (okio.Buffer.readByteArray)"), true)
  assert.equal(isAlwaysSend("IllegalStateException: no activity"), true)
  assert.equal(isAlwaysSend("NullPointerException"), true)
  assert.equal(isAlwaysSend("SIGSEGV"), true)
  assert.equal(isAlwaysSend("connect timeout"), false)
})

// --- event flattening ----------------------------------------------------

test("eventText: prefers the exception type+value, falls back to message", () => {
  assert.equal(
    eventText({ exception: { values: [{ type: "Error", value: "connect timeout" }] } }),
    "connect timeout",
  )
  assert.equal(
    eventText({ exception: { values: [{ type: "OutOfMemoryError", value: "Failed to allocate" }] } }),
    "OutOfMemoryError: Failed to allocate",
  )
  assert.equal(eventText({ message: "plain message" }), "plain message")
  assert.equal(eventText({}), "")
})

test("isFatalEvent: fatal level or unhandled mechanism is fatal", () => {
  assert.equal(isFatalEvent({ level: "fatal" }), true)
  assert.equal(
    isFatalEvent({ exception: { values: [{ value: "boom", mechanism: { handled: false } }] } }),
    true,
  )
  assert.equal(
    isFatalEvent({ level: "error", exception: { values: [{ value: "boom", mechanism: { handled: true } }] } }),
    false,
  )
})

// --- fingerprinting ------------------------------------------------------

test("fingerprint: the 401 retry loop collapses to a single key", () => {
  const a = fingerprint('API Error: 401 - {"error":"token expired at 1786700000"}')
  const b = fingerprint('API Error: 401 - {"error":"token expired at 1786700931"}')
  const c = fingerprint("API Error: 401 - Unauthorized")
  assert.equal(a, b)
  assert.equal(a, c)
})

test("fingerprint: different statuses stay distinct", () => {
  assert.notEqual(fingerprint("API Error: 401 - x"), fingerprint("API Error: 403 - x"))
  assert.notEqual(fingerprint("API Error: 401 - x"), fingerprint("API Error: 500 - x"))
})

test("fingerprint: ids/urls/paths do not fragment one error into many", () => {
  const a = fingerprint("Failed to load session 0f8c7a2b-1111-4d3e-9aaa-1234567890ab from https://box.example/v1/x")
  const b = fingerprint("Failed to load session 7bb1c0de-2222-4d3e-9aaa-abcdef123456 from https://other.example/v1/y")
  assert.equal(a, b)
})

test("fingerprint: genuinely different errors stay different", () => {
  assert.notEqual(fingerprint("TypeError: x is not a function"), fingerprint("connect timeout"))
})

test("fingerprint: bounded length", () => {
  assert.ok(fingerprint("z".repeat(500)).length <= 100)
})

// --- gate behaviour ------------------------------------------------------

test("gate: transport noise is dropped every time, forever", () => {
  const gate = new NoiseGate()
  for (let i = 0; i < 200; i++) {
    const d = gate.admit("connect timeout", {}, T0 + i * MIN)
    assert.equal(d.send, false)
    assert.equal(d.reason, "transport-noise")
  }
  assert.equal(gate.takeDroppedCount(), 200)
})

test("gate: a 401 retry loop reports once per cooldown, not 498 times", () => {
  const gate = new NoiseGate()
  let sent = 0
  // 498 events over 3 hours — the exact shape of the AGE-105 single-user loop.
  for (let i = 0; i < 498; i++) {
    const at = T0 + Math.floor((i * 3 * HOUR) / 498)
    if (gate.admit(`API Error: 401 - attempt ${i}`, {}, at).send) sent++
  }
  assert.equal(sent, 1)
  // ...and it re-opens once the 6h cooldown has elapsed.
  assert.equal(gate.admit("API Error: 401 - later", {}, T0 + 6 * HOUR + MIN).send, true)
})

test("gate: cooldown boundary is exclusive-then-inclusive", () => {
  const gate = new NoiseGate()
  assert.equal(gate.admit("TypeError: boom", {}, T0).send, true)
  assert.equal(gate.admit("TypeError: boom", {}, T0 + DEFAULT_GATE_LIMITS.cooldownMs - 1).send, false)
  assert.equal(gate.admit("TypeError: boom", {}, T0 + DEFAULT_GATE_LIMITS.cooldownMs).send, true)
})

test("gate: at most maxNewPerHour distinct new issues open per hour", () => {
  const gate = new NoiseGate()
  let sent = 0
  for (let i = 0; i < 20; i++) {
    if (gate.admit(`Distinct failure ${String.fromCharCode(97 + i)}`, {}, T0 + i * MIN).send) sent++
  }
  assert.equal(sent, DEFAULT_GATE_LIMITS.maxNewPerHour)
  // The window is rolling, so an hour later new issues can open again.
  assert.equal(gate.admit("Distinct failure zz", {}, T0 + HOUR + MIN).send, true)
})

test("gate: total per hour never exceeds maxPerHour even across cooldowns", () => {
  const gate = new NoiseGate({ cooldownMs: 0, maxNewPerHour: 1000 })
  let sent = 0
  for (let i = 0; i < 100; i++) {
    if (gate.admit(`Failure ${i % 30}`, {}, T0 + i * 30_000).send) sent++
  }
  // 100 events spread over 50 minutes — all inside one rolling hour.
  assert.equal(sent, DEFAULT_GATE_LIMITS.maxPerHour)
})

test("gate: real crashes are never dropped, whatever the quota state", () => {
  const gate = new NoiseGate()
  // Exhaust every budget with ordinary errors first.
  for (let i = 0; i < 50; i++) gate.admit(`Ordinary failure ${i}`, {}, T0 + i * MIN)

  const oom = gate.admit("OutOfMemoryError (okio.Buffer.readByteArray)", {}, T0 + 51 * MIN)
  assert.equal(oom.send, true)
  assert.equal(oom.reason, "always-send")

  // Repeats of a crash loop also survive — a relaunch-crash loop is a real signal.
  const again = gate.admit("OutOfMemoryError (okio.Buffer.readByteArray)", {}, T0 + 52 * MIN)
  assert.equal(again.send, true)

  const fatal = gate.admit("Some unhandled native failure", { fatal: true }, T0 + 53 * MIN)
  assert.equal(fatal.send, true)
  assert.equal(fatal.reason, "always-send")
})

test("gate: fingerprint state stays bounded (oldest evicted)", () => {
  // Distinct, digit-free labels: fingerprint() maps every digit to '#', so
  // numbered labels would all collapse into one key.
  const label = (i: number) =>
    `failure ${i
      .toString(26)
      .split("")
      .map((c) => String.fromCharCode(97 + parseInt(c, 26)))
      .join("")}`
  const gate = new NoiseGate({ maxNewPerHour: 1e6, maxPerHour: 1e6, maxTrackedFingerprints: 10 })
  for (let i = 0; i < 50; i++) gate.admit(label(i), {}, T0 + i)

  // The oldest fingerprints were evicted, so they are allowed to report again
  // (bounded memory beats perfect dedup on a mobile client).
  assert.equal(gate.admit(label(0), {}, T0 + MIN).send, true)
  // A recently-seen one is still deduped.
  assert.equal(gate.admit(label(49), {}, T0 + MIN).send, false)
})

test("gate: the AGE-105 mixed hour lands far under the old volume", () => {
  const gate = new NoiseGate()
  let sent = 0
  const at = (i: number) => T0 + i * 1000
  let i = 0
  // The observed mix, compressed into one hour.
  for (let n = 0; n < 462; n++) if (gate.admit("connect timeout", {}, at(i++)).send) sent++
  for (let n = 0; n < 498; n++) if (gate.admit(`API Error: 401 - ${n}`, {}, at(i++)).send) sent++
  for (let n = 0; n < 157; n++) if (gate.admit("connect server-unreachable", {}, at(i++)).send) sent++
  for (let n = 0; n < 5; n++) if (gate.admit("Network request failed", {}, at(i++)).send) sent++
  for (let n = 0; n < 4; n++) if (gate.admit("OutOfMemoryError (okio.Buffer)", {}, at(i++)).send) sent++

  // 1126 raw events -> 1 auth report + 4 real crashes.
  assert.equal(sent, 5)
})
