import { useState } from "react"
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  useColorScheme,
  ActivityIndicator,
  Alert,
  Linking,
} from "react-native"
import { router } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { useTranslation } from "react-i18next"
import { useConnections } from "../../src/stores/connections"
import type { ConnectionType } from "../../src/lib/types"
import { probeConnection, shareReport } from "../../src/lib/diagnostics"
import { captureDiagnostic } from "../../src/lib/sentry"
import { parseUrl } from "../../src/lib/diagnostics-classify"
import { buildAuth } from "../../src/lib/auth"
import { AnalyticsEvent, track } from "../../src/lib/analytics"
import { submitWaitlistSignup, buildWaitlistMailtoUrl } from "../../src/lib/waitlist"

export default function AddConnectionScreen() {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === "dark"
  const { t } = useTranslation()

  const { addConnection, testConnection } = useConnections()

  const [mode, setMode] = useState<"quick" | "advanced">("quick")
  const [type, setType] = useState<ConnectionType>("local")
  const [name, setName] = useState("")
  const [ip, setIp] = useState("")
  const [port, setPort] = useState("4096")
  const [url, setUrl] = useState("")
  const [directory, setDirectory] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [isConnecting, setIsConnecting] = useState(false)
  const [waitlistEmail, setWaitlistEmail] = useState("")
  const [waitlistState, setWaitlistState] = useState<"idle" | "submitting" | "joined">("idle")

  const buildUrl = () => {
    if (mode === "advanced") return url.trim()
    const raw = ip.trim()
    if (!raw) return ""
    // Be forgiving about pasted values: a full URL, a host:port, or a
    // host with a trailing path. Extract scheme, host, and port so we
    // never produce "http://http://host:4096:4096".
    const schemeMatch = raw.match(/^(https?):\/\//i)
    const scheme = schemeMatch ? schemeMatch[1].toLowerCase() : "http"
    let rest = raw.replace(/^https?:\/\//i, "")
    rest = rest.split("/")[0] // drop any path/query
    let host = rest
    let pastedPort = ""
    const lastColon = rest.lastIndexOf(":")
    // Only treat trailing ":NNNN" as a port (ignore IPv6 colons / bare host)
    if (lastColon > -1 && /^\d+$/.test(rest.slice(lastColon + 1))) {
      host = rest.slice(0, lastColon)
      pastedPort = rest.slice(lastColon + 1)
    }
    const finalPort = pastedPort || port.trim() || "4096"
    return `${scheme}://${host}:${finalPort}`
  }

  const handleQuickConnect = async () => {
    const serverUrl = buildUrl()
    if (!serverUrl) {
      Alert.alert(t("common.error"), t("connection.add.alerts.enterIp"))
      return
    }

    track(AnalyticsEvent.ConnectionFormSubmitted, { mode: "quick" })
    setIsConnecting(true)

    // Test connection first. Quick Connect has no username field, so the
    // connection is intentionally saved without one — buildAuth() defaults
    // it to "opencode" wherever auth is built. Sending the `username` state
    // here would leak a value typed earlier in Advanced mode (issue: Back to
    // Quick silently overriding the default).
    const result = await testConnection(
      {
        id: "",
        name: name || t("connection.shared.namePlaceholder"),
        type: "local",
        url: serverUrl,
      },
      "onboarding",
      password || undefined,
    )

    if (result.ok) {
      // Save and go back
      try {
        await addConnection(
          {
            name: name.trim() || t("connection.shared.namePlaceholder"),
            type: "local",
            url: serverUrl,
          },
          password || undefined,
        )
        setIsConnecting(false)
        router.back()
      } catch {
        setIsConnecting(false)
        Alert.alert(
          t("connection.shared.alerts.saveFailedTitle"),
          t("connection.shared.alerts.saveFailedMessage"),
        )
      }
    } else {
      // Failed: run active diagnostics, capture to Sentry, offer a shareable report.
      const report = await probeConnection(serverUrl, buildAuth(undefined, password))
      captureDiagnostic(report)
      setIsConnecting(false)
      Alert.alert(
        t("connection.shared.alerts.connectionFailedTitle"),
        t("connection.add.alerts.connectionFailedMessage", {
          summary: report.summary,
          target: serverUrl,
          error: result.error || t("connection.shared.alerts.unknownError"),
        }),
        [
          { text: t("common.ok"), style: "cancel" },
          { text: t("common.shareReport"), onPress: () => shareReport(report) },
        ],
      )
    }
  }

  const handleAdvancedSave = async () => {
    if (!name.trim()) {
      Alert.alert(t("common.error"), t("connection.shared.alerts.enterName"))
      return
    }
    if (!url.trim()) {
      Alert.alert(t("common.error"), t("connection.shared.alerts.enterUrl"))
      return
    }
    if (!parseUrl(url).valid) {
      Alert.alert(t("connection.shared.alerts.invalidUrlTitle"), t("connection.shared.alerts.invalidUrlMessage"))
      return
    }

    track(AnalyticsEvent.ConnectionFormSubmitted, { mode: "advanced" })
    setIsConnecting(true)

    // Pre-flight, mirroring Quick Connect: previously Advanced mode saved
    // directly with no health check, so bad credentials (401/403) or an
    // unreachable server silently became the active connection with zero
    // feedback (issue #76). testConnection() also fires the
    // connection_attempted/succeeded/failed analytics events.
    const result = await testConnection(
      {
        id: "",
        name: name.trim(),
        type,
        url: url.trim(),
        directory: directory.trim() || undefined,
        username: username.trim() || undefined,
      },
      "onboarding",
      password || undefined,
    )

    if (result.ok) {
      try {
        await addConnection(
          {
            name: name.trim(),
            type,
            url: url.trim(),
            directory: directory.trim() || undefined,
            username: username.trim() || undefined,
          },
          password || undefined,
        )
        setIsConnecting(false)
        router.back()
      } catch {
        setIsConnecting(false)
        Alert.alert(
          t("connection.shared.alerts.saveFailedTitle"),
          t("connection.shared.alerts.saveFailedMessage"),
        )
      }
      return
    }

    // Failed: same "Connection Failed" alert as Quick Connect — run active
    // diagnostics, capture to Sentry, and offer a shareable report instead of
    // silently persisting an unreachable/unauthorized connection.
    const report = await probeConnection(url.trim(), buildAuth(username, password))
    captureDiagnostic(report)
    setIsConnecting(false)
    Alert.alert(
      t("connection.shared.alerts.connectionFailedTitle"),
      t("connection.add.alerts.connectionFailedMessage", {
        summary: report.summary,
        target: url.trim(),
        error: result.error || t("connection.shared.alerts.unknownError"),
      }),
      [
        { text: t("common.ok"), style: "cancel" },
        { text: t("common.shareReport"), onPress: () => shareReport(report) },
      ],
    )
  }

  const handleJoinWaitlist = async () => {
    if (waitlistState === "submitting") return
    setWaitlistState("submitting")
    const result = await submitWaitlistSignup(waitlistEmail)
    if (result.ok) {
      setWaitlistState("joined")
      return
    }
    setWaitlistState("idle")
    if (result.fallback) {
      // API unreachable/broken: fall back to the pre-#87 mailto path so the
      // signup still reaches the support inbox instead of being lost.
      try {
        await Linking.openURL(buildWaitlistMailtoUrl(result.email))
      } catch {
        // No mail app either — tell the user instead of failing silently.
        Alert.alert(t("connection.add.waitlist.alertTitle"), t("connection.add.waitlist.fallbackMessage"))
      }
    } else {
      Alert.alert(t("connection.add.waitlist.alertTitle"), result.error)
    }
  }

  // Quick connect mode - simplified
  if (mode === "quick") {
    return (
      <ScrollView
        style={[styles.container, isDark && styles.containerDark]}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.quickHeader}>
          <Ionicons name="wifi" size={48} color={isDark ? "#ffffff" : "#0a0a0a"} />
          <Text style={[styles.quickTitle, isDark && styles.textDark]}>{t("connection.add.quick.title")}</Text>
          <Text style={[styles.quickSubtitle, isDark && styles.hintDark]}>{t("connection.add.quick.subtitle")}</Text>
        </View>

        {/* IP Address */}
        <Text style={[styles.label, isDark && styles.labelDark]}>{t("connection.add.quick.ipAddressLabel")}</Text>
        <View style={styles.ipRow}>
          <TextInput
            style={[styles.input, styles.ipInput, isDark && styles.inputDark]}
            placeholder="192.168.1.100"
            placeholderTextColor={isDark ? "#666666" : "#999999"}
            value={ip}
            onChangeText={setIp}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            testID="connect-ip-input"
          />
          <Text style={[styles.ipColon, isDark && styles.textDark]}>:</Text>
          <TextInput
            style={[styles.input, styles.portInput, isDark && styles.inputDark]}
            placeholder="4096"
            placeholderTextColor={isDark ? "#666666" : "#999999"}
            value={port}
            onChangeText={setPort}
            keyboardType="number-pad"
            testID="connect-port-input"
          />
        </View>

        {/* Optional name */}
        <Text style={[styles.label, isDark && styles.labelDark]}>{t("connection.add.quick.nameOptionalLabel")}</Text>
        <TextInput
          style={[styles.input, isDark && styles.inputDark]}
          placeholder={t("connection.add.quick.namePlaceholder")}
          placeholderTextColor={isDark ? "#666666" : "#999999"}
          value={name}
          onChangeText={setName}
        />

        {/* Password if needed */}
        <Text style={[styles.label, isDark && styles.labelDark]}>{t("connection.add.quick.passwordIfSetLabel")}</Text>
        <TextInput
          style={[styles.input, isDark && styles.inputDark]}
          placeholder={t("connection.add.quick.passwordPlaceholder")}
          placeholderTextColor={isDark ? "#666666" : "#999999"}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          testID="connect-password-input"
        />
        <Text style={[styles.usernameHint, isDark && styles.hintDark]}>
          {t("connection.add.quick.usernameHintPrefix")}
          <Text style={styles.code}>opencode</Text>
          {t("connection.add.quick.usernameHintMiddle")}
          <Text style={styles.usernameHintLink} onPress={() => setMode("advanced")}>
            {t("connection.add.quick.advancedOptionsLink")}
          </Text>
          {t("connection.add.quick.usernameHintSuffix")}
        </Text>

        {/* Connect button */}
        <TouchableOpacity
          style={[styles.connectButton, isDark && styles.connectButtonDark]}
          onPress={handleQuickConnect}
          disabled={isConnecting}
          testID="connect-submit-button"
        >
          {isConnecting ? (
            <ActivityIndicator size="small" color={isDark ? "#0a0a0a" : "#ffffff"} />
          ) : (
            <>
              <Ionicons name="flash" size={20} color={isDark ? "#0a0a0a" : "#ffffff"} />
              <Text style={[styles.connectButtonText, isDark && styles.connectButtonTextDark]}>
                {t("connection.add.quick.connectButton")}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {/* Help text */}
        <View style={[styles.helpBox, isDark && styles.helpBoxDark]}>
          <Text style={[styles.helpTitle, isDark && styles.textDark]}>{t("connection.add.quick.helpTitle")}</Text>
          <Text style={[styles.helpText, isDark && styles.hintDark]}>
            {t("connection.add.quick.helpMacPrefix")}
            {"\n"}
            <Text style={styles.code}>ipconfig getifaddr en0</Text>
          </Text>
          <Text style={[styles.helpText, isDark && styles.hintDark, { marginTop: 8 }]}>
            {t("connection.add.quick.helpTailscalePrefix")}
            {"\n"}
            <Text style={styles.code}>http://100.64.12.34:4096</Text>
            {"\n"}
            <Text style={styles.code}>http://my-mac.tailnet.ts.net:4096</Text>
          </Text>
          <Text style={[styles.helpText, isDark && styles.hintDark, { marginTop: 8 }]}>
            {t("connection.add.quick.helpProtocolPrefix")}
            <Text style={styles.code}>http://</Text>
            {t("connection.add.quick.helpProtocolMiddle")}
            <Text style={styles.code}>https://</Text>
            {t("connection.add.quick.helpProtocolSuffix")}
          </Text>
          <Text style={[styles.helpText, isDark && styles.hintDark, { marginTop: 8 }]}>
            {t("connection.add.quick.helpRunningPrefix")}
            {"\n"}
            <Text style={styles.code}>opencode serve --hostname 0.0.0.0</Text>
          </Text>
        </View>

        {/* OpenCode Connect — Coming Soon */}
        <View style={[styles.connectCard, isDark && styles.connectCardDark]}>
          <View style={styles.connectCardHeader}>
            <Ionicons name="cloud-done-outline" size={28} color="#6366f1" />
            <View style={styles.connectCardTitles}>
              <Text style={[styles.connectCardTitle, isDark && styles.textDark]}>
                {t("connection.add.quick.connectCardTitle")}
              </Text>
              <View style={styles.connectCardBadge}>
                <Text style={styles.connectCardBadgeText}>{t("connection.add.quick.connectCardBadge")}</Text>
              </View>
            </View>
          </View>
          <Text style={[styles.connectCardDesc, isDark && styles.hintDark]}>
            {t("connection.add.quick.connectCardDesc")}
          </Text>
          {waitlistState === "joined" ? (
            <View style={styles.waitlistSuccess} testID="waitlist-success">
              <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
              <Text style={[styles.waitlistSuccessText, isDark && styles.textDark]}>
                {t("connection.add.waitlist.successText")}
              </Text>
            </View>
          ) : (
            <>
              <TextInput
                style={[styles.input, isDark && styles.inputDark, { marginTop: 12 }]}
                placeholder="your@email.com"
                placeholderTextColor={isDark ? "#666666" : "#999999"}
                value={waitlistEmail}
                onChangeText={setWaitlistEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                editable={waitlistState !== "submitting"}
                testID="waitlist-email-input"
              />
              <TouchableOpacity
                style={styles.waitlistButton}
                onPress={handleJoinWaitlist}
                disabled={waitlistState === "submitting"}
                testID="waitlist-submit-button"
              >
                {waitlistState === "submitting" ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Ionicons name="mail-outline" size={16} color="#ffffff" />
                    <Text style={styles.waitlistButtonText}>{t("connection.add.waitlist.joinButton")}</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Advanced mode link */}
        <TouchableOpacity style={styles.advancedLink} onPress={() => setMode("advanced")}>
          <Text style={[styles.advancedLinkText, isDark && styles.hintDark]}>
            {t("connection.add.quick.advancedLink")}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={isDark ? "#888888" : "#666666"} />
        </TouchableOpacity>
      </ScrollView>
    )
  }

  // Advanced mode - full options
  return (
    <ScrollView
      style={[styles.container, isDark && styles.containerDark]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <TouchableOpacity style={styles.backToQuick} onPress={() => setMode("quick")}>
        <Ionicons name="chevron-back" size={16} color={isDark ? "#888888" : "#666666"} />
        <Text style={[styles.backToQuickText, isDark && styles.hintDark]}>{t("connection.add.advanced.backToQuick")}</Text>
      </TouchableOpacity>

      {/* Connection Type */}
      <Text style={[styles.label, isDark && styles.labelDark]}>{t("connection.shared.connectionType")}</Text>
      <View style={styles.typeContainer}>
        {[
          { type: "local" as const, label: t("connection.shared.types.local"), icon: "wifi" as const },
          { type: "tunnel" as const, label: t("connection.shared.types.tunnel"), icon: "globe" as const },
          { type: "cloud" as const, label: t("connection.shared.types.cloud"), icon: "cloud" as const },
        ].map((opt) => (
          <TouchableOpacity
            key={opt.type}
            style={[
              styles.typeOption,
              isDark && styles.typeOptionDark,
              type === opt.type && styles.typeOptionSelected,
              type === opt.type && isDark && styles.typeOptionSelectedDark,
            ]}
            onPress={() => setType(opt.type)}
          >
            <Ionicons
              name={opt.icon}
              size={20}
              color={type === opt.type ? (isDark ? "#0a0a0a" : "#ffffff") : isDark ? "#888888" : "#666666"}
            />
            <Text
              style={[
                styles.typeLabel,
                isDark && styles.textDark,
                type === opt.type && styles.typeLabelSelected,
                type === opt.type && isDark && styles.typeLabelSelectedDark,
              ]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Name */}
      <Text style={[styles.label, isDark && styles.labelDark]}>{t("connection.shared.name")}</Text>
      <TextInput
        style={[styles.input, isDark && styles.inputDark]}
        placeholder={t("connection.shared.namePlaceholder")}
        placeholderTextColor={isDark ? "#666666" : "#999999"}
        value={name}
        onChangeText={setName}
      />

      {/* URL */}
      <Text style={[styles.label, isDark && styles.labelDark]}>{t("connection.shared.serverUrl")}</Text>
      <TextInput
        style={[styles.input, isDark && styles.inputDark]}
        placeholder={
          type === "local"
            ? "http://192.168.1.100:4096"
            : type === "tunnel"
              ? "https://your-tunnel.trycloudflare.com"
              : "https://api.opencode.ai"
        }
        placeholderTextColor={isDark ? "#666666" : "#999999"}
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      <Text style={[styles.hint, isDark && styles.hintDark]}>
        {t("connection.add.advanced.urlHintPrefix")}
        <Text style={styles.code}>http://100.64.12.34:4096</Text>
        {t("connection.add.advanced.urlHintOr")}
        <Text style={styles.code}>http://my-mac.tailnet.ts.net:4096</Text>
        {t("connection.add.advanced.urlHintUse")}
        <Text style={styles.code}>https://</Text>
        {t("connection.add.advanced.urlHintSuffix")}
      </Text>

      {/* Directory */}
      <Text style={[styles.label, isDark && styles.labelDark]}>{t("connection.shared.directoryOptional")}</Text>
      <TextInput
        style={[styles.input, isDark && styles.inputDark]}
        placeholder="/path/to/project"
        placeholderTextColor={isDark ? "#666666" : "#999999"}
        value={directory}
        onChangeText={setDirectory}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Text style={[styles.hint, isDark && styles.hintDark]}>{t("connection.add.advanced.directoryHint")}</Text>

      {/* Auth */}
      <Text style={[styles.sectionTitle, isDark && styles.textDark]}>{t("connection.shared.authentication")}</Text>

      <Text style={[styles.label, isDark && styles.labelDark]}>{t("connection.shared.username")}</Text>
      <TextInput
        style={[styles.input, isDark && styles.inputDark]}
        placeholder="admin"
        placeholderTextColor={isDark ? "#666666" : "#999999"}
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={[styles.label, isDark && styles.labelDark]}>{t("connection.shared.password")}</Text>
      <TextInput
        style={[styles.input, isDark && styles.inputDark]}
        placeholder="password"
        placeholderTextColor={isDark ? "#666666" : "#999999"}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      {/* Save */}
      <TouchableOpacity
        style={[styles.connectButton, isDark && styles.connectButtonDark, { marginTop: 32 }]}
        onPress={handleAdvancedSave}
        disabled={isConnecting}
      >
        {isConnecting ? (
          <ActivityIndicator size="small" color={isDark ? "#0a0a0a" : "#ffffff"} />
        ) : (
          <Text style={[styles.connectButtonText, isDark && styles.connectButtonTextDark]}>
            {t("connection.add.advanced.saveButton")}
          </Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  containerDark: {
    backgroundColor: "#0a0a0a",
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  // Quick connect styles
  quickHeader: {
    alignItems: "center",
    paddingVertical: 24,
  },
  quickTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0a0a0a",
    marginTop: 16,
  },
  quickSubtitle: {
    fontSize: 15,
    color: "#666666",
    marginTop: 8,
    textAlign: "center",
  },
  ipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  ipInput: {
    flex: 1,
  },
  ipColon: {
    fontSize: 20,
    fontWeight: "600",
    color: "#0a0a0a",
  },
  portInput: {
    width: 80,
  },
  connectButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#0a0a0a",
    marginTop: 24,
  },
  connectButtonDark: {
    backgroundColor: "#ffffff",
  },
  connectButtonText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#ffffff",
  },
  connectButtonTextDark: {
    color: "#0a0a0a",
  },
  helpBox: {
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    padding: 16,
    marginTop: 24,
  },
  helpBoxDark: {
    backgroundColor: "#1a1a1a",
  },
  helpTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0a0a0a",
    marginBottom: 8,
  },
  helpText: {
    fontSize: 13,
    color: "#666666",
    lineHeight: 20,
  },
  code: {
    fontFamily: "monospace",
    backgroundColor: "#e5e5e5",
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  usernameHint: {
    fontSize: 12,
    color: "#666666",
    marginTop: 6,
    marginBottom: 4,
    lineHeight: 18,
  },
  usernameHintLink: {
    color: "#6366f1",
    fontWeight: "600",
  },
  advancedLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 16,
    marginTop: 16,
  },
  advancedLinkText: {
    fontSize: 14,
    color: "#666666",
  },
  backToQuick: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 8,
  },
  backToQuickText: {
    fontSize: 14,
    color: "#666666",
  },
  // Original styles
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0a0a0a",
    marginTop: 16,
    marginBottom: 8,
  },
  labelDark: {
    color: "#ffffff",
  },
  typeContainer: {
    flexDirection: "row",
    gap: 8,
  },
  typeOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#f5f5f5",
    gap: 6,
  },
  typeOptionDark: {
    backgroundColor: "#1a1a1a",
  },
  typeOptionSelected: {
    backgroundColor: "#0a0a0a",
  },
  typeOptionSelectedDark: {
    backgroundColor: "#ffffff",
  },
  typeLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: "#666666",
  },
  textDark: {
    color: "#ffffff",
  },
  typeLabelSelected: {
    color: "#ffffff",
  },
  typeLabelSelectedDark: {
    color: "#0a0a0a",
  },
  hint: {
    fontSize: 13,
    color: "#666666",
    marginTop: 8,
  },
  hintDark: {
    color: "#888888",
  },
  input: {
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: "#0a0a0a",
  },
  inputDark: {
    backgroundColor: "#1a1a1a",
    color: "#ffffff",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#0a0a0a",
    marginTop: 32,
    marginBottom: 8,
  },
  connectCard: {
    backgroundColor: "#f0f0ff",
    borderRadius: 12,
    padding: 16,
    marginTop: 24,
    borderWidth: 1,
    borderColor: "#c7d2fe",
  },
  connectCardDark: {
    backgroundColor: "#1e1b4b",
    borderColor: "#3730a3",
  },
  connectCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  connectCardTitles: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  connectCardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0a0a0a",
  },
  connectCardBadge: {
    backgroundColor: "#6366f1",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  connectCardBadgeText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "600",
  },
  connectCardDesc: {
    fontSize: 13,
    color: "#666666",
    lineHeight: 20,
  },
  waitlistButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#6366f1",
    marginTop: 12,
  },
  waitlistButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#ffffff",
  },
  waitlistSuccess: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
  },
  waitlistSuccessText: {
    flex: 1,
    fontSize: 13,
    color: "#0a0a0a",
    lineHeight: 20,
  },
})
