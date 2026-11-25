// Regression test for issue #304: probeConnection built its Basic auth
// header with raw `btoa`, which is Latin1-only on Hermes and throws on
// non-ASCII credentials. The probe must complete and send a UTF-8 Basic
// auth header instead.
//
// Unlike diagnostics-classify.test.ts (pure logic), this drives the real
// probeConnection over real HTTP against a local server and asserts on the
// Authorization header the server actually received — the same
// integration-style pattern as session-list.integration.test.ts.
//
// Run: node --test src/lib/diagnostics.test.ts
//
// diagnostics.ts imports react-native / Expo modules, which cannot load
// under plain node --test (react-native ships Flow-typed sources, Expo
// modules need the native bridge), so the resolve hook below redirects
// them to minimal stubs — mirroring the expo/fetch redirect in
// session-list.integration.test.ts. The stubs only stand in for the native
// environment; the code under test (header construction + fetch) runs for
// real. The expected header is computed independently with Buffer, not
// with the helper under test.
//
// `./telemetry` is stubbed too: it pulls in analytics.ts, which uses a
// TypeScript `enum` that Node's type-stripping cannot load
// (ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX). Telemetry only serves
// sendReportToSupport, which probeConnection never calls.

import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { Buffer } from "node:buffer"
import { register } from "node:module"
import http from "node:http"

const stubs: Record<string, string> = {
  "react-native":
    "export const Platform = { OS: 'android', Version: 34 };\n" +
    "export const Share = { share: async () => ({}) };\n",
  "expo-clipboard": "export async function setStringAsync() {}\n",
  "expo-device": "export const modelName = 'test-device';\n",
  "expo-secure-store":
    "export async function getItemAsync() { return null; }\n" +
    "export async function setItemAsync() {}\n",
  "./telemetry":
    "export function hasTelemetryConsent() { return null; }\n" +
    "export async function loadTelemetryConsent() { return 'unknown'; }\n" +
    "export async function setTelemetryConsent() {}\n",
}

const hookSource =
  "export async function resolve(specifier, context, nextResolve) {\n" +
  "  const stubs = " + JSON.stringify(stubs) + ";\n" +
  "  if (Object.prototype.hasOwnProperty.call(stubs, specifier)) {\n" +
  "    return { url: 'data:text/javascript,' + encodeURIComponent(stubs[specifier]), shortCircuit: true };\n" +
  "  }\n" +
  "  if (specifier.endsWith('app.json')) {\n" +
  "    return { url: 'data:text/javascript,' + encodeURIComponent(\"export default { expo: { version: '0.0.0-test', android: { versionCode: 1 } } };\"), shortCircuit: true };\n" +
  "  }\n" +
  "  try { return await nextResolve(specifier, context); } catch (e) {\n" +
  "    if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\\.[a-z]+$/i.test(specifier)) {\n" +
  "      return nextResolve(specifier + '.ts', context);\n" +
  "    }\n" +
  "    throw e;\n" +
  "  }\n" +
  "}\n"

register("data:text/javascript," + encodeURIComponent(hookSource))

// probeConnection is imported dynamically AFTER register() so the hook
// applies to the whole diagnostics.ts import tree (same pattern as
// session-list.integration.test.ts).
let probeConnection: typeof import("./diagnostics.ts").probeConnection

let server: http.Server
let port: number
const seenAuth: Record<string, string | string[] | undefined> = {}

before(async () => {
  const diagnostics = await import("./diagnostics.ts")
  probeConnection = diagnostics.probeConnection
  server = http.createServer((req, res) => {
    seenAuth[req.url || ""] = req.headers.authorization
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end("{}")
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  port = (server.address() as { port: number }).port
})

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

test("probeConnection with non-ASCII credentials completes and sends a UTF-8 Basic auth header (issue #304)", async () => {
  const auth = { username: "пользователь", password: "пароль123" }
  const expected = `Basic ${Buffer.from(`${auth.username}:${auth.password}`, "utf8").toString("base64")}`
  const report = await probeConnection(`http://127.0.0.1:${port}`, auth)
  assert.equal(report.attempts.find((a) => a.name === "health")?.ok, true)
  assert.equal(seenAuth["/global/health"], expected)
  assert.equal(seenAuth["/"], expected)
})

test("probeConnection with ASCII credentials sends the exact header plain btoa would", async () => {
  const auth = { username: "alice", password: "s3cret" }
  const expected = `Basic ${btoa("alice:s3cret")}`
  const report = await probeConnection(`http://127.0.0.1:${port}`, auth)
  assert.equal(report.attempts.find((a) => a.name === "health")?.ok, true)
  assert.equal(seenAuth["/global/health"], expected)
})
