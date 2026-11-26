import type { Message } from "./sdk"

/**
 * Merge a server `message.updated` event into the current message list.
 *
 * Optimistic sends add placeholder messages with `temp-` ids (see
 * sessions.ts sendMessage). When the real server message arrives we must
 * replace ONLY the oldest still-pending optimistic message of the same role —
 * not every `temp-` message.
 *
 * The bug this guards against: sending a second message while the first is
 * still processing leaves two `temp-` user messages in the list. A naive
 * "drop all temp messages when any real one arrives" would remove BOTH when
 * the first real message lands, so the second (already queued server-side but
 * not yet echoed back) vanishes from the chat until its own event arrives —
 * a "did my message send?" ghosting bug.
 */
export function mergeIncomingMessage(messages: Message[], message: Message): Message[] {
  // Already present (a later update to a message we've seen): replace in place.
  if (messages.some((m) => m.id === message.id)) {
    return messages.map((m) => (m.id === message.id ? message : m))
  }
  // First time we see this real message: resolve the oldest matching temp.
  const tempIdx = messages.findIndex((m) => m.id.startsWith("temp-") && m.role === message.role)
  if (tempIdx !== -1) {
    const next = messages.slice()
    next[tempIdx] = message
    return next
  }
  // No optimistic placeholder to resolve (e.g. an assistant reply): append.
  return [...messages, message]
}

/**
 * Apply a `message.part.delta` event (`{partID, field, delta}`) to a message's
 * parts. opencode streams assistant text token by token this way between
 * `message.part.updated` snapshots; without it the text only appears once the
 * part is complete.
 *
 * A delta for an unknown part or a non-string field is ignored: the next
 * `message.part.updated` carries the full part and reconciles the state.
 */
export function applyPartDelta<P extends { id: string }>(parts: P[], partID: string, field: string, delta: string): P[] {
  const index = parts.findIndex((p) => p.id === partID)
  if (index === -1) return parts
  const current = (parts[index] as Record<string, unknown>)[field]
  if (current !== undefined && typeof current !== "string") return parts
  const next = parts.slice()
  next[index] = { ...parts[index], [field]: (current ?? "") + delta }
  return next
}
