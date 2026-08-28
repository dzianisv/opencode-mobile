// KeyboardAvoidingView computes its padding from a route-local view frame and
// a global keyboard screenY. On Android this route begins below the native
// stack header, so its vertical offset must include the complete header height.

export const IOS_KEYBOARD_VERTICAL_OFFSET = 90
export const ANDROID_HEADER_CONTENT_HEIGHT = 56

export function keyboardVerticalOffset(platform: string, insetTop: number): number {
  if (platform === "ios") return IOS_KEYBOARD_VERTICAL_OFFSET
  return Math.max(0, insetTop) + ANDROID_HEADER_CONTENT_HEIGHT
}
