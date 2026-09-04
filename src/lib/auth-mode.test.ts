import { test } from "node:test"
import assert from "node:assert/strict"
import { inferAuthMode } from "./auth-mode.ts"

test("missing authMode with password loads as basic", () => {
  assert.equal(inferAuthMode({}, true), "basic")
  assert.equal(inferAuthMode({ authMode: undefined }, true), "basic")
})

test("missing authMode without password loads as none", () => {
  assert.equal(inferAuthMode({}, false), "none")
})

test("stored authMode is preserved and never inferred as oidc", () => {
  assert.equal(inferAuthMode({ authMode: "none" }, true), "none")
  assert.equal(inferAuthMode({ authMode: "basic" }, false), "basic")
  assert.equal(inferAuthMode({ authMode: "oidc" }, false), "oidc")
})

test("unknown authMode falls back to password presence, not oidc", () => {
  assert.equal(inferAuthMode({ authMode: "oauth" }, true), "basic")
  assert.equal(inferAuthMode({ authMode: "oauth" }, false), "none")
})
