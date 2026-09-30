import type { SessionStatus } from "./sdk"

export function isSessionWorking(status: SessionStatus | undefined, optimistic: boolean): boolean {
  return optimistic || (!!status && status.type !== "idle")
}

export function mergeSessionStatusSnapshot(
  current: Record<string, SessionStatus>,
  baseline: Record<string, SessionStatus>,
  snapshot: Record<string, SessionStatus>,
  sessionIDs: string[],
): Record<string, SessionStatus> {
  const next = { ...current }
  for (const id of sessionIDs) {
    if (current[id] !== baseline[id]) continue
    next[id] = snapshot[id] ?? { type: "idle" }
  }
  return next
}
