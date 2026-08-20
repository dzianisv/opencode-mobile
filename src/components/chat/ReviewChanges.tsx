import { useState } from "react"
import { Ionicons } from "@expo/vector-icons"
import { StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { useTranslation } from "react-i18next"
import type { FileDiff } from "../../lib/sdk"
import { DiffLinesView } from "./DiffView"
import { computePatchDiff } from "./patch-compute"

interface Props {
  diffs: FileDiff[]
  isDark: boolean
}

export function ReviewChanges({ diffs, isDark }: Props) {
  const { t } = useTranslation()
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const files = diffs.filter((diff): diff is FileDiff & { file: string } => typeof diff.file === "string")

  if (files.length === 0) return null

  const additions = files.reduce((sum, diff) => sum + diff.additions, 0)
  const deletions = files.reduce((sum, diff) => sum + diff.deletions, 0)

  return (
    <View style={[s.container, isDark && s.containerDark]} testID="review-changes">
      <View style={s.header}>
        <View style={s.headerTitle}>
          <Ionicons name="git-compare-outline" size={16} color={isDark ? "#c4b5fd" : "#6d28d9"} />
          <Text style={[s.title, isDark && s.titleDark]}>{t("chat.reviewChanges.title")}</Text>
          <Text style={[s.count, isDark && s.countDark]}>{t("chat.reviewChanges.files", { count: files.length })}</Text>
        </View>
        <View style={s.stats}>
          <Text style={s.additions}>+{additions}</Text>
          <Text style={s.deletions}>-{deletions}</Text>
        </View>
      </View>

      {files.map((diff) => {
        const expanded = !!open[diff.file]
        const canExpand = typeof diff.patch === "string" && diff.patch.length > 0
        return (
          <View key={diff.file} style={[s.file, isDark && s.fileDark]}>
            <TouchableOpacity
              style={s.fileHeader}
              activeOpacity={canExpand ? 0.7 : 1}
              disabled={!canExpand}
              onPress={() => setOpen((state) => ({ ...state, [diff.file]: !state[diff.file] }))}
            >
              <Ionicons
                name={diff.status === "added" ? "add-circle-outline" : diff.status === "deleted" ? "remove-circle-outline" : "document-text-outline"}
                size={15}
                color={isDark ? "#a3a3a3" : "#666666"}
              />
              <Text style={[s.path, isDark && s.pathDark]} numberOfLines={2}>{diff.file}</Text>
              <View style={s.fileStats}>
                <Text style={s.additions}>+{diff.additions}</Text>
                <Text style={s.deletions}>-{diff.deletions}</Text>
              </View>
              {canExpand && (
                <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={15} color={isDark ? "#737373" : "#999999"} />
              )}
            </TouchableOpacity>
            {expanded && diff.patch && (
              <View style={s.diff}>
                <DiffLinesView lines={computePatchDiff(diff.patch)} title={diff.file} isDark={isDark} maxHeight={300} />
              </View>
            )}
          </View>
        )
      })}
    </View>
  )
}

const s = StyleSheet.create({
  container: { marginTop: 10, borderWidth: 1, borderColor: "#ddd6fe", borderRadius: 9, overflow: "hidden", backgroundColor: "#fafaff" },
  containerDark: { borderColor: "#37305c", backgroundColor: "#171725" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 10, paddingVertical: 9 },
  headerTitle: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  title: { fontSize: 13, fontWeight: "700", color: "#3b0764" },
  titleDark: { color: "#ddd6fe" },
  count: { fontSize: 11, color: "#777777" },
  countDark: { color: "#8f8f9d" },
  stats: { flexDirection: "row", gap: 7 },
  additions: { fontSize: 11, fontWeight: "700", color: "#16a34a" },
  deletions: { fontSize: 11, fontWeight: "700", color: "#dc2626" },
  file: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#e5e5e5" },
  fileDark: { borderTopColor: "#34343f" },
  fileHeader: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 10, paddingVertical: 9 },
  path: { flex: 1, fontSize: 12, color: "#262626" },
  pathDark: { color: "#d4d4d4" },
  fileStats: { flexDirection: "row", gap: 6 },
  diff: { paddingHorizontal: 8, paddingBottom: 8 },
})
