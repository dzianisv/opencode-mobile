import { useRef, type ReactNode } from "react"
import { PanResponder, ScrollView, View, type StyleProp, type ViewStyle } from "react-native"
import { dragOffset, flingTarget, isHorizontalIntent } from "../lib/horizontal-intent"

/**
 * A horizontal scroller that survives inside the vertical transcript.
 *
 * The plain nested ScrollView only won the gesture race on a near-perfect
 * left-right swipe — both it and the vertical list claim at ~10dp on their own
 * axis, so any diagonal drift scrolled the page instead. This wrapper claims
 * via a PanResponder the moment the drag is horizontal-DOMINANT (see
 * src/lib/horizontal-intent.ts) and drives the ScrollView by ref, with a
 * projected-velocity fling on release.
 *
 * scrollEnabled stays on underneath, so a perfectly straight swipe still uses
 * the native path; the responder only matters for the sloppy ones.
 */
export function WideScroll({
  children,
  contentContainerStyle,
  testID,
}: {
  children: ReactNode
  contentContainerStyle?: StyleProp<ViewStyle>
  testID?: string
}) {
  const scrollRef = useRef<ScrollView>(null)
  const offsetRef = useRef(0)
  const startOffsetRef = useRef(0)
  const contentWidthRef = useRef(0)
  const layoutWidthRef = useRef(0)
  const maxOffsetRef = useRef(0)

  const updateMax = () => {
    maxOffsetRef.current = Math.max(0, contentWidthRef.current - layoutWidthRef.current)
  }

  const responder = useRef(
    PanResponder.create({
      // Capture-phase, so the claim happens before the vertical FlatList's
      // own responder gets the move event.
      onMoveShouldSetPanResponderCapture: (_evt, gesture) => isHorizontalIntent(gesture.dx, gesture.dy),
      onPanResponderGrant: () => {
        startOffsetRef.current = offsetRef.current
      },
      onPanResponderMove: (_evt, gesture) => {
        scrollRef.current?.scrollTo({
          x: dragOffset(startOffsetRef.current, gesture.dx, maxOffsetRef.current),
          animated: false,
        })
      },
      onPanResponderRelease: (_evt, gesture) => {
        const current = dragOffset(startOffsetRef.current, gesture.dx, maxOffsetRef.current)
        const target = flingTarget(current, gesture.vx, maxOffsetRef.current)
        if (Math.abs(target - current) > 1) {
          scrollRef.current?.scrollTo({ x: target, animated: true })
        }
      },
      // The transcript must not steal the touch back mid-drag.
      onPanResponderTerminationRequest: () => false,
    }),
  ).current

  return (
    <View {...responder.panHandlers}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator
        contentContainerStyle={contentContainerStyle}
        testID={testID}
        onScroll={(e) => {
          offsetRef.current = e.nativeEvent.contentOffset.x
          maxOffsetRef.current = Math.max(
            0,
            e.nativeEvent.contentSize.width - e.nativeEvent.layoutMeasurement.width,
          )
        }}
        // Both known before any scroll event fires, so the very first drag
        // clamps correctly instead of overshooting into empty space.
        onContentSizeChange={(w) => {
          contentWidthRef.current = w
          updateMax()
        }}
        onLayout={(e) => {
          layoutWidthRef.current = e.nativeEvent.layout.width
          updateMax()
        }}
        scrollEventThrottle={16}
        nestedScrollEnabled
      >
        {children}
      </ScrollView>
    </View>
  )
}
