import { useState } from "react"
import { View, Text, TouchableOpacity, StyleSheet, useColorScheme, Platform } from "react-native"
import * as Clipboard from "expo-clipboard"
import { wideTextSelection } from "../../lib/scroll-config"

interface Props {
  code: string
  language?: string
}

export function CodeBlock({ code, language }: Props) {
  const isDark = useColorScheme() === "dark"
  const [copied, setCopied] = useState(false)
  const sel = wideTextSelection(Platform.OS)

  // Cosmetic wrapping: one Text per logical line, so indentation survives and a
  // long line folds inside the block instead of needing sideways scrolling.
  // The clipboard gets `code` — the raw string from the server — so what you
  // paste is byte-identical to what was sent, line breaks and all. Wrapping only
  // exists in the rendering. See ../../lib/scroll-config for why these blocks no
  // longer scroll horizontally.
  const lines = code.split("\n")

  const copy = async () => {
    try {
      await Clipboard.setStringAsync(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <View style={[styles.header, isDark && styles.headerDark]}>
        <Text style={[styles.language, isDark && styles.languageDark]}>{language || "code"}</Text>
        <TouchableOpacity onPress={copy} hitSlop={8}>
          <Text style={[styles.copyBtn, isDark && styles.copyBtnDark]}>{copied ? "Copied!" : "Copy"}</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.codeBody} testID="code-block-body">
        {lines.map((line, idx) => (
          // An empty Text collapses to zero height, which would eat blank lines
          // and make pasted-vs-displayed line counts disagree.
          <Text key={idx} style={[styles.code, isDark && styles.codeDark]} selectable={sel.selectable}>
            {line.length > 0 ? line : " "}
          </Text>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    marginVertical: 8,
    overflow: "hidden",
  },
  containerDark: {
    backgroundColor: "#1a1a1a",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#e8e8e8",
  },
  headerDark: {
    backgroundColor: "#2a2a2a",
  },
  language: {
    fontSize: 11,
    fontWeight: "600",
    color: "#666666",
    textTransform: "uppercase",
  },
  languageDark: {
    color: "#888888",
  },
  copyBtn: {
    fontSize: 11,
    color: "#8b5cf6",
    fontWeight: "600",
  },
  copyBtnDark: {
    color: "#a78bfa",
  },
  codeBody: {
    padding: 12,
  },
  code: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 13,
    lineHeight: 20,
    color: "#1a1a1a",
  },
  codeDark: {
    color: "#e5e5e5",
  },
})
