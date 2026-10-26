import type { Message, Session } from "./sdk"

export function summarizeSessionUsage(session: Session | null, messages: Message[]) {
  let messageCost = 0
  let last: Message | null = null

  for (const message of messages) {
    if (message.role !== "assistant") continue
    if (Number.isFinite(message.cost) && message.cost! >= 0) messageCost += message.cost!
    if (message.tokens && message.tokens.output > 0) last = message
  }

  const tokens = last?.tokens
  const input = tokens?.input || 0
  const output = tokens?.output || 0
  const reasoning = tokens?.reasoning || 0
  const cacheRead = tokens?.cache?.read || 0
  const cacheWrite = tokens?.cache?.write || 0
  const total = input + output + reasoning + cacheRead + cacheWrite
  const cost = Number.isFinite(session?.cost) && session!.cost! >= 0 ? session!.cost! : messageCost

  return { cost, input, output, reasoning, cacheRead, cacheWrite, total, last }
}
