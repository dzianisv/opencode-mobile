import { useRef, type ReactNode } from "react"
import { ScrollView, View, type StyleProp, type ViewStyle } from "react-native"
import { Gesture, GestureDetector } from "react-native-gesture-handler"
import { dragOffset, flingTarget, CLAIM_MIN_DX, VERTICAL_FAIL_DY } from "../lib/horizontal-intent"

/**
 * A horizontal scroller that survives inside the vertical transcript.
 *
 * Round one used a JS PanResponder — and lost anyway on device, because
 * Android's vertical list intercepts touches in the NATIVE layer before the
 * JS responder system gets a vote. This version claims natively via
 * react-native-gesture-handler: the pan activates once the drag crosses
 * CLAIM_MIN_DX horizontally, FAILS if it crosses VERTICAL_FAIL_DY vertically
 * first (the list keeps those), and on activation RNGH disallows the parent
 * list's interception — which is the part no JS-level solution could do.
 *
 * The inner ScrollView is driven entirely by ref (scrollEnabled=false):
 * one owner per axis, no double-handling of the same drag.
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

  const pan = Gesture.Pan()
    .activeOffsetX([-CLAIM_MIN_DX, CLAIM_MIN_DX])
    .failOffsetY([-VERTICAL_FAIL_DY, VERTICAL_FAIL_DY])
    .onStart(() => {
      startOffsetRef.current = offsetRef.current
    })
    .onUpdate((e) => {
      const next = dragOffset(startOffsetRef.current, e.translationX, maxOffsetRef.current)
      offsetRef.current = next
      scrollRef.current?.scrollTo({ x: next, animated: false })
    })
    .onEnd((e) => {
      // RNGH velocity is px/s; flingTarget projects px/ms.
      const target = flingTarget(offsetRef.current, e.velocityX / 1000, maxOffsetRef.current)
      if (Math.abs(target - offsetRef.current) > 1) {
        offsetRef.current = target
        scrollRef.current?.scrollTo({ x: target, animated: true })
      }
    })
    .runOnJS(true)

  return (
    <GestureDetector gesture={pan}>
      <View>
        <ScrollView
          ref={scrollRef}
          horizontal
          scrollEnabled={false}
          showsHorizontalScrollIndicator
          contentContainerStyle={contentContainerStyle}
          testID={testID}
          onScroll={(e) => {
            offsetRef.current = e.nativeEvent.contentOffset.x
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
    </GestureDetector>
  )
}
