// Production wiring for the waitlist retry queue (AGE-87).
//
// Split out from waitlist-queue.ts so the queue logic stays importable by
// `node --test` (no react-native / AsyncStorage native module). This file is
// the only place that touches device storage.
//
// AsyncStorage (not SecureStore) on purpose: a pending waitlist email is not a
// credential, and this queue must survive a keychain that refuses to unlock —
// the whole point is that the signup is never silently lost.

import AsyncStorage from "@react-native-async-storage/async-storage"
import { flushQueue, loadQueue, enqueueSignup, removeFromQueue, type FlushOutcome, type QueuedSignup, type QueueStorage } from "./waitlist"

const storage: QueueStorage = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
}

export function queuePendingSignup(email: string, error?: string): Promise<QueuedSignup | null> {
  return enqueueSignup(storage, email, { error })
}

export function readPendingSignups(): Promise<QueuedSignup[]> {
  return loadQueue(storage)
}

export function dropPendingSignup(email: string): Promise<void> {
  return removeFromQueue(storage, email)
}

/** Best-effort retry of every pending signup. Safe to call on every foreground. */
export function flushPendingSignups(): Promise<FlushOutcome> {
  return flushQueue(storage)
}
