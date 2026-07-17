import { test } from "node:test"
import assert from "node:assert/strict"
import { matchSupportedLocale, resolveLocale, FALLBACK_LOCALE } from "./locale-resolve.ts"

test("matchSupportedLocale maps zh variants to zh-Hans", () => {
  assert.equal(matchSupportedLocale("zh"), "zh-Hans")
  assert.equal(matchSupportedLocale("zh-CN"), "zh-Hans")
  assert.equal(matchSupportedLocale("zh-Hans"), "zh-Hans")
  assert.equal(matchSupportedLocale("zh-Hans-CN"), "zh-Hans")
  assert.equal(matchSupportedLocale("zh-Hant-TW"), "zh-Hans") // no zh-Hant catalog yet — closest match
})

test("matchSupportedLocale maps en variants to en", () => {
  assert.equal(matchSupportedLocale("en"), "en")
  assert.equal(matchSupportedLocale("en-US"), "en")
  assert.equal(matchSupportedLocale("EN-GB"), "en") // case-insensitive
})

test("matchSupportedLocale returns null for unsupported languages", () => {
  assert.equal(matchSupportedLocale("fr-FR"), null)
  assert.equal(matchSupportedLocale("ja"), null)
  assert.equal(matchSupportedLocale("es-ES"), null)
})

test("resolveLocale: explicit preference always wins over device tags", () => {
  assert.equal(resolveLocale("en", ["zh-Hans-CN"]), "en")
  assert.equal(resolveLocale("zh-Hans", ["en-US"]), "zh-Hans")
})

test("resolveLocale: system preference picks first supported device tag", () => {
  assert.equal(resolveLocale("system", ["fr-FR", "zh-Hans-CN", "en-US"]), "zh-Hans")
  assert.equal(resolveLocale("system", ["en-US", "zh-Hans-CN"]), "en")
})

test("resolveLocale: system preference falls back when nothing matches", () => {
  assert.equal(resolveLocale("system", ["fr-FR", "ja-JP"]), FALLBACK_LOCALE)
  assert.equal(resolveLocale("system", []), FALLBACK_LOCALE)
})
