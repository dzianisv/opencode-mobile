/**
 * When should the app tell the user a newer build exists? — pure decision logic.
 *
 * WHY THIS EXISTS (AGE-110)
 * -------------------------
 * This app has no update mechanism of its own. It ships through four channels
 * and only ONE of them auto-updates:
 *
 *   Play Store            auto-updates ... but only to whatever is on the
 *                         production track (which lagged eight weeks, see
 *                         .github/workflows/publish-play-store.yml)
 *   self-hosted F-Droid   updates only if the user enabled auto-update AND has
 *                         the repo added
 *   direct APK download   never updates
 *   third-party mirrors   never update (APKCombo currently advertises v0.4.10
 *                         as its newest listing)
 *
 * The measured result on 2026-08-14: 64% of 30d-active users sat on v0.4.10 and
 * 0.2% on the newest build. A device on a direct-APK install has literally no
 * way to learn a newer version exists — so any client-side fix (the AGE-105
 * Sentry noise gate, for one) is capped at the slice of the base that happens to
 * update by luck.
 *
 * DESIGN RULES, so this never becomes an ad
 * -----------------------------------------
 *   1. At most one network check per CHECK_INTERVAL_MS (24h). It is a single
 *      unauthenticated GET; it must not become a per-launch beacon.
 *   2. A dismissal is remembered PER VERSION. Dismiss v0.4.15 and you are never
 *      asked about v0.4.15 again — but v0.4.16 may ask once.
 *   3. Never prompt when the running version is unknown or unparseable, and
 *      never prompt for a version that is not strictly newer. A false "update
 *      available" is worse than silence.
 *
 * Everything here is pure so it runs under `node --test` with no React Native,
 * no network and no clock. The effectful half lives in update-check.ts.
 */

/** One check per day, max. */
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

/**
 * Parse a dotted numeric version ("0.4.10", "v0.4.10", "0.4.10-rc.1") into
 * comparable segments. Returns null for anything that is not a numeric-dotted
 * version, which is the signal to stay quiet.
 */
export function parseVersion(raw: string | null | undefined): number[] | null {
  if (typeof raw !== "string") return null
  const trimmed = raw.trim().replace(/^v/i, "")
  // Drop pre-release / build metadata: 0.4.10-rc.1+abc -> 0.4.10
  const core = trimmed.split(/[-+]/, 1)[0]
  if (!/^\d+(\.\d+)*$/.test(core)) return null
  const parts = core.split(".").map((n) => Number(n))
  if (parts.some((n) => !Number.isFinite(n))) return null
  return parts
}

/**
 * -1 / 0 / 1, comparing segment-by-segment with numeric semantics.
 *
 * The whole point: a string compare puts "0.4.9" AFTER "0.4.10", which would
 * have told the largest stale cohort in the install base that it was already
 * up to date.
 */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  if (!pa || !pb) return 0
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0
    const db = pb[i] ?? 0
    if (da !== db) return da < db ? -1 : 1
  }
  return 0
}

/** Is `latest` strictly newer than `current`? Unparseable input => false. */
export function isNewer(latest: string | null | undefined, current: string | null | undefined): boolean {
  if (!parseVersion(latest) || !parseVersion(current)) return false
  return compareVersions(latest as string, current as string) > 0
}

/** Throttle: has enough time passed since the last completed check? */
export function shouldCheck(input: {
  lastCheckedAt: number | null
  now: number
  intervalMs?: number
}): boolean {
  const interval = input.intervalMs ?? CHECK_INTERVAL_MS
  if (input.lastCheckedAt === null || !Number.isFinite(input.lastCheckedAt)) return true
  // A clock that moved backwards (timezone/NTP correction, or a restored
  // backup) must not lock checks out until the future timestamp passes.
  if (input.lastCheckedAt > input.now) return true
  return input.now - input.lastCheckedAt >= interval
}

/** Storage keys. Values are a timestamp and two version strings — no user data. */
export const LAST_CHECK_KEY = "opencode_update_last_check"
export const DISMISSED_KEY = "opencode_update_dismissed_version"
export const LATEST_KEY = "opencode_update_latest"

export type AvailableUpdate = { version: string; url: string }

/** The two storage calls this needs, injected so the logic stays testable. */
export type UpdateStorage = {
  getItem: (key: string) => Promise<string | null>
  setItem: (key: string, value: string) => Promise<void>
}

/**
 * Decide what to show, doing at most one network call per interval.
 *
 * The last successful lookup is cached so the banner survives between checks:
 * without it a user who dismissed nothing would still only ever see the prompt
 * on the one launch that happened to perform the fetch.
 *
 * Never throws. A failed fetch or an unreadable store degrades to "say nothing"
 * (or to the cached answer), because a broken update check must not be visible
 * to the user in any way.
 */
export async function resolveUpdate(deps: {
  storage: UpdateStorage
  fetchLatest: () => Promise<AvailableUpdate | null>
  currentVersion: string
  now?: number
  force?: boolean
  intervalMs?: number
  /**
   * Settings shows "0.4.10 -> 0.4.14" even after the banner was dismissed:
   * "not now" means stop interrupting me, not lie to me when I go looking.
   */
  ignoreDismissed?: boolean
}): Promise<AvailableUpdate | null> {
  const now = deps.now ?? Date.now()
  try {
    const [rawLastCheck, dismissedVersion, rawCached] = await Promise.all([
      deps.storage.getItem(LAST_CHECK_KEY),
      deps.storage.getItem(DISMISSED_KEY),
      deps.storage.getItem(LATEST_KEY),
    ])

    let latest = parseCachedUpdate(rawCached)
    const lastCheckedAt = rawLastCheck === null ? null : Number(rawLastCheck)

    if (deps.force || shouldCheck({ lastCheckedAt, now, intervalMs: deps.intervalMs })) {
      const fetched = await deps.fetchLatest().catch(() => null)
      if (fetched && parseVersion(fetched.version)) {
        latest = fetched
        // Only a SUCCESSFUL lookup resets the clock. A device that is offline
        // for a week should check on its next launch with network, not be told
        // it already checked.
        await deps.storage.setItem(LAST_CHECK_KEY, String(now))
        await deps.storage.setItem(LATEST_KEY, JSON.stringify(fetched))
      }
    }

    if (!latest) return null
    if (
      !shouldPrompt({
        currentVersion: deps.currentVersion,
        latestVersion: latest.version,
        dismissedVersion: deps.ignoreDismissed ? null : dismissedVersion,
      })
    )
      return null
    return latest
  } catch {
    return null
  }
}

function parseCachedUpdate(raw: string | null): AvailableUpdate | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<AvailableUpdate>
    if (typeof parsed?.version !== "string" || typeof parsed?.url !== "string") return null
    if (!parseVersion(parsed.version)) return null
    return { version: parsed.version, url: parsed.url }
  } catch {
    return null
  }
}

/** Should the update affordance be shown right now? */
export function shouldPrompt(input: {
  currentVersion: string | null | undefined
  latestVersion: string | null | undefined
  dismissedVersion: string | null | undefined
}): boolean {
  if (!isNewer(input.latestVersion, input.currentVersion)) return false
  if (!input.dismissedVersion) return true
  // Dismissal sticks for that version and anything older than it, so a user who
  // said "not now" to v0.4.15 is not re-asked when a mirror briefly reports an
  // older tag.
  return compareVersions(input.latestVersion as string, input.dismissedVersion) > 0
}
