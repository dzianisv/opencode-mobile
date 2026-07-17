// App-level React error boundary. Catches render-time exceptions anywhere in
// the component tree, reports them to Sentry with the React component stack,
// and presents a recovery UI that lets the user share a diagnostic report
// (logs + device info + stack) before retrying. The retry path remounts the
// children, which is enough recovery for the vast majority of render bugs;
// truly fatal cases will just re-throw and the user can share again.

import React from "react"
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { captureException } from "../lib/sentry"
import { buildCrashReport, shareReport } from "../lib/diagnostics"
import { log } from "../lib/logbuffer"
// Class component — can't use the useTranslation() hook, so resolve strings
// via the shared i18next instance directly (already initialized by the time
// this can render, since app/_layout.tsx imports it before mounting).
import i18n from "../lib/i18n/config"

interface Props {
  children: React.ReactNode
}

interface State {
  error: Error | null
  componentStack: string | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, componentStack: null }

  static getDerivedStateFromError(error: Error): State {
    return { error, componentStack: null }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    log.error("boundary", "react render crash", error.message)
    captureException(error, {
      level: "fatal",
      tags: { "crash.source": "react-boundary" },
      extra: { componentStack: info.componentStack ?? "" },
    })
    this.setState({ componentStack: info.componentStack ?? null })
  }

  handleShare = () => {
    const { error } = this.state
    if (!error) return
    const report = buildCrashReport(error, "react-boundary")
    shareReport(report).catch((e) => log.warn("boundary", "share failed", String(e)))
  }

  handleRetry = () => {
    this.setState({ error: null, componentStack: null })
  }

  render() {
    const { error, componentStack } = this.state
    if (!error) return this.props.children

    const message = error.message || i18n.t("errorBoundary.unknownError")
    const stack = (error.stack ?? "").split("\n").slice(0, 6).join("\n")
    const compStack = (componentStack ?? "").split("\n").slice(0, 6).join("\n")

    return (
      <View style={styles.root}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>{i18n.t("errorBoundary.title")}</Text>
          <Text style={styles.subtitle}>{i18n.t("errorBoundary.subtitle")}</Text>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>{i18n.t("errorBoundary.errorLabel")}</Text>
            <Text style={styles.cardBody} selectable>
              {message}
            </Text>
          </View>

          {stack ? (
            <View style={styles.card}>
              <Text style={styles.cardLabel}>{i18n.t("errorBoundary.stackLabel")}</Text>
              <Text style={styles.code} selectable>
                {stack}
              </Text>
            </View>
          ) : null}

          {compStack ? (
            <View style={styles.card}>
              <Text style={styles.cardLabel}>{i18n.t("errorBoundary.componentLabel")}</Text>
              <Text style={styles.code} selectable>
                {compStack}
              </Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <TouchableOpacity style={[styles.button, styles.buttonPrimary]} onPress={this.handleShare}>
              <Text style={styles.buttonPrimaryText}>{i18n.t("errorBoundary.shareButton")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.buttonSecondary]} onPress={this.handleRetry}>
              <Text style={styles.buttonSecondaryText}>{i18n.t("errorBoundary.tryAgainButton")}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    )
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0a0a0a" },
  content: { padding: 24, paddingTop: 80 },
  title: { color: "#ffffff", fontSize: 24, fontWeight: "700", marginBottom: 8 },
  subtitle: { color: "#a0a0a0", fontSize: 15, lineHeight: 21, marginBottom: 24 },
  card: { backgroundColor: "#1a1a1a", borderRadius: 12, padding: 16, marginBottom: 12 },
  cardLabel: { color: "#888", fontSize: 12, fontWeight: "600", textTransform: "uppercase", marginBottom: 6 },
  cardBody: { color: "#fff", fontSize: 15 },
  code: { color: "#cdd3da", fontSize: 12, fontFamily: "Courier" },
  actions: { marginTop: 16, flexDirection: "row", gap: 12 },
  button: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: "center" },
  buttonPrimary: { backgroundColor: "#3b82f6" },
  buttonSecondary: { backgroundColor: "#2a2a2a" },
  buttonPrimaryText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  buttonSecondaryText: { color: "#fff", fontSize: 16, fontWeight: "600" },
})
