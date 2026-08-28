type ToolInput = Record<string, unknown>

function record(value: unknown): ToolInput | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null
  return value as ToolInput
}

function nonblank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function text(value: unknown): string | null {
  return nonblank(value) ? value.trim().replace(/\s+/gu, " ") : null
}

function cap(value: string): string {
  const chars = Array.from(value)
  if (chars.length <= 60) return value
  return `${chars.slice(0, 59).join("")}…`
}

function promptLine(prompt: string, instructions: unknown): string | null {
  const skipped = new Set(
    typeof instructions === "string"
      ? instructions.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
      : [],
  )

  for (const raw of prompt.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith("HIGHEST-PRIORITY HARD RULE") || skipped.has(line)) continue
    return line.replace(/\s+/gu, " ")
  }
  return null
}

export function delegationTitle(input: unknown): string | null {
  const value = record(input)
  if (!value) return null

  const agent = text(value.subagent_type)
  const description = text(value.description)
  if ("subagent_type" in value || "description" in value) {
    return `Task ${agent ?? "general"}: ${description ?? "subagent"}`
  }

  const role = text(value.role)
  if (!role) return null
  const line = nonblank(value.prompt) ? promptLine(value.prompt, value.instructions) : null
  return cap(`Task ${role}: ${line ?? "delegation"}`)
}

export function toolTitle(tool: string | undefined, stateTitle: unknown, input: unknown): string | null {
  if (nonblank(stateTitle)) return stateTitle
  if (tool === "task") return delegationTitle(input) ?? tool
  return tool || null
}
