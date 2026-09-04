export const SECURE_STORE_LIMIT = 2048

export function splitChunks(value: string, limit = SECURE_STORE_LIMIT): string[] {
  const bytes = new TextEncoder().encode(value)
  if (bytes.length <= limit) return [value]
  const decoder = new TextDecoder()
  const parts: string[] = []
  let offset = 0
  while (offset < bytes.length) {
    let end = Math.min(offset + limit, bytes.length)
    while (end > offset && (bytes[end] & 0b11000000) === 0b10000000) end--
    parts.push(decoder.decode(bytes.subarray(offset, end)))
    offset = end
  }
  return parts
}

export function joinChunks(parts: string[]): string {
  return parts.join("")
}
