// Client-side Sentry noise gate (AGE-105).
//
// Why this exists: `opencode-mobile` became the #1 source of Sentry error
// volume in the org (~4,500 events/month against a 3,500/month org gate).
// Breaking that number down, the top three issues (~1,100 events) were NOT app
// defects:
//
//     462 events / 104 users   Error: connect timeout
//     498 events /   1 user    Error: API Error: 401 - …
//     157 events /  33 users   Error: connect server-unreachable
//
// The `connect …` ones are `captureDiagnostic()` reports of client-side network
// conditions (user's LAN/VPN/self-hosted box is down). They are already shown to
// the user as UI state AND already counted, without PII, as the PostHog
// `connection_failed` event with an `error_class` property
// (see analytics-classify.ts + stores/connections.ts), so dropping them from
// Sentry loses no trend visibility — it just stops paying per-event for a graph
// we already have.
//
// The 401 storm was NOT an automated retry loop (AGE-107 traced it): it was one
// user manually re-tapping Connect for two months because v0.4.4's probe scored
// any HTTP response as a success and told them "connection actually works now"
// while their password was wrong. A wrong password is user config, not an app
// defect — it is already surfaced in the connection screen (now as
// `connect auth-failed`) and already trended in PostHog as
// `connection_failed{error_class:"unauthorized"}`, so it is dropped here too.
//
// Three layers, cheapest first (`admit()` applies them in order):
//   1. ALWAYS-SEND allowlist — genuine crash classes (OOM/ANR/native/fatal)
//      bypass every limit below. Quota is worthless if it silences real crashes.
//   2. TRANSPORT drop-list — hard drop for client-side network conditions.
//      Hard, not sampled: this gate runs per-install, so even "1 per device per
//      day" multiplies by the install base back into thousands per month.
//   3. Dedup + rate cap — per-fingerprint cooldown plus new-fingerprint/hour and
//      total/hour ceilings, mirroring the `openclaw-box-bot` shim (AGE-55) that
//      took that project from 50.7 events/h to 0. This is what turns a retry
//      loop into one report, and caps the blast radius of any future regression.
//
// This module is pure and dependency-free (no @sentry/react-native, no RN) so it
// runs under plain `node --test`, same convention as analytics-classify.ts /
// diagnostics-classify.ts / api-error.ts.

/** Minimal structural shape of a Sentry event — avoids importing the SDK here
 *  so this module stays testable under plain node. */
export type NoiseEventLike = {
  level?: string
  message?: string
  exception?: { values?: Array<{ type?: string; value?: string; mechanism?: { handled?: boolean } }> }
}

/** Client-side network and credential conditions. Unactionable server-side,
 *  already surfaced to the user as connection UI, and already trended in
 *  PostHog as `connection_failed{error_class}`. Dropped outright. */
export const TRANSPORT_NOISE_PATTERNS: RegExp[] = [
  // captureDiagnostic() → new Error(`connect ${classification}`)
  // `auth-failed` = the server answered 401/403: wrong password, user config.
  // `health-failed` and `tls-error` are deliberately NOT here — a box that
  // answers but is unhealthy, or a broken cert, is actionable.
  /^connect (?:timeout|server-unreachable|no-internet|malformed-url|auth-failed)$/i,
  // RN fetch failures surfacing through the global handler / rejection hook.
  /network request failed/i,
  /request timed out after/i,
  /\b(?:ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH)\b/,
  /aborted due to timeout/i,
]

/** Real crash classes that must never be filtered, whatever the quota says.
 *  Kept deliberately narrow — everything not listed here is still *reported*,
 *  just deduped/rate-capped rather than dropped. */
export const ALWAYS_SEND_PATTERNS: RegExp[] = [
  /OutOfMemoryError/i,
  /\bANR\b/,
  /Application Not Responding/i,
  /IllegalStateException/,
  /NullPointerException/,
  /SIGSEGV|SIGABRT|SIGBUS|EXC_BAD_ACCESS/,
  /native crash/i,
]

export type NoiseReason =
  | "always-send"
  | "ok"
  | "transport-noise"
  | "cooldown"
  | "new-fingerprint-cap"
  | "hourly-cap"

export type NoiseDecision = { send: boolean; reason: NoiseReason; fingerprint: string }

export type NoiseGateLimits = {
  /** Per-fingerprint silence window after one report is sent. */
  cooldownMs: number
  /** Max *distinct* fingerprints allowed to open a new report per rolling hour. */
  maxNewPerHour: number
  /** Absolute ceiling of events sent per rolling hour, allowlist excluded. */
  maxPerHour: number
  /** Bound on retained fingerprint state (oldest evicted first). */
  maxTrackedFingerprints: number
}

const HOUR_MS = 60 * 60 * 1000

/** Mirrors the box-bot shim: cooldown=6h, max_new/h=6, max/h=10. */
export const DEFAULT_GATE_LIMITS: NoiseGateLimits = {
  cooldownMs: 6 * HOUR_MS,
  maxNewPerHour: 6,
  maxPerHour: 10,
  maxTrackedFingerprints: 200,
}

/** Flatten an event to the text the pattern lists match against. */
export function eventText(event: NoiseEventLike): string {
  const values = event.exception?.values ?? []
  const parts: string[] = []
  for (const ex of values) {
    const type = ex.type && ex.type !== "Error" ? `${ex.type}: ` : ""
    if (ex.value || ex.type) parts.push(`${type}${ex.value ?? ""}`.trim())
  }
  if (!parts.length && event.message) parts.push(event.message)
  return parts.join(" | ").trim()
}

/** True for events that must bypass every limit: allowlisted crash classes,
 *  fatal level, or an unhandled native mechanism. */
export function isFatalEvent(event: NoiseEventLike): boolean {
  if (event.level === "fatal") return true
  return (event.exception?.values ?? []).some((ex) => ex.mechanism?.handled === false)
}

export function isTransportNoise(text: string): boolean {
  if (!text) return false
  return TRANSPORT_NOISE_PATTERNS.some((p) => p.test(text))
}

export function isAlwaysSend(text: string): boolean {
  if (!text) return false
  return ALWAYS_SEND_PATTERNS.some((p) => p.test(text))
}

/** Collapse an error message to a stable dedup key.
 *
 *  The point is that `API Error: 401 - {"error":"token expired at 17867…"}`
 *  fired 498 times by one token-refresh loop must map to ONE key. So: keep the
 *  first line, cut the variable tail off `API Error: <status> - <body>`, blank
 *  out URLs/paths/hex/uuids/numbers, then truncate. */
export function fingerprint(text: string): string {
  let s = (text || "").split("\n")[0].trim()
  // HTTP status is the one number worth keeping: 401 and 500 are different bugs.
  const apiErr = s.match(/API Error:\s*(\d{3})\b/i)
  if (apiErr) return `api error: ${apiErr[1]}`
  s = s
    .replace(/<redacted-url>|<redacted>/gi, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "")
    .replace(/\b[0-9a-f]{12,}\b/gi, "")
    .replace(/\/[^\s"']*/g, "")
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
  return s.slice(0, 100)
}

/**
 * Dedup + rate limiter. Deterministic: every method takes an explicit `now`
 * (defaulting to `Date.now()`), so tests drive time instead of sleeping.
 * State is in-memory and per app process — a restart legitimately re-opens the
 * cooldown, since a crash-restart loop is itself worth one report per launch.
 */
export class NoiseGate {
  private readonly limits: NoiseGateLimits
  /** fingerprint -> last time it was SENT */
  private readonly lastSent = new Map<string, number>()
  /** timestamps of events sent in the current rolling hour */
  private sentTimes: number[] = []
  /** timestamps at which a *previously unseen* fingerprint was opened */
  private newFingerprintTimes: number[] = []
  private dropped = 0

  constructor(limits: Partial<NoiseGateLimits> = {}) {
    this.limits = { ...DEFAULT_GATE_LIMITS, ...limits }
  }

  /** Number of events dropped since the last `takeDroppedCount()`. */
  takeDroppedCount(): number {
    const n = this.dropped
    this.dropped = 0
    return n
  }

  admit(text: string, opts: { fatal?: boolean } = {}, now: number = Date.now()): NoiseDecision {
    const fp = fingerprint(text)

    if (opts.fatal || isAlwaysSend(text)) {
      // Still recorded so the hourly window reflects reality, but never blocked.
      this.touch(fp, now)
      this.sentTimes.push(now)
      this.prune(now)
      return { send: true, reason: "always-send", fingerprint: fp }
    }

    if (isTransportNoise(text)) return this.drop("transport-noise", fp)

    this.prune(now)

    const last = this.lastSent.get(fp)
    if (last !== undefined && now - last < this.limits.cooldownMs) {
      return this.drop("cooldown", fp)
    }
    if (this.sentTimes.length >= this.limits.maxPerHour) {
      return this.drop("hourly-cap", fp)
    }
    if (last === undefined && this.newFingerprintTimes.length >= this.limits.maxNewPerHour) {
      return this.drop("new-fingerprint-cap", fp)
    }

    if (last === undefined) this.newFingerprintTimes.push(now)
    this.touch(fp, now)
    this.sentTimes.push(now)
    this.evictIfNeeded()
    return { send: true, reason: "ok", fingerprint: fp }
  }

  /** Re-insert so Map iteration order stays least-recently-sent first. */
  private touch(fp: string, now: number) {
    this.lastSent.delete(fp)
    this.lastSent.set(fp, now)
  }

  private drop(reason: NoiseReason, fp: string): NoiseDecision {
    this.dropped++
    return { send: false, reason, fingerprint: fp }
  }

  private prune(now: number) {
    const hourAgo = now - HOUR_MS
    this.sentTimes = this.sentTimes.filter((t) => t > hourAgo)
    this.newFingerprintTimes = this.newFingerprintTimes.filter((t) => t > hourAgo)
    const cutoff = now - this.limits.cooldownMs
    for (const [fp, t] of this.lastSent) if (t <= cutoff) this.lastSent.delete(fp)
  }

  private evictIfNeeded() {
    while (this.lastSent.size > this.limits.maxTrackedFingerprints) {
      // Map preserves insertion order and we re-set on each send, so the first
      // key is the least recently sent.
      const oldest = this.lastSent.keys().next()
      if (oldest.done) break
      this.lastSent.delete(oldest.value)
    }
  }
}
