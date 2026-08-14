import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

/**
 * Tripwire for the "poisoned persistent memory" class of bug (a scanner
 * flagged us for it; see the triage in the security notes).
 *
 * The app is a thin client: sessions, messages and tool output live on the
 * opencode server and are held in memory by the zustand stores. Nothing that
 * a model or a tool produced is ever written to on-device storage, so there
 * is no persistent store an injected instruction could sit in and be replayed
 * from on the next launch.
 *
 * That property is worth keeping, and it is invisible in review: it only
 * breaks the day someone adds a well-meaning "cache the last conversation" or
 * "remember the assistant's summary" write. So: every on-device write is
 * enumerated here by key. Adding a new one is fine — you just have to come
 * to this list and say what it holds, which is the moment to ask whether the
 * value is user/config data or model output.
 *
 * Rule: keys listed here must hold user-entered config, consent flags or
 * counters. Never message text, session titles, tool results or any other
 * model-derived content.
 */
const ALLOWED_PERSISTED_KEYS = new Map<string, string>([
  ["SETTINGS_KEY", "user's app settings (theme, notification prefs)"],
  ["CONNECTIONS_KEY", "user-entered server connections"],
  ["`${PASSWORDS_PREFIX}${id}`", "user-entered server password, per connection"],
  ["RECENT_DIRS_KEY", "directories the user picked, for the recents list"],
  ["AUTH_SETTINGS_KEY", "biometric/app-lock preference"],
  ["COUNT_KEY", "store-review: launch counter"],
  ["ASKED_KEY", "store-review: already-prompted flag"],
  ["FIRST_OPEN_KEY", "analytics: first-open flag"],
  ["CONSENT_KEY", "telemetry consent decision"],
  ["CHATWOOT_SOURCE_KEY", "support contact id issued by Chatwoot"],
])

const SRC = path.join(import.meta.dirname, "..")

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    if (!/\.tsx?$/.test(entry.name)) return []
    if (entry.name.includes(".test.")) return []
    return [full]
  })
}

test("every on-device write uses a reviewed key, never model-generated content", () => {
  const unknown: string[] = []

  for (const file of sourceFiles(SRC)) {
    const code = fs.readFileSync(file, "utf8")
    for (const match of code.matchAll(/SecureStore\.setItemAsync\(\s*([^,]+?)\s*,/g)) {
      const key = match[1].trim()
      if (!ALLOWED_PERSISTED_KEYS.has(key)) {
        unknown.push(`${path.relative(SRC, file)}: ${key}`)
      }
    }
  }

  assert.deepEqual(
    unknown,
    [],
    `New persistent write(s) found. If the value is user config, add the key to ALLOWED_PERSISTED_KEYS ` +
      `with a note. If it is model or tool output, don't persist it — it comes back as context next launch:\n` +
      unknown.join("\n"),
  )
})

test("the allowlist itself stays live (no keys left behind after a refactor)", () => {
  const code = sourceFiles(SRC)
    .map((file) => fs.readFileSync(file, "utf8"))
    .join("\n")
  const used = new Set(
    [...code.matchAll(/SecureStore\.setItemAsync\(\s*([^,]+?)\s*,/g)].map((match) => match[1].trim()),
  )
  const stale = [...ALLOWED_PERSISTED_KEYS.keys()].filter((key) => !used.has(key))

  assert.deepEqual(stale, [], `Allowlist entries no longer written anywhere — delete them:\n${stale.join("\n")}`)
})
