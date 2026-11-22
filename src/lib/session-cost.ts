// Cumulative session cost ($) — the single source of truth for every place
// the UI shows what a session has spent so far (the session header, #293,
// and the SessionInfo pulldown). The server reports cost per assistant
// message (Message.cost); the session total is the sum over assistant
// messages, exactly how the terminal UI derives it.
//
// No runtime imports (Message is type-only) so this stays importable from
// plain node --test without the expo/fetch resolve hook.

import type { Message } from "./sdk"

type CostedMessage = Pick<Message, "role" | "cost">

/** Sum of per-assistant-message costs. User messages never carry a cost. */
export function sessionCost(messages: CostedMessage[]): number {
  let total = 0
  for (const msg of messages) {
    if (msg.role !== "assistant") continue
    if (msg.cost) total += msg.cost
  }
  return total
}

/**
 * Format a cost for display: "$1.23" at $1+, otherwise up to 4 decimals
 * with trailing zeros trimmed (min 2dp) so $0.0143 stays exact instead of
 * rounding to $0.01, and $0.10 reads as $0.10, not $0.1.
 */
export function formatSessionCost(cost: number): string {
  if (cost >= 1) return `$${cost.toFixed(2)}`
  let text = cost.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")
  if (/^\d+\.\d$/.test(text)) text += "0"
  return `$${text}`
}

/**
 * Header text for a session, or null when there is no cost to show: a
 * session with no priced assistant messages renders nothing — never
 * "$0.00" and never an error.
 */
export function sessionCostText(messages: CostedMessage[]): string | null {
  const total = sessionCost(messages)
  if (total <= 0) return null
  return formatSessionCost(total)
}
