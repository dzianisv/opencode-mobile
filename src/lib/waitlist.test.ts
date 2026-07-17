import { test } from "node:test"
import assert from "node:assert/strict"
import {
  WAITLIST_ENDPOINT,
  WAITLIST_SOURCE,
  normalizeWaitlistEmail,
  buildWaitlistPayload,
  buildWaitlistMailtoUrl,
  shouldFallbackToMailto,
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

// --- mailto fallback URL: byte-compatible with the pre-#87 behavior ---

test("mailto fallback preserves subject and embeds the email", () => {
  const url = buildWaitlistMailtoUrl("dev@example.com")
  assert.ok(url.startsWith("mailto:support@agentlabs.cc?"))
  assert.ok(url.includes("subject=OpenCode%20Connect%20Waitlist"))
  assert.ok(url.includes(encodeURIComponent("Email: dev@example.com")))
})

test("mailto fallback works without an email", () => {
  const url = buildWaitlistMailtoUrl("")
  assert.ok(url.includes("body=Sign%20me%20up!"))
  assert.ok(!url.includes("Email"))
})

// --- fallback decision ---

// 502 named explicitly: the server returns it when Brevo itself fails, and the
// signup must survive that via mailto.
test("fallback: transport failures and 5xx (incl. 502 Brevo failure) -> mailto, 4xx -> fix input", () => {
  assert.equal(shouldFallbackToMailto({ kind: "network-error" }), true)
  assert.equal(shouldFallbackToMailto({ kind: "http", status: 500 }), true)
  assert.equal(shouldFallbackToMailto({ kind: "http", status: 502 }), true)
  assert.equal(shouldFallbackToMailto({ kind: "http", status: 503 }), true)
  assert.equal(shouldFallbackToMailto({ kind: "http", status: 400 }), false)
  assert.equal(shouldFallbackToMailto({ kind: "http", status: 429 }), false)
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
  assert.deepEqual(result, { ok: false, email: "nope", fallback: false, error: "Enter a valid email address." })
})

test("submit surfaces the server's 400 message without falling back to mailto", async () => {
  const result = await submitWaitlistSignup("dev@example.com", {
    fetchFn: fakeFetch({ ok: false, status: 400, body: { error: "Enter a valid email address." } }),
  })
  assert.deepEqual(result, { ok: false, email: "dev@example.com", fallback: false, error: "Enter a valid email address." })
})

test("submit falls back to mailto on 5xx (server broken, keep the signup alive)", async () => {
  const result = await submitWaitlistSignup("dev@example.com", {
    fetchFn: fakeFetch({ ok: false, status: 503, body: { error: "The waitlist is temporarily unavailable. Please try again later." } }),
  })
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.fallback, true)
    assert.equal(result.error, "The waitlist is temporarily unavailable. Please try again later.")
  }
})

test("submit falls back to mailto when fetch rejects (offline)", async () => {
  const result = await submitWaitlistSignup("dev@example.com", {
    fetchFn: async () => {
      throw new TypeError("Network request failed")
    },
  })
  assert.deepEqual(result, { ok: false, email: "dev@example.com", fallback: true, error: "Network request failed" })
})

test("submit aborts after timeoutMs and falls back to mailto", async () => {
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
  assert.deepEqual(result, { ok: false, email: "dev@example.com", fallback: true, error: "timeout after 20ms" })
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
  assert.deepEqual(result, { ok: false, email: "dev@example.com", fallback: true, error: "Signup failed (HTTP 502)." })
})
