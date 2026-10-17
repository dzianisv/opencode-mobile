import { useState } from "react"
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View, useColorScheme } from "react-native"
import * as Clipboard from "expo-clipboard"
import { useTranslation } from "react-i18next"

interface Props {
  visible: boolean
  text: string
  onClose: () => void
}

// Full-screen selectable-text view for a chat message.
//
// Why a modal instead of selectable <Text> inside the bubble: markdown text
// nodes live in rows of the session screen's FlatList, where selectable Text
// hits the long-standing Android nesting bug (facebook/react-native#46999 —
// the reason Markdown.tsx drops `selectable` entirely). A plain ScrollView
// outside any virtualized list lets the platform's native selection
// (long-press → handles → copy) work reliably on both platforms, and gives a
// "copy all" fallback for whole-message copying.
export function MessageTextSheet({ visible, text, onClose }: Props) {
  const { t } = useTranslation()
  const isDark = useColorScheme() === "dark"
  const [copied, setCopied] = useState(false)

  const copyAll = async () => {
    await Clipboard.setStringAsync(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[s.container, isDark && s.containerDark]}>
        <View style={[s.header, isDark && s.headerDark]}>
          <Text style={[s.title, isDark && s.textWhite]}>{t("session.actions.selectText")}</Text>
          <TouchableOpacity onPress={copyAll} style={[s.copyBtn, isDark && s.copyBtnDark]} testID="text-sheet-copy">
            <Text style={[s.copyText, isDark && s.copyTextDark]}>{copied ? t("session.actions.copied") : t("session.actions.copyAll")}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={s.closeBtn} testID="text-sheet-close">
            <Text style={[s.closeText, isDark && s.closeTextDark]}>{t("common.close")}</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator>
          <Text style={[s.body, isDark && s.textWhite]} selectable>
            {text}
          </Text>
        </ScrollView>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafafa" },
  containerDark: { backgroundColor: "#111111" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
  },
  headerDark: { borderBottomColor: "#2a2a2a" },
  title: { flex: 1, fontSize: 16, fontWeight: "600", color: "#0a0a0a" },
  textWhite: { color: "#ffffff" },
  copyBtn: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "#e8e5f0", borderRadius: 8 },
  copyBtnDark: { backgroundColor: "#2a2040" },
  copyText: { color: "#6d28d9", fontSize: 13, fontWeight: "600" },
  copyTextDark: { color: "#c4b5fd" },
  closeBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  closeText: { color: "#666666", fontSize: 13 },
  closeTextDark: { color: "#888888" },
  scroll: { padding: 16 },
  body: { fontSize: 15, lineHeight: 23, color: "#0a0a0a" },
})
