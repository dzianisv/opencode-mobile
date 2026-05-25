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
import { useConnections } from "../../src/stores/connections"
import type { ConnectionType } from "../../src/lib/types"
import { probeConnection, shareReport } from "../../src/lib/diagnostics"
import { captureDiagnostic } from "../../src/lib/sentry"

export default function AddConnectionScreen() {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === "dark"

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
      Alert.alert("Error", "Please enter your computer's IP address")
      return
    }

    setIsConnecting(true)

    // Test connection first
    const result = await testConnection(
      {
        id: "",
        name: name || "My Server",
        type: "local",
        url: serverUrl,
        username: username.trim() || undefined,
      },
      password || undefined,
    )

    if (result.ok) {
      // Save and go back
      await addConnection(
        {
          name: name.trim() || "My Server",
          type: "local",
          url: serverUrl,
          username: username.trim() || undefined,
        },
        password || undefined,
      )
      setIsConnecting(false)
      router.back()
    } else {
      // Failed: run active diagnostics, capture to Sentry, offer a shareable report.
      const report = await probeConnection(
        serverUrl,
        username.trim() && password ? { username: username.trim(), password } : undefined,
      )
      captureDiagnostic(report, result.error ? new Error(result.error) : undefined)
      setIsConnecting(false)
      Alert.alert(
        "Connection Failed",
        `${report.summary}\n\nTarget: ${serverUrl}\nError: ${result.error || "Unknown error"}`,
        [
          { text: "OK", style: "cancel" },
          { text: "Share report", onPress: () => shareReport(report) },
        ],
      )
    }
  }

  const handleAdvancedSave = async () => {
    if (!name.trim()) {
      Alert.alert("Error", "Please enter a connection name")
      return
    }
    if (!url.trim()) {
      Alert.alert("Error", "Please enter a server URL")
      return
    }

    setIsConnecting(true)
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
  }

  const handleJoinWaitlist = () => {
    const email = waitlistEmail.trim()
    const subject = encodeURIComponent("OpenCode Connect Waitlist")
    const body = encodeURIComponent(email ? `Sign me up!\n\nEmail: ${email}` : "Sign me up!")
    Linking.openURL(`mailto:connect@vibebrowser.app?subject=${subject}&body=${body}`)
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
          <Text style={[styles.quickTitle, isDark && styles.textDark]}>Connect to OpenCode</Text>
          <Text style={[styles.quickSubtitle, isDark && styles.hintDark]}>
            Enter your computer's IP address to connect
          </Text>
        </View>

        {/* IP Address */}
        <Text style={[styles.label, isDark && styles.labelDark]}>IP Address</Text>
        <View style={styles.ipRow}>
          <TextInput
            style={[styles.input, styles.ipInput, isDark && styles.inputDark]}
            placeholder="192.168.1.100 or my-mac.ts.net"
            placeholderTextColor={isDark ? "#666666" : "#999999"}
            value={ip}
            onChangeText={setIp}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Text style={[styles.ipColon, isDark && styles.textDark]}>:</Text>
          <TextInput
            style={[styles.input, styles.portInput, isDark && styles.inputDark]}
            placeholder="4096"
            placeholderTextColor={isDark ? "#666666" : "#999999"}
            value={port}
            onChangeText={setPort}
            keyboardType="number-pad"
          />
        </View>

        {/* Optional name */}
        <Text style={[styles.label, isDark && styles.labelDark]}>Name (optional)</Text>
        <TextInput
          style={[styles.input, isDark && styles.inputDark]}
          placeholder="My Mac"
          placeholderTextColor={isDark ? "#666666" : "#999999"}
          value={name}
          onChangeText={setName}
        />

        {/* Password if needed */}
        <Text style={[styles.label, isDark && styles.labelDark]}>Password (if set on server)</Text>
        <TextInput
          style={[styles.input, isDark && styles.inputDark]}
          placeholder="Leave empty if none"
          placeholderTextColor={isDark ? "#666666" : "#999999"}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        {/* Connect button */}
        <TouchableOpacity
          style={[styles.connectButton, isDark && styles.connectButtonDark]}
          onPress={handleQuickConnect}
          disabled={isConnecting}
        >
          {isConnecting ? (
            <ActivityIndicator size="small" color={isDark ? "#0a0a0a" : "#ffffff"} />
          ) : (
            <>
              <Ionicons name="flash" size={20} color={isDark ? "#0a0a0a" : "#ffffff"} />
              <Text style={[styles.connectButtonText, isDark && styles.connectButtonTextDark]}>Connect</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Help text */}
        <View style={[styles.helpBox, isDark && styles.helpBoxDark]}>
          <Text style={[styles.helpTitle, isDark && styles.textDark]}>How to find your IP:</Text>
          <Text style={[styles.helpText, isDark && styles.hintDark]}>
            On your Mac, run:{"\n"}
            <Text style={styles.code}>ipconfig getifaddr en0</Text>
          </Text>
          <Text style={[styles.helpText, isDark && styles.hintDark, { marginTop: 8 }]}>
            Tailscale examples:{"\n"}
            <Text style={styles.code}>http://100.64.12.34:4096</Text>
            {"\n"}
            <Text style={styles.code}>http://my-mac.tailnet.ts.net:4096</Text>
          </Text>
          <Text style={[styles.helpText, isDark && styles.hintDark, { marginTop: 8 }]}>
            Use <Text style={styles.code}>http://</Text> for local and Tailscale addresses unless TLS is configured,
            then use <Text style={styles.code}>https://</Text>.
          </Text>
          <Text style={[styles.helpText, isDark && styles.hintDark, { marginTop: 8 }]}>
            Make sure OpenCode is running:{"\n"}
            <Text style={styles.code}>opencode serve --hostname 0.0.0.0</Text>
          </Text>
        </View>

        {/* OpenCode Connect — Coming Soon */}
        <View style={[styles.connectCard, isDark && styles.connectCardDark]}>
          <View style={styles.connectCardHeader}>
            <Ionicons name="cloud-done-outline" size={28} color="#6366f1" />
            <View style={styles.connectCardTitles}>
              <Text style={[styles.connectCardTitle, isDark && styles.textDark]}>OpenCode Connect</Text>
              <View style={styles.connectCardBadge}>
                <Text style={styles.connectCardBadgeText}>Coming Soon</Text>
              </View>
            </View>
          </View>
          <Text style={[styles.connectCardDesc, isDark && styles.hintDark]}>
            Bridge your phone to your opencode server — no tunnel setup, no firewall config. One-tap connect from
            anywhere.
          </Text>
          <TextInput
            style={[styles.input, isDark && styles.inputDark, { marginTop: 12 }]}
            placeholder="your@email.com"
            placeholderTextColor={isDark ? "#666666" : "#999999"}
            value={waitlistEmail}
            onChangeText={setWaitlistEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />
          <TouchableOpacity
            style={styles.waitlistButton}
            onPress={handleJoinWaitlist}
          >
            <Ionicons name="mail-outline" size={16} color="#ffffff" />
            <Text style={styles.waitlistButtonText}>Join Waitlist</Text>
          </TouchableOpacity>
        </View>

        {/* Advanced mode link */}
        <TouchableOpacity style={styles.advancedLink} onPress={() => setMode("advanced")}>
          <Text style={[styles.advancedLinkText, isDark && styles.hintDark]}>
            Advanced options (tunnels, cloud, auth)
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
        <Text style={[styles.backToQuickText, isDark && styles.hintDark]}>Simple mode</Text>
      </TouchableOpacity>

      {/* Connection Type */}
      <Text style={[styles.label, isDark && styles.labelDark]}>Connection Type</Text>
      <View style={styles.typeContainer}>
        {[
          { type: "local" as const, label: "Local", icon: "wifi" as const },
          { type: "tunnel" as const, label: "Tunnel", icon: "globe" as const },
          { type: "cloud" as const, label: "Cloud", icon: "cloud" as const },
        ].map((t) => (
          <TouchableOpacity
            key={t.type}
            style={[
              styles.typeOption,
              isDark && styles.typeOptionDark,
              type === t.type && styles.typeOptionSelected,
              type === t.type && isDark && styles.typeOptionSelectedDark,
            ]}
            onPress={() => setType(t.type)}
          >
            <Ionicons
              name={t.icon}
              size={20}
              color={type === t.type ? (isDark ? "#0a0a0a" : "#ffffff") : isDark ? "#888888" : "#666666"}
            />
            <Text
              style={[
                styles.typeLabel,
                isDark && styles.textDark,
                type === t.type && styles.typeLabelSelected,
                type === t.type && isDark && styles.typeLabelSelectedDark,
              ]}
            >
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Name */}
      <Text style={[styles.label, isDark && styles.labelDark]}>Name</Text>
      <TextInput
        style={[styles.input, isDark && styles.inputDark]}
        placeholder="My Server"
        placeholderTextColor={isDark ? "#666666" : "#999999"}
        value={name}
        onChangeText={setName}
      />

      {/* URL */}
      <Text style={[styles.label, isDark && styles.labelDark]}>Server URL</Text>
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
        Local/Tailscale examples: <Text style={styles.code}>http://100.64.12.34:4096</Text> or{" "}
        <Text style={styles.code}>http://my-mac.tailnet.ts.net:4096</Text>. Use <Text style={styles.code}>https://</Text>
        only when TLS is configured.
      </Text>

      {/* Directory */}
      <Text style={[styles.label, isDark && styles.labelDark]}>Project Directory (Optional)</Text>
      <TextInput
        style={[styles.input, isDark && styles.inputDark]}
        placeholder="/path/to/project"
        placeholderTextColor={isDark ? "#666666" : "#999999"}
        value={directory}
        onChangeText={setDirectory}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Text style={[styles.hint, isDark && styles.hintDark]}>
        Leave empty to use the server's current directory, or specify a path to work in a different folder.
      </Text>

      {/* Auth */}
      <Text style={[styles.sectionTitle, isDark && styles.textDark]}>Authentication</Text>

      <Text style={[styles.label, isDark && styles.labelDark]}>Username</Text>
      <TextInput
        style={[styles.input, isDark && styles.inputDark]}
        placeholder="admin"
        placeholderTextColor={isDark ? "#666666" : "#999999"}
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={[styles.label, isDark && styles.labelDark]}>Password</Text>
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
          <Text style={[styles.connectButtonText, isDark && styles.connectButtonTextDark]}>Save Connection</Text>
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
})
