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

/**
 * Last-resort, USER-INITIATED escape hatch (AGE-87). Never open this
 * automatically: a failed signup is queued locally and retried
 * (waitlist-queue.ts). This URL is only offered after retries keep failing,
 * behind an explicit "still not working? email us" tap.
 *
 * `appVersion` stamps the build into the mail body (AGE-100). Without it the
 * hourly reconciler that heals these mails
 * (VibeBrowserProductPage/scripts/reconcile-waitlist-mailto.js) cannot tell a
 * ~436-device pre-v0.4.8 sideload — which has no signup API at all and can
 * never be fixed by shipping code — from a current build that still fell back,
 * which would be a live defect. Absence of the line means "pre-v0.4.13 build".
 */
export function buildWaitlistMailtoUrl(email: string, appVersion?: string): string {
  const subject = encodeURIComponent("OpenCode Connect Waitlist")
  const lines = ["Sign me up!"]
  if (email) lines.push("", `Email: ${email}`)
  if (appVersion) lines.push("", `App: OpenCode Mobile v${appVersion}`)
  const body = encodeURIComponent(lines.join("\n"))
  return `mailto:${WAITLIST_FALLBACK_EMAIL}?subject=${subject}&body=${body}`
}

export type WaitlistResult =
  /** Signup persisted server-side. */
  | { ok: true; email: string }
  /** Signup not persisted. `retryable` decides the UX: true -> the same
   *  request can succeed later, so queue it and retry on reconnect;
   *  false -> the input (or server validation) is wrong, ask the user to fix
   *  their email instead of queueing garbage forever. */
  | { ok: false; email: string; retryable: boolean; error: string }

/**
 * Retry decision, isolated for testability:
 * - transport failure (offline, DNS, timeout) -> retry when connectivity returns
 * - 5xx -> server broken through no fault of the user's -> retry
 * - 4xx -> the server rejected this email; repeating it wouldn't help
 */
export function isRetryableFailure(outcome: { kind: "network-error" } | { kind: "http"; status: number }): boolean {
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
    return { ok: false, email: rawEmail.trim(), retryable: false, error: "Enter a valid email address." }
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
      retryable: isRetryableFailure({ kind: "http", status: res.status }),
      error: message || `Signup failed (HTTP ${res.status}).`,
    }
  } catch (error: unknown) {
    const err = error as { name?: string; message?: string }
    const aborted = err?.name === "AbortError"
    return {
      ok: false,
      email,
      retryable: isRetryableFailure({ kind: "network-error" }),
      error: aborted ? `timeout after ${timeoutMs}ms` : err?.message || String(error),
    }
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// Durable retry queue (AGE-87)
// ---------------------------------------------------------------------------
//
// Before this, a signup that hit a network error / 8s timeout / 5xx was handed
// straight to a `mailto:` composer. That is lossy by design: it depends on the
// user actually pressing send in their mail client, and on us reconciling the
// support inbox into Brevo list 4 forever (AGE-61's hourly reconciler). 20 of
// 21 signups were lost that way before that reconciler existed.
//
// Instead we persist the pending signup on the device and retry it on the next
// foreground / connectivity. `mailto:` survives only as a last-resort,
// USER-INITIATED escape hatch once retries are clearly not working.
//
// Lives in this file (rather than its own module) so it stays a dependency-free
// leaf that `node --test` can run directly, the same constraint that keeps
// react-native imports out of here. Storage and the clock are injected; the
// production AsyncStorage adapter is waitlist-queue-storage.ts.

export const WAITLIST_QUEUE_KEY = "opencode.waitlist.pending.v1"

/** Cap the queue so a broken device can't grow storage without bound. */
export const WAITLIST_QUEUE_MAX = 5

/** After this many failed attempts the UI offers the manual email escape hatch. */
export const WAITLIST_QUEUE_ATTEMPTS_BEFORE_MANUAL = 3

/** Entries older than this are dropped: the address is stale, the user moved on. */
export const WAITLIST_QUEUE_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export interface QueuedSignup {
  /** Already normalized (trimmed/lowercased) by normalizeWaitlistEmail. */
  email: string
  /** Epoch ms of the first attempt. */
  queuedAt: number
  /** Number of failed submit attempts so far (>= 1 — enqueue follows a failure). */
  attempts: number
  /** Epoch ms of the last attempt. */
  lastAttemptAt: number
  /** Last transport/server error, for diagnostics only. */
  lastError?: string
}

/**
 * Minimal storage port. AsyncStorage satisfies this structurally, so does a
 * plain Map in tests. Deliberately not typed against AsyncStorage so this file
 * stays importable by `node --test`.
 */
export interface QueueStorage {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
}

function isQueuedSignup(value: unknown): value is QueuedSignup {
  if (typeof value !== "object" || value === null) return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.email === "string" &&
    normalizeWaitlistEmail(entry.email) === entry.email &&
    typeof entry.queuedAt === "number" &&
    Number.isFinite(entry.queuedAt) &&
    typeof entry.attempts === "number" &&
    Number.isFinite(entry.attempts)
  )
}

/** Reads the queue, tolerating absent/corrupt/foreign JSON (never throws). */
export async function loadQueue(storage: QueueStorage): Promise<QueuedSignup[]> {
  let raw: string | null = null
  try {
    raw = await storage.getItem(WAITLIST_QUEUE_KEY)
  } catch {
    return []
  }
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isQueuedSignup).map((entry) => ({
      ...entry,
      lastAttemptAt: typeof entry.lastAttemptAt === "number" ? entry.lastAttemptAt : entry.queuedAt,
    }))
  } catch {
    return []
  }
}

async function saveQueue(storage: QueueStorage, queue: QueuedSignup[]): Promise<void> {
  try {
    if (queue.length === 0) await storage.removeItem(WAITLIST_QUEUE_KEY)
    else await storage.setItem(WAITLIST_QUEUE_KEY, JSON.stringify(queue))
  } catch {
    // Storage unavailable: the retry is lost, but the caller already told the
    // user the truth ("saved, we'll finish signing you up") only when this
    // resolves. enqueueSignup() surfaces the failure via its return value.
    throw new Error("waitlist queue storage unavailable")
  }
}

/** Drops entries past the TTL. Exported for the test that pins the policy. */
export function pruneQueue(queue: QueuedSignup[], now: number): QueuedSignup[] {
  return queue.filter((entry) => now - entry.queuedAt < WAITLIST_QUEUE_TTL_MS)
}

/**
 * Persists a failed signup for later retry. Dedupes by email (an impatient
 * user tapping twice must not produce two entries) and keeps the newest
 * WAITLIST_QUEUE_MAX entries.
 *
 * Returns the stored entry, or null when the email is invalid or storage
 * refused the write — in that case the caller must NOT tell the user we saved it.
 */
export async function enqueueSignup(
  storage: QueueStorage,
  rawEmail: string,
  options: { now?: number; error?: string } = {},
): Promise<QueuedSignup | null> {
  const email = normalizeWaitlistEmail(rawEmail)
  if (email === null) return null
  const now = options.now ?? Date.now()

  const existing = pruneQueue(await loadQueue(storage), now)
  const previous = existing.find((entry) => entry.email === email)
  const entry: QueuedSignup = {
    email,
    queuedAt: previous?.queuedAt ?? now,
    attempts: (previous?.attempts ?? 0) + 1,
    lastAttemptAt: now,
    ...(options.error ? { lastError: options.error } : {}),
  }
  const next = [...existing.filter((e) => e.email !== email), entry].slice(-WAITLIST_QUEUE_MAX)
  try {
    await saveQueue(storage, next)
  } catch {
    return null
  }
  return entry
}

export async function removeFromQueue(storage: QueueStorage, email: string): Promise<void> {
  const queue = await loadQueue(storage)
  const next = queue.filter((entry) => entry.email !== email)
  if (next.length === queue.length) return
  try {
    await saveQueue(storage, next)
  } catch {
    // best effort
  }
}

export interface FlushOutcome {
  /** Entries that reached the server (Brevo list 4). */
  synced: string[]
  /** Entries the server permanently rejected (4xx) — dropped, retrying can't help. */
  rejected: string[]
  /** Entries still pending after this flush. */
  pending: QueuedSignup[]
}

export type SubmitFn = (email: string) => Promise<WaitlistResult>

/**
 * Retries every pending signup once. Called on app foreground and when the
 * waitlist screen mounts.
 *
 * - ok            -> drop (it's in Brevo now)
 * - 4xx           -> drop (the server will never accept this address)
 * - network/5xx   -> keep, bump attempts (retry next foreground)
 *
 * Never throws: a flush is a background best-effort action.
 */
export async function flushQueue(
  storage: QueueStorage,
  options: { submit?: SubmitFn; now?: number } = {},
): Promise<FlushOutcome> {
  const now = options.now ?? Date.now()
  const submit = options.submit ?? ((email: string) => submitWaitlistSignup(email))

  const queue = pruneQueue(await loadQueue(storage), now)
  const synced: string[] = []
  const rejected: string[] = []
  const pending: QueuedSignup[] = []

  for (const entry of queue) {
    let result: WaitlistResult
    try {
      result = await submit(entry.email)
    } catch (error: unknown) {
      pending.push({ ...entry, attempts: entry.attempts + 1, lastAttemptAt: now, lastError: String(error) })
      continue
    }
    if (result.ok) {
      synced.push(entry.email)
    } else if (!result.retryable) {
      rejected.push(entry.email)
    } else {
      pending.push({ ...entry, attempts: entry.attempts + 1, lastAttemptAt: now, lastError: result.error })
    }
  }

  try {
    await saveQueue(storage, pending)
  } catch {
    // Storage went away mid-flush; the in-memory outcome is still accurate.
  }
  return { synced, rejected, pending }
}

/**
 * True once an entry has failed enough times that we should stop implying
 * "we'll handle it" and offer the manual email escape hatch instead.
 */
export function needsManualEscapeHatch(entry: QueuedSignup | null | undefined): boolean {
  return !!entry && entry.attempts >= WAITLIST_QUEUE_ATTEMPTS_BEFORE_MANUAL
}
