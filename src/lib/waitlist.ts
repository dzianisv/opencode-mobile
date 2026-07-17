// OpenCode Connect waitlist signup: pure payload/fallback logic.
//
// Kept free of react-native imports (Linking, Alert) so it's unit-testable
// with plain `node --test`, the same split used for buildAuth() in auth.ts
// and shouldRequestReview() in store-review-policy.ts. The screen injects
// nothing in production (global fetch is used); tests inject a fake fetch.
//
// Backend: the OpenCodeMobileSite beta-signup route (VibeBrowserProductPage
// repo, OpenCodeMobileSite/app/api/beta-signup/route.ts) validates `email`
// and adds it to a Brevo list. It ignores unknown body fields today, so the
// `source` tag we send is forward-compatible: harmless now, attributable as
// soon as the route starts reading it.

export const WAITLIST_ENDPOINT = "https://opencode.agentlabs.cc/api/beta-signup"
export const WAITLIST_SOURCE = "opencode-connect-waitlist"
export const WAITLIST_TIMEOUT_MS = 8_000
export const WAITLIST_FALLBACK_EMAIL = "support@agentlabs.cc"

// Mirrors the server-side pattern in brevo-contact.ts so we reject locally
// exactly what the server would 400 on, instead of burning a round trip.
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Trim/lowercase like the server does; null when the server would 400. */
export function normalizeWaitlistEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase()
  if (!email || email.length > 254 || !emailPattern.test(email)) return null
  return email
}

export function buildWaitlistPayload(email: string): { email: string; source: string } {
  return { email, source: WAITLIST_SOURCE }
}

/** The pre-#87 mailto path, kept as the fallback when the API is unreachable. */
export function buildWaitlistMailtoUrl(email: string): string {
  const subject = encodeURIComponent("OpenCode Connect Waitlist")
  const body = encodeURIComponent(email ? `Sign me up!\n\nEmail: ${email}` : "Sign me up!")
  return `mailto:${WAITLIST_FALLBACK_EMAIL}?subject=${subject}&body=${body}`
}

export type WaitlistResult =
  /** Signup persisted server-side. */
  | { ok: true; email: string }
  /** Signup not persisted. `fallback` decides the UX: true -> open the
   *  mailto fallback so the signup still reaches the support inbox;
   *  false -> the input (or server validation) is wrong, ask the user to fix
   *  their email instead of mailing garbage. */
  | { ok: false; email: string; fallback: boolean; error: string }

/**
 * Fallback decision, isolated for testability:
 * - transport failure (offline, DNS, timeout) -> mailto keeps the signup alive
 * - 5xx -> server broken through no fault of the user's -> mailto
 * - 4xx -> the server rejected this email; mailing it wouldn't help
 */
export function shouldFallbackToMailto(outcome: { kind: "network-error" } | { kind: "http"; status: number }): boolean {
  if (outcome.kind === "network-error") return true
  return outcome.status >= 500
}

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

export interface WaitlistDeps {
  fetchFn?: FetchLike
  timeoutMs?: number
}

function serverError(body: unknown): string | undefined {
  if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") {
    return body.error
  }
  return undefined
}

export async function submitWaitlistSignup(rawEmail: string, deps: WaitlistDeps = {}): Promise<WaitlistResult> {
  const email = normalizeWaitlistEmail(rawEmail)
  if (email === null) {
    return { ok: false, email: rawEmail.trim(), fallback: false, error: "Enter a valid email address." }
  }

  const fetchFn = deps.fetchFn ?? (fetch as unknown as FetchLike)
  const timeoutMs = deps.timeoutMs ?? WAITLIST_TIMEOUT_MS

  // Same timeout pattern as timedFetch() in diagnostics.ts.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetchFn(WAITLIST_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildWaitlistPayload(email)),
      signal: controller.signal,
    })
    if (res.ok) return { ok: true, email }
    const message = serverError(await res.json().catch(() => null))
    return {
      ok: false,
      email,
      fallback: shouldFallbackToMailto({ kind: "http", status: res.status }),
      error: message || `Signup failed (HTTP ${res.status}).`,
    }
  } catch (error: unknown) {
    const err = error as { name?: string; message?: string }
    const aborted = err?.name === "AbortError"
    return {
      ok: false,
      email,
      fallback: shouldFallbackToMailto({ kind: "network-error" }),
      error: aborted ? `timeout after ${timeoutMs}ms` : err?.message || String(error),
    }
  } finally {
    clearTimeout(timer)
  }
}
