import { test } from "node:test"
import assert from "node:assert/strict"
import {
  needsRefresh,
  normalizeIssuer,
  OIDC_REDIRECT_URI,
  OIDC_SCOPES,
  oidcAccessKey,
  oidcExpiresKey,
  oidcRefreshKey,
} from "./oidc.ts"

test("redirect URI is the public-client custom scheme", () => {
  assert.equal(OIDC_REDIRECT_URI, "opencode://auth")
})

test("default scopes include openid, profile, and offline_access", () => {
  assert.deepEqual([...OIDC_SCOPES].sort(), ["offline_access", "openid", "profile"])
})

test("normalizeIssuer strips whitespace and trailing slashes", () => {
  assert.equal(normalizeIssuer(" https://auth.example.com/ "), "https://auth.example.com")
  assert.equal(normalizeIssuer("https://auth.example.com///"), "https://auth.example.com")
  assert.equal(normalizeIssuer("https://auth.example.com/application/o/opencode/"), "https://auth.example.com/application/o/opencode")
})

test("needsRefresh is true within the 60s window", () => {
  const now = 1_000_000
  assert.equal(needsRefresh(now + 60_000, now), true)
  assert.equal(needsRefresh(now + 60_001, now), false)
  assert.equal(needsRefresh(now - 1, now), true)
  assert.equal(needsRefresh(null, now), true)
})

test("token SecureStore keys are per connection id", () => {
  assert.equal(oidcAccessKey("abc"), "opencode_oidc_access_abc")
  assert.equal(oidcRefreshKey("abc"), "opencode_oidc_refresh_abc")
  assert.equal(oidcExpiresKey("abc"), "opencode_oidc_expires_abc")
})
