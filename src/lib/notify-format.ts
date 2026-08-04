// Pure formatting for notification bodies, extracted from stores/events.ts so the
// sanitization rules are unit-testable without the event store's RN dependencies.

export const MAX_NOTIF_BODY = 200

/**
 * Make a server-supplied string safe to show in a notification:
 * strip C0 control characters and DEL (which can corrupt the notification shade
 * or hide content), collapse surrounding whitespace, and cap the length. Falls
 * back to `fallback` when the input is empty/whitespace-only or undefined.
 */
export function sanitizeBody(s: string | undefined, fallback: string): string {
  // eslint-disable-next-line no-control-regex -- C0 controls are exactly what must be stripped
  return (s ? s.replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, MAX_NOTIF_BODY) : "") || fallback
}
