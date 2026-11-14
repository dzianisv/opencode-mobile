/** Format a message creation time in the device's local time zone. */
export function formatMessageTimestamp(timestamp: number, locale?: string): string | undefined {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return undefined

  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return undefined

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}
