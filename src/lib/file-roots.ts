// Pure helpers for normalizing GET /file/roots responses from opencode
// servers. No React Native imports — unit-testable with node --test.
//
// Older servers don't expose the endpoint (404), which the SDK client turns
// into `null`; newer servers may still send malformed, empty-path, or
// duplicate entries, so this module defends against all of that before the
// directory browser renders anything.

export interface FileRoot {
  path: string
  label: string
}

function isPlausibleRoot(value: unknown): value is { path: string; label: unknown } {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.path === "string" && candidate.path.length > 0
}

/**
 * Validate and dedupe a raw /file/roots response into pinned entries for
 * the directory browser. Drops entries missing a non-empty `path`, falls
 * back to the path itself when `label` is missing/blank, and drops later
 * duplicates by path (keeping first-seen order). Non-array input (including
 * `null`, which the SDK returns for servers that don't support the
 * endpoint) normalizes to an empty list rather than throwing.
 */
export function normalizeRoots(raw: unknown): FileRoot[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const roots: FileRoot[] = []
  for (const item of raw) {
    if (!isPlausibleRoot(item)) continue
    if (seen.has(item.path)) continue
    seen.add(item.path)
    const label = typeof item.label === "string" && item.label.trim() ? item.label : item.path
    roots.push({ path: item.path, label })
  }
  return roots
}
