// Pure, transport-agnostic logic for listing sessions, extracted from sdk.ts so
// it's unit-testable under plain `node --test` without importing expo/fetch
// (sdk.ts is RN-only) — same pattern as api-error.ts / file-roots.ts.
//
// Why this exists: a directory-less `GET /session` is directory-SCOPED and
// returns [] on a server whose active directory has no sessions, so the Recent
// Sessions list showed nothing unless the user first picked a folder. The
// global `GET /experimental/session` returns EVERY session across ALL
// directories. We prefer it, and fall back to the legacy directory path only on
// 404 (older servers without the experimental route).
import type { Session } from "./sdk"

export interface SessionListParams {
  roots?: boolean
  limit?: number
  search?: string
}

// One page of the global list. The endpoint DEFAULTS to limit=100 and
// silently truncates to the newest sessions — fetching "with no params" made
// the client believe it had everything while anything past #100 by recency
// simply did not exist on the phone (the missing-sessions bug, round two:
// the first round was a client-side slice, this one is the server's cap).
// The cure is the endpoint's own x-next-cursor pagination, looped until
// exhausted below.
export interface SessionListPage {
  sessions: Session[]
  // time.updated of the last row, from the x-next-cursor header; absent on
  // the final page.
  nextCursor?: number
}

export interface SessionListTransport {
  // GET /experimental/session for ONE page (query carries limit + cursor).
  // Resolves null when the route is absent (HTTP 404 on older servers) so we
  // fall back to the legacy path. Any other non-2xx is thrown by the
  // transport (parity with request()).
  getExperimental: (query: string) => Promise<SessionListPage | null>
  // Legacy directory-scoped GET /session<query>, used only when the experimental
  // route is absent. Its behavior is unchanged from before this feature.
  getLegacy: (query: string) => Promise<Session[]>
}

// Shape the global session pool to match the list UI's intent: when roots:true,
// keep only top-level sessions (no parentID); case-insensitive title search;
// most-recently-updated first; then apply limit. Order matters — limit is
// applied LAST so it caps the visible roots, not the raw (root+child) pool.
export function normalizeSessions(all: Session[], params?: SessionListParams): Session[] {
  let out = Array.isArray(all) ? all.slice() : []
  if (params?.roots) out = out.filter((s) => !s.parentID)
  if (params?.search) {
    const q = params.search.toLowerCase()
    out = out.filter((s) => (s.title ?? "").toLowerCase().includes(q))
  }
  out.sort((a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0))
  if (params?.limit != null) out = out.slice(0, params.limit)
  return out
}

// Build the query string for the legacy directory-scoped /session fallback,
// preserving the exact params the old code sent so old servers behave as before.
export function legacySessionQuery(params?: SessionListParams): string {
  const query = new URLSearchParams()
  if (params?.roots) query.set("roots", "true")
  if (params?.limit) query.set("limit", String(params.limit))
  if (params?.search) query.set("search", params.search)
  const qs = query.toString()
  return qs ? `?${qs}` : ""
}

// Page size per request and the loop's hard ceiling. 10 pages of 200 is
// 2000 sessions — far past any real farm today, while still bounding a
// misbehaving server that returns a cursor forever.
export const GLOBAL_PAGE_LIMIT = 200
export const MAX_GLOBAL_PAGES = 10

export function experimentalPageQuery(cursor?: number): string {
  const query = new URLSearchParams()
  query.set("limit", String(GLOBAL_PAGE_LIMIT))
  if (cursor != null) query.set("cursor", String(cursor))
  return `?${query.toString()}`
}

// List sessions globally: prefer /experimental/session (all directories),
// PAGING through the server's x-next-cursor until exhausted, shape
// client-side, and fall back to the legacy /session path only when the
// experimental route is absent (transport resolves null on 404). Any other
// non-2xx is surfaced by the transport, exactly as before this feature.
export async function loadSessionList(
  transport: SessionListTransport,
  params?: SessionListParams,
): Promise<Session[]> {
  const first = await transport.getExperimental(experimentalPageQuery())
  if (first === null) return transport.getLegacy(legacySessionQuery(params))

  const seen = new Set<string>()
  const all: Session[] = []
  const push = (page: Session[]) => {
    // Cursor boundaries can duplicate rows on time.updated ties; dedupe by id.
    for (const session of page) {
      if (!seen.has(session.id)) {
        seen.add(session.id)
        all.push(session)
      }
    }
  }
  push(first.sessions)
  let cursor = first.nextCursor
  for (let pageIndex = 1; cursor != null && pageIndex < MAX_GLOBAL_PAGES; pageIndex++) {
    const page = await transport.getExperimental(experimentalPageQuery(cursor))
    if (page === null) break // route vanished mid-loop: keep what we have
    push(page.sessions)
    // A cursor that does not advance would loop forever; treat as final.
    if (page.nextCursor == null || page.nextCursor === cursor) break
    cursor = page.nextCursor
  }
  return normalizeSessions(all, params)
}
