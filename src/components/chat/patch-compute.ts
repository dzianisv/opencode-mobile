import type { DiffLine } from "./diff-compute"

const MAX_PATCH_LINES = 600

function truncationMarker(totalLines: number): DiffLine {
  return {
    type: "context",
    text: `... diff too large to display in full (${totalLines} lines) - view on your computer`,
  }
}

export function patchTextFromInput(input: unknown): string | undefined {
  if (typeof input === "string") return input
  if (typeof input !== "object" || input === null) return undefined

  const value = input as Record<string, unknown>
  if (typeof value.patchText === "string") return value.patchText
  if (typeof value.patch === "string") return value.patch
  return undefined
}

// Convert both unified diffs and OpenCode's *** patch format into the same
// line model used by DiffView. Patch headers are kept as context so filenames
// remain visible, while metadata lines and patch delimiters are omitted.
export function computePatchDiff(patch: string): DiffLine[] {
  const lines: DiffLine[] = []
  let inHunk = false
  const source = patch.split(/\r?\n/)
  let truncated = false

  for (const text of source) {
    if (lines.length >= MAX_PATCH_LINES) {
      truncated = true
      break
    }
    if (text === "*** End Patch") continue
    if (text.startsWith("*** Add File:") || text.startsWith("*** Update File:") || text.startsWith("*** Delete File:")) {
      lines.push({ type: "context", text })
      inHunk = true
      continue
    }
    if (text.startsWith("@@")) {
      lines.push({ type: "context", text })
      inHunk = true
      continue
    }
    if (text.startsWith("+++ ") || text.startsWith("--- ")) {
      lines.push({ type: "context", text })
      continue
    }
    if (text.startsWith("+") && !text.startsWith("+++")) {
      lines.push({ type: "add", text: text.slice(1) })
      continue
    }
    if (text.startsWith("-") && !text.startsWith("---")) {
      lines.push({ type: "remove", text: text.slice(1) })
      continue
    }
    if (inHunk && text.length > 0) lines.push({ type: "context", text: text.startsWith(" ") ? text.slice(1) : text })
  }

  if (truncated) lines.push(truncationMarker(source.length))
  return lines
}
