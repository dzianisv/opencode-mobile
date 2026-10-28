export const IOS_KEYBOARD_VERTICAL_OFFSET = 90
export const COMPOSER_MAX_HEIGHT = 120
export const COMPOSER_MIN_HEIGHT = 88
const COMPOSER_LINE_HEIGHT = 20
const COMPOSER_VERTICAL_PADDING = 20

// KeyboardAvoidingView measures its frame in window coordinates while Android
// reports the IME in screen coordinates under edge-to-edge. The top inset
// reconciles those origins without changing iOS's established offset.
export function keyboardVerticalOffset(platform: string, insetTop: number): number {
  if (platform === "ios") return IOS_KEYBOARD_VERTICAL_OFFSET
  return Math.max(0, insetTop)
}

export function composerMaxHeight(
  platform: string,
  windowHeight: number,
  keyboardY: number | null,
  insetTop: number,
  fontScale = 1,
): number {
  if (platform !== "android" || keyboardY === null) return COMPOSER_MAX_HEIGHT

  // Keep multiple scaled draft lines usable on compact IME-resized windows while
  // reserving room for the question/transcript surface and composer controls.
  const visibleHeight = Math.max(0, Math.min(windowHeight, keyboardY) - Math.max(0, insetTop))
  const scaledMinimum = Math.ceil(COMPOSER_LINE_HEIGHT * Math.max(1, fontScale) * 2 + COMPOSER_VERTICAL_PADDING)
  return Math.min(COMPOSER_MAX_HEIGHT, Math.max(COMPOSER_MIN_HEIGHT, scaledMinimum, visibleHeight - 250))
}

export const QUESTION_BODY_SCROLL_PROPS = {
  keyboardShouldPersistTaps: "handled",
  nestedScrollEnabled: true,
  showsVerticalScrollIndicator: true,
} as const
