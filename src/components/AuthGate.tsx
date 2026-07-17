import { useEffect, type ReactNode } from "react"
import { View, Text, TouchableOpacity, StyleSheet, useColorScheme } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useTranslation } from "react-i18next"
import { useAuth } from "../stores/auth"

interface Props {
  children: ReactNode
}

export function AuthGate({ children }: Props) {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === "dark"
  const { t } = useTranslation()

  const { isAuthenticated, settings, hasBiometrics, biometricType, authenticate, error } = useAuth()

  // Auto-prompt the OS biometric dialog once when the lock screen appears, so users
  // aren't forced to tap "Unlock" on every cold start. If they cancel/fail, the
  // manual "Unlock" button below is the fallback.
  useEffect(() => {
    if (settings.requireBiometric && hasBiometrics && !isAuthenticated) {
      authenticate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // If biometric not required, or no biometrics available, show children
  if (!settings.requireBiometric || !hasBiometrics) {
    return <>{children}</>
  }

  // If authenticated, show children
  if (isAuthenticated) {
    return <>{children}</>
  }

  // Show auth screen
  const iconName =
    biometricType === 1 // FINGERPRINT
      ? "finger-print"
      : biometricType === 2 // FACIAL_RECOGNITION
        ? "scan"
        : "lock-closed"

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <View style={styles.content}>
        <Ionicons name={iconName} size={64} color={isDark ? "#ffffff" : "#0a0a0a"} />
        <Text style={[styles.title, isDark && styles.textDark]}>{t("authGate.title")}</Text>
        <Text style={[styles.subtitle, isDark && styles.subtitleDark]}>{t("authGate.subtitle")}</Text>

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity style={[styles.button, isDark && styles.buttonDark]} onPress={authenticate}>
          <Ionicons name={iconName} size={24} color={isDark ? "#0a0a0a" : "#ffffff"} />
          <Text style={[styles.buttonText, isDark && styles.buttonTextDark]}>{t("authGate.unlockButton")}</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
  },
  containerDark: {
    backgroundColor: "#0a0a0a",
  },
  content: {
    alignItems: "center",
    padding: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
    marginTop: 24,
    color: "#0a0a0a",
  },
  textDark: {
    color: "#ffffff",
  },
  subtitle: {
    fontSize: 16,
    color: "#666666",
    marginTop: 8,
    textAlign: "center",
  },
  subtitleDark: {
    color: "#888888",
  },
  error: {
    color: "#ef4444",
    marginTop: 16,
    fontSize: 14,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0a0a0a",
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 32,
    gap: 12,
  },
  buttonDark: {
    backgroundColor: "#ffffff",
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "600",
  },
  buttonTextDark: {
    color: "#0a0a0a",
  },
})
