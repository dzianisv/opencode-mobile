// iOS continues to use KeyboardAvoidingView's established offset. Android
// applies the IME-reported height directly because RN 0.81's Android hide
// event path can retain keyboardVerticalOffset as stale bottom padding.

export const IOS_KEYBOARD_VERTICAL_OFFSET = 90

export function keyboardPadding(platform: string, keyboardHeight: number): number {
  if (platform !== "android") return 0
  return Math.max(0, keyboardHeight)
}

export function keyboardVerticalOffset(platform: string, _insetTop: number): number {
  if (platform === "ios") return IOS_KEYBOARD_VERTICAL_OFFSET
  return 0
}
