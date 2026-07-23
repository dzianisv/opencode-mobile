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

export interface SessionListTransport {
  // GET /experimental/session with NO query params — the server applies `limit`
  // BEFORE we can filter to roots, so limiting server-side would truncate the
  // pool and yield too few root sessions. We fetch the full global list and
  // shape it client-side via normalizeSessions. Resolves to null when the route
  // is absent (HTTP 404 on older servers) so we fall back to the legacy path.
  // Any other non-2xx is thrown by the transport (parity with request()).
  getExperimental: () => Promise<Session[] | null>
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

// List sessions globally: prefer /experimental/session (all directories), shape
// client-side, and fall back to the legacy /session path only when the
// experimental route is absent (transport resolves null on 404). Any other
// non-2xx is surfaced by the transport, exactly as before this feature.
export async function loadSessionList(
  transport: SessionListTransport,
  params?: SessionListParams,
): Promise<Session[]> {
  const all = await transport.getExperimental()
  if (all === null) return transport.getLegacy(legacySessionQuery(params))
  return normalizeSessions(all, params)
}
