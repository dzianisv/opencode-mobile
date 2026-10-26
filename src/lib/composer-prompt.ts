export interface ComposerFile {
  uri: string
  mime: string
  filename?: string
  base64?: string
}

export type PromptPart =
  | { type: "text"; text: string }
  | { type: "file"; mime: string; url: string; filename?: string }

/** Build server prompt parts without trimming, normalizing, or truncating text. */
export function buildPromptParts(text: string, files: ComposerFile[] = []): PromptPart[] {
  const parts: PromptPart[] = []
  if (text.length > 0) parts.push({ type: "text", text })
  for (const file of files) {
    const url = file.base64 ? `data:${file.mime};base64,${file.base64}` : file.uri
    parts.push({ type: "file", mime: file.mime, url, filename: file.filename })
  }
  return parts
}

export interface PromptSelection {
  providerID: string
  modelID: string
}

/** Exact JSON-compatible request body used by the v1 prompt_async endpoint. */
export function legacyPromptBody(input: {
  parts: PromptPart[]
  model?: PromptSelection
  agent?: string
  variant?: string
}) {
  return input
}

/** Convert the mobile part model to the v2 prompt body without text rewriting. */
export function v2PromptBody(parts: PromptPart[]) {
  return {
    text: parts.filter((part): part is Extract<PromptPart, { type: "text" }> => part.type === "text")
      .map((part) => part.text)
      .join("\n"),
    files: parts
      .filter((part): part is Extract<PromptPart, { type: "file" }> => part.type === "file")
      .map((part) => ({ uri: part.url, ...(part.filename ? { name: part.filename } : {}) })),
  }
}
