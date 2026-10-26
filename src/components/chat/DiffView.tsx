import { View, Text, StyleSheet, Platform } from "react-native"
import { wideTextSelection } from "../../lib/scroll-config"
import { computeDiff } from "./diff-compute"

const mono = Platform.OS === "ios" ? "Menlo" : "monospace"

interface Props {
  before: string
  after: string
  isDark: boolean
}

export function DiffView({ before, after, isDark }: Props) {
  const lines = computeDiff(before, after)
  const sel = wideTextSelection(Platform.OS)

  if (lines.length === 0) return null

  return (
    <View style={[s.container, isDark && s.containerDark]} testID="diff-view">
      {lines.map((line, idx) => (
        <View
          key={idx}
          style={[
            s.line,
            line.type === "add" && (isDark ? s.addDark : s.add),
            line.type === "remove" && (isDark ? s.removeDark : s.remove),
          ]}
        >
          <Text style={[s.prefix, isDark && s.prefixDark]}>
            {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
          </Text>
          {/* s.text is flex:1 with no numberOfLines, so a long diff line folds
              inside its own row: the +/- gutter stays aligned with the line it
              belongs to, and nothing is truncated (issue #21). Wrapping is
              rendering only — the diff text itself is untouched. */}
          <Text
            style={[
              s.text,
              isDark && s.textDark,
              line.type === "add" && s.addText,
              line.type === "remove" && s.removeText,
            ]}
            selectable={sel.selectable}
          >
            {line.text.length > 0 ? line.text : " "}
          </Text>
        </View>
      ))}
    </View>
  )
}

const s = StyleSheet.create({
  container: {
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: "#f8f8f8",
    marginTop: 6,
  },
  containerDark: { backgroundColor: "#1a1a1a" },

  line: {
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingVertical: 1,
  },
  add: { backgroundColor: "#dcfce7" },
  addDark: { backgroundColor: "#052e16" },
  remove: { backgroundColor: "#fee2e2" },
  removeDark: { backgroundColor: "#2a0a0a" },

  prefix: {
    width: 16,
    fontSize: 12,
    fontFamily: mono,
    color: "#999999",
    lineHeight: 20,
  },
  prefixDark: { color: "#666666" },

  text: {
    // flex:1 is what makes the fold happen inside the row instead of pushing the
    // row wider than the screen.
    flex: 1,
    fontSize: 12,
    fontFamily: mono,
    color: "#0a0a0a",
    lineHeight: 20,
  },
  textDark: { color: "#e5e5e5" },
  addText: { color: "#16a34a" },
  removeText: { color: "#dc2626" },
})
