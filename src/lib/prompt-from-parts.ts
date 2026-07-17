// Pure helper: turn a reverted message's parts back into editable prompt
// state (text + file attachments), mirroring the TUI's revert-to-edit
// reduce (packages/tui/src/routes/session/dialog-message.tsx). Kept
// dependency-free so it's testable under plain `node --test`.
import type { Part } from "./sdk"

export interface PromptFromParts {
  text: string
  files: Part[]
}

export function extractPromptFromParts(parts: Part[] | undefined): PromptFromParts {
  const list = parts || []
  const text = list
    .filter((p) => p.type === "text" && p.text)
    .map((p) => p.text)
    .join("\n")
  const files = list.filter((p) => p.type === "file")
  return { text, files }
}
