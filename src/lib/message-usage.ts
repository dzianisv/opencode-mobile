interface Tokens {
  input: number
  output: number
}

export function messageUsage(tokens: Tokens | undefined, cost: number | undefined): string | null {
  const total = (tokens?.input || 0) + (tokens?.output || 0)
  const tokenText = total > 0 ? `${total} tokens` : null
  const costText = typeof cost === "number" && cost > 0 ? `$${cost.toFixed(4)}` : null
  if (!tokenText && !costText) return null
  return [tokenText, costText].filter(Boolean).join(" · ")
}
