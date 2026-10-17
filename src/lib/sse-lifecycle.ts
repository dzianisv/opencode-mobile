// The v2 API sends heartbeat comments every ~15s; v1 servers send a JSON
// heartbeat more frequently. Three missed v2 heartbeats bounds a half-open
// connection without churning on a short radio stall.
export const SSE_IDLE_TIMEOUT_MS = 45_000

export interface SseReader {
  read(): Promise<{ done?: boolean; value?: Uint8Array }>
  cancel?(): Promise<void>
}

export async function readWithIdleTimeout(
  reader: SseReader,
  timeoutMs = SSE_IDLE_TIMEOUT_MS,
): Promise<{ done?: boolean; value?: Uint8Array } | "idle"> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const read = reader.read().catch(() => ({ done: true, value: undefined }))
  try {
    const result = await Promise.race([
      read,
      new Promise<"idle">((resolve) => { timer = setTimeout(() => resolve("idle"), timeoutMs) }),
    ])
    if (result === "idle") void reader.cancel?.().catch(() => {})
    return result
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export const RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000] as const

export type TransportState = "idle" | "backgrounded" | "connecting" | "live" | "reconnecting" | "auth-required"

export function reconnectDelayMs(attempt: number, random: () => number = Math.random): number {
  const index = Math.min(Math.max(attempt, 1) - 1, RECONNECT_DELAYS_MS.length - 1)
  return Math.min(15_000, Math.round(RECONNECT_DELAYS_MS[index] * (0.75 + random() * 0.5)))
}

export function shouldResetRetries(receivedEvent: boolean): boolean {
  return receivedEvent
}

/** Only the active, verified transport should suppress a foreground reconnect. */
export function shouldReconnectOnResume(input: { transport: TransportState; attemptInFlight: boolean }): boolean {
  if (input.transport === "live") return false
  return !input.attemptInFlight
}

export function sessionActivityFromMessages(messages: Array<{
  role: "user" | "assistant"
  time?: { completed?: number }
  error?: unknown
}>): "unknown" | "busy" | "idle" {
  if (messages.length === 0) return "unknown"
  const last = messages[messages.length - 1]
  if (last.role === "assistant" && (last.time?.completed || last.error)) return "idle"
  return "busy"
}
