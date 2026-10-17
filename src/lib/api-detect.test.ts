import assert from "node:assert/strict"
import { test } from "node:test"

import { apiForUnprobedServer, detectServerApi, isLegacyApi, type ProbeResponse } from "./api-detect.ts"

// Every fixture below is a real response recorded on 2026-09-24 from a live server:
// opencode v2.0.16 (100.77.13.76:4096) and opencode 1.18.32 (`opencode serve`).
const SPA_HTML =
  '<!doctype html> <html lang="en" style="background-color: var(--v2-background-bg-deep, #fafafa)"> <head>'

function probe(responses: Record<string, ProbeResponse>) {
  return async (path: string): Promise<ProbeResponse> => {
    const found = responses[path]
    if (!found) throw new Error(`probe not stubbed: ${path}`)
    return found
  }
}

test("detectServerApi reads a v2 server from its JSON /api/info", async () => {
  const identity = await detectServerApi(
    probe({
      "/api/info": {
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ version: "2.0.16", pid: 2967, urls: ["http://100.77.13.76:4096"] }),
      },
    }),
  )
  assert.deepEqual(identity, { api: "v2", version: "2.0.16" })
})

test("detectServerApi still classifies v2 when /api/info only answers 401", async () => {
  // Recorded unauthenticated against v2.0.16: the route exists and demands a password,
  // while every v1 route on the same host falls through to the SPA.
  const identity = await detectServerApi(
    probe({
      "/api/info": { status: 401, contentType: "", body: "" },
    }),
  )
  assert.deepEqual(identity, { api: "v2" })
})

test("detectServerApi falls back to /global/health for a v1 server", async () => {
  // Recorded against 1.18.32: /api/info is not a route there, so it serves the SPA
  // with a 200. Treating that 200 as a healthy v2 connection is the bug this guards.
  const identity = await detectServerApi(
    probe({
      "/api/info": { status: 200, contentType: "text/html", body: SPA_HTML },
      "/global/health": { status: 200, contentType: "application/json", body: '{"healthy":true,"version":"1.18.32"}' },
    }),
  )
  assert.deepEqual(identity, { api: "v1", version: "1.18.32" })
})

test("detectServerApi classifies v1 when health demands a password", async () => {
  const identity = await detectServerApi(
    probe({
      "/api/info": { status: 200, contentType: "text/html", body: SPA_HTML },
      "/global/health": { status: 401, contentType: "", body: "" },
    }),
  )
  assert.deepEqual(identity, { api: "v1" })
})

test("detectServerApi rejects a server that answers HTML everywhere", async () => {
  await assert.rejects(
    detectServerApi(
      probe({
        "/api/info": { status: 200, contentType: "text/html", body: SPA_HTML },
        "/global/health": { status: 200, contentType: "text/html", body: SPA_HTML },
      }),
    ),
    /neither \/api\/info \(v2\) nor \/global\/health \(v1\)/,
  )
})

test("isLegacyApi only reports v1", () => {
  assert.equal(isLegacyApi("v1"), true)
  assert.equal(isLegacyApi("v2"), false)
  assert.equal(isLegacyApi(undefined), true)
  assert.equal(apiForUnprobedServer(undefined), "v1")
  assert.equal(apiForUnprobedServer("v2"), "v2")
})
