import { useMemo, type ReactNode } from "react"
import { View, Text, useColorScheme, Platform, type StyleProp, type ViewStyle, type TextStyle } from "react-native"
import { useMarkdown, Renderer } from "react-native-marked"
import { CodeBlock } from "./CodeBlock"
import { WideScroll } from "../WideScroll"
// Transitive deps of react-native-marked, used to mirror its own MDTable
// structure inside the forgiving scroller.
// eslint-disable-next-line import/no-extraneous-dependencies
import { Cell, Table, TableWrapper } from "react-native-reanimated-table"
// @ts-expect-error -- internal util of react-native-marked, no types exported
import { getTableWidthArr } from "react-native-marked/dist/module/utils/table"

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
class CustomRenderer extends Renderer {
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
    return this.plainText(text, styles)
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
    return this.plainText(text, [styles, { fontStyle: "normal", fontWeight: "normal" }])
  }

  // The library's MDTable wraps itself in a plain horizontal ScrollView, which
  // loses the gesture race inside the vertical transcript unless the swipe is
  // near-perfectly axis-aligned — the reported "have to hit a perfect
  // left-right swipe". Re-render the same table structure inside WideScroll,
  // whose pan claims on horizontal DOMINANCE instead. Also gives the content
  // real edge padding, which the library's version lacked.
  table(
    header: ReactNode[][],
    rows: ReactNode[][][],
    tableStyle?: ViewStyle,
    rowStyle?: ViewStyle,
    cellStyle?: ViewStyle,
  ): ReactNode {
    // windowWidth is a private field on the base renderer; read it the same
    // way its own table() does, typed around rather than through.
    const windowWidth = (this as unknown as { windowWidth: number }).windowWidth
    const widthArr = getTableWidthArr(header.length, windowWidth)
    const { borderWidth, borderColor, ...tableStyleRest } = tableStyle || {}
    return (
      <WideScroll key={this.getKey()} contentContainerStyle={{ paddingRight: 16 }} testID="md-table-scroll">
        <Table borderStyle={{ borderWidth, borderColor: borderColor as string | undefined }} style={tableStyleRest}>
          <TableWrapper style={rowStyle}>
            {header.map((headerCol, index) => (
              <Cell key={`h-${index}`} width={widthArr[index]} data={<View style={cellStyle}>{headerCol}</View>} />
            ))}
          </TableWrapper>
          {rows.map((rowData, rowIndex) => (
            <TableWrapper key={`r-${rowIndex}`} style={rowStyle}>
              {rowData.map((cellData, cellIndex) => (
                <Cell
                  key={`c-${rowIndex}-${cellIndex}`}
                  width={widthArr[cellIndex]}
                  data={<View style={cellStyle}>{cellData}</View>}
                />
              ))}
            </TableWrapper>
          ))}
        </Table>
      </WideScroll>
    )
  }
}

const mono = Platform.OS === "ios" ? "Menlo" : "monospace"

const lightTheme = {
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
    backgroundColor: "#e8e5f0",
    color: "#6d28d9",
    fontFamily: mono,
    fontSize: 13,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  list: { marginBottom: 4 },
  li: { marginBottom: 2 },
  hr: { backgroundColor: "#e5e5e5", height: 1, marginVertical: 12 },
  strong: { fontWeight: "700" as const },
  em: { fontStyle: "italic" as const },
  strikethrough: { textDecorationLine: "line-through" as const },
  image: { borderRadius: 8 },
}

const darkTheme = {
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
    backgroundColor: "#2a2040",
    color: "#c4b5fd",
  },
  hr: { ...lightTheme.hr, backgroundColor: "#2a2a2a" },
}

interface Props {
  children: string
}

export function Markdown({ children }: Props) {
  const isDark = useColorScheme() === "dark"
  const theme = isDark ? darkTheme : lightTheme

  // A module-scope singleton renderer would share one CustomRenderer (and
  // its underlying github-slugger) across every Markdown instance and every
  // streamed token forever. github-slugger never resets, so its heading-slug
  // keys only ever climb — which fed into useMarkdown's memoized parser and
  // made the emitted React keys change on every token, remounting the whole
  // subtree (resetting code-block scroll position, flashing content). Scoping
  // the renderer to `children` resets the slugger per parse, so keys are
  // deterministic (and stable) for a given value, while re-renders with an
  // unchanged value stay memoized instead of creating a new renderer.
  const renderer = useMemo(() => new CustomRenderer(), [children])

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
