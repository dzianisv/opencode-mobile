import { memo, useEffect, useState } from "react"
import { ActivityIndicator, Image, ImageBackground, type ImageStyle } from "react-native"

interface Props {
  uri: string
  alt?: string
  style?: ImageStyle
}

// App-owned replacement for react-native-marked's MDImage (see CustomRenderer
// in Markdown.tsx). Same rendering — ImageBackground sized by the image's
// real aspect ratio, spinner while the size resolves — but the size fetch
// runs once per URI.
//
// The library version's effect has NO dependency array:
//
//   useEffect(() => { fetchOriginalSizeFromRemoteImage() })
//
// so it refetches after EVERY render, and both the success and the failure
// callback call setImageState with a fresh object, which schedules another
// render, which runs the effect again. Any markdown image in any message
// spins an unbounded re-render loop (2,573 renders in 3s in a harness
// against React 19.1, the app's version; with a synchronously-resolving
// getSize it throws React's "Maximum update depth exceeded" — its message
// names this exact shape: "setState inside useEffect, but useEffect either
// doesn't have a dependency array..."). That is the leading candidate for
// the two fatal Sentry issues on v0.4.22, OPENCODE-MOBILE-S/T (#262):
// same user/device, session screen, class setState path in one and hooks
// dispatchSetState in the other — the same loop surfacing through whichever
// component's setState crosses React's 50-nested-update guard first.
// Exact frame mapping is blocked: 0.4.22 shipped without symbolication
// (no Sentry artifact bundle for 0.4.16+), so the image-in-message trigger
// is not proven from the events — only the loop itself is.
//
// Scoping the fetch to [uri] (like the library's own MDSvg already does)
// bounds the component to exactly two renders per image: mount, then one
// size resolution.
function MarkdownImageInner({ uri, alt, style }: Props) {
  const [imageState, setImageState] = useState({ isLoading: true, aspectRatio: undefined as number | undefined })

  useEffect(() => {
    Image.getSize(
      uri,
      (width, height) => {
        if (width > 0 && height > 0) {
          setImageState({ isLoading: false, aspectRatio: width / height })
        } else {
          setImageState({ isLoading: false, aspectRatio: undefined })
        }
      },
      () => {
        setImageState((current) => ({ ...current, isLoading: false }))
      },
    )
  }, [uri])

  return (
    <ImageBackground
      source={{ uri }}
      style={{ width: "100%", aspectRatio: imageState.aspectRatio }}
      accessibilityRole="image"
      accessibilityLabel={alt}
      accessibilityHint={undefined}
      imageStyle={style}
      testID="react-native-marked-md-image"
    >
      {imageState.isLoading ? (
        <ActivityIndicator testID="react-native-marked-md-image-activity-indicator" size="small" />
      ) : null}
    </ImageBackground>
  )
}

export const MarkdownImage = memo(MarkdownImageInner)
