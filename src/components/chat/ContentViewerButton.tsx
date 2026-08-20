import { Ionicons } from "@expo/vector-icons"
import { useRouter } from "expo-router"
import { Text, TouchableOpacity, StyleSheet } from "react-native"
import { useTranslation } from "react-i18next"
import { setContentViewer } from "../../lib/content-viewer"

interface Props {
  title: string
  content: string
  language?: string
  isDark: boolean
}

export function ContentViewerButton({ title, content, language, isDark }: Props) {
  const router = useRouter()
  const { t } = useTranslation()

  if (!content) return null

  return (
    <TouchableOpacity
      style={[s.button, isDark && s.buttonDark]}
      onPress={() => {
        setContentViewer({ title, language, content })
        router.push("/content-viewer")
      }}
      hitSlop={6}
    >
      <Ionicons name="expand-outline" size={14} color={isDark ? "#c4b5fd" : "#6d28d9"} />
      <Text style={[s.text, isDark && s.textDark]}>{t("chat.contentViewer.open")}</Text>
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 5,
    backgroundColor: "#ede9fe",
  },
  buttonDark: { backgroundColor: "#312e81" },
  text: { fontSize: 11, fontWeight: "600", color: "#6d28d9" },
  textDark: { color: "#c4b5fd" },
})
