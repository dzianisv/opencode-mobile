import { Text, type StyleProp, type TextStyle } from "react-native"
import { openLink, splitTextWithUrls } from "./links"

interface Props {
  text: string
  style?: StyleProp<TextStyle>
  selectable?: boolean
  isDark?: boolean
}

// Plain-text surfaces (user messages) have no markdown renderer, so a bare
// URL in them was inert text. Same link treatment as Markdown (issue #284):
// split the text on URLs and render each URL as a tappable link node.
export function LinkifiedText({ text, style, selectable, isDark }: Props) {
  const segments = splitTextWithUrls(text)
  if (!segments.some((segment) => segment.url)) {
    return (
      <Text style={style} selectable={selectable}>
        {text}
      </Text>
    )
  }
  return (
    <Text style={style} selectable={selectable}>
      {segments.map((segment, index) => {
        if (!segment.url) return <Text key={index}>{segment.text}</Text>
        const url = segment.url
        return (
          <Text
            key={index}
            style={{ color: isDark ? "#a78bfa" : "#8b5cf6" }}
            accessibilityRole="link"
            accessibilityHint="Opens in a new window"
            onPress={() => openLink(url)}
          >
            {segment.text}
          </Text>
        )
      })}
    </Text>
  )
}
