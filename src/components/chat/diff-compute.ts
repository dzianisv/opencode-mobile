// Pure (no React Native imports) diff computation shared by
// src/components/chat/DiffView.tsx. Kept in its own plain module — same
// pattern as src/lib/scroll-config.ts — so it can be unit-tested with
// node:test (no react-test-renderer needed) while DiffView imports the same
// runtime logic it renders, so the test and the real component can't drift
// apart.

export interface DiffLine {
  type: "add" | "remove" | "context"
  text: string
}

// Above this size the O(a.length * b.length) LCS table (and the matching
// backtrack array) becomes an OOM/ANR risk on-device — a 2000-line file both
// sides is a 4,000,000-cell table. Guard on both a hard per-side line count
// and the product so two moderately sized files can't multiply into a huge
// table either.
const MAX_DIFF_LINES = 800
const MAX_DIFF_CELLS = 250_000
// Even a "normal" LCS diff can produce thousands of rendered native rows for
// a large file with few matching lines (e.g. a full rewrite). Cap the final
// rendered line count so DiffView can never mount an unbounded number of
// <View>/<Text> rows.
const MAX_RENDERED_LINES = 600
const TRUNCATED_SIDE_LINES = 400

function truncationMarker(totalLines: number): DiffLine {
  return {
    type: "context",
    text: `… diff too large to display in full (${totalLines} lines) — view on your computer`,
  }
}

export function computeDiff(before: string, after: string): DiffLine[] {
  // Normalize line endings so a CRLF/LF mismatch doesn't make every line
  // look changed.
  const a = before.split(/\r?\n/)
  const b = after.split(/\r?\n/)

  // Fallback path for huge inputs: skip the O(a.length * b.length) LCS table
  // entirely and render a simple, truncated remove-then-add diff.
  if (a.length > MAX_DIFF_LINES || b.length > MAX_DIFF_LINES || a.length * b.length > MAX_DIFF_CELLS) {
    const removed = a.slice(0, TRUNCATED_SIDE_LINES).map((text) => ({ type: "remove" as const, text }))
    const added = b.slice(0, TRUNCATED_SIDE_LINES).map((text) => ({ type: "add" as const, text }))
    return [...removed, ...added, truncationMarker(a.length + b.length)]
  }

  // Simple LCS-based diff
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }

  // Backtrack
  const result: DiffLine[] = []
  let i = m
  let j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.push({ type: "context", text: a[i - 1] })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: "add", text: b[j - 1] })
      j--
    } else {
      result.push({ type: "remove", text: a[i - 1] })
      i--
    }
  }

  result.reverse()

  // Collapse long context runs (show max 3 context lines between changes)
  const collapsed: DiffLine[] = []
  let contextRun = 0
  for (const line of result) {
    if (line.type === "context") {
      contextRun++
      if (contextRun <= 3) {
        collapsed.push(line)
      } else if (contextRun === 4) {
        collapsed.push({ type: "context", text: "..." })
      }
    } else {
      contextRun = 0
      collapsed.push(line)
    }
  }

  if (collapsed.length > MAX_RENDERED_LINES) {
    return [...collapsed.slice(0, MAX_RENDERED_LINES), truncationMarker(collapsed.length)]
  }

  return collapsed
}
