/**
 * First-launch consent modal for Sentry crash reporting.
 *
 * Shows once when the user hasn't yet made a consent decision.
 * Matches the app's existing Settings screen visual conventions.
 */

import { View, Text, TouchableOpacity, StyleSheet, useColorScheme, Modal, Linking } from "react-native"
import { Ionicons } from "@expo/vector-icons"

interface Props {
  visible: boolean
  onAllow: () => void
  onDecline: () => void
}

export function TelemetryConsentModal({ visible, onAllow, onDecline }: Props) {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === "dark"

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onDecline}>
      <View style={styles.overlay}>
        <View style={[styles.card, isDark && styles.cardDark]}>
          {/* Icon */}
          <View style={[styles.iconWrap, isDark && styles.iconWrapDark]}>
            <Ionicons name="bug-outline" size={40} color="#3b82f6" />
          </View>

          {/* Title */}
          <Text style={[styles.title, isDark && styles.textDark]}>Help improve OpenCode?</Text>

          {/* Body */}
          <Text style={[styles.body, isDark && styles.bodyDark]}>
            Share anonymous crash reports to help us find and fix bugs faster. No code, prompts,
            or server addresses are ever included.
          </Text>

          {/* Detail bullets */}
          <View style={styles.bullets}>
            <BulletRow icon="checkmark-circle" text="Device model, OS version, app version" isDark={isDark} positive />
            <BulletRow icon="checkmark-circle" text="Stack traces of crashes (no variable values)" isDark={isDark} positive />
            <BulletRow icon="close-circle" text="Your code, prompts, or chat messages" isDark={isDark} positive={false} />
            <BulletRow icon="close-circle" text="Server URLs or authentication tokens" isDark={isDark} positive={false} />
          </View>

          {/* Privacy policy link */}
          <TouchableOpacity
            onPress={() => Linking.openURL("https://agentlabs.cc/opencode/privacy")}
          >
            <Text style={styles.privacyLink}>Read our full privacy policy</Text>
          </TouchableOpacity>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.btnDecline, isDark && styles.btnDeclineDark]}
              onPress={onDecline}
              accessibilityLabel="No thanks, decline crash reporting"
            >
              <Text style={[styles.btnDeclineText, isDark && styles.btnDeclineTextDark]}>No thanks</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnAllow]}
              onPress={onAllow}
              accessibilityLabel="Allow anonymous crash reports"
            >
              <Text style={styles.btnAllowText}>Allow</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.footnote, isDark && styles.footnoteDark]}>
            You can change this at any time in Settings → Privacy.
          </Text>
        </View>
      </View>
    </Modal>
  )
}

function BulletRow({
  icon,
  text,
  isDark,
  positive,
}: {
  icon: "checkmark-circle" | "close-circle"
  text: string
  isDark: boolean
  positive: boolean
}) {
  return (
    <View style={styles.bulletRow}>
      <Ionicons
        name={icon}
        size={18}
        color={positive ? "#22c55e" : "#ef4444"}
        style={styles.bulletIcon}
      />
      <Text style={[styles.bulletText, isDark && styles.bodyDark]}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 28,
    width: "100%",
    maxWidth: 440,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 16,
    elevation: 10,
  },
  cardDark: {
    backgroundColor: "#1a1a1a",
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 18,
    backgroundColor: "#eff6ff",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: 16,
  },
  iconWrapDark: {
    backgroundColor: "#1e293b",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0a0a0a",
    textAlign: "center",
    marginBottom: 12,
  },
  textDark: {
    color: "#f8fafc",
  },
  body: {
    fontSize: 15,
    color: "#374151",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 20,
  },
  bodyDark: {
    color: "#94a3b8",
  },
  bullets: {
    marginBottom: 16,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  bulletIcon: {
    marginTop: 2,
    marginRight: 10,
    flexShrink: 0,
  },
  bulletText: {
    fontSize: 14,
    color: "#374151",
    flex: 1,
    lineHeight: 20,
  },
  privacyLink: {
    color: "#3b82f6",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 24,
    textDecorationLine: "underline",
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  btnDecline: {
    backgroundColor: "#f1f5f9",
  },
  btnDeclineDark: {
    backgroundColor: "#2a2a2a",
  },
  btnDeclineText: {
    color: "#374151",
    fontWeight: "600",
    fontSize: 16,
  },
  btnDeclineTextDark: {
    color: "#94a3b8",
  },
  btnAllow: {
    backgroundColor: "#3b82f6",
  },
  btnAllowText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 16,
  },
  footnote: {
    fontSize: 12,
    color: "#9ca3af",
    textAlign: "center",
  },
  footnoteDark: {
    color: "#64748b",
  },
})
