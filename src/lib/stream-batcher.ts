// Trailing-edge stream batcher: coalesces rapid successive values into at
// most one emission per window, always delivering the latest value once the
// stream settles. The final value is never dropped — the last push of a burst
// always fires after one window.
//
// Used to throttle markdown re-parsing during SSE token streaming: a chat
// part's joined text changes on every token, and re-parsing the whole string
// per token is O(n²) over the stream. Batching to ~16 renders/sec keeps the
// response smooth while the trailing edge guarantees the finished text is
// rendered exactly.
//
// Pure module (no react import) so the node --test suite keeps running
// without an install. The React binding lives in ./use-batched-text.ts.
export interface StreamBatcher<T> {
  push(value: T): void
  stop(): void
}

export function createStreamBatcher<T>(emit: (value: T) => void, windowMs = 60): StreamBatcher<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: T | undefined
  let hasPending = false

  const flush = () => {
    timer = null
    if (!hasPending) return
    hasPending = false
    const value = pending as T
    emit(value)
  }

  return {
    push(value: T) {
      pending = value
      hasPending = true
      if (timer === null) {
        timer = setTimeout(flush, windowMs)
      }
    },
    stop() {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      hasPending = false
    },
  }
}
