// Pure classification of HTTP auth failures, extracted so it's unit-testable
// under plain `node --test` without pulling in expo/fetch (sdk.ts is RN-only)
// — same pattern as analytics-classify.ts / diagnostics-classify.ts.
//
// Why this exists: sdk.ts's request()/events() used to throw a generic Error
// for every non-2xx response, so call sites (the SSE reconnect loop, screen
// error states) had no way to tell "your password is wrong" apart from "the
// server is briefly unreachable" — a 401 got treated like any transient
// failure and retried forever (see events.ts's reconnect loop / issue #76).

/** Thrown by sdk.ts's request()/events() when the server responds 401/403,
 *  so call sites can distinguish "bad credentials" from any other failure
 *  (network error, 5xx, timeout) instead of catching a generic Error. */
export class ApiAuthError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = "ApiAuthError"
    this.status = status
  }
}

/** True for HTTP statuses that mean "your credentials are wrong", as opposed
 *  to transient/network/server failures that should keep retrying. */
export function isAuthStatus(status: number): boolean {
  return status === 401 || status === 403
}

/** Build the right error type for a failed HTTP response. */
export function apiErrorFor(status: number, message: string): Error {
  return isAuthStatus(status) ? new ApiAuthError(status, message) : new Error(message)
}

/** Type guard for call sites (e.g. the SSE reconnect loop) that need to branch
 *  on whether a caught error was an auth failure. */
export function isAuthError(error: unknown): error is ApiAuthError {
  return error instanceof ApiAuthError
}
