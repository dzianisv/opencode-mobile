import { test } from "node:test"
import assert from "node:assert/strict"
import {
  WAITLIST_ENDPOINT,
  WAITLIST_SOURCE,
  normalizeWaitlistEmail,
  buildWaitlistPayload,
  buildWaitlistMailtoUrl,
  isRetryableFailure,
  submitWaitlistSignup,
} from "./waitlist.ts"

// --- normalizeWaitlistEmail: mirror of the server's 400 rule ---

test("normalize trims and lowercases like the server", () => {
  assert.equal(normalizeWaitlistEmail("  Dev@Example.COM "), "dev@example.com")
})

test("normalize rejects what the server would 400 on", () => {
  assert.equal(normalizeWaitlistEmail(""), null)
  assert.equal(normalizeWaitlistEmail("   "), null)
  assert.equal(normalizeWaitlistEmail("not-an-email"), null)
  assert.equal(normalizeWaitlistEmail("a b@example.com"), null)
  assert.equal(normalizeWaitlistEmail("no-tld@host"), null)
  assert.equal(normalizeWaitlistEmail(`${"x".repeat(250)}@a.com`), null) // > 254 chars
})

// --- payload: the source tag is the whole point of #87 ---

test("payload tags the signup with the opencode-connect source", () => {
  assert.deepEqual(buildWaitlistPayload("dev@example.com"), {
    email: "dev@example.com",
    source: WAITLIST_SOURCE,
  })
})

// --- mailto URL: last-resort escape hatch only (AGE-87), byte-compatible ---

test("mailto escape hatch preserves subject and embeds the email", () => {
  const url = buildWaitlistMailtoUrl("dev@example.com")
  assert.ok(url.startsWith("mailto:support@agentlabs.cc?"))
  assert.ok(url.includes("subject=OpenCode%20Connect%20Waitlist"))
  assert.ok(url.includes(encodeURIComponent("Email: dev@example.com")))
})

test("mailto escape hatch works without an email", () => {
  const url = buildWaitlistMailtoUrl("")
  assert.ok(url.includes("body=Sign%20me%20up!"))
  assert.ok(!url.includes("Email"))
})

// --- retry decision ---

// 502 named explicitly: the server returns it when Brevo itself fails, and the
// signup must survive that by being queued and retried (AGE-87), not mailed.
test("retryable: transport failures and 5xx (incl. 502 Brevo failure) -> retry, 4xx -> fix input", () => {
  assert.equal(isRetryableFailure({ kind: "network-error" }), true)
  assert.equal(isRetryableFailure({ kind: "http", status: 500 }), true)
  assert.equal(isRetryableFailure({ kind: "http", status: 502 }), true)
  assert.equal(isRetryableFailure({ kind: "http", status: 503 }), true)
  assert.equal(isRetryableFailure({ kind: "http", status: 400 }), false)
  assert.equal(isRetryableFailure({ kind: "http", status: 429 }), false)
})

// --- submitWaitlistSignup with injected fetch ---

type FetchCall = { url: string; init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal } }

function fakeFetch(response: { ok: boolean; status: number; body?: unknown }, calls: FetchCall[] = []) {
  return async (url: string, init: FetchCall["init"]) => {
    calls.push({ url, init })
    return { ok: response.ok, status: response.status, json: async () => response.body ?? null }
  }
}

test("submit posts the tagged payload to the beta-signup endpoint", async () => {
  const calls: FetchCall[] = []
  const result = await submitWaitlistSignup(" Dev@Example.com ", { fetchFn: fakeFetch({ ok: true, status: 200, body: { ok: true } }, calls) })
  assert.deepEqual(result, { ok: true, email: "dev@example.com" })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, WAITLIST_ENDPOINT)
  assert.equal(calls[0].init.method, "POST")
  assert.equal(calls[0].init.headers["content-type"], "application/json")
  assert.deepEqual(JSON.parse(calls[0].init.body), { email: "dev@example.com", source: WAITLIST_SOURCE })
  assert.ok(calls[0].init.signal instanceof AbortSignal)
})

test("submit rejects an invalid email locally without hitting the network", async () => {
  const calls: FetchCall[] = []
  const result = await submitWaitlistSignup("nope", { fetchFn: fakeFetch({ ok: true, status: 200 }, calls) })
  assert.equal(calls.length, 0)
  assert.deepEqual(result, { ok: false, email: "nope", retryable: false, error: "Enter a valid email address." })
})

test("submit surfaces the server's 400 message and marks it non-retryable", async () => {
  const result = await submitWaitlistSignup("dev@example.com", {
    fetchFn: fakeFetch({ ok: false, status: 400, body: { error: "Enter a valid email address." } }),
  })
  assert.deepEqual(result, { ok: false, email: "dev@example.com", retryable: false, error: "Enter a valid email address." })
})

test("submit marks 5xx retryable (server broken, keep the signup alive)", async () => {
  const result = await submitWaitlistSignup("dev@example.com", {
    fetchFn: fakeFetch({ ok: false, status: 503, body: { error: "The waitlist is temporarily unavailable. Please try again later." } }),
  })
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.retryable, true)
    assert.equal(result.error, "The waitlist is temporarily unavailable. Please try again later.")
  }
})

test("submit marks a rejected fetch retryable (offline)", async () => {
  const result = await submitWaitlistSignup("dev@example.com", {
    fetchFn: async () => {
      throw new TypeError("Network request failed")
    },
  })
  assert.deepEqual(result, { ok: false, email: "dev@example.com", retryable: true, error: "Network request failed" })
})

test("submit aborts after timeoutMs and marks it retryable", async () => {
  const result = await submitWaitlistSignup("dev@example.com", {
    timeoutMs: 20,
    fetchFn: (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => {
          const err = new Error("Aborted")
          err.name = "AbortError"
          reject(err)
        })
      }),
  })
  assert.deepEqual(result, { ok: false, email: "dev@example.com", retryable: true, error: "timeout after 20ms" })
})

test("submit tolerates a non-JSON error body", async () => {
  const result = await submitWaitlistSignup("dev@example.com", {
    fetchFn: async () => ({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError("Unexpected token")
      },
    }),
  })
  assert.deepEqual(result, { ok: false, email: "dev@example.com", retryable: true, error: "Signup failed (HTTP 502)." })
})
