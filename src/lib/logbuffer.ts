// In-memory ring buffer of recent log lines, for attaching to diagnostic reports.
// Also mirrors to console so logs still show in Metro / logcat.

export type LogLevel = "debug" | "info" | "warn" | "error"

export interface LogEntry {
  ts: number
  level: LogLevel
  tag: string
  message: string
}

const MAX_ENTRIES = 200
const buffer: LogEntry[] = []

function push(level: LogLevel, tag: string, parts: unknown[]) {
  const message = parts
    .map((p) => {
      if (typeof p === "string") return p
      try {
        return JSON.stringify(p)
      } catch {
        return String(p)
      }
    })
    .join(" ")
  buffer.push({ ts: Date.now(), level, tag, message })
  if (buffer.length > MAX_ENTRIES) buffer.shift()

  const line = `[${tag}] ${message}`
  if (level === "error") console.error(line)
  else if (level === "warn") console.warn(line)
  else console.log(line)
}

export const log = {
  debug: (tag: string, ...parts: unknown[]) => push("debug", tag, parts),
  info: (tag: string, ...parts: unknown[]) => push("info", tag, parts),
  warn: (tag: string, ...parts: unknown[]) => push("warn", tag, parts),
  error: (tag: string, ...parts: unknown[]) => push("error", tag, parts),
}

export function getLogEntries(): LogEntry[] {
  return [...buffer]
}

export function formatLogLines(entries: LogEntry[] = buffer): string {
  return entries
    .map((e) => {
      const t = new Date(e.ts).toISOString().slice(11, 23)
      return `${t} ${e.level.toUpperCase().padEnd(5)} [${e.tag}] ${e.message}`
    })
    .join("\n")
}

export function clearLog() {
  buffer.length = 0
}
