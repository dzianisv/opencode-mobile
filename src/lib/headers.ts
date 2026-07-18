// Pure request-header construction for the opencode client.
// Extracted from sdk.ts so the auth + directory-encoding rules are unit-testable
// without pulling in expo/fetch (which has no resolver outside Metro).
//
// Relies only on `btoa`, which is available in both Hermes (RN) and Node >= 16.

export interface HeaderConfig {
  directory?: string
  auth?: { username: string; password: string }
}

// `btoa` is Latin1-only and throws a range error on any character outside
// the Latin1 byte range (e.g. a non-ASCII username/password). UTF-8-encode
// first so arbitrary Unicode credentials survive - this is the standard
// browser idiom for UTF-8-safe base64, and matches RFC 7617 (Basic auth
// credentials are UTF-8 before being base64-encoded). ASCII input is
// byte-identical to plain `btoa` since encodeURIComponent/unescape
// round-trip it unchanged.
function toBase64Utf8(str: string): string {
  return btoa(unescape(encodeURIComponent(str)))
}

export function buildRequestHeaders(config: HeaderConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }

  if (config.directory) {
    // The directory travels in an HTTP header, which is latin1-only. ASCII paths
    // pass through untouched (so the server sees a readable path); anything with
    // non-ASCII bytes is percent-encoded to stay header-safe.
    const encoded = /[^\x00-\x7F]/.test(config.directory)
      ? encodeURIComponent(config.directory)
      : config.directory
    headers["x-opencode-directory"] = encoded
  }

  if (config.auth) {
    const credentials = toBase64Utf8(`${config.auth.username}:${config.auth.password}`)
    headers["Authorization"] = `Basic ${credentials}`
  }

  return headers
}
