// Pure, transport-agnostic Server-Sent Events framing for the opencode event stream.
// Extracted from sdk.ts so the chunk-buffering rules — which are easy to get wrong when
// a single event is split across two network reads — are unit-testable without a socket.

/**
 * Type of the liveness-only event the SDK event generators yield when a chunk
 * arrives carrying no session event (subscribe frame, heartbeat comment).
 * A healthy but idle server never emits a session event, so without this the
 * events store could never observe that the stream is live (#189/#186
 * Finding 1). Carries no payload: the store treats it as proof of bytes on
 * the wire and skips dispatch. Fits the shared `Event {type, properties}`
 * shape, so both the v1 and v2 generators can yield it.
 */
export const SSE_LIVENESS_EVENT_TYPE = "sse.liveness"

/**
 * Bound on the SSE dial (headers must arrive within this long). The 45s idle
 * watchdog only wraps `reader.read()` AFTER headers arrive, so a black-holed
 * dial would otherwise park the reconnect loop forever — `attemptInFlight`
 * never clears and `reconnectNow()` no-ops (Finding 2). The events store's
 * stale-connecting rescue keys off this same constant, so the two bounds
 * cannot drift apart.
 */
export const SSE_DIAL_TIMEOUT_MS = 15_000

/**
 * A `live` stream with no byte for this long is stale — a half-open socket
 * after a network change, where the 45s idle watchdog has not fired yet.
 * The events store lets `reconnectNow()` rescue a stale-live stream at this
 * bound instead of waiting out the watchdog. Two missed v2 heartbeats
 * (15s interval); well under the 45s watchdog.
 */
export const SSE_STALE_LIVE_MS = 30_000

export class SSEParser {
  private buffer = ""

  /**
   * Feed one decoded text chunk. Returns the `data:` payloads (as raw strings)
   * that completed within this chunk. A partial trailing line is retained and
   * prepended to the next chunk. The `[DONE]` sentinel and empty payloads are
   * filtered out. Lines that are not `data:` frames (comments, `event:`, blanks)
   * are ignored. Callers JSON-parse the returned strings.
   */
  push(chunk: string): string[] {
    this.buffer += chunk
    const lines = this.buffer.split("\n")
    // The last element is whatever came after the final newline — possibly an
    // incomplete line. Hold it until the next chunk completes it.
    this.buffer = lines.pop() ?? ""

    const out: string[] = []
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6)
        if (data && data !== "[DONE]") out.push(data)
      }
    }
    return out
  }
}
