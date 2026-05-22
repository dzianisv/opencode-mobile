// Thin Sentry wrapper. No-ops cleanly when no DSN is configured so dev/CI
// builds work without secrets. DSN comes from EXPO_PUBLIC_SENTRY_DSN
// (Expo inlines EXPO_PUBLIC_* at build time).
import * as Sentry from "@sentry/react-native"
import { log } from "./logbuffer"
import type { DiagnosticReport } from "./diagnostics"

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN
let enabled = false

export function initSentry() {
  if (!DSN) {
    log.info("sentry", "no DSN configured — telemetry disabled")
    return
  }
  try {
    Sentry.init({
      dsn: DSN,
      // Capture breadcrumbs but keep performance tracing off by default.
      tracesSampleRate: 0,
      enableAutoSessionTracking: true,
      // Don't send PII; connection URLs are attached explicitly + scrubbed below.
      sendDefaultPii: false,
    })
    enabled = true
    log.info("sentry", "initialized")
  } catch (e) {
    log.warn("sentry", "init failed", String(e))
  }
}

// Strip basic-auth credentials from a URL before it leaves the device.
function scrubUrl(url: string): string {
  return url.replace(/\/\/[^@/]+@/, "//<redacted>@")
}

export function captureDiagnostic(report: DiagnosticReport, rawError?: unknown) {
  log.info("sentry", "capture", report.classification, enabled ? "(uploading)" : "(local only)")
  if (!enabled) return
  Sentry.withScope((scope) => {
    scope.setTag("connect.classification", report.classification)
    scope.setTag("connect.scheme", report.scheme ?? "n/a")
    scope.setContext("connection", {
      url: scrubUrl(report.url),
      host: report.host,
      port: report.port,
      isHostname: report.isHostname,
      summary: report.summary,
    })
    scope.setContext("probes", {
      attempts: report.attempts.map((a) => ({
        name: a.name,
        ok: a.ok,
        status: a.status,
        durationMs: a.durationMs,
        error: a.error,
        cause: a.errorCause,
      })),
    })
    scope.setContext("device", report.device)
    const err = rawError instanceof Error ? rawError : new Error(`connect ${report.classification}: ${report.summary}`)
    Sentry.captureException(err)
  })
}

export const wrap = Sentry.wrap
