/**
 * Decide whether selecting `targetSessionID` for the session detail screen
 * is a "cold" load — nothing is shown yet, or we're switching to a
 * different session, so the blocking spinner is appropriate — or a
 * background refresh of a session that's already loaded and rendering.
 *
 * Why this exists (issue #150): the session detail screen re-runs
 * `selectSession` on every navigation focus (see #121's useFocusEffect
 * resync, which re-binds this screen to its session on every re-entry, not
 * just mount — since the native stack keeps screens mounted underneath a
 * pushed one). That re-fetch is a good idea (it recovers from missed SSE
 * events), but unconditionally flipping `isLoading` back to `true` for it
 * hides the ENTIRE conversation — messages, composer, everything — behind a
 * spinner for as long as the redundant fetch takes. Meanwhile SSE keeps
 * delivering `message.updated`/`message.part.updated` events the whole
 * time — the store keeps them, but the screen can't show them while
 * `isLoading` is blocking the message list. If that redundant fetch is slow
 * or stalls (flaky mobile network), the conversation looks permanently stuck
 * "loading" until the user backs out to the sessions list and re-enters —
 * which works only because it's a fresh attempt that (usually) doesn't hit
 * the same stall, not because anything was actually fixed.
 *
 * A cold load (no session shown yet, or a genuinely different session) still
 * needs the spinner — there's nothing to show meanwhile. A refresh of the
 * session already on screen does not: keep showing what's there (which
 * live SSE updates keep current) while the refetch runs quietly in the
 * background.
 */
export function isColdSessionLoad(currentSessionID: string | null | undefined, targetSessionID: string): boolean {
  return currentSessionID !== targetSessionID
}

/**
 * Decide whether an incoming SSE event's session matches the session a
 * screen/store is currently bound to — the shared "is this event for me"
 * check used to key live updates (messages, parts) to the active session,
 * instead of e.g. matching on stale or missing ids.
 */
export function isLiveEventForSession(
  eventSessionID: string | null | undefined,
  activeSessionID: string | null | undefined,
): boolean {
  return !!eventSessionID && !!activeSessionID && eventSessionID === activeSessionID
}
