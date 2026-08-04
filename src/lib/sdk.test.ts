// Integration tests for the production SDK client (src/lib/sdk.ts) driven
// against the real mock opencode server over HTTP.
//
// sdk.ts is THE networking surface of the app — every store, screen, and the
// demo script talk through createClient — yet it had no dedicated tests:
// only the SSE parser (sse.ts), request headers (headers.ts), auth error
// classification (api-error.ts), and the session-list shaping logic were
// covered in isolation. These tests exercise the ACTUAL client end-to-end:
// URL normalization, every REST method, the error contract (non-2xx throws
// ApiError carrying the HTTP status so callers can tell a 404 "older server"
// apart from other failures), the auth mapping (401 -> ApiAuthError), the
// /file/roots 404 -> null fallback, and the live SSE event stream driven by
// the mock's prompt_async broadcast.
//
// Run: node --test src/lib/sdk.test.ts

import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { createMockOpencodeServer } from "../../tests/fixtures/mock-opencode-server.ts"
import { ApiAuthError, isAuthError } from "./api-error.ts"
import { ApiError, createClient } from "./sdk.ts"

const PORT = 45080
const FAIL_AUTH_PORT = 45081
const SEED_DEFAULT = "seed-default"
const SEED_OTHER = "seed-other"

let mock: ReturnType<typeof createMockOpencodeServer>
let failAuthMock: ReturnType<typeof createMockOpencodeServer>
let base: string

before(async () => {
  mock = createMockOpencodeServer({ port: PORT, seedSessions: true })
  await mock.listen()
  base = mock.url

  failAuthMock = createMockOpencodeServer({ port: FAIL_AUTH_PORT, failAuth: true })
  await failAuthMock.listen()
})

after(async () => {
  await failAuthMock.close()
  await mock.close()
})

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`waitFor: timed out after ${timeoutMs}ms`)
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

// Asserts a rejected request throws the SDK error contract: ApiError for
// non-auth statuses (or ApiAuthError when `auth` is set) carrying `.status`.
async function expectStatus(
  promise: Promise<unknown>,
  status: number,
  ErrorClass: new (...args: never[]) => Error & { status: number } = ApiError,
): Promise<Error & { status: number }> {
  try {
    await promise
  } catch (err) {
    assert.ok(err instanceof ErrorClass, `expected ${ErrorClass.name}, got ${err?.constructor?.name}: ${err}`)
    assert.equal((err as Error & { status: number }).status, status)
    return err as Error & { status: number }
  }
  assert.fail("expected request to reject")
}

test("createClient: normalizes a trailing slash on baseUrl", async () => {
  const client = createClient({ baseUrl: `${base}/` })
  const health = await client.global.health()
  assert.equal(health.healthy, true)
})

test("global.health: returns healthy + version", async () => {
  const client = createClient({ baseUrl: base })
  const health = await client.global.health()
  assert.equal(health.healthy, true)
  assert.equal(typeof health.version, "string")
})

test("project: list includes the mock project and current resolves", async () => {
  const client = createClient({ baseUrl: base })
  const projects = await client.project.list()
  assert.ok(projects.some((p) => p.id === "mock-project"))
  const current = await client.project.current()
  assert.equal(current.id, "mock-project")
})

test("path.get: returns the known path surface", async () => {
  const client = createClient({ baseUrl: base })
  const paths = await client.path.get()
  for (const key of ["home", "state", "config", "worktree", "directory"]) {
    assert.equal(typeof paths[key], "string", `path.get().${key} must be a string`)
  }
})

test("agent/command/provider: lists resolve with the expected shapes", async () => {
  const client = createClient({ baseUrl: base })
  const agents = await client.agent.list()
  assert.ok(Array.isArray(agents))
  const commands = await client.command.list()
  assert.ok(Array.isArray(commands))
  const providers = await client.provider.list()
  assert.ok(Array.isArray(providers.all))
  assert.ok(Array.isArray(providers.connected))
  assert.ok(
    providers.all.some((p) => Object.keys(p.models).length > 0),
    "provider.all must include a provider with models",
  )
})

test("file.list: defaults to path=. and honors an explicit path", async () => {
  const client = createClient({ baseUrl: base })
  const root = await client.file.list()
  const names = root.map((e) => e.name)
  assert.ok(names.includes("README.md"))
  assert.ok(names.includes("frontend"))
  assert.ok(names.includes("backend"))
  const empty = await client.file.list({ path: "frontend" })
  assert.deepEqual(empty, [])
})

test("file.roots: returns null when the server lacks the route (404)", async () => {
  const client = createClient({ baseUrl: base })
  const roots = await client.file.roots()
  assert.equal(roots, null)
})

test("permission/question: lists resolve to empty arrays", async () => {
  const client = createClient({ baseUrl: base })
  assert.deepEqual(await client.permission.list(), [])
  assert.deepEqual(await client.question.list(), [])
})

test("session.list: experimental endpoint lists sessions from every directory", async () => {
  const client = createClient({ baseUrl: base })
  const sessions = await client.session.list({ roots: true, limit: 50 })
  const ids = sessions.map((s) => s.id)
  assert.ok(ids.includes(SEED_DEFAULT))
  assert.ok(ids.includes(SEED_OTHER))
})

test("session.list: works with no params", async () => {
  const client = createClient({ baseUrl: base })
  const sessions = await client.session.list()
  const ids = sessions.map((s) => s.id)
  assert.ok(ids.includes(SEED_DEFAULT))
})

test("session.create: honors x-opencode-directory and round-trips through get", async () => {
  const client = createClient({ baseUrl: base, directory: "/mock/project/other-dir" })
  const created = await client.session.create({ title: "SDK Test Session" })
  assert.equal(created.directory, "/mock/project/other-dir")
  const fetched = await client.session.get(created.id)
  assert.equal(fetched.id, created.id)
  assert.equal(fetched.title, "SDK Test Session")
})

test("session.get: returns a seeded session", async () => {
  const client = createClient({ baseUrl: base })
  const session = await client.session.get(SEED_DEFAULT)
  assert.equal(session.id, SEED_DEFAULT)
})

test("session.messages: returns an array for a seeded session", async () => {
  const client = createClient({ baseUrl: base })
  const messages = await client.session.messages(SEED_DEFAULT)
  assert.ok(Array.isArray(messages))
})

test("session.prompt: fire-and-forget send resolves", async () => {
  const client = createClient({ baseUrl: base })
  await client.session.prompt(SEED_DEFAULT, { parts: [{ type: "text", text: "hello from sdk.test" }] })
})

test("session.abort: resolves", async () => {
  const client = createClient({ baseUrl: base })
  await client.session.abort(SEED_DEFAULT)
})

test("non-2xx responses throw ApiError carrying the HTTP status", async () => {
  const client = createClient({ baseUrl: base })
  await expectStatus(client.session.get("missing-session"), 404)
  await expectStatus(client.session.messages("missing-session"), 404)
  await expectStatus(client.session.update("missing-session", { title: "x" }), 404)
  await expectStatus(client.session.delete("missing-session"), 404)
  await expectStatus(client.session.diff(SEED_DEFAULT), 404)
  await expectStatus(client.session.revert(SEED_DEFAULT, "msg-1"), 404)
  await expectStatus(client.session.unrevert(SEED_DEFAULT), 404)
  await expectStatus(client.session.command(SEED_DEFAULT, { command: "help", arguments: "" }), 404)
  await expectStatus(client.permission.reply("req-1", "always"), 404)
  await expectStatus(client.question.reply("req-1", [["yes"]]), 404)
  await expectStatus(client.question.reject("req-1"), 404)
  await expectStatus(client.config.get(), 404)
})

test("401 responses throw ApiAuthError (isAuthError true)", async () => {
  const client = createClient({ baseUrl: failAuthMock.url })
  const err = await expectStatus(client.global.health(), 401, ApiAuthError)
  assert.ok(isAuthError(err), "401 must map to ApiAuthError")
})

test("file.roots: does NOT swallow auth failures (401 propagates)", async () => {
  const client = createClient({ baseUrl: failAuthMock.url })
  const err = await expectStatus(client.file.roots(), 401, ApiAuthError)
  assert.ok(isAuthError(err))
})

test("global.events: streams the mock's prompt broadcast over SSE", async () => {
  const client = createClient({ baseUrl: base })
  const ac = new AbortController()
  const seen: Array<{ type: string; properties: Record<string, unknown> }> = []

  const collect = (async () => {
    for await (const raw of client.global.events(ac.signal)) {
      const ev = raw as { type: string; properties: Record<string, unknown> }
      seen.push(ev)
    }
  })().catch(() => {})

  // Give the SSE handshake time to register the client, then prompt so the
  // mock broadcasts the user message + assistant reply + idle status.
  await new Promise((resolve) => setTimeout(resolve, 300))
  await client.session.prompt(SEED_DEFAULT, { parts: [{ type: "text", text: "stream this please" }] })

  await waitFor(
    () => seen.some((ev) => ev.type === "session.status" && (ev.properties.status as { type?: string })?.type === "idle"),
    3000,
  )
  ac.abort()
  await collect

  const types = seen.map((ev) => ev.type)
  assert.ok(types.includes("message.updated"), `expected message.updated in ${types.join(", ")}`)
  assert.ok(types.includes("session.status"), `expected session.status in ${types.join(", ")}`)
})
