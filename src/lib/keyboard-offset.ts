// iOS continues to use KeyboardAvoidingView's established offset. Android
// applies the IME-reported height directly because RN 0.81's Android hide
// event path can retain keyboardVerticalOffset as stale bottom padding.

export const IOS_KEYBOARD_VERTICAL_OFFSET = 90

// MainActivity installs a native IME-insets listener on Android 15+
// (SDK_INT >= VANILLA_ICE_CREAM, API 35) that adds the IME height to the
// root view's bottom padding. The JS padding below must stay off there or
// the IME height is applied twice.
export const NATIVE_IME_INSETS_MIN_API_LEVEL = 35

export function keyboardPadding(platform: string, keyboardHeight: number): number {
  if (platform !== "android") return 0
  return Math.max(0, keyboardHeight)
}

export function keyboardVerticalOffset(platform: string, _insetTop: number): number {
  if (platform === "ios") return IOS_KEYBOARD_VERTICAL_OFFSET
  return 0
}

// Exactly one layer applies the IME height on every API level: the native
// listener owns API 35+, this JS padding owns API < 35. Platform.Version is
// the API-level number on Android; a non-numeric version cannot prove the
// native listener is absent, so JS padding stays off.
export function jsKeyboardPaddingApplies(platform: string, apiLevel: number | string): boolean {
  if (platform !== "android") return false
  if (typeof apiLevel !== "number") return false
  return apiLevel < NATIVE_IME_INSETS_MIN_API_LEVEL
}
