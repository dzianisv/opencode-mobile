// Pure helper: turn a message's parts into the plain text a user would
// expect "Copy message" to put on the clipboard.
//
// Why this exists: assistant prose is rendered through
// src/components/markdown/Markdown.tsx, whose CustomRenderer deliberately
// strips react-native-marked's `selectable` prop from every plain-text node
// to dodge facebook/react-native#46999 (selectable <Text> inside a FlatList
// row misapplies selection state on Android). That left assistant replies
// with no copy path at all — code blocks have CodeBlock's Copy button and
// user messages are plainly `selectable`, but prose had nothing.
//
// Rather than re-enabling `selectable` inside the FlatList row (which is what
// the RN bug punishes), the copy path reads the source text straight from the
// parts. Kept dependency-free so it's testable under plain `node --test`.
import type { Part } from "./sdk"

// Text and reasoning are the two part types rendered as prose. Reasoning is
// visually collapsible (ReasoningBlock) and is not what someone means by
// "copy this message", so it is excluded by default and offered separately.
export function extractCopyText(parts: Part[] | undefined): string {
  return (parts || [])
    .filter((p) => p.type === "text" && p.text)
    .map((p) => p.text)
    .join("\n")
}

export function extractReasoningText(parts: Part[] | undefined): string {
  return (parts || [])
    .filter((p) => p.type === "reasoning" && p.text)
    .map((p) => p.text)
    .join("\n")
}

// True when there is anything worth offering a copy/select action for.
// Guards the long-press handler so an empty or tool-only message doesn't
// open an action sheet whose actions would all be no-ops.
export function hasCopyableText(parts: Part[] | undefined): boolean {
  return extractCopyText(parts).trim().length > 0
}
