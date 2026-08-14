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

/**
 * Fixed, generic body for permission-request notifications.
 *
 * Permissions are server-driven prompts that can carry arbitrary text (the
 * tool name, patterns, etc.). Rendering that text in the OS notification can
 * leak server content to the lock screen when the user has not unlocked the
 * device, and gives a malicious server a free text-injection surface. The
 * notification body is therefore a constant string; the full detail stays
 * in-app where the user has authenticated.
 */
export function permissionNotificationBody(): string {
  return "A tool needs your approval"
}

/**
 * Fixed, generic body for assistant-question notifications.
 *
 * Same lock-screen reasoning as `permissionNotificationBody()`: the question
 * header/text comes from the server, so it is not echoed into the notification.
 */
export function questionNotificationBody(): string {
  return "The assistant has a question"
}
