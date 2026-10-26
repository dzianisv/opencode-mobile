export type PendingPermission = {
  id: string
  sessionID: string
  permission: string
  patterns: string[]
  metadata: Record<string, unknown>
  tool?: { messageID: string; callID: string }
  action?: string
  resources?: string[]
  save?: string[]
  source?: Record<string, unknown>
}

export type PermissionReply = "once" | "always" | "reject"

export function permissionReplyRequest(
  protocol: "v1" | "v2",
  requestID: string,
  reply: PermissionReply,
  sessionID?: string,
): { path: string; body: { reply: PermissionReply } } {
  if (protocol === "v2") {
    if (!sessionID) throw new Error("A v2 permission reply requires its sessionID")
    return {
      path: `/api/session/${encodeURIComponent(sessionID)}/permission/${encodeURIComponent(requestID)}/reply`,
      body: { reply },
    }
  }
  return { path: `/permission/${encodeURIComponent(requestID)}/reply`, body: { reply } }
}

type PermissionEvent = {
  type?: string
  properties?: Record<string, unknown>
}

/** Normalize both generations of server permission request into the prompt model. */
export function normalizePermissionEvent(event: PermissionEvent): PendingPermission | null {
  if (event.type !== "permission.asked" && event.type !== "permission.v2.asked") return null
  const properties = event.properties
  if (!properties || typeof properties.id !== "string" || !properties.id ||
      typeof properties.sessionID !== "string" || !properties.sessionID) return null

  if (event.type === "permission.asked") {
    if (typeof properties.permission !== "string" || !Array.isArray(properties.patterns) ||
        !properties.patterns.every((item) => typeof item === "string")) return null
    return {
      id: properties.id,
      sessionID: properties.sessionID,
      permission: properties.permission,
      patterns: properties.patterns,
      metadata: isRecord(properties.metadata) ? properties.metadata : {},
      ...(isRecord(properties.tool) ? { tool: properties.tool as PendingPermission["tool"] } : {}),
    }
  }

  if (typeof properties.action !== "string" || !Array.isArray(properties.resources) ||
      !properties.resources.every((item) => typeof item === "string")) return null
  return {
    id: properties.id,
    sessionID: properties.sessionID,
    permission: properties.action,
    patterns: properties.resources,
    metadata: isRecord(properties.metadata) ? properties.metadata : {},
    action: properties.action,
    resources: properties.resources,
    ...(Array.isArray(properties.save) && properties.save.every((item) => typeof item === "string")
      ? { save: properties.save as string[] } : {}),
    ...(isRecord(properties.source) ? { source: properties.source } : {}),
  }
}

/** Convert a pending-list API item (which may be from either protocol generation). */
export function normalizePendingPermission(value: unknown): PendingPermission | null {
  if (!isRecord(value)) return null
  return normalizePermissionEvent({
    type: Array.isArray(value.resources) || typeof value.action === "string" ? "permission.v2.asked" : "permission.asked",
    properties: value,
  })
}

export function mergePendingPermissions(
  current: PendingPermission[], incoming: PendingPermission[],
): PendingPermission[] {
  const merged = new Map(current.map((item) => [item.id, item]))
  for (const item of incoming) merged.set(item.id, { ...merged.get(item.id), ...item })
  return [...merged.values()]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}
