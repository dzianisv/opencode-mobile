import { useState } from "react"
import { View, Text, Modal, ScrollView, TouchableOpacity, StyleSheet, useColorScheme } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import * as Clipboard from "expo-clipboard"
import { useTranslation } from "react-i18next"

interface Props {
  visible: boolean
  text: string
  onClose: () => void
}

// Renders a message's source text in a fully `selectable` <Text> so the user
// can drag-select a portion of it and use the platform copy affordance.
//
// The critical detail is *where* this renders. Assistant prose in the chat
// transcript is a row of the session screen's inverted FlatList, and a
// `selectable` <Text> in that position hits facebook/react-native#46999 on
// Android — selection state (and accessibility-tree exposure) never applies
// correctly, which is exactly why Markdown.tsx's CustomRenderer strips the
// prop. A <Modal> renders into its own host view outside that FlatList, so
// `selectable` behaves normally here.
export function SelectableTextModal({ visible, text, onClose }: Props) {
  const isDark = useColorScheme() === "dark"
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const [copied, setCopied] = useState(false)

  const copyAll = async () => {
    try {
      await Clipboard.setStringAsync(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  // onRequestClose covers the Android hardware/gesture back action, which
  // would otherwise leave the modal stuck open.
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={[s.sheet, isDark && s.sheetDark]} testID="selectable-text-modal">
          <View style={[s.header, isDark && s.headerDark]}>
            <Text style={[s.title, isDark && s.titleDark]}>{t("session.selectText.title")}</Text>
            <View style={s.headerActions}>
              <TouchableOpacity onPress={copyAll} hitSlop={8} testID="selectable-text-copy-all">
                <Text style={s.copyBtn}>{copied ? t("session.selectText.copied") : t("session.selectText.copyAll")}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} hitSlop={8} testID="selectable-text-close">
                <Ionicons name="close" size={22} color={isDark ? "#888888" : "#666666"} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView style={s.body} contentContainerStyle={s.bodyContent}>
            <Text style={[s.text, isDark && s.textDark]} selectable testID="selectable-text-content">
              {text}
            </Text>
          </ScrollView>

          {/* Under edge-to-edge the sheet extends beneath the system
              navigation bar, so a fixed paddingBottom leaves this hint drawn
              behind it (verified on an Android 12 emulator). Pad by the real
              bottom inset instead, with a floor so it still breathes on
              devices reporting inset 0. */}
          <Text style={[s.hint, isDark && s.hintDark, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
            {t("session.selectText.hint")}
          </Text>
        </View>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "85%",
    minHeight: "50%",
  },
  sheetDark: { backgroundColor: "#141420" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e5e5",
  },
  headerDark: { borderBottomColor: "#2a2a2a" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 16 },
  title: { fontSize: 16, fontWeight: "600", color: "#0a0a0a" },
  titleDark: { color: "#ffffff" },
  copyBtn: { fontSize: 14, color: "#8b5cf6", fontWeight: "600" },

  body: { flexGrow: 0 },
  bodyContent: { padding: 16 },
  text: { fontSize: 15, lineHeight: 22, color: "#0a0a0a" },
  textDark: { color: "#e5e5e5" },

  // paddingBottom is applied inline from the safe-area inset — see render.
  hint: { fontSize: 11, color: "#999999", textAlign: "center", paddingHorizontal: 16, paddingTop: 8 },
  hintDark: { color: "#666666" },
})
