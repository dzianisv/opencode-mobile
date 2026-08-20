import type { FileDiff, Message } from "./sdk"

export function reviewDiffsForMessage(message: Message, messages: Message[]): FileDiff[] | undefined {
  if (message.role !== "assistant" || !message.parentID) return undefined
  const activeUser = messages.filter((item) => item.role === "user").at(-1)
  if (message.parentID !== activeUser?.id) return undefined
  const activeAssistants = messages.filter((item) => item.role === "assistant" && item.parentID === activeUser.id)
  if (message.id !== activeAssistants.at(-1)?.id) return undefined
  return messages.find((item) => item.id === message.parentID)?.summary?.diffs
}
