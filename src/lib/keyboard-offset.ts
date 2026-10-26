// KeyboardAvoidingView's `keyboardVerticalOffset`, per platform.
//
// Why Android needs a non-zero value under edge-to-edge:
//
// RN's KeyboardAvoidingView derives its padding from
//
//     keyboardY = keyboardFrame.screenY - keyboardVerticalOffset
//     padding   = max(frame.y + frame.height - keyboardY, 0)
//
// `frame` comes from the view's own onLayout, which is in **window**
// coordinates — the origin sits below the status bar. `keyboardFrame.screenY`
// is in **screen** coordinates, measured from the true top of the display.
// Before Expo's mandatory edge-to-edge those two origins coincided, because
// the app window started below the status bar and the OS resized it
// (adjustResize) when the keyboard opened. Under edge-to-edge the window spans
// the full display, the two spaces no longer agree, and the computed padding
// comes up short by exactly the status-bar inset.
//
// Measured on an Android 12 emulator (Pixel 3 XL profile, scale 3.5), keyboard
// open on the session screen:
//
//     screen height        845.71 dp
//     window height        748.86 dp
//     insets.top            48.86 dp   insets.bottom 48 dp
//     keyboard screenY     511.71 dp   height 286 dp
//
//     computed padding = 748.86 - 511.71 = 237.14 dp
//     required padding =                   286.00 dp   (the real keyboard)
//     shortfall        =                    48.86 dp   === insets.top
//
// 48.86 dp x 3.5 = 171 px, which is the composer row — hence "the input box is
// invisible" (#156, and #53/#147 before it). Those earlier reports were each
// answered with a different `behavior=` value; none addressed the coordinate
// mismatch, which is why the bug kept coming back.
//
// Adding `insets.top` to keyboardVerticalOffset re-aligns the two spaces:
// padding becomes 237.14 + 48.86 = 286, exactly the keyboard height.
//
// iOS keeps its existing empirical 90 — it does not have this mismatch, and
// changing it is out of scope for this fix.

export const IOS_KEYBOARD_VERTICAL_OFFSET = 90

export function keyboardVerticalOffset(platform: string, insetTop: number): number {
  if (platform === "ios") return IOS_KEYBOARD_VERTICAL_OFFSET
  // Guard against a bogus/unmeasured inset so we never push content *down*.
  return Math.max(0, insetTop)
}
