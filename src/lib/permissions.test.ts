import assert from "node:assert/strict"
import test from "node:test"
import { mergePendingPermissions, normalizePermissionEvent, permissionReplyRequest } from "./permissions.ts"

test("normalizes legacy permission asks", () => {
  assert.deepEqual(normalizePermissionEvent({ type: "permission.asked", properties: {
    id: "p1", sessionID: "s1", permission: "bash", patterns: ["printf hi"], metadata: {},
  } }), { id: "p1", sessionID: "s1", permission: "bash", patterns: ["printf hi"], metadata: {} })
})

test("normalizes PermissionV2 action/resources/metadata/source", () => {
  assert.deepEqual(normalizePermissionEvent({ type: "permission.v2.asked", properties: {
    id: "p2", sessionID: "s1", action: "bash", resources: ["printf hi"], metadata: { command: "printf hi" }, source: { tool: "bash" },
  } }), { id: "p2", sessionID: "s1", permission: "bash", patterns: ["printf hi"], action: "bash", resources: ["printf hi"], metadata: { command: "printf hi" }, source: { tool: "bash" } })
})

test("rejects malformed requests and ignores unrelated events", () => {
  assert.equal(normalizePermissionEvent({ type: "permission.v2.asked", properties: { id: "p", sessionID: "s" } }), null)
  assert.equal(normalizePermissionEvent({ type: "other", properties: {} }), null)
})

test("deduplicates replayed IDs and lets the latest request data win", () => {
  const item = normalizePermissionEvent({ type: "permission.v2.asked", properties: {
    id: "p", sessionID: "s", action: "bash", resources: ["safe"],
  } })!
  assert.deepEqual(mergePendingPermissions([item], [item]), [item])
})

for (const reply of ["once", "always", "reject"] as const) {
  test(`builds the v1 and v2 ${reply} reply endpoint and wire value`, () => {
    assert.deepEqual(permissionReplyRequest("v1", "per_1", reply), {
      path: "/permission/per_1/reply",
      body: { reply },
    })
    assert.deepEqual(permissionReplyRequest("v2", "per_1", reply, "ses_1"), {
      path: "/api/session/ses_1/permission/per_1/reply",
      body: { reply },
    })
  })
}

test("v2 reply refuses to form a global request without the owning session", () => {
  assert.throws(() => permissionReplyRequest("v2", "per_1", "once"), /requires its sessionID/)
})
