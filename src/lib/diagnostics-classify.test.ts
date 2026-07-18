import { test } from "node:test"
import assert from "node:assert/strict"
import { parseUrl, classify, type ProbeAttempt } from "./diagnostics-classify.ts"

const probe = (over: Partial<ProbeAttempt> = {}): ProbeAttempt => ({
  name: "p",
  target: "t",
  ok: false,
  durationMs: 1,
  ...over,
})

// ---------------- parseUrl ----------------

test("parses scheme, host, and explicit port", () => {
  assert.deepEqual(parseUrl("http://192.168.1.10:4096"), {
    valid: true,
    scheme: "http",
    host: "192.168.1.10",
    port: "4096",
    isHostname: false,
  })
})

test("defaults port to 443 for https and 80 for http", () => {
  assert.equal(parseUrl("https://example.com").port, "443")
  assert.equal(parseUrl("http://example.com").port, "80")
})

test("lowercases the scheme and trims surrounding whitespace", () => {
  const p = parseUrl("  HTTPS://Host.Example  ")
  assert.equal(p.scheme, "https")
  assert.equal(p.host, "Host.Example") // host case is preserved
})

test("flags an IPv4 host as not-a-hostname, and a DNS name as a hostname", () => {
  assert.equal(parseUrl("http://10.0.0.1:8080").isHostname, false)
  assert.equal(parseUrl("http://server.tailnet.ts.net:8080").isHostname, true)
})

test("ignores path, query, and fragment when extracting the host", () => {
  const p = parseUrl("http://host:9000/global/health?x=1#frag")
  assert.equal(p.host, "host")
  assert.equal(p.port, "9000")
})

test("rejects malformed or non-http(s) URLs", () => {
  for (const bad of ["", "not a url", "ftp://host", "host:1234", "://nope", "https://"]) {
    assert.equal(parseUrl(bad).valid, false, `should be invalid: ${JSON.stringify(bad)}`)
  }
})

// ---------------- classify ----------------

const okUrl = parseUrl("http://host:8080")

test("malformed URL short-circuits to malformed-url", () => {
  const r = classify(parseUrl("garbage"), probe(), probe(), probe())
  assert.equal(r.classification, "malformed-url")
})

test("a healthy probe classifies as ok regardless of other probes", () => {
  const r = classify(okUrl, probe({ ok: true, status: 200 }), probe(), probe())
  assert.equal(r.classification, "ok")
})

test("TLS-flavored error wins even when internet is down", () => {
  const r = classify(okUrl, probe({ error: "SSL handshake failed" }), probe({ ok: false }), probe())
  assert.equal(r.classification, "tls-error")
})

test("detects TLS keywords from errorCause too", () => {
  const r = classify(okUrl, probe({ errorCause: "certificate has expired" }), probe({ ok: true }), probe())
  assert.equal(r.classification, "tls-error")
})

test("no internet (and no TLS signal) classifies as no-internet", () => {
  const r = classify(okUrl, probe({ error: "Network request failed" }), probe({ ok: false }), probe())
  assert.equal(r.classification, "no-internet")
})

test("internet up + server root reachable but health failed -> health-failed (includes status)", () => {
  const r = classify(
    okUrl,
    probe({ error: "HTTP 404", status: 404 }),
    probe({ ok: true }), // internet
    probe({ ok: true, status: 404 }), // root reachable
  )
  assert.equal(r.classification, "health-failed")
  assert.match(r.summary, /404/)
})

test("internet up, root unreachable, timeout signal -> timeout", () => {
  const r = classify(
    okUrl,
    probe({ error: "timeout after 8000ms" }),
    probe({ ok: true }),
    probe({ ok: false }),
  )
  assert.equal(r.classification, "timeout")
})

test("internet up, root unreachable, no timeout -> server-unreachable", () => {
  const r = classify(
    okUrl,
    probe({ error: "connection refused" }),
    probe({ ok: true }),
    probe({ ok: false }),
  )
  assert.equal(r.classification, "server-unreachable")
})

test("root reachable but internet probe down still classifies as health-failed, not no-internet", () => {
  // Regression: the user's own server responded (proving the path to it
  // works — e.g. captive portal or no WAN but Tailscale LAN still up), so
  // this must not be misreported as "no internet".
  const r = classify(
    okUrl,
    probe({ ok: false, error: "HTTP 401", status: 401 }), // health
    probe({ ok: false }), // internet (down)
    probe({ ok: true }), // root (reachable)
  )
  assert.equal(r.classification, "health-failed")
})

test("server-unreachable adds MagicDNS hint only for hostnames, not IPs", () => {
  const fail = { internet: probe({ ok: true }), root: probe({ ok: false }) }
  const hostR = classify(parseUrl("http://box.ts.net:8080"), probe({ error: "refused" }), fail.internet, fail.root)
  const ipR = classify(parseUrl("http://10.0.0.5:8080"), probe({ error: "refused" }), fail.internet, fail.root)
  assert.match(hostR.summary, /MagicDNS/)
  assert.doesNotMatch(ipR.summary, /MagicDNS/)
})
