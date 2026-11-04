const TASK_TITLE_LENGTH = 60

/**
 * A compact title for native Task calls and OpencodeX swarm delegations.
 * Native `{subagent_type, description}` input wins when both shapes exist.
 */
export function taskToolTitle(input: unknown) {
  if (!input || typeof input !== "object") return undefined
  const value = input as Record<string, unknown>
  const agent = text(value.subagent_type)
  const description = text(value.description)
  if (agent || description) return truncate(`Task ${agent ?? "general"}: ${description ?? "subagent"}`)

  const role = text(value.role)
  if (!role) return undefined
  const prompt = firstLine(value.prompt) ?? "delegation"
  return truncate(`Task ${role}: ${prompt}`)
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function firstLine(value: unknown) {
  return text(value)
    ?.split("\n")
    .find((line) => line.trim())
    ?.trim()
    .replace(/\s+/g, " ")
}

function truncate(value: string) {
  const points = [...value]
  if (points.length <= TASK_TITLE_LENGTH) return value
  return `${points.slice(0, TASK_TITLE_LENGTH - 1).join("").trimEnd()}…`
}
