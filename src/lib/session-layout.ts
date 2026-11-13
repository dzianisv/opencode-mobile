// Bounded multiline composer + scrollable question body (#208's (b) coverage
// for #194/#156). The keyboard offset itself lives in ./keyboard-offset:
// Android applies the IME-reported height as bottom padding, not the static
// top inset — the insets.top offset alone measured 56 dp short on a
// Pixel 11 Pro (see #194), so no keyboardVerticalOffset is defined here.

export const COMPOSER_MAX_HEIGHT = 120
export const COMPOSER_MIN_HEIGHT = 88
const COMPOSER_LINE_HEIGHT = 20
const COMPOSER_VERTICAL_PADDING = 20

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
