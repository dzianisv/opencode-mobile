import { test } from "node:test"
import assert from "node:assert/strict"
import {
  WAITLIST_QUEUE_KEY,
  WAITLIST_QUEUE_MAX,
  WAITLIST_QUEUE_TTL_MS,
  enqueueSignup,
  flushQueue,
  loadQueue,
  needsManualEscapeHatch,
  pruneQueue,
  removeFromQueue,
  type QueueStorage,
  type QueuedSignup,
  type WaitlistResult,
} from "./waitlist.ts"

// In-memory stand-in for AsyncStorage. `fail` makes every write throw, which is
// how a device with full/locked storage behaves.
function memoryStorage(initial?: string, opts: { failWrites?: boolean } = {}) {
  const map = new Map<string, string>()
  if (initial !== undefined) map.set(WAITLIST_QUEUE_KEY, initial)
  const storage: QueueStorage & { map: Map<string, string> } = {
    map,
    async getItem(key) {
      return map.get(key) ?? null
    },
    async setItem(key, value) {
      if (opts.failWrites) throw new Error("storage full")
      map.set(key, value)
    },
    async removeItem(key) {
      if (opts.failWrites) throw new Error("storage full")
      map.delete(key)
    },
  }
  return storage
}

function stored(storage: { map: Map<string, string> }): QueuedSignup[] {
  const raw = storage.map.get(WAITLIST_QUEUE_KEY)
  return raw ? (JSON.parse(raw) as QueuedSignup[]) : []
}

const ok = (email: string): WaitlistResult => ({ ok: true, email })
const offline = (email: string): WaitlistResult => ({ ok: false, email, retryable: true, error: "Network request failed" })
const rejected = (email: string): WaitlistResult => ({ ok: false, email, retryable: false, error: "Enter a valid email address." })

// --- enqueue ---

test("enqueue persists a normalized signup with attempt 1", async () => {
  const storage = memoryStorage()
  const entry = await enqueueSignup(storage, "  Dev@Example.COM ", { now: 1_000, error: "Network request failed" })
  assert.deepEqual(entry, {
    email: "dev@example.com",
    queuedAt: 1_000,
    attempts: 1,
    lastAttemptAt: 1_000,
    lastError: "Network request failed",
  })
  assert.deepEqual(stored(storage), [entry])
})

test("enqueue dedupes by email and bumps attempts instead of growing the queue", async () => {
  const storage = memoryStorage()
  await enqueueSignup(storage, "dev@example.com", { now: 1_000 })
  const second = await enqueueSignup(storage, "DEV@example.com", { now: 2_000 })
  assert.equal(stored(storage).length, 1)
  assert.equal(second?.attempts, 2)
  assert.equal(second?.queuedAt, 1_000, "original queue time is preserved")
  assert.equal(second?.lastAttemptAt, 2_000)
})

test("enqueue caps the queue at WAITLIST_QUEUE_MAX, keeping the newest", async () => {
  const storage = memoryStorage()
  for (let i = 0; i < WAITLIST_QUEUE_MAX + 3; i++) {
    await enqueueSignup(storage, `user${i}@example.com`, { now: 1_000 + i })
  }
  const queue = stored(storage)
  assert.equal(queue.length, WAITLIST_QUEUE_MAX)
  assert.equal(queue[queue.length - 1].email, `user${WAITLIST_QUEUE_MAX + 2}@example.com`)
})

test("enqueue refuses an invalid email — nothing is stored, caller must not claim success", async () => {
  const storage = memoryStorage()
  assert.equal(await enqueueSignup(storage, "not-an-email"), null)
  assert.equal(storage.map.size, 0)
})

test("enqueue returns null when storage refuses the write (never lie about saving)", async () => {
  const storage = memoryStorage(undefined, { failWrites: true })
  assert.equal(await enqueueSignup(storage, "dev@example.com", { now: 1 }), null)
})

// --- load resilience: a corrupt blob must not brick the screen ---

test("load tolerates missing, corrupt, non-array and foreign-shaped payloads", async () => {
  assert.deepEqual(await loadQueue(memoryStorage()), [])
  assert.deepEqual(await loadQueue(memoryStorage("{not json")), [])
  assert.deepEqual(await loadQueue(memoryStorage('{"email":"a@b.co"}')), [])
  assert.deepEqual(await loadQueue(memoryStorage('[{"nope":1},null,3]')), [])
  assert.deepEqual(
    await loadQueue(memoryStorage('[{"email":"NOT normalized","queuedAt":1,"attempts":1}]')),
    [],
    "entries that were never normalized are dropped rather than replayed as garbage",
  )
})

test("load backfills lastAttemptAt for entries written before that field existed", async () => {
  const storage = memoryStorage('[{"email":"dev@example.com","queuedAt":42,"attempts":1}]')
  assert.deepEqual(await loadQueue(storage), [
    { email: "dev@example.com", queuedAt: 42, attempts: 1, lastAttemptAt: 42 },
  ])
})

test("load survives a storage read that throws", async () => {
  const storage: QueueStorage = {
    async getItem() {
      throw new Error("AsyncStorage unavailable")
    },
    async setItem() {},
    async removeItem() {},
  }
  assert.deepEqual(await loadQueue(storage), [])
})

// --- TTL ---

test("entries older than the TTL are pruned", () => {
  const fresh: QueuedSignup = { email: "a@b.co", queuedAt: 1_000, attempts: 1, lastAttemptAt: 1_000 }
  const stale: QueuedSignup = { email: "c@d.co", queuedAt: 0, attempts: 9, lastAttemptAt: 0 }
  assert.deepEqual(pruneQueue([fresh, stale], WAITLIST_QUEUE_TTL_MS + 500), [fresh])
})

// --- flush: the AGE-87 acceptance test ---

test("offline signup reaches the server on the next flush, with no mail client involved", async () => {
  const storage = memoryStorage()

  // 1. User taps "Join Waitlist" on a plane: the POST fails, we queue it.
  const failure = offline("dev@example.com")
  assert.equal(failure.ok, false)
  const queued = await enqueueSignup(storage, "dev@example.com", { now: 1_000, error: failure.error })
  assert.equal(queued?.attempts, 1)

  // 2. Still offline on the next foreground: kept, attempts bumped.
  const attempted: string[] = []
  const stillOffline = await flushQueue(storage, {
    now: 2_000,
    submit: async (email) => {
      attempted.push(email)
      return offline(email)
    },
  })
  assert.deepEqual(stillOffline.synced, [])
  assert.deepEqual(stillOffline.pending.map((e) => e.attempts), [2])
  assert.deepEqual(stored(storage).map((e) => e.email), ["dev@example.com"])

  // 3. Device reconnects: the queued signup lands in Brevo list 4 and the
  //    queue empties. No mailto: URL was ever built.
  const reconnected = await flushQueue(storage, {
    now: 3_000,
    submit: async (email) => {
      attempted.push(email)
      return ok(email)
    },
  })
  assert.deepEqual(reconnected.synced, ["dev@example.com"])
  assert.deepEqual(reconnected.pending, [])
  assert.equal(storage.map.has(WAITLIST_QUEUE_KEY), false, "queue key is removed once empty")
  assert.deepEqual(attempted, ["dev@example.com", "dev@example.com"])
})

test("flush drops entries the server permanently rejects (4xx) instead of retrying forever", async () => {
  const storage = memoryStorage()
  await enqueueSignup(storage, "dev@example.com", { now: 1 })
  const outcome = await flushQueue(storage, { now: 2, submit: async (email) => rejected(email) })
  assert.deepEqual(outcome.rejected, ["dev@example.com"])
  assert.deepEqual(outcome.pending, [])
  assert.deepEqual(stored(storage), [])
})

test("flush keeps the other entries when one submit throws", async () => {
  const storage = memoryStorage()
  await enqueueSignup(storage, "a@example.com", { now: 1 })
  await enqueueSignup(storage, "b@example.com", { now: 2 })
  const outcome = await flushQueue(storage, {
    now: 3,
    submit: async (email) => {
      if (email === "a@example.com") throw new TypeError("boom")
      return ok(email)
    },
  })
  assert.deepEqual(outcome.synced, ["b@example.com"])
  assert.deepEqual(outcome.pending.map((e) => e.email), ["a@example.com"])
  assert.match(outcome.pending[0].lastError ?? "", /boom/)
})

test("flush prunes expired entries without submitting them", async () => {
  const storage = memoryStorage()
  await enqueueSignup(storage, "old@example.com", { now: 0 })
  let called = 0
  const outcome = await flushQueue(storage, {
    now: WAITLIST_QUEUE_TTL_MS + 1,
    submit: async (email) => {
      called++
      return ok(email)
    },
  })
  assert.equal(called, 0)
  assert.deepEqual(outcome, { synced: [], rejected: [], pending: [] })
  assert.deepEqual(stored(storage), [])
})

test("flush on an empty queue is a no-op", async () => {
  const storage = memoryStorage()
  const outcome = await flushQueue(storage, { submit: async () => assert.fail("must not submit") })
  assert.deepEqual(outcome, { synced: [], rejected: [], pending: [] })
})

// --- manual escape hatch policy ---

test("the manual email escape hatch appears only after repeated failures", async () => {
  const storage = memoryStorage()
  let entry = await enqueueSignup(storage, "dev@example.com", { now: 1 })
  assert.equal(needsManualEscapeHatch(entry), false)
  entry = await enqueueSignup(storage, "dev@example.com", { now: 2 })
  assert.equal(needsManualEscapeHatch(entry), false)
  entry = await enqueueSignup(storage, "dev@example.com", { now: 3 })
  assert.equal(needsManualEscapeHatch(entry), true, "3rd failed attempt -> offer 'still not working? email us'")
  assert.equal(needsManualEscapeHatch(null), false)
})

// --- explicit removal ---

test("removeFromQueue drops just that email", async () => {
  const storage = memoryStorage()
  await enqueueSignup(storage, "a@example.com", { now: 1 })
  await enqueueSignup(storage, "b@example.com", { now: 2 })
  await removeFromQueue(storage, "a@example.com")
  assert.deepEqual(stored(storage).map((e) => e.email), ["b@example.com"])
  await removeFromQueue(storage, "missing@example.com") // no-op, no throw
  assert.deepEqual(stored(storage).map((e) => e.email), ["b@example.com"])
})
