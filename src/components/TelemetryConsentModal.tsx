/**
 * First-launch consent modal for crash reporting AND activation analytics.
 *
 * A single "Allow" decision gates both Sentry (crash reports) and PostHog
 * (anonymous usage analytics) — see src/lib/telemetry.ts. There is no
 * separate toggle for analytics, so this modal must disclose both.
 *
 * Shows once when the user hasn't yet made a consent decision.
 * Matches the app's existing Settings screen visual conventions.
 */

import { View, Text, TouchableOpacity, StyleSheet, useColorScheme, Modal, Linking } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useTranslation } from "react-i18next"
import { PRIVACY_POLICY_URL } from "../lib/links"

interface Props {
  visible: boolean
  onAllow: () => void
  onDecline: () => void
}

export function TelemetryConsentModal({ visible, onAllow, onDecline }: Props) {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === "dark"
  const { t } = useTranslation()

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onDecline}>
      <View style={styles.overlay}>
        <View style={[styles.card, isDark && styles.cardDark]} testID="telemetry-consent-card">
          {/* Icon */}
          <View style={[styles.iconWrap, isDark && styles.iconWrapDark]}>
            <Ionicons name="bug-outline" size={40} color="#3b82f6" />
          </View>

          {/* Title */}
          <Text style={[styles.title, isDark && styles.textDark]}>{t("telemetryConsent.title")}</Text>

          {/* Body */}
          <Text style={[styles.body, isDark && styles.bodyDark]}>{t("telemetryConsent.body")}</Text>

          {/* Detail bullets */}
          <View style={styles.bullets}>
            <BulletRow icon="checkmark-circle" text={t("telemetryConsent.bullets.deviceInfo")} isDark={isDark} positive />
            <BulletRow
              icon="checkmark-circle"
              text={t("telemetryConsent.bullets.stackTraces")}
              isDark={isDark}
              positive
            />
            <BulletRow
              icon="checkmark-circle"
              text={t("telemetryConsent.bullets.usageEvents")}
              isDark={isDark}
              positive
            />
            <BulletRow
              icon="close-circle"
              text={t("telemetryConsent.bullets.noCode")}
              isDark={isDark}
              positive={false}
            />
            <BulletRow
              icon="close-circle"
              text={t("telemetryConsent.bullets.noServerUrls")}
              isDark={isDark}
              positive={false}
            />
          </View>

          {/* Privacy policy link */}
          <TouchableOpacity onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}>
            <Text style={styles.privacyLink}>{t("telemetryConsent.privacyLink")}</Text>
          </TouchableOpacity>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.btnDecline, isDark && styles.btnDeclineDark]}
              onPress={onDecline}
              accessibilityLabel={t("telemetryConsent.declineA11yLabel")}
              testID="telemetry-decline-button"
            >
              <Text style={[styles.btnDeclineText, isDark && styles.btnDeclineTextDark]}>
                {t("telemetryConsent.declineButton")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnAllow]}
              onPress={onAllow}
              accessibilityLabel={t("telemetryConsent.allowA11yLabel")}
              testID="telemetry-allow-button"
            >
              <Text style={styles.btnAllowText}>{t("telemetryConsent.allowButton")}</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.footnote, isDark && styles.footnoteDark]}>{t("telemetryConsent.footnote")}</Text>
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
