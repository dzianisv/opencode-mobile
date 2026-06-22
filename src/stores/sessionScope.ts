// Single source of truth for which directory scope session reads/writes use.
//
// Bug #10 ("sessions tab empty after connect / create") happened because the
// list path and the create path each computed this rule independently and drifted:
// loadSessions listed sessions home-scoped while createSession wrote CWD-scoped, so
// a freshly created session was invisible. Both call sites now derive their client
// from this one function, so they cannot disagree again.
//
// Bug #32 ("recent sessions missing"): the previous rule scoped to the server's
// home directory when no explicit directory was set. opencode-server resolves the
// x-opencode-directory header to a project id by exact-match, NOT subtree prefix.
// $HOME typically maps to the synthetic "global" project, which never contains
// the user's real workspace sessions (those live under e.g. ~/workspace/foo, a
// different project id). The list looked empty even when sessions existed.
//
// Rule: when the active connection pins an explicit directory, use the default
// client (it is already scoped to that directory). Otherwise, send no scope at
// all so the server uses its own CWD — i.e. the project where opencode serve was
// launched, which is the project the user actually works in. The `home` argument
// is accepted for backward compatibility but intentionally ignored.

export function sessionScopeDirectory(hasExplicitDirectory: boolean, _home?: string | null | undefined): string | null {
  void _home
  if (hasExplicitDirectory) return null
  return null
}
