import { View, Text, TouchableOpacity, StyleSheet } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import BottomSheet, { BottomSheetBackdrop, BottomSheetFlatList } from "@gorhom/bottom-sheet"

interface VariantOption {
  id: string | null
  label: string
  description: string
}

interface Props {
  variants: Record<string, { reasoningEffort?: string }> | undefined
  selected: string | null
  isDark: boolean
  onSelect: (variant: string | null) => void
  sheetRef: React.RefObject<BottomSheet | null>
}

const AUTO_OPTION: VariantOption = {
  id: null,
  label: "Auto",
  description: "Use model default reasoning",
}

const EFFORT_DESCRIPTIONS: Record<string, string> = {
  low: "Faster, less thorough reasoning",
  medium: "Balanced reasoning and speed",
  high: "Deep, thorough reasoning",
}

export function VariantPicker({ variants, selected, isDark, onSelect, sheetRef }: Props) {
  const options: VariantOption[] = [
    AUTO_OPTION,
    ...Object.keys(variants || {}).map((id) => ({
      id,
      label: id.charAt(0).toUpperCase() + id.slice(1),
      description: EFFORT_DESCRIPTIONS[id] ?? id,
    })),
  ]

  const handleSelect = (id: string | null) => {
    onSelect(id)
    sheetRef.current?.close()
  }

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={["30%", "50%"]}
      enablePanDownToClose
      backgroundStyle={isDark ? s.sheetDark : s.sheet}
      handleIndicatorStyle={{ backgroundColor: isDark ? "#666666" : "#cccccc" }}
      backdropComponent={(props) => (
        <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} />
      )}
    >
      <View style={s.header}>
        <Text style={[s.title, isDark && s.textWhite]}>Reasoning Effort</Text>
      </View>
      <BottomSheetFlatList
        data={options}
        keyExtractor={(item: VariantOption) => item.id ?? "auto"}
        renderItem={({ item }: { item: VariantOption }) => {
          const active = item.id === selected
          return (
            <TouchableOpacity
              style={[s.row, isDark && s.rowDark, active && (isDark ? s.rowSelectedDark : s.rowSelected)]}
              onPress={() => handleSelect(item.id)}
              testID={`variant-option-${item.id ?? "auto"}`}
            >
              <View style={s.rowText}>
                <Text style={[s.rowName, isDark && s.textWhite]}>{item.label}</Text>
                <Text style={[s.rowDesc, isDark && s.metaDark]}>{item.description}</Text>
              </View>
              {active && <Ionicons name="checkmark-circle" size={20} color="#8b5cf6" />}
            </TouchableOpacity>
          )
        }}
        contentContainerStyle={s.content}
      />
    </BottomSheet>
  )
}

const s = StyleSheet.create({
  sheet: { backgroundColor: "#ffffff" },
  sheetDark: { backgroundColor: "#1a1a1a" },
  header: { paddingHorizontal: 16, paddingBottom: 12 },
  title: { fontSize: 18, fontWeight: "700", color: "#0a0a0a" },
  textWhite: { color: "#ffffff" },
  metaDark: { color: "#666666" },
  content: { paddingBottom: 40 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e5e5",
  },
  rowDark: { borderBottomColor: "#2a2a2a" },
  rowSelected: { backgroundColor: "#f5f3ff" },
  rowSelectedDark: { backgroundColor: "#1f1a2e" },
  rowText: { flex: 1 },
  rowName: { fontSize: 15, fontWeight: "600", color: "#0a0a0a" },
  rowDesc: { fontSize: 12, color: "#999999", marginTop: 2 },
})
