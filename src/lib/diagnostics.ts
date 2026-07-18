// Active connection diagnostics: when a connect attempt fails, run a set of
// parallel probes that classify *why* it failed, instead of swallowing the
// opaque RN "Network request failed" string.
import { Platform, Share } from "react-native"
import * as Clipboard from "expo-clipboard"
import * as Device from "expo-device"
import * as SecureStore from "expo-secure-store"
import appJson from "../../app.json"
import { log, formatLogLines } from "./logbuffer"
import { type Classification, type ProbeAttempt, type ParsedUrl, parseUrl, classify } from "./diagnostics-classify"
import { chatwootConfigured, sendSupportReport } from "./chatwoot"
import { hasTelemetryConsent, loadTelemetryConsent } from "./telemetry"
import { redactHostAndUrls } from "./scrub"

export type { Classification, ProbeAttempt } from "./diagnostics-classify"

const PROBE_TIMEOUT_MS = 8_000
// Public 204 endpoints used purely as an "is the internet reachable at all" check.
const INTERNET_CHECK_URL = "https://www.gstatic.com/generate_204"

export interface DiagnosticReport {
  classification: Classification
  summary: string
  url: string
  scheme?: string
  host?: string
  port?: string
  isHostname: boolean
  attempts: ProbeAttempt[]
  device: {
    platform: string
    osVersion: string
    model: string
    appVersion: string
  }
  timestamp: string
}

// requireOk: whether a non-2xx HTTP response counts as a probe failure.
// The health probe must actually succeed (2xx) to mean "the server works" —
// otherwise a 401/403/404/500 response was being reported as ok:true, which
// made classify() short-circuit to "connection actually works now" even when
// auth failed or the server errored. The root probe only checks reachability
// (any HTTP response, even an error status, proves something is listening).
async function timedFetch(name: string, target: string, init?: RequestInit, opts?: { requireOk?: boolean }): Promise<ProbeAttempt> {
  const requireOk = opts?.requireOk ?? true
  const start = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    const res = await fetch(target, { ...init, signal: controller.signal })
    return { name, target, ok: requireOk ? res.ok : true, status: res.status, durationMs: Date.now() - start }
  } catch (error: unknown) {
    const err = error as { name?: string; message?: string; cause?: unknown }
    const aborted = err?.name === "AbortError"
    return {
      name,
      target,
      ok: false,
      durationMs: Date.now() - start,
      error: aborted ? `timeout after ${PROBE_TIMEOUT_MS}ms` : err?.message || String(error),
      errorCause: err?.cause != null ? String((err.cause as { message?: string })?.message ?? err.cause) : undefined,
    }
  } finally {
    clearTimeout(timer)
  }
}

// Every host probed this session. Log lines mention hosts without a scheme
// (so URL-based scrubbing misses them), and a crash report has no host of its
// own — this set lets formatReportForSupport redact them all regardless.
const seenHosts = new Set<string>()

export async function probeConnection(url: string, auth?: { username: string; password: string }): Promise<DiagnosticReport> {
  const parsed = parseUrl(url)
  if (parsed.host) seenHosts.add(parsed.host)
  log.info("diag", "probe start", url, "parsed", JSON.stringify(parsed))

  const headers: Record<string, string> = {}
  if (auth) headers["Authorization"] = `Basic ${btoa(`${auth.username}:${auth.password}`)}`

  let health: ProbeAttempt
  let root: ProbeAttempt
  let internet: ProbeAttempt

  if (parsed.valid) {
    const base = `${parsed.scheme}://${parsed.host}:${parsed.port}`
    ;[health, root, internet] = await Promise.all([
      timedFetch("health", `${base}/global/health`, { headers }),
      timedFetch("server-root", `${base}/`, { headers }, { requireOk: false }),
      timedFetch("internet", INTERNET_CHECK_URL),
    ])
  } else {
    const skipped: ProbeAttempt = { name: "health", target: url, ok: false, durationMs: 0, error: "skipped: malformed url" }
    health = skipped
    root = { ...skipped, name: "server-root" }
    internet = await timedFetch("internet", INTERNET_CHECK_URL)
  }

  const { classification, summary } = classify(parsed, health, internet, root)

  const report: DiagnosticReport = {
    classification,
    summary,
    url,
    scheme: parsed.scheme,
    host: parsed.host,
    port: parsed.port,
    isHostname: parsed.isHostname,
    attempts: [health, root, internet],
    device: {
      platform: Platform.OS,
      osVersion: String(Platform.Version),
      model: Device.modelName || "unknown",
      appVersion: (appJson as { expo?: { version?: string } }).expo?.version || "unknown",
    },
    timestamp: new Date().toISOString(),
  }

  log.info("diag", "probe result", classification, "-", summary)
  return report
}

export function formatReport(report: DiagnosticReport): string {
  const lines: string[] = []
  lines.push("=== OpenCode Mobile — Connection Diagnostic ===")
  lines.push(`Time:        ${report.timestamp}`)
  lines.push(`Result:      ${report.classification.toUpperCase()}`)
  lines.push(`Summary:     ${report.summary}`)
  lines.push("")
  lines.push(`Target URL:  ${report.url}`)
  lines.push(`  scheme=${report.scheme} host=${report.host} port=${report.port} hostname=${report.isHostname}`)
  lines.push("")
  lines.push("Probes:")
  for (const a of report.attempts) {
    const status = a.ok ? `OK ${a.status ?? ""}`.trim() : `FAIL ${a.error ?? ""}`.trim()
    lines.push(`  - ${a.name.padEnd(12)} ${a.target}`)
    lines.push(`      ${status} (${a.durationMs}ms)${a.errorCause ? ` cause=${a.errorCause}` : ""}`)
  }
  lines.push("")
  lines.push("Device:")
  lines.push(`  ${report.device.platform} ${report.device.osVersion} | ${report.device.model} | app ${report.device.appVersion}`)
  lines.push("")
  lines.push("Recent logs:")
  lines.push(formatLogLines())
  return lines.join("\n")
}

// Build a synthetic DiagnosticReport from an unexpected runtime error (e.g.
// a React render crash or an unhandled promise rejection). Reuses the same
// formatting / share pipeline as connection diagnostics so users only ever
// see one kind of "Share report" UI.
export function buildCrashReport(error: unknown, source: "react-boundary" | "global" = "global"): DiagnosticReport {
  const err = error instanceof Error ? error : new Error(typeof error === "string" ? error : JSON.stringify(error))
  const stackHead = (err.stack ?? "").split("\n").slice(0, 3).join(" | ")
  const attempt: ProbeAttempt = {
    name: source === "react-boundary" ? "react-render" : "runtime",
    target: "app",
    ok: false,
    durationMs: 0,
    error: err.message,
    errorCause: stackHead || undefined,
  }
  return {
    classification: "unknown",
    summary: `App crashed (${source}): ${err.message}`,
    url: "",
    isHostname: false,
    attempts: [attempt],
    device: {
      platform: Platform.OS,
      osVersion: String(Platform.Version),
      model: Device.modelName || "unknown",
      appVersion: (appJson as { expo?: { version?: string } }).expo?.version || "unknown",
    },
    timestamp: new Date().toISOString(),
  }
}

// Variant of formatReport for sending off-device: the user's server address
// must never leave the phone, so every URL and every occurrence of the target
// host is redacted. Classification, probe outcomes, device info and (URL-
// scrubbed) logs survive — that is what support needs.
export function formatReportForSupport(report: DiagnosticReport): string {
  return redactHostAndUrls(formatReport(report), [report.host, ...seenHosts])
}

const CHATWOOT_SOURCE_KEY = "opencode_chatwoot_source_id"

// Best-effort delivery of the scrubbed report to the Chatwoot support inbox.
// Only runs when the user has granted telemetry consent (same flag that
// gates Sentry/analytics) and the inbox is configured for this build.
async function sendReportToSupport(report: DiagnosticReport): Promise<void> {
  // Consent may not be loaded yet if a crash happens very early in startup —
  // resolve it from the store rather than silently dropping the report.
  if (hasTelemetryConsent() === null) await loadTelemetryConsent()
  if (hasTelemetryConsent() !== true || !chatwootConfigured()) return
  try {
    await sendSupportReport(formatReportForSupport(report), {
      loadSourceId: () => SecureStore.getItemAsync(CHATWOOT_SOURCE_KEY),
      saveSourceId: (id) => SecureStore.setItemAsync(CHATWOOT_SOURCE_KEY, id),
    })
    log.info("diag", "report delivered to support inbox")
  } catch (e) {
    log.warn("diag", "support delivery failed", String(e))
  }
}

// Copy the report to the clipboard and open the native share sheet.
// Works fully offline (unlike the Sentry auto-upload). When telemetry
// consent is granted, a scrubbed copy is also delivered to the support
// inbox so reports reach us even if the user cancels the share sheet.
export async function shareReport(report: DiagnosticReport): Promise<void> {
  const text = formatReport(report)
  void sendReportToSupport(report)
  try {
    await Clipboard.setStringAsync(text)
  } catch {
    // clipboard optional
  }
  try {
    await Share.share({ title: "OpenCode connection diagnostic", message: text })
  } catch (e) {
    log.warn("diag", "share failed", String(e))
  }
}
