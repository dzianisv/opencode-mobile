// Pure URL parsing + connection-failure classification, extracted from diagnostics.ts
// so this decision logic (which produces the user-facing "why did connecting fail"
// guidance) is unit-testable without react-native / expo-clipboard / expo-device.

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

export interface ParsedUrl {
  valid: boolean
  scheme?: string
  host?: string
  port?: string
  isHostname: boolean
}

// Hermes' built-in URL is incomplete (hostname/port often unreliable), so parse
// with a regex instead of `new URL`.
export function parseUrl(url: string): ParsedUrl {
  const m = url.trim().match(/^(https?):\/\/([^/:?#]+)(?::(\d+))?/i)
  if (!m) return { valid: false, isHostname: false }
  const scheme = m[1].toLowerCase()
  const host = m[2]
  const port = m[3] || (scheme === "https" ? "443" : "80")
  const isHostname = !/^\d{1,3}(\.\d{1,3}){3}$/.test(host)
  return { valid: true, scheme, host, port, isHostname }
}

export function classify(
  parsed: ParsedUrl,
  health: ProbeAttempt,
  internet: ProbeAttempt,
  root: ProbeAttempt,
): { classification: Classification; summary: string } {
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
  // The user's own server responded to *something* (even a 401/403/404) —
  // that proves the path to the server works, so a failed public-internet
  // probe (captive portal, no WAN but Tailscale LAN still up, etc.) must not
  // override it and misreport a reachable server as "no internet".
  if (root.ok) {
    return { classification: "health-failed", summary: `Server is reachable but /global/health failed (HTTP ${health.status ?? "error"}). Likely wrong path, auth, or an old server version.` }
  }
  if (!internet.ok) {
    return { classification: "no-internet", summary: "The device has no working internet/network at all (public check also failed). Check Wi-Fi/data and Tailscale (VPN) status." }
  }
  // Internet works, server does not.
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
