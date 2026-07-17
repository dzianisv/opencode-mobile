// Centralised PostHog wrapper for activation-funnel analytics.
//
// Mirrors sentry.ts's shape and guarantees:
//   1. Strict no-op when no API key is configured (dev/CI builds need no secrets).
//   2. Strict no-op when the user has not granted telemetry consent — this
//      module never calls PostHog.init/capture on its own; it is only ever
//      driven by ./telemetry.ts, which gates BOTH Sentry and analytics behind
//      the exact same "opencode_telemetry_consent" flag.
//   3. On consent REVOCATION, buffered-but-unsent events are DROPPED, not
//      flushed: PostHog's shutdown() normally drains the queue over the
//      network, and optOut() only blocks NEW captures (already-queued events
//      would still be sent by the next flush). So ConsentGatedPostHog
//      overrides the client's public fetch() transport; once revoked it
//      answers every SDK request with a synthetic 200 without touching the
//      network. shutdown() then "drains" the queue into that stub — clearing
//      the persisted queue and stopping timers — while zero bytes leave the
//      device.
//   4. No PII in event properties: never pass server URLs, tokens, prompts,
//      or file contents. Only coarse, enumerated event names + small typed
//      properties (booleans, enums, counts).
//
// Chosen SDK: PostHog (posthog-react-native), self-instantiated (no
// PostHogProvider / autocapture) so the app controls exactly what is sent —
// same "explicit event, no magic" posture as sentry.ts.

import PostHog from "posthog-react-native"
import * as SecureStore from "expo-secure-store"
import { log } from "./logbuffer"

export { classifyConnectionError, type ConnectionErrorClass } from "./analytics-classify"

const API_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY
// EU by default (GDPR-friendly region for opencode's mostly-EU/self-hosted user base).
// Override with EXPO_PUBLIC_POSTHOG_HOST for a self-hosted instance.
const HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com"

const FIRST_OPEN_KEY = "opencode_analytics_first_open_done"

// When true (set on consent revocation), the transport answers with a
// synthetic 200 instead of hitting the network, so queued events are
// discarded rather than uploaded. Reset when a new client is created.
let dropNetwork = false

/** PostHog client whose transport is consent-gated: after revocation every
 *  request short-circuits to a fake success so nothing reaches the network.
 *  (Types derived from the base class to avoid importing the transitive
 *  @posthog/core package directly.) */
class ConsentGatedPostHog extends PostHog {
  fetch(url: string, options: Parameters<PostHog["fetch"]>[1]): ReturnType<PostHog["fetch"]> {
    if (dropNetwork) {
      return Promise.resolve({
        status: 200,
        text: async () => "",
        json: async () => ({ status: 1 }),
      })
    }
    return super.fetch(url, options)
  }
}

let client: ConsentGatedPostHog | null = null
let enabled = false
// app_opened must fire at most once per JS session, whichever path enables
// analytics first (cold start with prior consent, or the consent modal /
// Settings toggle mid-session). Also prevents a revoke -> re-grant in the
// same session from double-counting.
let appOpenedTracked = false

/** Activation-funnel events. Keep this list in 1:1 sync with the funnel steps
 *  tracked in the product analytics dashboard. */
export enum AnalyticsEvent {
  /** Fired once per app session, as soon as analytics is enabled (either at
   *  cold start with prior consent, or right after consent is granted). */
  AppOpened = "app_opened",
  /** User tapped Connect/Save with a non-empty server URL (quick or advanced mode). */
  ConnectionFormSubmitted = "connection_form_submitted",
  /** A real network call to test/establish the connection started. */
  ConnectionAttempted = "connection_attempted",
  /** The connection attempt succeeded (health check / project fetch responded). */
  ConnectionSucceeded = "connection_succeeded",
  /** The connection attempt failed. Always paired with `error_class`. */
  ConnectionFailed = "connection_failed",
  /** User sent a prompt/message to an agent session (excludes slash commands). */
  MessageSent = "message_sent",
  /** An agent response finished streaming (session transitioned busy -> idle),
   *  excluding user-aborted runs. */
  ResponseReceived = "response_received",
}

/** Where a connection test/failure was initiated from. The activation funnel
 *  filters to source=onboarding only; edit_test (Test button on the
 *  existing-connection edit screen) and sse (background reconnect loop,
 *  see events.ts) would otherwise pollute the funnel with repeat-tester and
 *  post-activation noise. */
export type ConnectionTestSource = "onboarding" | "edit_test" | "sse"

export function initAnalytics() {
  if (enabled) return
  if (!API_KEY) {
    log.info("analytics", "no API key configured — analytics disabled")
    return
  }
  try {
    dropNetwork = false
    client = new ConsentGatedPostHog(API_KEY, {
      host: HOST,
      // We call track() explicitly at each funnel step — no implicit capture.
      captureAppLifecycleEvents: false,
    })
    // A previous revoke persisted the SDK-level opt-out flag; clear it so the
    // re-granted client can enqueue again. No-op on a fresh install.
    void client.optIn()
    enabled = true
    log.info("analytics", "initialized", `host=${HOST}`)
  } catch (e) {
    log.warn("analytics", "init failed", String(e))
  }
}

/** Consent revoked: block new captures, DROP anything buffered (see header
 *  note 3 — the gated fetch turns shutdown's drain into a no-network discard),
 *  and tear the client down. */
export async function shutdownAnalytics() {
  if (!enabled || !client) return
  enabled = false
  const c = client
  client = null
  dropNetwork = true
  try {
    // Persist SDK-level opt-out first so even a re-created client (without
    // consent) could not capture, then let shutdown clear queue + timers.
    await c.optOut()
    await c.shutdown()
  } catch (e) {
    log.warn("analytics", "shutdown failed", String(e))
  }
  log.info("analytics", "disabled by user — buffered events dropped")
}

export function analyticsEnabled(): boolean {
  return enabled
}

/** Flat, JSON-safe event properties — keep it to primitives so nothing
 *  accidentally nests an object that could carry a URL/token. */
export type AnalyticsProps = Record<string, string | number | boolean | null>

/** No-op unless consent has been granted (initAnalytics() was called) and a
 *  key is configured. Never throws. */
export function track(event: AnalyticsEvent, props?: AnalyticsProps) {
  if (!enabled || !client) return
  try {
    client.capture(event, props)
  } catch (e) {
    log.warn("analytics", "capture failed", String(e))
  }
}

/** Fire AppOpened with `is_first_open`, at most once per JS session.
 *  Called both from app start (consent already granted) and from the
 *  consent-grant transition (modal "Allow" / Settings toggle) — the session
 *  guard makes whichever happens first win. The "seen before" flag is only
 *  ever read/written once consent is granted (this function is itself a
 *  no-op without consent), so nothing is recorded locally pre-consent. */
export async function trackAppOpened() {
  if (!enabled || appOpenedTracked) return
  appOpenedTracked = true
  let isFirstOpen = false
  try {
    const seen = await SecureStore.getItemAsync(FIRST_OPEN_KEY)
    isFirstOpen = !seen
    if (isFirstOpen) await SecureStore.setItemAsync(FIRST_OPEN_KEY, "1")
  } catch {
    // SecureStore unavailable — still fire the event, just without the flag.
  }
  track(AnalyticsEvent.AppOpened, { is_first_open: isFirstOpen })
}
