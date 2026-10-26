export type NormalizedSessionStatus =
  | { type: "idle" }
  | { type: "busy" }
  | { type: "retry"; attempt?: number; message?: string }

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

export function normalizeSessionStatusResponse(value: unknown): Record<string, NormalizedSessionStatus> {
  if (!record(value)) return {}
  const source = record(value.data) ? value.data : value
  const result: Record<string, NormalizedSessionStatus> = {}

  for (const [sessionID, raw] of Object.entries(source)) {
    if (!record(raw) || typeof raw.type !== "string") continue
    if (raw.type === "idle") result[sessionID] = { type: "idle" }
    if (raw.type === "busy" || raw.type === "running" || raw.type === "active") {
      result[sessionID] = { type: "busy" }
    }
    if (raw.type === "retry") {
      result[sessionID] = {
        type: "retry",
        ...(typeof raw.attempt === "number" ? { attempt: raw.attempt } : {}),
        ...(typeof raw.message === "string" ? { message: raw.message } : {}),
      }
    }
  }

  return result
}
