// i18next setup. Kept separate from locale-resolve.ts (the pure, testable
// piece) because this module pulls in expo-localization + i18next, which
// have no resolver outside Metro/RN — the same split used for buildAuth()
// in auth.ts and the settings store's clamp/merge helpers.
import i18next from "i18next"
import { initReactI18next } from "react-i18next"
import * as Localization from "expo-localization"
import en from "./en.json"
import zhHans from "./zh-Hans.json"
import { resolveLocale, FALLBACK_LOCALE, type LocalePreference } from "./locale-resolve"

const resources = {
  en: { translation: en },
  "zh-Hans": { translation: zhHans },
}

/** Device locale tags in priority order, e.g. ["zh-Hans-CN", "en-US"]. */
export function deviceLocaleTags(): string[] {
  return Localization.getLocales().map((locale) => locale.languageTag)
}

i18next.use(initReactI18next).init({
  resources,
  lng: resolveLocale("system", deviceLocaleTags()),
  fallbackLng: FALLBACK_LOCALE,
  interpolation: { escapeValue: false }, // React already escapes output
})

/** Apply a locale preference immediately. Persisting it is the caller's job. */
export function setAppLocale(preference: LocalePreference): void {
  const resolved = resolveLocale(preference, deviceLocaleTags())
  if (i18next.language !== resolved) i18next.changeLanguage(resolved)
}

export default i18next
