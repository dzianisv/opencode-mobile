// Active connection diagnostics: when a connect attempt fails, run a set of
// parallel probes that classify *why* it failed, instead of swallowing the
// opaque RN "Network request failed" string.
import { Platform, Share } from "react-native"
import * as Clipboard from "expo-clipboard"
import * as Device from "expo-device"
import appJson from "../../app.json"
import { log, formatLogLines } from "./logbuffer"

const PROBE_TIMEOUT_MS = 8_000
// Public 204 endpoints used purely as an "is the internet reachable at all" check.
const INTERNET_CHECK_URL = "https://www.gstatic.com/generate_204"

export type Classification =
  | "ok"
  | "malformed-url"
  | "no-internet"
  | "server-unreachable"
  | "health-failed"
  | "tls-error"
  | "timeout"
  | "unknown"

export interface ProbeAttempt {
  name: string
  target: string
  ok: boolean
  status?: number
  durationMs: number
  error?: string
  errorCause?: string
}

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

interface ParsedUrl {
  valid: boolean
  scheme?: string
  host?: string
  port?: string
  isHostname: boolean
}

// Hermes' built-in URL is incomplete (hostname/port often unreliable), so parse
// with a regex instead of `new URL`.
function parseUrl(url: string): ParsedUrl {
  const m = url.trim().match(/^(https?):\/\/([^/:?#]+)(?::(\d+))?/i)
  if (!m) return { valid: false, isHostname: false }
  const scheme = m[1].toLowerCase()
  const host = m[2]
  const port = m[3] || (scheme === "https" ? "443" : "80")
  const isHostname = !/^\d{1,3}(\.\d{1,3}){3}$/.test(host)
  return { valid: true, scheme, host, port, isHostname }
}

async function timedFetch(name: string, target: string, init?: RequestInit): Promise<ProbeAttempt> {
  const start = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    const res = await fetch(target, { ...init, signal: controller.signal })
    return { name, target, ok: true, status: res.status, durationMs: Date.now() - start }
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

function classify(parsed: ParsedUrl, health: ProbeAttempt, internet: ProbeAttempt, root: ProbeAttempt): {
  classification: Classification
  summary: string
} {
  if (!parsed.valid) {
    return { classification: "malformed-url", summary: "The server URL could not be parsed. Check for typos or extra characters." }
  }
  if (health.ok) {
    return { classification: "ok", summary: "Health endpoint responded — connection actually works now." }
  }

  const txt = `${health.error ?? ""} ${health.errorCause ?? ""}`.toLowerCase()
  const isTls = /ssl|tls|certificate|trust|handshake/.test(txt)
  const isTimeout = /timeout|timed out/.test(txt)

  if (isTls) {
    return { classification: "tls-error", summary: "TLS/certificate problem. Try http:// instead of https://, or fix the server certificate." }
  }
  if (!internet.ok) {
    return { classification: "no-internet", summary: "The device has no working internet/network at all (public check also failed). Check Wi-Fi/data and Tailscale (VPN) status." }
  }
  // Internet works, server does not.
  if (root.ok) {
    return { classification: "health-failed", summary: `Server is reachable but /global/health failed (HTTP ${health.status ?? "error"}). Likely wrong path, auth, or an old server version.` }
  }
  if (isTimeout) {
    return { classification: "timeout", summary: "Connection to the server timed out (dropped, not refused). Likely a firewall, wrong port, or Tailscale ACL blocking the device." }
  }
  return {
    classification: "server-unreachable",
    summary:
      `Internet works, but the server at ${parsed.host}:${parsed.port} is unreachable. ` +
      (parsed.isHostname
        ? "Hostname may not resolve from this device (MagicDNS off?). Try the raw Tailscale IP. "
        : "") +
      "Confirm the opencode server is running, the device is on the same tailnet, and the port is correct.",
  }
}

export async function probeConnection(url: string, auth?: { username: string; password: string }): Promise<DiagnosticReport> {
  const parsed = parseUrl(url)
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
      timedFetch("server-root", `${base}/`, { headers }),
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

// Copy the report to the clipboard and open the native share sheet.
// Works fully offline (unlike the Sentry auto-upload).
export async function shareReport(report: DiagnosticReport): Promise<void> {
  const text = formatReport(report)
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
