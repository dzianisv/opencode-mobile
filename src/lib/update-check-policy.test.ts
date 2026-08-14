import { test } from "node:test"
import assert from "node:assert/strict"
import {
  CHECK_INTERVAL_MS,
  compareVersions,
  isNewer,
  parseVersion,
  shouldCheck,
  shouldPrompt,
  resolveUpdate,
  LAST_CHECK_KEY,
  LATEST_KEY,
  DISMISSED_KEY,
} from "./update-check-policy.ts"

test("parseVersion accepts the shapes our releases actually use", () => {
  assert.deepEqual(parseVersion("0.4.10"), [0, 4, 10])
  assert.deepEqual(parseVersion("v0.4.10"), [0, 4, 10])
  assert.deepEqual(parseVersion(" v0.4.14 "), [0, 4, 14])
  assert.deepEqual(parseVersion("0.4.14-rc.1"), [0, 4, 14])
  assert.deepEqual(parseVersion("1.0"), [1, 0])
})

test("parseVersion rejects anything it cannot compare", () => {
  assert.equal(parseVersion("unknown"), null)
  assert.equal(parseVersion(""), null)
  assert.equal(parseVersion(null), null)
  assert.equal(parseVersion(undefined), null)
  assert.equal(parseVersion("nightly"), null)
  assert.equal(parseVersion("0.4.x"), null)
})

test("0.4.9 is older than 0.4.10 — the comparison a string sort gets backwards", () => {
  // Not a hypothetical: v0.4.10 held 64% of the 30d-active base on 2026-08-14.
  // A lexicographic compare would have told that exact cohort it was current.
  assert.equal(compareVersions("0.4.9", "0.4.10"), -1)
  assert.equal(compareVersions("0.4.10", "0.4.9"), 1)
  assert.equal(isNewer("0.4.10", "0.4.9"), true)
  assert.equal(isNewer("0.4.9", "0.4.10"), false)
})

test("compareVersions handles equality and differing segment counts", () => {
  assert.equal(compareVersions("0.4.14", "0.4.14"), 0)
  assert.equal(compareVersions("0.4", "0.4.0"), 0)
  assert.equal(compareVersions("0.5", "0.4.99"), 1)
  assert.equal(compareVersions("1.0.0", "0.9.9"), 1)
})

test("unknown versions never count as newer", () => {
  assert.equal(isNewer("unknown", "0.4.10"), false)
  assert.equal(isNewer("0.4.15", "unknown"), false)
  assert.equal(isNewer(null, "0.4.10"), false)
  assert.equal(isNewer("0.4.15", null), false)
})

test("shouldCheck throttles to one check per interval", () => {
  const now = 1_786_723_000_000
  assert.equal(shouldCheck({ lastCheckedAt: null, now }), true)
  assert.equal(shouldCheck({ lastCheckedAt: now - CHECK_INTERVAL_MS, now }), true)
  assert.equal(shouldCheck({ lastCheckedAt: now - CHECK_INTERVAL_MS + 1, now }), false)
  assert.equal(shouldCheck({ lastCheckedAt: now, now }), false)
})

test("shouldCheck recovers from a clock that moved backwards", () => {
  const now = 1_786_723_000_000
  // Restored backup / NTP correction: a future timestamp must not disable
  // update checks until real time catches up.
  assert.equal(shouldCheck({ lastCheckedAt: now + CHECK_INTERVAL_MS * 30, now }), true)
  assert.equal(shouldCheck({ lastCheckedAt: Number.NaN, now }), true)
})

test("shouldCheck honours a custom interval", () => {
  const now = 1_786_723_000_000
  assert.equal(shouldCheck({ lastCheckedAt: now - 1000, now, intervalMs: 500 }), true)
  assert.equal(shouldCheck({ lastCheckedAt: now - 100, now, intervalMs: 500 }), false)
})

test("prompts only for a strictly newer version", () => {
  assert.equal(
    shouldPrompt({ currentVersion: "0.4.10", latestVersion: "0.4.14", dismissedVersion: null }),
    true,
  )
  assert.equal(
    shouldPrompt({ currentVersion: "0.4.14", latestVersion: "0.4.14", dismissedVersion: null }),
    false,
  )
  // A mirror or a stale CDN reporting an older tag must never trigger a prompt.
  assert.equal(
    shouldPrompt({ currentVersion: "0.4.14", latestVersion: "0.4.10", dismissedVersion: null }),
    false,
  )
})

test("a dismissal sticks for that version but not for the next one", () => {
  assert.equal(
    shouldPrompt({ currentVersion: "0.4.10", latestVersion: "0.4.14", dismissedVersion: "0.4.14" }),
    false,
  )
  assert.equal(
    shouldPrompt({ currentVersion: "0.4.10", latestVersion: "0.4.15", dismissedVersion: "0.4.14" }),
    true,
  )
  // Older-than-dismissed stays dismissed.
  assert.equal(
    shouldPrompt({ currentVersion: "0.4.9", latestVersion: "0.4.12", dismissedVersion: "0.4.14" }),
    false,
  )
})

test("never prompts when the running version is unknown", () => {
  assert.equal(
    shouldPrompt({ currentVersion: "unknown", latestVersion: "0.4.14", dismissedVersion: null }),
    false,
  )
  assert.equal(
    shouldPrompt({ currentVersion: "0.4.10", latestVersion: null, dismissedVersion: null }),
    false,
  )
})

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: async (key: string) => data.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      data.set(key, value)
    },
  }
}

const NOW = 1_786_723_000_000

test("resolveUpdate: fetches, caches and reports a newer release", async () => {
  const storage = memoryStorage()
  let calls = 0
  const update = await resolveUpdate({
    storage,
    currentVersion: "0.4.10",
    now: NOW,
    fetchLatest: async () => {
      calls++
      return { version: "0.4.14", url: "https://example.test/v0.4.14" }
    },
  })

  assert.deepEqual(update, { version: "0.4.14", url: "https://example.test/v0.4.14" })
  assert.equal(calls, 1)
  assert.equal(storage.data.get(LAST_CHECK_KEY), String(NOW))
  assert.deepEqual(JSON.parse(storage.data.get(LATEST_KEY) as string), {
    version: "0.4.14",
    url: "https://example.test/v0.4.14",
  })
})

test("resolveUpdate: within the interval it serves the cache without a network call", async () => {
  const storage = memoryStorage({
    [LAST_CHECK_KEY]: String(NOW - 1000),
    [LATEST_KEY]: JSON.stringify({ version: "0.4.14", url: "https://example.test/v0.4.14" }),
  })
  let calls = 0
  const update = await resolveUpdate({
    storage,
    currentVersion: "0.4.10",
    now: NOW,
    fetchLatest: async () => {
      calls++
      return { version: "0.4.15", url: "https://example.test/v0.4.15" }
    },
  })

  assert.equal(calls, 0)
  assert.equal(update?.version, "0.4.14")
})

test("resolveUpdate: a failed fetch is silent and does not consume the interval", async () => {
  const storage = memoryStorage()
  const update = await resolveUpdate({
    storage,
    currentVersion: "0.4.10",
    now: NOW,
    fetchLatest: async () => {
      throw new Error("offline")
    },
  })

  assert.equal(update, null)
  // No timestamp written: the next launch with network must try again.
  assert.equal(storage.data.get(LAST_CHECK_KEY), undefined)
})

test("resolveUpdate: garbage from the network or the cache is ignored", async () => {
  const storage = memoryStorage({ [LATEST_KEY]: "not json" })
  const update = await resolveUpdate({
    storage,
    currentVersion: "0.4.10",
    now: NOW,
    fetchLatest: async () => ({ version: "nightly", url: "https://example.test/nightly" }),
  })

  assert.equal(update, null)
  assert.equal(storage.data.get(LAST_CHECK_KEY), undefined)
})

test("resolveUpdate: a dismissed version stays dismissed even though it is cached", async () => {
  const storage = memoryStorage({
    [LAST_CHECK_KEY]: String(NOW - 1000),
    [LATEST_KEY]: JSON.stringify({ version: "0.4.14", url: "https://example.test/v0.4.14" }),
    [DISMISSED_KEY]: "0.4.14",
  })
  const update = await resolveUpdate({
    storage,
    currentVersion: "0.4.10",
    now: NOW,
    fetchLatest: async () => null,
  })

  assert.equal(update, null)
})

test("resolveUpdate: already on the newest build -> nothing to show", async () => {
  const storage = memoryStorage()
  const update = await resolveUpdate({
    storage,
    currentVersion: "0.4.14",
    now: NOW,
    fetchLatest: async () => ({ version: "0.4.14", url: "https://example.test/v0.4.14" }),
  })

  assert.equal(update, null)
  // The check still counted — it succeeded, it just had nothing to report.
  assert.equal(storage.data.get(LAST_CHECK_KEY), String(NOW))
})

test("resolveUpdate: a broken store never throws at the caller", async () => {
  const update = await resolveUpdate({
    storage: {
      getItem: async () => {
        throw new Error("keystore locked")
      },
      setItem: async () => undefined,
    },
    currentVersion: "0.4.10",
    now: NOW,
    fetchLatest: async () => ({ version: "0.4.14", url: "https://example.test/v0.4.14" }),
  })

  assert.equal(update, null)
})

test("resolveUpdate: ignoreDismissed still reports a dismissed version (Settings row)", async () => {
  const storage = memoryStorage({
    [LAST_CHECK_KEY]: String(NOW - 1000),
    [LATEST_KEY]: JSON.stringify({ version: "0.4.14", url: "https://example.test/v0.4.14" }),
    [DISMISSED_KEY]: "0.4.14",
  })
  const update = await resolveUpdate({
    storage,
    currentVersion: "0.4.10",
    now: NOW,
    ignoreDismissed: true,
    fetchLatest: async () => null,
  })

  assert.equal(update?.version, "0.4.14")
})
