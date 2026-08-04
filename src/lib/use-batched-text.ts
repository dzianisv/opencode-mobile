import { useEffect, useRef, useState } from "react"
import { createStreamBatcher, type StreamBatcher } from "./stream-batcher.ts"

// React binding for createStreamBatcher: returns a copy of `text` that lags
// real time by at most one window. Initial value renders immediately (no lag
// for already-finished content); only *changes* are batched. Identical joined
// strings (e.g. part object refs changed but content didn't) never push, so
// no timer and no re-parse fire for unchanged messages.
export function useBatchedText(text: string, windowMs = 60): string {
  const [display, setDisplay] = useState(text)
  const batcherRef = useRef<StreamBatcher<string> | null>(null)
  const first = useRef(true)

  if (batcherRef.current === null) {
    batcherRef.current = createStreamBatcher(setDisplay, windowMs)
  }

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    batcherRef.current?.push(text)
  }, [text])

  useEffect(() => () => batcherRef.current?.stop(), [])

  return display
}
