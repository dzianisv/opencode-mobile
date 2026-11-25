import { useMemo, type ReactNode } from "react"
import { View, Text, useColorScheme, Platform, type ImageStyle, type StyleProp, type ViewStyle, type TextStyle } from "react-native"
import { useMarkdown, Renderer } from "react-native-marked"
import { CodeBlock } from "./CodeBlock"
import { MarkdownImage } from "./MarkdownImage"
import { extractSingleUrl, openLink, splitTextWithUrls } from "./links"

// react-native-marked's base Renderer hardcodes `selectable` on every plain
// text node it produces (text/strong/em/del/heading/codespan). On Android,
// selectable <Text> nested inside a FlatList row has a long-standing,
// still-unresolved RN bug (facebook/react-native#46999, a reopened
// regression of #28952's fix) where the underlying view's selectable state
// — and, per our own diff-scroll flow (issue #104), its exposure to the
// accessibility tree Maestro/UiAutomator reads from — never gets applied
// correctly. Chat messages here are rendered as rows of the session screen's
// own FlatList (app/session/[id].tsx), so every markdown text node hits
// this. Code content is still copyable via CodeBlock's explicit Copy
// button, so dropping `selectable` on plain text costs little.
// Exported so the key generation can be driven directly (repro/verification
// harness, issue #255) without rendering the component.
export class CustomRenderer extends Renderer {
  // The theme's link style, for nodes the library's Parser never styles as
  // links: a URL inside backticks (codespan) and a bare URL GFM autolink
  // missed (text). The Parser passes the link style to link() itself.
  private linkStyle?: TextStyle

  constructor(linkStyle?: TextStyle) {
    super()
    this.linkStyle = linkStyle
  }

  // Base Renderer generates every React key via github-slugger, slugging the
  // same constant string ("react-native-marked-ele") on every call — one new
  // property on the slugger's `occurrences` object per rendered node in a
  // single parse. Past 196,607 nodes Hermes throws RangeError "Property
  // storage exceeds 196607 properties" (issue #255, Sentry
  // OPENCODE-MOBILE-Q). Keys only need to be unique within a parse, so use
  // a cheap counter instead: no per-node storage, no limit to hit. Every
  // base method (list/link/image/table/code/paragraph/...) calls
  // `this.getKey()`, so this one override covers all of them. The renderer
  // is created fresh per `children` value (below), so the counter restarts
  // per parse and keys stay stable for a given value.
  private keyCounter = 0

  getKey(): string {
    return `markdown-key-${this.keyCounter++}`
  }

  private plainText(children: string | ReactNode[], styles?: StyleProp<TextStyle>): ReactNode {
    return (
      <Text key={this.getKey()} style={styles}>
        {children}
      </Text>
    )
  }

  code(text: string, language?: string, containerStyle?: ViewStyle, _textStyle?: TextStyle) {
    return (
      <View key={this.getKey()} style={containerStyle}>
        <CodeBlock code={text} language={language} />
      </View>
    )
  }

  text(text: string | ReactNode[], styles?: TextStyle): ReactNode {
    // A bare URL GFM autolink missed (trailing punctuation, www. without
    // scheme — issue #284) arrives here as a raw string: split it out as a
    // link node instead of leaving it inert. The Parser also calls text()
    // with an already-rendered array (paragraph wrapper) — pass that through
    // untouched, its link tokens are already link nodes.
    if (typeof text !== "string") return this.plainText(text, styles)
    const segments = splitTextWithUrls(text)
    if (!segments.some((segment) => segment.url)) return this.plainText(text, styles)
    return segments.map((segment) =>
      segment.url ? this.link(segment.text, segment.url, this.linkStyle) : this.plainText(segment.text, styles),
    )
  }

  // Own link handling instead of inheriting the library default (issue
  // #284): same purple link style and accessibilityRole, but the press goes
  // through openLink — canOpenURL guard with an open/copy fallback — and the
  // node is NOT selectable. Selectable <Text> nested in a FlatList row is
  // unreliable on Android (RN#46999, see the header comment), and a link
  // that only selects is a link that never opens.
  link(children: string | ReactNode[], href: string, styles?: TextStyle, _title?: string): ReactNode {
    return (
      <Text key={this.getKey()} style={styles} accessibilityRole="link" accessibilityHint="Opens in a new window" onPress={() => openLink(href)}>
        {children}
      </Text>
    )
  }

  strong(children: string | ReactNode[], styles?: TextStyle): ReactNode {
    return this.plainText(children, styles)
  }

  em(children: string | ReactNode[], styles?: TextStyle): ReactNode {
    return this.plainText(children, styles)
  }

  del(children: string | ReactNode[], styles?: TextStyle): ReactNode {
    return this.plainText(children, styles)
  }

  heading(text: string | ReactNode[], styles?: TextStyle): ReactNode {
    return this.plainText(text, styles)
  }

  codespan(text: string, styles?: TextStyle): ReactNode {
    // A URL in backticks lexes as a codespan, not a link — the screenshot
    // case in #284. A span that IS a single URL renders as a link (link
    // style + the link() press path), not an inert code box. Anything else
    // keeps the code styling and stays inert; fenced code blocks (code(),
    // above) are untouched.
    const url = extractSingleUrl(text)
    if (url) return this.link(text, url, this.linkStyle)
    return this.plainText(text, [styles, { fontStyle: "normal", fontWeight: "normal" }])
  }

  image(uri: string, alt?: string, style?: ImageStyle, title?: string): ReactNode {
    // .svg keeps the library's MDSvg — its fetch effect is already scoped
    // to [uri], so it does not loop.
    if (uri.endsWith(".svg")) return super.image(uri, alt, style, title)
    // Non-SVG images must NOT use the library's MDImage: its size-fetch
    // effect has no dependency array, so it refetches and setStates after
    // every render — an unbounded re-render loop that trips React's
    // "Maximum update depth exceeded" guard (issue #262, Sentry S/T).
    // MarkdownImage is the same rendering with the fetch scoped to [uri].
    return <MarkdownImage key={this.getKey()} uri={uri} alt={alt || title} style={style} />
  }
}

const mono = Platform.OS === "ios" ? "Menlo" : "monospace"

// Exported so the regression tests assert the real shipped styles instead
// of a hardcoded copy that drifts (issue #292).
export const lightTheme = {
  text: { color: "#0a0a0a", fontSize: 15, lineHeight: 22 },
  paragraph: { marginTop: 0, marginBottom: 8 },
  h1: { fontSize: 22, fontWeight: "700" as const, color: "#0a0a0a", marginBottom: 8, marginTop: 12 },
  h2: { fontSize: 19, fontWeight: "600" as const, color: "#0a0a0a", marginBottom: 6, marginTop: 10 },
  h3: { fontSize: 16, fontWeight: "600" as const, color: "#0a0a0a", marginBottom: 4, marginTop: 8 },
  link: { color: "#8b5cf6" },
  blockquote: {
    backgroundColor: "transparent",
    borderLeftWidth: 3,
    borderLeftColor: "#d1d5db",
    paddingLeft: 12,
    paddingVertical: 2,
    marginVertical: 4,
  },
  code: {
    backgroundColor: "#e8e5f0",
    color: "#6d28d9",
    fontFamily: mono,
    fontSize: 13,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  codespan: {
    // #292: subtle neutral gray fill, no outline — the previous pale
    // lavender (#e8e5f0) read as a white box against the assistant bubble
    // (#f0f0ff). No borderWidth is set by the library default either; the
    // explicit 0 pins the no-outline requirement.
    backgroundColor: "#e8e8e8",
    color: "#6d28d9",
    fontFamily: mono,
    fontSize: 13,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 0,
  },
  list: { marginBottom: 4 },
  li: { marginBottom: 2 },
  hr: { backgroundColor: "#e5e5e5", height: 1, marginVertical: 12 },
  strong: { fontWeight: "700" as const },
  em: { fontStyle: "italic" as const },
  strikethrough: { textDecorationLine: "line-through" as const },
  image: { borderRadius: 8 },
}

export const darkTheme = {
  ...lightTheme,
  text: { ...lightTheme.text, color: "#e5e5e5" },
  h1: { ...lightTheme.h1, color: "#ffffff" },
  h2: { ...lightTheme.h2, color: "#ffffff" },
  h3: { ...lightTheme.h3, color: "#ffffff" },
  link: { color: "#a78bfa" },
  blockquote: {
    ...lightTheme.blockquote,
    borderLeftColor: "#4a4a5a",
  },
  code: {
    ...lightTheme.code,
    backgroundColor: "#2a2040",
    color: "#c4b5fd",
  },
  codespan: {
    ...lightTheme.codespan,
    backgroundColor: "#333333",
    color: "#c4b5fd",
    borderWidth: 0,
  },
  hr: { ...lightTheme.hr, backgroundColor: "#2a2a2a" },
}

interface Props {
  children: string
}

export function Markdown({ children }: Props) {
  const isDark = useColorScheme() === "dark"
  const theme = isDark ? darkTheme : lightTheme

  // A module-scope singleton renderer would share one CustomRenderer across
  // every Markdown instance and every streamed token forever, so the emitted
  // React keys would change on every token and remount the whole subtree
  // (resetting code-block scroll position, flashing content). Scoping the
  // renderer to `children` restarts the key counter per parse, so keys are
  // deterministic (and stable) for a given value, while re-renders with an
  // unchanged value stay memoized instead of creating a new renderer.
  const renderer = useMemo(() => new CustomRenderer(theme.link), [children, theme.link])

  // react-native-marked's default <RNMarkdown> export renders blocks inside a
  // FlatList. Chat messages are rendered inside app/session/[id].tsx's own
  // *inverted* FlatList (each row a MessageBubble) — nesting one
  // VirtualizedList inside another, especially an inverted one, is a known
  // React Native footgun where the inner list's content can fail to lay out
  // (renders zero height) instead of just warning. We already force
  // scrollEnabled: false and a large initialNumToRender here, which defeats
  // virtualization anyway, so there's nothing to lose by rendering the parsed
  // blocks directly with the useMarkdown hook instead (issue #104).
  const elements = useMarkdown(children ?? "", {
    renderer,
    styles: theme,
    colorScheme: isDark ? "dark" : "light",
  })

  if (!children?.trim()) return null

  return <View style={{ backgroundColor: "transparent" }}>{elements}</View>
}
