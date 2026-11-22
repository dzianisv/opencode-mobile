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

import { test, describe, before, after } from "node:test"
import assert from "node:assert/strict"
import { register } from "node:module"
import {
  createMockOpencodeServer,
  DEFAULT_DIRECTORY,
  SEED_PARENT_SESSION_ID,
  SEED_PARENT_TITLE,
  SEED_CHILD_DONE_ID,
  SEED_CHILD_DONE_TITLE,
  SEED_CHILD_IDLE_ID,
  SEED_CHILD_IDLE_TITLE,
} from "../../tests/fixtures/mock-opencode-server.ts"
import { loadSessionList, legacySessionQuery, type SessionListTransport } from "./session-list.ts"
import { formatSessionCost, sessionCost, sessionCostText } from "./session-cost.ts"
import { selectChildren } from "./session-children.ts"
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

// Session rename (#295) — the long-press Rename menu in the sessions list
// (app/(tabs)/index.tsx submitRename) calls client.session.update, which on
// v1 is PATCH /session/:id { title }. Drives the REAL v1 client over HTTP
// against the mock and proves the round-trip the switcher depends on: the
// renamed title is what a re-list returns, so the list shows the new name
// after the rename (the list itself then just re-renders the re-loaded rows).
// Renames seed-default (DEFAULT_DIRECTORY, so the directory-less client may
// PATCH it — the mock enforces the same per-directory scoping as GET), and
// leaves time.updated alone so the most-recent-first order above is stable.
test("rename (#295): PATCH title via the real v1 client, re-list shows the new title", async () => {
  const { createClient } = await import("./sdk.ts")
  const client = createClient({ baseUrl: base, api: "v1" })

  const renamed = await client.session.update("seed-default", { title: "Renamed Session" })
  assert.equal(renamed.id, "seed-default")
  assert.equal(renamed.title, "Renamed Session")

  // The list the switcher renders reflects the rename — no stale title.
  const sessions = await loadSessionList(realTransport(base), { roots: true, limit: 50 })
  const byId = new Map(sessions.map((s) => [s.id, s]))
  assert.equal(byId.get("seed-default")?.title, "Renamed Session")
  assert.equal(byId.get("seed-other")?.title, "Cross-Project Session")
})

// Subagent children (#187) — the session.created routing itself lives in the
// RN-only events store, which plain node --test cannot load, and the mock
// emits no session.created broadcast (nor can any UI create a child), so the
// live routing branch has no automated cover in this slice: it is verified by
// inspection, and the rendered section is covered by
// .maestro/flows/subagents.yaml. What this block DOES prove across the real
// HTTP boundary is the data path the section and the leak-closure depend on:
// the pool carries children with parentID (OQ1 at the app boundary),
// selectChildren isolates one parent's children (AC1), and the roots list
// excludes children (AC3, load path).
describe("subagent children: pool carries children, roots list stays roots-only", () => {
  const PORT = 45072
  let subMock: ReturnType<typeof createMockOpencodeServer>
  let subBase: string

  before(async () => {
    // --seed-subagents pre-populates one parent + two children, all in
    // DEFAULT_DIRECTORY (/mock/project):
    //   seed-parent     (updated now-60s)
    //   seed-child-done (parentID seed-parent, agent explore,
    //                    model opencode/deepseek-v4-flash-free,
    //                    time.idle set, updated now-30s, newest)
    //   seed-child-idle (parentID seed-parent, no agent/model/idle,
    //                    updated now-45s)
    subMock = createMockOpencodeServer({ port: PORT, seedSubagents: true })
    await subMock.listen()
    subBase = subMock.url
  })

  after(async () => {
    await subMock.close()
  })

  test("pool: the global list carries children with parentID set (OQ1)", async () => {
    const pool = await loadSessionList(realTransport(subBase))
    const byId = new Map(pool.map((s) => [s.id, s]))
    assert.equal(pool.length, 3)
    assert.equal(byId.get(SEED_CHILD_DONE_ID)?.parentID, SEED_PARENT_SESSION_ID)
    assert.equal(byId.get(SEED_CHILD_IDLE_ID)?.parentID, SEED_PARENT_SESSION_ID)
    assert.equal(byId.get(SEED_PARENT_SESSION_ID)?.parentID, undefined)
  })

  test("selectChildren (AC1): isolates one parent's children, newest-first", async () => {
    const pool = await loadSessionList(realTransport(subBase))
    const children = selectChildren(pool, SEED_PARENT_SESSION_ID)
    assert.deepEqual(
      children.map((s) => s.id),
      [SEED_CHILD_DONE_ID, SEED_CHILD_IDLE_ID],
    )
    assert.equal(children[0].title, SEED_CHILD_DONE_TITLE)
    assert.equal(children[1].title, SEED_CHILD_IDLE_TITLE)
  })

  test("selectChildren (AC1): child rows carry agent/model where the server provides them", async () => {
    const pool = await loadSessionList(realTransport(subBase))
    const children = selectChildren(pool, SEED_PARENT_SESSION_ID)
    const done = children.find((s) => s.id === SEED_CHILD_DONE_ID)
    assert.equal(done?.agent, "explore")
    assert.deepEqual(done?.model, { providerID: "opencode", modelID: "deepseek-v4-flash-free" })
    assert.ok(done?.time?.idle != null, "done child carries time.idle")
    const idle = children.find((s) => s.id === SEED_CHILD_IDLE_ID)
    assert.equal(idle?.agent, undefined)
    assert.equal(idle?.model, undefined)
  })

  test("roots list (AC3): roots:true excludes children at load time", async () => {
    const sessions = await loadSessionList(realTransport(subBase), { roots: true, limit: 50 })
    assert.deepEqual(
      sessions.map((s) => s.id),
      [SEED_PARENT_SESSION_ID],
    )
    assert.ok(sessions.every((s) => !s.parentID), "no parentID row reaches the root list")
    assert.equal(sessions[0].title, SEED_PARENT_TITLE)
  })
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

// --- New session defaults to the server default directory (#291) -----------
//
// The app's default create path (FAB tap, and the New Session modal's primary
// button) calls session.create with NO directory: the server must place the
// session in its own default directory, matching the terminal app, instead of
// forcing the user through the directory form on every new session. The
// directory choice stays available as an optional/advanced path — a
// directory-scoped client still creates in the directory it was given.
// These tests drive the REAL v1 client against the mock server over HTTP
// (same pattern as the liveness tests above). The modal's collapsed-by-default
// disclosure itself is RN-only and not runnable under node --test, so it is
// covered by typecheck + review and by .maestro/flows/directory-picker.yaml
// (which now expands the disclosure before asserting on its contents).
//
// Appended at the end of the file on purpose: the tests above assert exact
// session counts on the shared mock, and these creates add sessions to it.
describe("new session defaults to server default directory (#291)", () => {
  test("create with no directory lands in the server default directory", async () => {
    const { createClient } = await import("./sdk.ts")
    const client = createClient({ baseUrl: base, api: "v1" })
    const created = await client.session.create({})
    assert.ok(created.id, "create must return a session id")
    assert.equal(
      created.directory,
      DEFAULT_DIRECTORY,
      "a directory-less create must land in the server default, not require a picked folder",
    )
  })

  test("directory-scoped create still honors an explicitly chosen directory", async () => {
    const { createClient } = await import("./sdk.ts")
    const otherDir = "/mock/project/other-dir"
    const client = createClient({ baseUrl: base, api: "v1", directory: otherDir })
    const created = await client.session.create({})
    assert.ok(created.id, "create must return a session id")
    assert.equal(
      created.directory,
      otherDir,
      "the optional/advanced directory choice must still scope the new session",
    )
  })
})

// --- Session cost (#293) ---------------------------------------------------
//
// The header cost is the sum of Message.cost over assistant messages, so
// this test proves the cost actually arrives over the wire: drive the REAL
// v1 client.global.events generator against the mock server, trigger a
// prompt, and assert the assistant message.updated carries the cost the
// mock reply reports — then assert the header's sum/format over exactly
// those received messages. v1, not v2: the v2 translator drops v1-shaped
// frames, and the mock broadcasts message.updated in v1 shape.

async function collectV1Events(
  client: Client,
  durationMs: number,
  trigger?: () => Promise<void>,
): Promise<Array<{ type: string; properties: Record<string, unknown> }>> {
  const controller = new AbortController()
  const gen = client.global.events(controller.signal)
  const events: Array<{ type: string; properties: Record<string, unknown> }> = []
  let notifyFirst: () => void = () => {}
  const firstYield = new Promise<void>((resolve) => {
    notifyFirst = resolve
  })
  const pump = (async () => {
    try {
      for await (const event of gen) {
        events.push(event)
        if (events.length === 1) notifyFirst()
      }
    } catch {
      // Expected: aborting the fetch below rejects the pending read.
    }
  })()
  // Wait for the subscription to be established (first yield) before
  // triggering: a broadcast sent before the dial completes is missed, and
  // SSE does not replay.
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
  return events
}

test("v1 client.global.events: assistant message.updated carries the cost the session header sums (#293)", async () => {
  const { createClient } = await import("./sdk.ts")
  const client = createClient({ baseUrl: base, api: "v1" })
  const created = (await (
    await fetch(`${base}/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
  ).json()) as { id: string }

  const events = await collectV1Events(client, 5000, async () => {
    const res = await fetch(`${base}/session/${created.id}/prompt_async`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parts: [{ type: "text", text: "hi" }] }),
    })
    assert.equal(res.status, 200, "prompt_async must be accepted")
  })

  const infos = events
    .filter((e) => e.type === "message.updated")
    .map((e) => e.properties.info as { role?: string; cost?: number; sessionID?: string })
    .filter((info) => info.sessionID === created.id && info.role === "assistant")
  assert.ok(
    infos.length >= 1,
    `assistant message.updated must arrive, got: ${events.map((e) => e.type).join(",")}`,
  )
  assert.ok(
    infos.some((info) => info.cost === 0.0143),
    `assistant message must carry the mock reply cost 0.0143, got: ${JSON.stringify(infos)}`,
  )

  // The header's exact inputs: the received messages, summed and formatted.
  const messages = infos.map((info) => ({ role: "assistant" as const, cost: info.cost }))
  assert.equal(sessionCost(messages), 0.0143)
  assert.equal(sessionCostText(messages), "$0.0143")
  assert.equal(formatSessionCost(1.5), "$1.50")
  // No priced message yet → the header renders nothing, never "$0.00".
  assert.equal(sessionCostText([]), null)
  assert.equal(sessionCostText([{ role: "user", cost: undefined }]), null)
})
