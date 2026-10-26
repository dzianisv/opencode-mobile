import type { Part } from "./sdk"

// Plain-text rendering of a message's parts for the full-screen selection
// sheet. Selection needs a single selectable <Text> (FlatList rows break
// Android selection — react-native#46999), so every part kind is flattened
// into one text blob: assistant text verbatim, reasoning under a "Thinking"
// heading, tool calls as name + input + result/error blocks.

export type SheetLabels = {
  thinking: string
  tool: string
  input: string
  result: string
  error: string
  file: string
}

const DEFAULT_LABELS: SheetLabels = {
  thinking: "Thinking",
  tool: "Tool",
  input: "Input",
  result: "Result",
  error: "Error",
  file: "File",
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    return String(value)
  }
}

export function messagePartsToSelectableText(parts: Part[], labels: SheetLabels = DEFAULT_LABELS): string {
  const blocks: string[] = []
  for (const part of parts) {
    if (part.type === "text") {
      if (part.text) blocks.push(part.text)
      continue
    }
    if (part.type === "reasoning") {
      if (part.text) blocks.push(`${labels.thinking}:\n${part.text}`)
      continue
    }
    if (part.type === "tool") {
      const lines = [`${labels.tool}: ${part.tool || part.callID || "unknown"}`]
      if (part.state?.input !== undefined) {
        lines.push(`${labels.input}:\n${formatValue(part.state.input)}`)
      }
      if (part.state?.status === "error") {
        lines.push(`${labels.error}:\n${part.state.error?.message || "Tool call failed"}`)
      } else if (part.state?.output !== undefined) {
        lines.push(`${labels.result}:\n${formatValue(part.state.output)}`)
      }
      blocks.push(lines.join("\n"))
      continue
    }
    if (part.type === "file" && part.filename) {
      blocks.push(`${labels.file}: ${part.filename}`)
    }
  }
  return blocks.join("\n\n")
}

// True when a message has any part worth opening the selection sheet for.
export function hasSelectableContent(parts: Part[]): boolean {
  return parts.some(
    (part) =>
      (part.type === "text" && !!part.text) ||
      (part.type === "reasoning" && !!part.text) ||
      part.type === "tool" ||
      (part.type === "file" && !!part.filename),
  )
}
