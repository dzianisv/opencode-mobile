// When does a drag MEAN sideways?
//
// A horizontal ScrollView nested in the vertical transcript loses the gesture
// race unless the swipe is almost perfectly axis-aligned: both claim at ~10dp
// of movement on their own axis, so any diagonal drift hands the touch to the
// vertical list. In practice that means "hit a perfect left-right swipe or
// the page scrolls instead" — the reported annoyance.
//
// These predicates define a forgiving claim: horizontal wins when the drag is
// merely horizontal-DOMINANT, not horizontal-pure. Pure so the thresholds are
// testable under plain `node --test`.

/** Movement below this is jitter, not intent. */
export const CLAIM_MIN_DX = 6

/**
 * How much steeper than 45° a drag may be and still count as sideways.
 * 0.7 means dx only has to beat 70% of dy — a drag up to ~55° off-axis still
 * reads as horizontal. The vertical list keeps everything steeper.
 */
export const DOMINANCE_RATIO = 0.7

export function isHorizontalIntent(dx: number, dy: number): boolean {
  const absDx = Math.abs(dx)
  return absDx >= CLAIM_MIN_DX && absDx > Math.abs(dy) * DOMINANCE_RATIO
}

/**
 * Flick target for release momentum.
 *
 * Manual pan-driving loses native fling physics, so approximate: project the
 * release velocity over a fixed time slice. 180ms of projected travel feels
 * like a natural flick without letting a hard swipe teleport the view.
 */
export const FLING_PROJECTION_MS = 180

export function flingTarget(currentOffset: number, velocityX: number, maxOffset: number): number {
  const projected = currentOffset - velocityX * FLING_PROJECTION_MS
  return Math.max(0, Math.min(maxOffset, projected))
}

/** Clamp a live drag so pulling past the edges doesn't scroll into nothing. */
export function dragOffset(startOffset: number, dx: number, maxOffset: number): number {
  return Math.max(0, Math.min(maxOffset, startOffset - dx))
}
