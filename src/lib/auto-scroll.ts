// Auto-scroll policy for the session transcript.
//
// The transcript is an *inverted* FlatList, so contentOffset.y === 0 is the
// newest message ("the bottom" visually) and larger offsets mean the user has
// scrolled back through history.
//
// Two things conspired to make new content unreachable (issue #155,
// "Message cannot be scrolled automatically"):
//
//  1. scrollToBottom() was only ever wired to the manual scroll-to-bottom
//     button. Nothing scrolled when a message arrived or while one streamed.
//  2. maintainVisibleContentPosition={{ minIndexForVisible: 0 }} asks the list
//     to hold currently-visible items still when the data changes. New
//     messages are inserted at index 0 of the inverted list, so that setting
//     actively compensates the offset to keep the older items stationary —
//     parking the new message just outside the viewport.
//
// (2) is worth keeping: it's what stops the view jumping when older pages load
// via onEndReached. So the fix is to scroll explicitly when new content
// arrives — but only when the user is already at the bottom. Someone who has
// scrolled up to read history must not be yanked back down mid-sentence,
// which is the usual bug in naive "always scroll on new message" fixes.
//
// Dependency-free so it's testable under plain `node --test`.

// How far from the newest message still counts as "following along". Also the
// threshold at which the scroll-to-bottom button appears, so the button shows
// exactly when auto-follow stops — one number, no drift between the two.
export const AT_BOTTOM_THRESHOLD_PX = 200

export function isAtBottom(offsetY: number, threshold: number = AT_BOTTOM_THRESHOLD_PX): boolean {
  // Guard against overscroll/bounce producing small negative offsets.
  return offsetY <= threshold
}

export function shouldShowScrollButton(offsetY: number, threshold: number = AT_BOTTOM_THRESHOLD_PX): boolean {
  return !isAtBottom(offsetY, threshold)
}

/**
 * Should the transcript scroll itself to the newest message?
 *
 * Only when the content actually changed *and* the user was already following
 * along at the bottom. `contentSignature` is any value that changes as content
 * does — message count plus the streaming message's length — so a re-render
 * with unchanged content doesn't re-scroll and fight a user's own gesture.
 */
export function shouldAutoScroll(input: {
  offsetY: number
  previousSignature: string | null
  currentSignature: string
  threshold?: number
}): boolean {
  if (input.previousSignature === input.currentSignature) return false
  return isAtBottom(input.offsetY, input.threshold ?? AT_BOTTOM_THRESHOLD_PX)
}

/**
 * A value that changes whenever the transcript gains content: the number of
 * messages, plus the size of the newest one so a streaming reply keeps the
 * view pinned as it grows rather than only when it completes.
 */
export function transcriptSignature(messageCount: number, newestMessageLength: number): string {
  return `${messageCount}:${newestMessageLength}`
}
