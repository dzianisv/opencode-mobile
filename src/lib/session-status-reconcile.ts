import type { Message } from "./sdk"

/**
 * Decide whether a session the client believes is "busy" has actually
 * finished, based on the tail of its message history.
 *
 * Why this exists (issue #123): `sessionStatus`/`sending` are SSE-driven —
 * the server's busy -> idle `session.status` event is the only thing that
 * normally clears them. If the network drops while a session is busy and
 * that busy -> idle event fires DURING the outage, it is lost: SSE reconnect
 * resumes the stream from "now", it does not replay missed events. Without a
 * resync, the UI shows a stuck 'processing' spinner forever even though the
 * server finished long ago.
 *
 * Heuristic: idle iff the most recent message is an assistant message that
 * has terminated — either it completed normally (`time.completed` set) or it
 * ended in error (`error` set; the server still finalizes the message on
 * error, it just never gets a successful `time.completed`). Anything else —
 * the last message is a user prompt still awaiting a reply, or an assistant
 * message that hasn't finished streaming — means the run may still be in
 * progress server-side. Callers MUST treat that as "still busy" and leave the
 * local state alone: this heuristic only ever clears a stale busy flag, it
 * never forces a session busy that the server hasn't reported as such, so a
 * genuinely still-busy session is never clobbered.
 */
export function isSessionActuallyIdle(messages: Message[] | null | undefined): boolean {
  if (!messages || messages.length === 0) return false
  const last = messages[messages.length - 1]
  if (last.role !== "assistant") return false
  return Boolean(last.time?.completed) || Boolean(last.error)
}
