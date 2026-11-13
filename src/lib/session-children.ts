// Pure, transport-agnostic logic for the read-only subagent surface (#187),
// extracted so it's unit-testable under plain `node --test` without importing
// expo/fetch or any store (same pattern as session-list.ts).
//
// A child session is any session whose parentID equals the parent's id.
// Status is DERIVED, never stored on the session: the live SSE status map
// (events.ts sessionStatus) and error record (sessionErrors) are the inputs,
// plus the session record's own time.idle for cold-loaded children.
import type { Session } from "./sdk"

// Structural copy of the SessionStatus union in src/stores/events.ts
// (kept local so this module stays store-free and node-testable).
export type ChildSessionStatus =
  | { type: "idle" }
  | { type: "busy" }
  | { type: "retry"; attempt: number; message: string }

export type ChildStatus = "running" | "done" | "idle" | "failed"

// Exactly one level: parentID === parentID — grandchildren never appear as
// rows of the grandparent. Newest-first by time.updated, same sort as
// normalizeSessions in session-list.ts.
export function selectChildren(all: Session[], parentID: string): Session[] {
  if (!Array.isArray(all) || !parentID) return []
  return all
    .filter((s) => s?.parentID === parentID)
    .sort((a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0))
}

// Checked in this order (design §3):
// Failed — sessionErrors[child.id] present (set on session.error, cleared
//   when the child next goes busy, so a stale error never outlives a new run).
// Running — sessionStatus[child.id] is busy or retry.
// Done — child.time.idle present (server-marked completion), OR a status
//   entry exists with type idle: sessionStatus entries exist ONLY when a
//   status event arrived this app session (done-rule invariant), so an idle
//   entry is proof a busy -> idle transition was observed live.
// Idle — none of the above: never started, or finished before app start and
//   the server sent no time.idle. Idle honestly means "not known to be
//   running, failed, or finished".
export function deriveChildStatus(
  child: Session,
  sessionStatus: Record<string, ChildSessionStatus>,
  sessionErrors: Record<string, string>,
): ChildStatus {
  if (sessionErrors[child.id]) return "failed"
  const status = sessionStatus[child.id]?.type
  if (status === "busy" || status === "retry") return "running"
  if (child.time?.idle != null || status === "idle") return "done"
  return "idle"
}

export type ChildSummary = {
  total: number
  running: number
  done: number
  failed: number
  idle: number
  // Worst state, for the header badge dot: red if any failed, else amber if
  // any running, else the settled state; "none" when there are no children.
  worst: "failed" | "running" | "done" | "idle" | "none"
}

// Parent summary badge counts + worst state, derived per child through
// deriveChildStatus so the badge and the rows can never disagree.
export function summarizeChildren(
  children: Session[],
  sessionStatus: Record<string, ChildSessionStatus>,
  sessionErrors: Record<string, string>,
): ChildSummary {
  const summary: ChildSummary = { total: 0, running: 0, done: 0, failed: 0, idle: 0, worst: "none" }
  if (!Array.isArray(children)) return summary
  summary.total = children.length
  for (const child of children) {
    summary[deriveChildStatus(child, sessionStatus, sessionErrors)] += 1
  }
  if (summary.failed > 0) summary.worst = "failed"
  else if (summary.running > 0) summary.worst = "running"
  else if (summary.done > 0 && summary.idle === 0) summary.worst = "done"
  else if (summary.idle > 0) summary.worst = "idle"
  return summary
}
