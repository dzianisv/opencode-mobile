import { useCallback, useRef, useState } from "react"
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import BottomSheet, { BottomSheetBackdrop, BottomSheetFlatList, BottomSheetTextInput } from "@gorhom/bottom-sheet"
import { useTranslation } from "react-i18next"
import type { Client, FileEntry } from "../../lib/sdk"
import { parentOf, nameOf } from "../../lib/path-utils"
import { normalizeRoots, type FileRoot } from "../../lib/file-roots"

interface Props {
  sheetRef: React.RefObject<BottomSheet | null>
  // Directory to start browsing from whenever the sheet opens (project root, server home, etc).
  startDirectory: string | null
  // Builds a client rooted at an arbitrary absolute directory (see connections store).
  clientForDirectory: (directory: string) => Client | null
  isDark: boolean
  // Called with the chosen absolute directory when the user taps "Use this folder".
  onSelect: (directory: string) => void
  // Called whenever the sheet fully closes (selection or cancel).
  onDismiss?: () => void
}

export function DirectoryBrowserSheet({
  sheetRef,
  startDirectory,
  clientForDirectory,
  isDark,
  onSelect,
  onDismiss,
}: Props) {
  const { t } = useTranslation()
  const [browseDir, setBrowseDir] = useState<string | null>(null)
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [jumpPath, setJumpPath] = useState("")
  // Pinned top-level entries (drives, home dir) fetched from GET /file/roots.
  // Stays empty on older servers that don't expose the endpoint, or while a
  // fetch is in flight — the manual "Jump to path" input keeps working
  // either way.
  const [roots, setRoots] = useState<FileRoot[]>([])
  const loadToken = useRef(0)

  const load = useCallback(
    (dir: string) => {
      const client = clientForDirectory(dir)
      const token = ++loadToken.current
      setLoading(true)
      setError(null)
      if (!client) {
        setEntries([])
        setLoading(false)
        setError(t("chat.directoryBrowserSheet.noActiveConnection"))
        return
      }
      client.file
        .list({ path: "." })
        .then((items) => {
          if (loadToken.current !== token) return
          setEntries(items.filter((item) => item.type === "directory"))
        })
        .catch((err) => {
          if (loadToken.current !== token) return
          setEntries([])
          setError(err instanceof Error ? err.message : t("chat.directoryBrowserSheet.listFailed"))
        })
        .finally(() => {
          if (loadToken.current === token) setLoading(false)
        })
    },
    [clientForDirectory, t],
  )

  const enter = useCallback(
    (dir: string) => {
      setBrowseDir(dir)
      load(dir)
    },
    [load],
  )

  // Fetch pinned filesystem roots for the current server. Silently falls
  // back to no pinned roots (manual path entry still works) on older
  // servers or any request failure.
  const loadRoots = useCallback(
    (dir: string) => {
      const client = clientForDirectory(dir)
      if (!client) {
        setRoots([])
        return
      }
      client.file
        .roots()
        .then((result) => setRoots(normalizeRoots(result)))
        .catch(() => setRoots([]))
    },
    [clientForDirectory],
  )

  // Reset to the starting directory when the sheet transitions from closed
  // to open (not on drags between snap points), and notify on full close.
  const wasOpen = useRef(false)
  const handleSheetChange = useCallback(
    (index: number) => {
      if (index < 0) {
        wasOpen.current = false
        onDismiss?.()
        return
      }
      if (wasOpen.current) return // snap-point change while already open
      wasOpen.current = true
      setJumpPath("")
      if (startDirectory) {
        enter(startDirectory)
        loadRoots(startDirectory)
      } else {
        // No starting directory known (e.g. server home not loaded yet):
        // show an explicit empty state instead of a previous open's entries.
        loadToken.current++
        setBrowseDir(null)
        setEntries([])
        setError(null)
        setLoading(false)
        setRoots([])
      }
    },
    [startDirectory, enter, loadRoots, onDismiss],
  )

  const goUp = useCallback(() => {
    if (!browseDir) return
    const parent = parentOf(browseDir)
    if (!parent) return
    enter(parent)
  }, [browseDir, enter])

  const goJump = useCallback(() => {
    const dir = jumpPath.trim()
    if (!dir) return
    setJumpPath("")
    enter(dir)
  }, [jumpPath, enter])

  const handleUseFolder = useCallback(() => {
    if (!browseDir) return
    onSelect(browseDir)
    sheetRef.current?.close()
  }, [browseDir, onSelect, sheetRef])

  const canGoUp = !!browseDir && !!parentOf(browseDir)

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={["65%", "92%"]}
      // Static percentage snapPoints are provided above, but @gorhom/bottom-sheet
      // v5 defaults enableDynamicSizing to true, which requires content wrapped
      // in a size-reporting component (BottomSheetView) to ever compute a valid
      // detent — this sheet's children are plain Views/BottomSheetFlatList, so
      // contentHeight never resolves and the sheet can never open (expand() has
      // no valid snap position to animate to). Disable dynamic sizing so the
      // explicit snapPoints above are used directly. See GitHub issue #104.
      enableDynamicSizing={false}
      enablePanDownToClose
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      backgroundStyle={isDark ? s.sheetDark : s.sheet}
      handleIndicatorStyle={{ backgroundColor: isDark ? "#666666" : "#cccccc" }}
      backdropComponent={(props) => (
        <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} />
      )}
      onChange={handleSheetChange}
    >
      <View style={s.header}>
        <Text style={[s.title, isDark && s.white]}>{t("chat.directoryBrowserSheet.title")}</Text>
        <View style={s.pathRow}>
          <TouchableOpacity onPress={goUp} disabled={!canGoUp} hitSlop={8} testID="directory-up-button">
            <Ionicons
              name="arrow-up-circle-outline"
              size={22}
              color={canGoUp ? (isDark ? "#8b5cf6" : "#6d28d9") : isDark ? "#3a3a3a" : "#dddddd"}
            />
          </TouchableOpacity>
          <Text style={[s.path, isDark && s.dimDark]} numberOfLines={1} ellipsizeMode="head">
            {browseDir || "…"}
          </Text>
        </View>
      </View>

      {roots.length > 0 && (
        <View style={s.rootsRow}>
          {roots.map((root) => (
            <TouchableOpacity
              key={root.path}
              style={[s.rootChip, isDark && s.rootChipDark, browseDir === root.path && s.rootChipActive]}
              onPress={() => enter(root.path)}
              testID={`directory-root-${root.label}`}
            >
              <Ionicons
                name={root.label === "Home" ? "home-outline" : "layers-outline"}
                size={14}
                color={browseDir === root.path ? "#ffffff" : isDark ? "#c4b5fd" : "#6d28d9"}
              />
              <Text
                style={[
                  s.rootChipText,
                  isDark && s.rootChipTextDark,
                  browseDir === root.path && s.rootChipTextActive,
                ]}
                numberOfLines={1}
              >
                {root.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={s.inputWrap}>
        <BottomSheetTextInput
          style={[s.input, isDark && s.inputDark]}
          placeholder={t("chat.directoryBrowserSheet.jumpPlaceholder")}
          placeholderTextColor={isDark ? "#666666" : "#999999"}
          value={jumpPath}
          onChangeText={setJumpPath}
          onSubmitEditing={goJump}
          returnKeyType="go"
          autoCapitalize="none"
          autoCorrect={false}
          testID="directory-jump-input"
        />
        {jumpPath.trim() && (
          <TouchableOpacity style={[s.goBtn, isDark && s.goBtnDark]} onPress={goJump}>
            <Ionicons name="arrow-forward" size={18} color={isDark ? "#0a0a0a" : "#ffffff"} />
          </TouchableOpacity>
        )}
      </View>

      <BottomSheetFlatList
        data={entries}
        keyExtractor={(item: FileEntry) => item.absolute}
        renderItem={({ item }: { item: FileEntry }) => (
          <TouchableOpacity
            style={[s.row, isDark && s.rowDark]}
            onPress={() => enter(item.absolute)}
            testID={`directory-row-${item.name}`}
          >
            <Ionicons
              name="folder-outline"
              size={20}
              color={item.ignored ? (isDark ? "#555555" : "#bbbbbb") : isDark ? "#888888" : "#666666"}
            />
            <Text style={[s.rowLabel, isDark && s.white, item.ignored && s.rowLabelDim]} numberOfLines={1}>
              {item.name}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={isDark ? "#555555" : "#cccccc"} />
          </TouchableOpacity>
        )}
        contentContainerStyle={s.list}
        ListHeaderComponent={
          loading ? (
            <View style={s.centerBox}>
              <ActivityIndicator color={isDark ? "#ffffff" : "#0a0a0a"} />
            </View>
          ) : error ? (
            <View style={s.centerBox}>
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          !loading && !error ? (
            <Text style={[s.emptyText, isDark && s.dimDark]}>
              {browseDir
                ? t("chat.directoryBrowserSheet.noSubfolders")
                : t("chat.directoryBrowserSheet.enterPathHint")}
            </Text>
          ) : null
        }
      />

      <View style={s.footer}>
        <TouchableOpacity
          style={[s.selectBtn, isDark && s.selectBtnDark, !browseDir && s.selectBtnDisabled]}
          onPress={handleUseFolder}
          disabled={!browseDir}
          testID="directory-select-button"
        >
          <Ionicons name="checkmark-circle" size={18} color={isDark ? "#0a0a0a" : "#ffffff"} />
          <Text style={[s.selectBtnText, isDark && s.selectBtnTextDark]} numberOfLines={1}>
            {t("chat.directoryBrowserSheet.useFolderButton", {
              folder: browseDir ? nameOf(browseDir) : t("chat.directoryBrowserSheet.thisFolderFallback"),
            })}
          </Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  )
}

const s = StyleSheet.create({
  sheet: { backgroundColor: "#ffffff" },
  sheetDark: { backgroundColor: "#1a1a1a" },
  header: { paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  title: { fontSize: 18, fontWeight: "700", color: "#0a0a0a" },
  white: { color: "#ffffff" },
  pathRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  path: {
    flex: 1,
    fontSize: 12,
    color: "#666666",
  },
  dimDark: { color: "#888888" },
  rootsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  rootChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: "#e8e5f0",
  },
  rootChipDark: { backgroundColor: "#2a2040" },
  rootChipActive: { backgroundColor: "#8b5cf6" },
  rootChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6d28d9",
  },
  rootChipTextDark: { color: "#c4b5fd" },
  rootChipTextActive: { color: "#ffffff" },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  input: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: "#f5f5f5",
    color: "#0a0a0a",
    fontSize: 14,
  },
  inputDark: {
    backgroundColor: "#2a2a2a",
    color: "#ffffff",
  },
  goBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#0a0a0a",
    alignItems: "center",
    justifyContent: "center",
  },
  goBtnDark: { backgroundColor: "#ffffff" },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: "#f5f5f5",
    marginBottom: 6,
  },
  rowDark: { backgroundColor: "#2a2a2a" },
  rowLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#0a0a0a",
  },
  rowLabelDim: { color: "#999999" },
  centerBox: {
    paddingVertical: 24,
    alignItems: "center",
  },
  errorText: {
    fontSize: 13,
    color: "#ef4444",
    textAlign: "center",
    paddingHorizontal: 16,
  },
  emptyText: {
    fontSize: 13,
    color: "#999999",
    textAlign: "center",
    paddingVertical: 24,
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e5e5e5",
  },
  selectBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 46,
    borderRadius: 12,
    backgroundColor: "#0a0a0a",
  },
  selectBtnDark: { backgroundColor: "#ffffff" },
  selectBtnDisabled: { opacity: 0.5 },
  selectBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#ffffff",
  },
  selectBtnTextDark: { color: "#0a0a0a" },
})
