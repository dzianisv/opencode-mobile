// Integration test for the "global recent sessions" feature.
//
// Unlike session-list.test.ts (pure logic, injected fakes), this stands up the
// real mock opencode server over HTTP and drives loadSessionList through the
// SAME transport shape sdk.ts wires in production (fetch /experimental/session
// first, fall back to /session on 404). It proves the feature works end-to-end
// across the HTTP boundary: the Recent Sessions list is populated globally —
// every session across every directory — WITHOUT the user picking a folder.
//
// Run: node --test src/lib/session-list.integration.test.ts
//
// This file also hosts the v2 SSE transport tests for #189/#186 (bottom):
// the events store itself (zustand + react-native AppState) cannot run under
// node --test, so the store's first-event/dedupe logic is covered by
// typecheck + review — these tests prove the /api/event endpoint the store
// reads from actually streams, heartbeats, and broadcasts over real HTTP.

import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { register } from "node:module"
import { createMockOpencodeServer } from "../../tests/fixtures/mock-opencode-server.ts"
import { loadSessionList, legacySessionQuery, type SessionListTransport } from "./session-list.ts"
import { SSEParser, SSE_LIVENESS_EVENT_TYPE } from "./sse.ts"
import type { Client } from "./sdk"

// Bridge for the generator-level SSE tests below: sdk.ts / sdk-v1.ts import
// `expo/fetch`, which has no resolver outside Metro (its entry requires a
// `.ts` index CJS cannot find), so the SDK cannot be imported under plain
// `node --test` as-is. This resolve hook — registered before the dynamic
// `import("./sdk.ts")` in those tests — redirects `expo/fetch` to a module
// re-exporting the global fetch (WinterCG-compatible, streams
// ReadableStream, exactly what the SSE dial needs) and resolves the SDKs'
// extensionless Metro-style relative imports to their `.ts` files. No
// package.json / test-script change, no new files. `mock.module` cannot do
// this: it needs `--experimental-test-module-mocks`, which the test script
// does not pass.
register(
  "data:text/javascript,export async function resolve(specifier, context, nextResolve) { if (specifier === 'expo/fetch') { return { url: 'data:text/javascript,export const fetch = globalThis.fetch;', shortCircuit: true }; } try { return await nextResolve(specifier, context); } catch (e) { if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\\.[a-z]+$/i.test(specifier)) { return nextResolve(specifier + '.ts', context); } throw e; } }",
)

const PORT = 45071
let mock: ReturnType<typeof createMockOpencodeServer>
let base: string

before(async () => {
  // --seed-sessions pre-populates two sessions in two DIFFERENT directories:
  //   seed-default -> /mock/project        (updated now-120s)
  //   seed-other   -> /mock/project/other-dir (updated now-60s, more recent)
  mock = createMockOpencodeServer({ port: PORT, seedSessions: true })
  await mock.listen()
  base = mock.url
})

after(async () => {
  await mock.close()
})

// The exact transport sdk.ts builds in production: prefer the global
// experimental endpoint, signal fallback (null) only on 404.
function realTransport(baseUrl: string): SessionListTransport {
  return {
    getExperimental: async () => {
      const r = await fetch(`${baseUrl}/experimental/session`, { headers: { Accept: "application/json" } })
      if (r.status === 404) return null
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    },
    getLegacy: async (query) => {
      const r = await fetch(`${baseUrl}/session${query}`, { headers: { Accept: "application/json" } })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    },
  }
}

test("global sessions: lists sessions from EVERY directory without picking a folder", async () => {
  const sessions = await loadSessionList(realTransport(base), { roots: true, limit: 50 })

  // Both directories are represented — this is the whole feature.
  const ids = sessions.map((s) => s.id)
  assert.ok(ids.includes("seed-default"), "session from /mock/project must appear")
  assert.ok(ids.includes("seed-other"), "session from /mock/project/other-dir must appear")
  assert.equal(sessions.length, 2)

  const dirs = new Set(sessions.map((s) => s.directory))
  assert.equal(dirs.size, 2, "sessions span two distinct directories (global, not directory-scoped)")

  // Most-recently-updated first: seed-other (now-60s) before seed-default (now-120s).
  assert.equal(sessions[0].id, "seed-other")
  assert.equal(sessions[1].id, "seed-default")
})

test("hit the experimental endpoint, not the directory-scoped one", async () => {
  // Proves WHY the feature was needed: a plain directory-less GET /session
  // (no ?roots, no x-opencode-directory header) is directory-scoped and returns
  // ONLY the default directory's session — the old behavior that left the list
  // empty/partial until a folder was chosen.
  const scoped = await (await fetch(`${base}/session`)).json()
  assert.equal(scoped.length, 1, "directory-scoped /session returns only the default dir")
  assert.equal(scoped[0].id, "seed-default")

  // The global endpoint returns everything.
  const global = await (await fetch(`${base}/experimental/session`)).json()
  assert.equal(global.length, 2, "/experimental/session returns all sessions globally")
})

test("older servers (404 on /experimental/session) fall back to /session and still list globally", async () => {
  // Simulate a server that predates /experimental/session: getExperimental
  // resolves null (as it would on a 404), forcing the legacy path.
  const legacyTransport: SessionListTransport = {
    getExperimental: async () => null,
    getLegacy: async (query) => {
      const r = await fetch(`${base}/session${query}`, { headers: { Accept: "application/json" } })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    },
  }

  const sessions = await loadSessionList(legacyTransport, { roots: true, limit: 50 })
  // The mock's /session?roots=true returns all sessions, so the fallback still
  // produces a global list on old servers.
  assert.equal(sessions.length, 2)
  assert.deepEqual(new Set(sessions.map((s) => s.id)), new Set(["seed-default", "seed-other"]))
  // Sanity: the legacy query we sent is the exact one the old code sent.
  assert.equal(legacySessionQuery({ roots: true, limit: 50 }), "?roots=true&limit=50")
})

// --- v2 SSE stream (/api/event) — liveness transport coverage (#189/#186) ---
//
// Transport-level only: subscribes over real HTTP, parses frames with the
// production SSEParser, and asserts the two properties the client's liveness
// logic depends on — (1) bytes keep arriving (the 45s idle watchdog in
// src/lib/sdk.ts / sdk-v1.ts treats ANY bytes as proof of life, so a stream
// that never emits bytes is indistinguishable from a dead one), and (2)
// lifecycle broadcasts actually reach subscribers (the events store flips
// `connected`/`transport` to live on the first received event, so a stream
// that never delivers an event would never read as live).
//
// The generator-level tests below (collectGeneratorEvents) go one layer up:
// they drive the REAL client.global.events generator — the exact code path
// the events store consumes — against the mock server, and assert a quiet
// stream yields the liveness-only event. Before the Finding 1 fix the
// generator yielded nothing on a quiet stream (server.connected is dropped
// by the translator, heartbeats are comments), so these tests fail on the
// old code: no yield within the wait, and an empty type list.

async function collectSse(
  url: string,
  durationMs: number,
  trigger?: () => Promise<void>,
): Promise<{ raw: string; frames: Array<Record<string, unknown>> }> {
  const controller = new AbortController()
  const response = await fetch(url, { headers: { Accept: "text/event-stream" }, signal: controller.signal })
  assert.equal(response.status, 200, `GET ${url} must open the SSE stream`)
  assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/)

  const parser = new SSEParser()
  const decoder = new TextDecoder()
  const frames: Array<Record<string, unknown>> = []
  let raw = ""
  const reader = response.body!.getReader()
  const pump = (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value, { stream: true })
        raw += text
        for (const data of parser.push(text)) frames.push(JSON.parse(data) as Record<string, unknown>)
      }
    } catch {
      // Expected: aborting the fetch below rejects the pending read.
    }
  })()
  if (trigger) await trigger()
  await new Promise((resolve) => setTimeout(resolve, durationMs))
  controller.abort()
  await pump
  return { raw, frames }
}

test("v2 /api/event: stream opens, server.connected arrives, heartbeat bytes keep arriving", async () => {
  const { raw, frames } = await collectSse(`${base}/api/event`, 4500)

  assert.ok(
    frames.some((f) => f.type === "server.connected"),
    "a server.connected data frame must arrive on subscribe",
  )
  // Heartbeat comment frames every 2s — the bytes the idle watchdog watches
  // for. If the bug were present (a stream that opens but never emits), this
  // fails: no `: ping` in 4.5s of wall time.
  assert.match(raw, /: ping/, "heartbeat comment frames must arrive within a few seconds")
  assert.ok(
    frames.every((f) => typeof f.type === "string" && "data" in f),
    "v2 frames are {type, data} shaped (see V2EventTranslator)",
  )
})

test("v2 /api/event: execution lifecycle broadcasts reach subscribers in order", async () => {
  const created = (await (
    await fetch(`${base}/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
  ).json()) as { id: string }

  const { frames } = await collectSse(`${base}/api/event`, 5000, async () => {
    const res = await fetch(`${base}/session/${created.id}/prompt_async`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parts: [{ type: "text", text: "hi" }] }),
    })
    assert.equal(res.status, 200, "prompt_async must be accepted")
  })

  const types = frames.map((f) => f.type as string)
  assert.ok(types.includes("session.execution.started"), "execution start must broadcast over /api/event")
  assert.ok(types.includes("session.execution.succeeded"), "execution success must broadcast over /api/event")
  assert.ok(
    types.indexOf("session.execution.started") < types.indexOf("session.execution.succeeded"),
    "started must precede succeeded",
  )
  // The lifecycle frames carry the session they belong to.
  const started = frames.find((f) => f.type === "session.execution.started")
  assert.equal((started?.data as { sessionID?: string } | undefined)?.sessionID, created.id)
})

// --- Generator-level liveness (Finding 1) ---------------------------------
//
// Drive the REAL client.global.events generator — the exact code path the
// events store consumes — against the mock server. A quiet stream (subscribe
// frame + heartbeats only, no session events) must yield the liveness-only
// event: that yield is what flips the store to `live`, resets the backoff,
// and triggers the post-reconnect resync. Pre-fix the generator yielded
// nothing here, so the first assertion fails on the old code.

async function collectGeneratorEvents(
  client: Client,
  durationMs: number,
  trigger?: () => Promise<void>,
): Promise<string[]> {
  const controller = new AbortController()
  const gen = client.global.events(controller.signal)
  const types: string[] = []
  let notifyFirst: () => void = () => {}
  const firstYield = new Promise<void>((resolve) => {
    notifyFirst = resolve
  })
  const pump = (async () => {
    try {
      for await (const event of gen) {
        types.push(event.type)
        if (types.length === 1) notifyFirst()
      }
    } catch {
      // Expected: aborting the fetch below rejects the pending read.
    }
  })()
  // Wait for the subscription to be established (first yield) before
  // triggering: a broadcast sent before the dial completes is missed, and
  // SSE does not replay. Times out loudly if the generator never yields —
  // which is exactly Finding 1 on the old code.
  await Promise.race([
    firstYield,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("generator never yielded — no liveness on a quiet stream")), 5000),
    ),
  ])
  if (trigger) await trigger()
  await new Promise((resolve) => setTimeout(resolve, durationMs))
  controller.abort()
  await Promise.race([pump, new Promise((resolve) => setTimeout(resolve, 2000))])
  return types
}

test("v2 client.global.events: quiet stream yields liveness without any session event", async () => {
  const { createClient } = await import("./sdk.ts")
  const client = createClient({ baseUrl: base })
  const types = await collectGeneratorEvents(client, 3000)

  assert.ok(types.length >= 1, "generator must yield on a quiet stream (server.connected + heartbeats only)")
  assert.ok(
    types.every((t) => t === SSE_LIVENESS_EVENT_TYPE),
    `quiet stream must yield only liveness, got: ${types.join(",")}`,
  )
})

test("v1 client.global.events: quiet stream yields liveness without any session event", async () => {
  const { createClient } = await import("./sdk.ts")
  const client = createClient({ baseUrl: base, api: "v1" })
  const types = await collectGeneratorEvents(client, 3000)

  assert.ok(types.length >= 1, "generator must yield on a quiet v1 stream (: connected comment + heartbeats only)")
  assert.ok(
    types.every((t) => t === SSE_LIVENESS_EVENT_TYPE),
    `quiet v1 stream must yield only liveness, got: ${types.join(",")}`,
  )
})

test("v2 client.global.events: lifecycle events still flow through the generator", async () => {
  const { createClient } = await import("./sdk.ts")
  const client = createClient({ baseUrl: base })
  const created = (await (
    await fetch(`${base}/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
  ).json()) as { id: string }

  const types = await collectGeneratorEvents(client, 5000, async () => {
    const res = await fetch(`${base}/session/${created.id}/prompt_async`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parts: [{ type: "text", text: "hi" }] }),
    })
    assert.equal(res.status, 200, "prompt_async must be accepted")
  })

  // execution.started/succeeded translate to session.status busy/idle.
  assert.ok(types.includes("session.status"), `lifecycle must reach the generator, got: ${types.join(",")}`)
  // And the liveness yield must not have swallowed them — both kinds flow.
  assert.ok(types.includes(SSE_LIVENESS_EVENT_TYPE), `liveness must still be yielded, got: ${types.join(",")}`)
})
