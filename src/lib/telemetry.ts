/**
 * Telemetry consent + initialisation gate.
 *
 * Wraps sentry.ts so that initSentry() is only called when the user has
 * explicitly opted in. Consent state is persisted in expo-secure-store so
 * it survives app restarts.
 *
 * Usage:
 *   import { loadTelemetryConsent, setTelemetryConsent, hasTelemetryConsent } from './telemetry'
 *
 *   // On app start — call BEFORE trying to initialise Sentry.
 *   const state = await loadTelemetryConsent()   // 'granted' | 'denied' | 'unknown'
 *   if (state === 'granted') initSentry()
 *
 *   // After the user taps "Allow" in the consent modal:
 *   await setTelemetryConsent(true)   // persists + calls initSentry() if not already done
 *
 *   // Check in Settings screen:
 *   const current = hasTelemetryConsent()   // boolean | null (null = not yet decided)
 */

import * as SecureStore from "expo-secure-store"
import { disableSentry, initSentry, sentryEnabled } from "./sentry"

const CONSENT_KEY = "opencode_telemetry_consent"

export type ConsentState = "granted" | "denied" | "unknown"

let _resolved: boolean | null = null // null = unknown, true = granted, false = denied
let transition = Promise.resolve()

/**
 * Load persisted consent from SecureStore.
 * Returns 'unknown' if the user has never been asked.
 */
export async function loadTelemetryConsent(): Promise<ConsentState> {
  try {
    const stored = await SecureStore.getItemAsync(CONSENT_KEY)
    if (stored === "granted") {
      _resolved = true
      return "granted"
    }
    if (stored === "denied") {
      _resolved = false
      return "denied"
    }
    // No stored value — first launch
    _resolved = null
    return "unknown"
  } catch {
    _resolved = false
    return "denied"
  }
}

/**
 * Returns the in-memory resolved state (set by loadTelemetryConsent or setTelemetryConsent).
 * null = consent decision not yet loaded.
 * true = granted.
 * false = denied.
 */
export function hasTelemetryConsent(): boolean | null {
  return _resolved
}

/**
 * Persist the user's consent decision and, if granted and Sentry is not yet
 * running, initialise it immediately.
 */
export function setTelemetryConsent(granted: boolean): Promise<void> {
  const next = transition.then(() => applyTelemetryConsent(granted))
  transition = next.catch(() => undefined)
  return next
}

async function applyTelemetryConsent(granted: boolean): Promise<void> {
  if (granted) {
    await SecureStore.setItemAsync(CONSENT_KEY, "granted")
    _resolved = true
    if (!sentryEnabled()) initSentry()
    return
  }

  _resolved = false
  await disableSentry()
  try {
    await SecureStore.setItemAsync(CONSENT_KEY, "denied")
  } catch (error) {
    await SecureStore.deleteItemAsync(CONSENT_KEY)
    throw error
  }
}
