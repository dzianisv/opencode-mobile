export const IOS_KEYBOARD_VERTICAL_OFFSET = 90
export const COMPOSER_MAX_HEIGHT = 120
export const COMPOSER_MIN_HEIGHT = 88
const COMPOSER_LINE_HEIGHT = 20
const COMPOSER_VERTICAL_PADDING = 20

// Android reports IME geometry in screen coordinates while
// KeyboardAvoidingView measures the edge-to-edge frame in window coordinates.
// The top safe-area inset reconciles those coordinate spaces.
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
  const visibleHeight = Math.max(0, Math.min(windowHeight, keyboardY) - Math.max(0, insetTop))
  const scaledMinimum = Math.ceil(COMPOSER_LINE_HEIGHT * Math.max(1, fontScale) * 2 + COMPOSER_VERTICAL_PADDING)
  return Math.min(COMPOSER_MAX_HEIGHT, Math.max(COMPOSER_MIN_HEIGHT, scaledMinimum, visibleHeight - 250))
}

export const QUESTION_BODY_SCROLL_PROPS = {
  keyboardShouldPersistTaps: "handled",
  nestedScrollEnabled: true,
  showsVerticalScrollIndicator: true,
} as const
