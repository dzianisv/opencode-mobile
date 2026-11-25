// Sentry dist builder (issue #269).
//
// The dist identifies exactly one build: `<version>.<versionCode>`, e.g.
// `0.4.24.1000062` (CI), `0.4.24.162` (Play), `0.4.24.51` (F-Droid).
// Release stays `opencode-mobile@<version>`; the versionCode is the only
// per-build identity already distinct across all three builds.
//
// This module is pure and dependency-free (no @sentry/react-native, no RN)
// so it runs under plain `node --test`, same convention as
// sentry-noise.ts. Both sides derive the dist from the same inputs:
//   * runtime (src/lib/sentry.ts) — expo.version + expo.android.versionCode
//     from the same app.json the workflows mutate before bundling;
//   * upload (the three workflows) — the same two fields read back from
//     the mutated app.json, with a lockstep assertion in build.yml.
// A missing or non-numeric versionCode falls back to the version-only dist
// (the pre-#269 behaviour) so a local/dev build degrades instead of
// crashing; the workflows hard-fail on a missing code instead.

export function buildSentryDist(version: string, versionCode?: unknown): string {
  const code = parseVersionCode(versionCode)
  return code === null ? version : `${version}.${code}`
}

function parseVersionCode(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 0 ? value : null
  }
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (/^\d+$/.test(trimmed)) return Number(trimmed)
  }
  return null
}
