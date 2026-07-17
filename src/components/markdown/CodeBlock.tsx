import { useState } from "react"
import { View, Text, TouchableOpacity, StyleSheet, useColorScheme, Platform, ScrollView } from "react-native"
import * as Clipboard from "expo-clipboard"
import { WIDE_CONTENT_SCROLL_CONFIG } from "../../lib/scroll-config"

interface Props {
  code: string
  language?: string
}

export function CodeBlock({ code, language }: Props) {
  const isDark = useColorScheme() === "dark"
  const [copied, setCopied] = useState(false)

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
      <ScrollView {...WIDE_CONTENT_SCROLL_CONFIG} testID="code-block-scroll" contentContainerStyle={styles.codeScroll}>
        <Text style={[styles.code, isDark && styles.codeDark]} selectable>
          {code}
        </Text>
      </ScrollView>
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
  codeScroll: {
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
