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

import { test, describe, before, after } from "node:test"
import assert from "node:assert/strict"
import {
  createMockOpencodeServer,
  SEED_PARENT_SESSION_ID,
  SEED_PARENT_TITLE,
  SEED_CHILD_DONE_ID,
  SEED_CHILD_DONE_TITLE,
  SEED_CHILD_IDLE_ID,
  SEED_CHILD_IDLE_TITLE,
} from "../../tests/fixtures/mock-opencode-server.ts"
import { loadSessionList, legacySessionQuery, type SessionListTransport } from "./session-list.ts"
import { selectChildren } from "./session-children.ts"

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
