// Pure (no React Native imports) helpers shared by src/components/chat/DiffView.tsx
// and src/components/markdown/CodeBlock.tsx. Keeping the one decision these two
// components make in a plain module means it can be unit-tested with node:test
// (this repo's test runtime has no React Native renderer) instead of being
// duplicated in both files.
//
// Wide content — diff lines and code lines — WRAPS instead of scrolling sideways.
// The history of that decision is worth keeping, because every earlier attempt at
// this regressed something else:
//
// - Issue #21 was about truncation: wide lines were being cut with numberOfLines.
//   Wrapping solves that just as a horizontal ScrollView did, without the gesture
//   problem below. Neither component may reintroduce numberOfLines or ellipsizeMode.
// - A horizontal ScrollView inside the vertical message list is unreliable on
//   Android: ReactScrollView extends android.widget.ScrollView
//   (ReactAndroid/src/main/java/com/facebook/react/views/scroll/ReactScrollView.java:79),
//   so it only claims a drag it wins on Android's axis test against the enclosing
//   list — the drag must be horizontally dominant from the first ACTION_MOVE. That
//   ±45° window is native and no prop widens it: nestedScrollEnabled hands leftover
//   scroll to the parent, it does not change who claims the gesture. Paging buttons
//   were the workaround that existed until wrapping made them unnecessary.
// - `selectable` <Text> competes with horizontal drags (facebook/react-native#24630
//   family) and is unreliable inside FlatList rows on Android
//   (facebook/react-native#46999) — the same reason Markdown.tsx renders prose
//   non-selectable. Selecting message text goes through MessageTextSheet, a plain
//   ScrollView outside the list. CodeBlock's Copy button copies the raw string, so
//   cosmetic wrapping never changes what lands on the clipboard.
export interface WideTextSelection {
  selectable: boolean
}

export function wideTextSelection(platform: string): WideTextSelection {
  // iOS has no gesture conflict here, so it keeps inline selection.
  return { selectable: platform === "ios" }
}
