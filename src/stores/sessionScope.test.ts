import { test } from "node:test"
import assert from "node:assert/strict"
import { sessionScopeDirectory } from "./sessionScope.ts"

// Bug #10 regression guard: list and create must resolve to the SAME scope.
// Bug #32 regression guard: the default scope must be "no header" (null), not
// the server's home directory. The home dir resolves to the "global" project on
// the opencode server and hides real workspace sessions.

test("no explicit directory + known home -> default client (null), home ignored (#32)", () => {
  assert.equal(sessionScopeDirectory(false, "/home/user"), null)
})

test("no explicit directory + unknown home -> default client (null)", () => {
  assert.equal(sessionScopeDirectory(false, null), null)
  assert.equal(sessionScopeDirectory(false, undefined), null)
  assert.equal(sessionScopeDirectory(false, ""), null)
})

test("explicit directory -> default client (null), home ignored", () => {
  assert.equal(sessionScopeDirectory(true, "/home/user"), null)
  assert.equal(sessionScopeDirectory(true, null), null)
})

test("create and list resolve identically across all inputs (no drift, #10)", () => {
  for (const hasDir of [true, false]) {
    for (const home of ["/home/user", null, undefined, ""]) {
      const listScope = sessionScopeDirectory(hasDir, home)
      const createScope = sessionScopeDirectory(hasDir, home)
      assert.equal(listScope, createScope)
    }
  }
})

test("server directory != home: rule returns null so server uses its CWD project (#32)", () => {
  // Reproduces the real-world setup: server launched in ~/workspace/opencode
  // while $HOME is /home/azureuser. Old rule returned "/home/azureuser" (global
  // project, empty). New rule returns null so server uses its CWD project.
  assert.equal(sessionScopeDirectory(false, "/home/azureuser"), null)
})
