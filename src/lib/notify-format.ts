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
  return (s ? s.replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, MAX_NOTIF_BODY) : "") || fallback
}

/** Permission details are server-controlled and can contain sensitive paths. */
export function permissionNotificationBody(): string {
  return "A tool needs your approval"
}

/** Keep arbitrary server question text off the lock screen as well. */
export function questionNotificationBody(): string {
  return "The assistant has a question"
}
