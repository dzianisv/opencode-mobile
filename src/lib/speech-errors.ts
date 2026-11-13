/**
 * Which speech-recognition "error" events are actually errors.
 *
 * The Android module fires an error event for outcomes that are not
 * failures: "no-speech" (the user simply said nothing) and "aborted"
 * (the documented outcome of calling abort()). Events are module-global,
 * so a screen unmounting and calling abort() in cleanup broadcasts
 * "aborted" to every OTHER mounted session screen's listener. That's how
 * backing out of a subagent view produced a "Voice input failed" alert
 * on the parent screen with the mic never touched.
 */
export function isBenignSpeechError(code: string | undefined): boolean {
  return code === "no-speech" || code === "aborted"
}
