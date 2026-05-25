import { useEffect, useRef, useState } from "react"
import { Stack, router } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { useColorScheme, View, ActivityIndicator } from "react-native"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet"
import { useAuth } from "../src/stores/auth"
import { useConnections } from "../src/stores/connections"
import { useEvents } from "../src/stores/events"
import { useCatalog } from "../src/stores/catalog"
import { useSettings } from "../src/stores/settings"
import { AuthGate } from "../src/components/AuthGate"
import { ErrorBoundary } from "../src/components/ErrorBoundary"
import { TelemetryConsentModal } from "../src/components/TelemetryConsentModal"
import * as notifications from "../src/lib/notifications"
import { addBreadcrumb, wrap } from "../src/lib/sentry"
import { loadTelemetryConsent, setTelemetryConsent } from "../src/lib/telemetry"

const queryClient = new QueryClient()

function RootLayout() {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === "dark"

  const { initialize: initAuth, isLoading: authLoading } = useAuth()
  const { loadConnections, isLoading: connectionsLoading, client } = useConnections()
  const sseStarted = useRef(false)

  // Telemetry consent state: null = loading, 'unknown' = show modal, else decided
  const [consentState, setConsentState] = useState<"loading" | "unknown" | "decided">("loading")

  useEffect(() => {
    initAuth()
    loadConnections()
    useSettings.getState().load()

    // Connect notification preferences to the notification module
    notifications.configure(() => useSettings.getState().notifications)

    // Navigate to session when user taps a notification
    const unsubNotifications = notifications.onTap((data) => {
      router.push(`/session/${data.sessionId}`)
    })

    // Load telemetry consent — initialise Sentry only if previously granted
    loadTelemetryConsent()
      .then((state) => {
        if (state === "granted") {
          import("../src/lib/sentry").then(({ initSentry }) => {
            initSentry()
            addBreadcrumb({ category: "app.lifecycle", message: "app started" })
          })
          setConsentState("decided")
        } else if (state === "denied") {
          addBreadcrumb({ category: "app.lifecycle", message: "app started (telemetry off)" })
          setConsentState("decided")
        } else {
          setConsentState("unknown")
        }
      })
      .catch(() => {
        // SecureStore unavailable — show modal so user can decide
        setConsentState("unknown")
      })

    return unsubNotifications
  }, [])

  // Connect/disconnect SSE and load catalog when client changes
  useEffect(() => {
    if (client && !sseStarted.current) {
      sseStarted.current = true
      useEvents.getState().connect()
      useCatalog.getState().load()
    } else if (!client && sseStarted.current) {
      sseStarted.current = false
      useEvents.getState().disconnect()
    }
    return () => {
      if (sseStarted.current) {
        sseStarted.current = false
        useEvents.getState().disconnect()
      }
    }
  }, [client])

  const isLoading = authLoading || connectionsLoading || consentState === "loading"

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: isDark ? "#0a0a0a" : "#ffffff",
        }}
      >
        <ActivityIndicator size="large" color={isDark ? "#ffffff" : "#0a0a0a"} />
      </View>
    )
  }

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <BottomSheetModalProvider>
          <QueryClientProvider client={queryClient}>
            <AuthGate>
            <Stack
              screenOptions={{
                headerStyle: {
                  backgroundColor: isDark ? "#0a0a0a" : "#ffffff",
                },
                headerTintColor: isDark ? "#ffffff" : "#0a0a0a",
                contentStyle: {
                  backgroundColor: isDark ? "#0a0a0a" : "#ffffff",
                },
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen
                name="session/[id]"
                options={{
                  title: "Session",
                  presentation: "card",
                }}
              />
              <Stack.Screen
                name="connection/add"
                options={{
                  title: "Add Connection",
                  presentation: "modal",
                }}
              />
              <Stack.Screen
                name="connection/[id]"
                options={{
                  title: "Edit Connection",
                  presentation: "modal",
                }}
              />
            </Stack>
              <StatusBar style={isDark ? "light" : "dark"} />
            </AuthGate>
          </QueryClientProvider>
        </BottomSheetModalProvider>
      </GestureHandlerRootView>
      {/* Telemetry consent modal — shown once on first launch */}
      <TelemetryConsentModal
        visible={consentState === "unknown"}
        onAllow={async () => {
          await setTelemetryConsent(true)
          setConsentState("decided")
        }}
        onDecline={async () => {
          await setTelemetryConsent(false)
          setConsentState("decided")
        }}
      />
    </ErrorBoundary>
  )
}

export default wrap(RootLayout)
