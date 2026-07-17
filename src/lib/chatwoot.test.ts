import { test, beforeEach, afterEach } from "node:test"
import assert from "node:assert/strict"
import { chatwootConfigured, sendSupportReport } from "./chatwoot.ts"

const INBOX = "inbox-token-abc"
const BASE = "https://support.example.com"

const savedEnv = { ...process.env }

beforeEach(() => {
  process.env.EXPO_PUBLIC_CHATWOOT_INBOX_IDENTIFIER = INBOX
  process.env.EXPO_PUBLIC_CHATWOOT_BASE_URL = BASE
})

afterEach(() => {
  process.env = { ...savedEnv }
})

interface Call {
  url: string
  body: Record<string, unknown>
}

// Sequenced fetch mock: each entry answers one call, in order.
function mockFetch(responses: Array<{ status: number; json?: unknown }>) {
  const calls: Call[] = []
  const fetchFn = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) })
    const next = responses[calls.length - 1] ?? { status: 500 }
    return {
      status: next.status,
      json: async () => {
        if (next.json === undefined) throw new Error("no body")
        return next.json
      },
    } as Response
  }) as typeof fetch
  return { fetchFn, calls }
}

test("chatwootConfigured false without inbox identifier", () => {
  delete process.env.EXPO_PUBLIC_CHATWOOT_INBOX_IDENTIFIER
  assert.equal(chatwootConfigured(), false)
})

test("sendSupportReport returns false when unconfigured, makes no calls", async () => {
  delete process.env.EXPO_PUBLIC_CHATWOOT_INBOX_IDENTIFIER
  const { fetchFn, calls } = mockFetch([])
  assert.equal(await sendSupportReport("hello", { fetchFn }), false)
  assert.equal(calls.length, 0)
})

test("happy path: contact -> conversation -> message, source_id saved", async () => {
  const { fetchFn, calls } = mockFetch([
    { status: 200, json: { source_id: "src-1" } },
    { status: 200, json: { id: 42 } },
    { status: 200, json: {} },
  ])
  let saved: string | null = null
  const ok = await sendSupportReport("report body", {
    fetchFn,
    loadSourceId: async () => null,
    saveSourceId: async (id) => {
      saved = id
    },
  })
  assert.equal(ok, true)
  assert.equal(saved, "src-1")
  assert.deepEqual(
    calls.map((c) => c.url),
    [
      `${BASE}/public/api/v1/inboxes/${INBOX}/contacts`,
      `${BASE}/public/api/v1/inboxes/${INBOX}/contacts/src-1/conversations`,
      `${BASE}/public/api/v1/inboxes/${INBOX}/contacts/src-1/conversations/42/messages`,
    ],
  )
  assert.equal(calls[2].body.content, "report body")
})

test("stored source_id skips contact creation", async () => {
  const { fetchFn, calls } = mockFetch([
    { status: 200, json: { id: 7 } },
    { status: 200, json: {} },
  ])
  const ok = await sendSupportReport("hi", { fetchFn, loadSourceId: async () => "src-old" })
  assert.equal(ok, true)
  assert.equal(calls.length, 2)
  assert.match(calls[0].url, /contacts\/src-old\/conversations$/)
})

test("stale source_id (404) recreates contact once and retries", async () => {
  const { fetchFn, calls } = mockFetch([
    { status: 404, json: { error: "resource could not be found" } },
    { status: 200, json: { source_id: "src-new" } },
    { status: 200, json: { id: 9 } },
    { status: 200, json: {} },
  ])
  let saved: string | null = null
  const ok = await sendSupportReport("hi", {
    fetchFn,
    loadSourceId: async () => "src-stale",
    saveSourceId: async (id) => {
      saved = id
    },
  })
  assert.equal(ok, true)
  assert.equal(saved, "src-new")
  assert.equal(calls.length, 4)
  assert.match(calls[3].url, /contacts\/src-new\/conversations\/9\/messages$/)
})

test("contact create failure throws", async () => {
  const { fetchFn } = mockFetch([{ status: 500, json: { error: "boom" } }])
  await assert.rejects(() => sendSupportReport("hi", { fetchFn, loadSourceId: async () => null }), /http 500/)
})

test("non-404 conversation failure does not recreate contact", async () => {
  const { fetchFn, calls } = mockFetch([{ status: 500 }])
  await assert.rejects(() => sendSupportReport("hi", { fetchFn, loadSourceId: async () => "src-x" }), /http 500/)
  assert.equal(calls.length, 1)
})

test("base url trailing slash is normalised", async () => {
  process.env.EXPO_PUBLIC_CHATWOOT_BASE_URL = `${BASE}///`
  const { fetchFn, calls } = mockFetch([
    { status: 200, json: { id: 1 } },
    { status: 200, json: {} },
  ])
  await sendSupportReport("hi", { fetchFn, loadSourceId: async () => "s" })
  assert.equal(calls[0].url, `${BASE}/public/api/v1/inboxes/${INBOX}/contacts/s/conversations`)
})
