## Problem
After fresh server connect, Sessions tab can render empty or wrong session scope. Users lose ability to resume real conversations.

## Goal
Sessions tab reliably lists sessions for active connection scope right after connect, and smoke coverage catches regressions.

## Success Metric
Android end-to-end flow "connect then open Sessions tab" passes on real emulator against real server, and Sessions list renders at least one entry when server has sessions.

## Out of Scope
- Cross-project global session aggregation on server
- Session ranking/search UX changes
- New server API endpoints

## Current State
- Sessions list fetch path is `useSessions.loadSessions` in `src/stores/sessions.ts:75`.
- Current logic selects list client with home-directory fallback when connection directory is unset (`src/stores/sessions.ts:84`).
- Session list call currently uses `roots: true` and `limit: 50` (`src/stores/sessions.ts:89`).
- Connection bootstrap now fetches both project and server paths in `addConnection` before state update (`src/stores/connections.ts:155`).
- Sessions tab triggers `loadSessions()` in focus effect after connect/navigation (`app/(tabs)/index.tsx:141`).
- CUA script contains explicit session-list scenario and connect+verify scenario (`scripts/android-cua-smoke.py:480`, `scripts/android-cua-smoke.py:535`).

## Proposed Design
1. Keep connection bootstrap metadata fetch in `addConnection` so `serverHome` is available for the first sessions-tab render.
2. Keep sessions list call scoped through home-directory fallback when no explicit directory is configured, preserving expected global/root view for this app's UX.
3. Preserve `roots: true` filter so child/sub-task sessions do not flood primary list.
4. Add durable regression guard via real emulator smoke execution for connect-then-sessions flow, recorded in task test artifacts.
5. If runtime validation shows wrong scope, adjust client selection strategy and re-run same smoke protocol before merge.

## Alternatives Considered
1. Use active connection client directly for all list calls.
   - Rejected: in this environment it returns stale deploy-project sessions when connection has no directory.
2. Remove `roots: true`.
   - Rejected: increases noise from nested agent sub-sessions; not aligned with main session UX.
3. Add new backend endpoint for cross-project session aggregation.
   - Rejected: out-of-scope for mobile client bugfix and requires upstream server contract change.

## Risks & Open Questions
- Risk: server-side project resolution may vary across environments.
  - Mitigation: validate against real target server (`100.108.64.76:4096`) with deterministic emulator flow.
- Risk: CUA automation can return false negatives due transient UI load timing.
  - Mitigation: capture screenshots/UI dumps and use explicit wait windows in protocol.
- Open question: keep issue linked to existing PR #9 or open a dedicated PR branch.
  - Decision: create dedicated ownership branch from latest main-compatible fix state and link issue #10.

## Touched Surface
- `src/stores/connections.ts`
- `src/stores/sessions.ts`
- `app/(tabs)/index.tsx`
- `scripts/android-cua-smoke.py`
- `.github/workflows/cua-smoke.yml` (if CI scenario coverage adjustment needed)
