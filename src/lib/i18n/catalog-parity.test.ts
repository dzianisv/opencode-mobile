// Guards against locale drift: every catalog must expose exactly the same
// set of translation keys, or i18next silently falls back to the key path
// (en) / nothing sensible (missing catalog copy) at runtime. Run with plain
// `node --test` — no i18next/expo-localization imports needed, same as
// locale-resolve.test.ts.
import { test } from "node:test"
import assert from "node:assert/strict"
import en from "./en.json" with { type: "json" }
import zhHans from "./zh-Hans.json" with { type: "json" }
import it from "./it.json" with { type: "json" }

const CATALOGS = [
  ["en", en],
  ["zh-Hans", zhHans],
  ["it", it],
] as const

// Flattens a nested translation object into dotted leaf-key paths, e.g.
// { settings: { language: { label: "..." } } } -> ["settings.language.label"]
function flattenKeys(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [prefix]
  const keys: string[] = []
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === "object" && value !== null) {
      keys.push(...flattenKeys(value, path))
    } else {
      keys.push(path)
    }
  }
  return keys
}

test("all catalogs expose identical translation keys", () => {
  for (const [nameA, catalogA] of CATALOGS) {
    for (const [nameB, catalogB] of CATALOGS) {
      if (nameA >= nameB) continue
      const keysA = new Set(flattenKeys(catalogA))
      const keysB = new Set(flattenKeys(catalogB))

      const missingFromB = [...keysA].filter((k) => !keysB.has(k)).sort()
      const missingFromA = [...keysB].filter((k) => !keysA.has(k)).sort()

      assert.deepEqual(missingFromB, [], `keys present in ${nameA}.json but missing from ${nameB}.json: ${missingFromB.join(", ")}`)
      assert.deepEqual(missingFromA, [], `keys present in ${nameB}.json but missing from ${nameA}.json: ${missingFromA.join(", ")}`)
    }
  }
})

test("no translation value is an empty string", () => {
  for (const [name, catalog] of CATALOGS) {
    const keys = flattenKeys(catalog)
    for (const key of keys) {
      const value = key.split(".").reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], catalog)
      assert.notEqual(value, "", `${name}.json: "${key}" is an empty string`)
    }
  }
})
