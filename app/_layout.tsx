import { useEffect, useRef, useState } from "react"
import { Stack, router } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { useColorScheme, View, ActivityIndicator, AppState } from "react-native"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { KeyboardProvider } from "react-native-keyboard-controller"
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet"
import { I18nextProvider, useTranslation } from "react-i18next"
import i18n from "../src/lib/i18n/config"
import { useAuth } from "../src/stores/auth"
import { useConnections } from "../src/stores/connections"
import { useEvents } from "../src/stores/events"
import { useCatalog } from "../src/stores/catalog"
import { useSessions } from "../src/stores/sessions"
import { useSettings } from "../src/stores/settings"
import { AuthGate } from "../src/components/AuthGate"
import { ErrorBoundary } from "../src/components/ErrorBoundary"
import { TelemetryConsentModal } from "../src/components/TelemetryConsentModal"
import * as notifications from "../src/lib/notifications"
import { addBreadcrumb, wrap } from "../src/lib/sentry"
import { loadTelemetryConsent, setTelemetryConsent } from "../src/lib/telemetry"
import { initAnalytics, trackAppOpened } from "../src/lib/analytics"
import { flushPendingSignups } from "../src/lib/waitlist-queue-storage"

const queryClient = new QueryClient()

function RootLayout() {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === "dark"
  const { t } = useTranslation()

  const { initialize: initAuth, isLoading: authLoading } = useAuth()
  const { loadConnections, isLoading: connectionsLoading, client } = useConnections()
  const sseStarted = useRef(false)
  const wasBackgrounded = useRef(false)
  const sessionRestoreAttempted = useRef(false)
  const notificationOpened = useRef(false)
  const notifPermissionRequested = useRef(false)

  // Telemetry consent state: null = loading, 'unknown' = show modal, else decided
  const [consentState, setConsentState] = useState<"loading" | "unknown" | "decided">("loading")

  useEffect(() => {
    initAuth()
    loadConnections()
    useSettings.getState().load()

    // Connect notification preferences to the notification module
    notifications.configure(() => useSettings.getState().notifications)

    // Navigate to session when user taps a notification. Connection-drop
    // notifications carry no sessionId (they aren't about a session) — route
    // to the home tab instead of "/session/" (an empty, dead-end route).
    const unsubNotifications = notifications.onTap((data) => {
      notificationOpened.current = true
      if (data.sessionId) router.push(`/session/${data.sessionId}`)
      else router.push("/")
    })

    // Load telemetry consent — initialise Sentry only if previously granted
    loadTelemetryConsent()
      .then((state) => {
        if (state === "granted") {
          import("../src/lib/sentry").then(({ initSentry }) => {
            initSentry()
            addBreadcrumb({ category: "app.lifecycle", message: "app started" })
          })
          initAnalytics()
          trackAppOpened()
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

  // Restore only the last selected session reference after Android recreates
  // the process. The transcript remains server-owned and is fetched by the
  // session screen; no assistant/tool output is persisted locally.
  useEffect(() => {
    if (!client || connectionsLoading || authLoading || consentState === "loading" || sessionRestoreAttempted.current || notificationOpened.current) return
    sessionRestoreAttempted.current = true
    void useSessions.getState().loadLastSession().then((last) => {
      if (!last) return
      const connections = useConnections.getState()
      if (last.connectionID && connections.activeConnection?.id !== last.connectionID) return
      router.replace({
        pathname: "/session/[id]",
        params: { id: last.sessionID, ...(last.directory ? { directory: last.directory } : {}) },
      } as never)
    })
  }, [authLoading, client, connectionsLoading, consentState])

  // Re-arm the biometric app-lock when the app leaves the foreground. Without
  // this, "Require Biometric to Open" is bypassable: authenticate() sets
  // isAuthenticated=true once at cold start and nothing ever resets it, so the
  // app stays unlocked for the whole JS-process lifetime — anyone with brief
  // physical access can reopen a backgrounded app straight into session
  // history and connection details. lock() flips isAuthenticated back to false
  // so AuthGate shows the lock screen (and re-prompts) on next foreground.
  // Preserve the in-progress composer draft and mark the SSE transport as no
  // longer verified when the app really backgrounds. Don't tear the stream down
  // here: OpenCode continues server-side regardless, and Android may keep the
  // socket alive. On the next foreground, reconnectNow replaces a stale reader
  // immediately rather than waiting on a JS timer that Doze may have frozen.
  // Biometric locking remains restricted to the actual background transition.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "background") {
        wasBackgrounded.current = true
        void useSessions.getState().flushDrafts().catch((err) => console.warn("[Sessions] Draft flush failed:", err))
        useEvents.getState().background()
        if (useAuth.getState().settings.requireBiometric) useAuth.getState().lock()
        return
      }
      if (next === "active" && wasBackgrounded.current) {
        wasBackgrounded.current = false
        if (sseStarted.current) useEvents.getState().reconnectNow()
      }
    })
    return () => sub.remove()
  }, [])

  // Retry any waitlist signup that couldn't reach the server when the user
  // tapped Join (AGE-87). Runs at cold start and on every foreground, which is
  // the cheapest reliable proxy for "connectivity may have come back" — it is a
  // no-op (single storage read, no network) when the queue is empty, and it
  // replaces the old silent mailto: fallback that lost 20 of 21 signups.
  useEffect(() => {
    const flush = () => {
      void flushPendingSignups()
        .then((outcome) => {
          if (outcome.synced.length > 0) {
            addBreadcrumb({ category: "waitlist", message: `retried ${outcome.synced.length} queued signup(s)` })
          }
        })
        .catch(() => {
          // Best effort: the entry stays queued for the next foreground.
        })
    }
    flush()
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") flush()
    })
    return () => sub.remove()
  }, [])

  // Connect/disconnect SSE and load catalog when client changes
  useEffect(() => {
    if (client && !sseStarted.current) {
      sseStarted.current = true
      useEvents.getState().connect()
      useCatalog.getState().load()
      // Request OS notification permission once we have a live connection —
      // the in-context moment the user will start running agent tasks they'll
      // want to be pinged about. Previously this was only ever requested when
      // a user manually toggled a notification switch off→on in Settings; since
      // most categories default on, that path never fired for typical users
      // and send() silently no-op'd on every notification (permission stayed
      // "undetermined"). setup() is idempotent — it won't re-prompt once the
      // OS has a decision — so the ref just avoids redundant calls per session.
      if (!notifPermissionRequested.current) {
        notifPermissionRequested.current = true
        void notifications.setup()
      }
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
      {/* react-native-keyboard-controller: drives keyboard avoidance from
          native WindowInsets instead of the legacy RN Keyboard events, which
          misreport under Android's mandatory edge-to-edge mode (Expo SDK 54). */}
      <KeyboardProvider>
      <I18nextProvider i18n={i18n}>
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
                  title: t("session.titleFallback"),
                  presentation: "card",
                }}
              />
              <Stack.Screen
                name="connection/add"
                options={{
                  title: t("nav.addConnectionTitle"),
                  presentation: "modal",
                }}
              />
              <Stack.Screen
                name="connection/[id]"
                options={{
                  title: t("nav.editConnectionTitle"),
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
      </I18nextProvider>
      </KeyboardProvider>
    </ErrorBoundary>
  )
}

export default wrap(RootLayout)
