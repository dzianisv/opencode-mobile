// Read-only subagent surface (#187): a collapsible Subagents section on the
// parent detail screen — one row per child session (title, agent/model, live
// status, error) plus a parent summary badge. No navigation, no management:
// rows are display-only (tap-to-inspect is out of scope).
//
// Data: childrenByParent in the sessions store (loaded on focus, updated live
// via the session.created routing in events.ts); status derived per child
// from the SSE sessionStatus map + sessionErrors record (see
// src/lib/session-children.ts). A load failure never blocks the screen — the
// section shows its own error + retry.
import { useCallback, useState } from "react"
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { useFocusEffect } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { useTranslation } from "react-i18next"
import type { Session } from "../../lib/sdk"
import { deriveChildStatus, summarizeChildren, type ChildStatus } from "../../lib/session-children"
import { useSessions } from "../../stores/sessions"
import { useEvents } from "../../stores/events"

// Pill colours match statusColor in ToolCallCard.tsx (completed green, error
// red, running amber, default grey) so the section speaks the transcript's
// existing language. Duplicated here because ToolCallCard's helper is
// module-private and this slice does not touch that file.
const PILL_COLORS: Record<ChildStatus, string> = {
  done: "#22c55e",
  failed: "#ef4444",
  running: "#f59e0b",
  idle: "#888888",
}

const WORST_DOT_COLORS: Record<string, string> = {
  failed: "#ef4444",
  running: "#f59e0b",
  done: "#22c55e",
  idle: "#888888",
}

// Same relative format as formatTime in SessionInfo.tsx (duplicated because
// that helper is module-private and this slice does not touch that file).
type Translate = ReturnType<typeof useTranslation>["t"]

function formatTime(ts: number, t: Translate): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return t("chat.sessionInfo.time.justNow")
  if (mins < 60) return t("chat.sessionInfo.time.minutesAgo", { count: mins })
  const hours = Math.floor(mins / 60)
  if (hours < 24) return t("chat.sessionInfo.time.hoursAgo", { count: hours })
  const days = Math.floor(hours / 24)
  if (days < 7) return t("chat.sessionInfo.time.daysAgo", { count: days })
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function statusLabel(status: ChildStatus, t: Translate): string {
  if (status === "running") return t("subagents.running")
  if (status === "done") return t("subagents.done")
  if (status === "failed") return t("subagents.failed")
  return t("subagents.idle")
}

interface RowProps {
  child: Session
  status: ChildStatus
  error?: string
  isDark: boolean
}

function SubagentRow({ child, status, error, isDark }: RowProps) {
  const { t } = useTranslation()
  const agentLine = child.agent ? child.agent : null
  const modelLine = child.model ? `${child.model.providerID}/${child.model.modelID}` : null
  const secondLine = [agentLine, modelLine, formatTime(child.time?.created ?? 0, t)]
    .filter((part) => part !== null && part !== "")
    .join(" · ")
  return (
    <View style={[s.row, isDark && s.rowDark]} testID={`subagent-row-${child.id}`}>
      <View style={s.rowMain}>
        <Text style={[s.rowTitle, isDark && s.textDark]} numberOfLines={1}>
          {child.title || "Untitled subagent"}
        </Text>
        {secondLine !== "" && (
          <Text style={[s.rowMeta, isDark && s.metaDark]} numberOfLines={1}>
            {secondLine}
          </Text>
        )}
        {status === "failed" && error && (
          <Text style={s.rowError} numberOfLines={2}>
            {error}
          </Text>
        )}
      </View>
      <View style={[s.pill, { backgroundColor: PILL_COLORS[status] }]}>
        <Text style={s.pillText}>{statusLabel(status, t)}</Text>
      </View>
    </View>
  )
}

const EMPTY_CHILDREN: Session[] = []

export function SubagentSection({ parentId, isDark }: { parentId: string; isDark: boolean }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const childrenByParent = useSessions((state) => state.childrenByParent)
  const children = childrenByParent[parentId] ?? EMPTY_CHILDREN
  const childrenLoading = useSessions((state) => state.childrenLoading)
  const childrenError = useSessions((state) => state.childrenError)
  const loadChildren = useSessions((state) => state.loadChildren)
  const sessionStatus = useEvents((state) => state.sessionStatus)
  const sessionErrors = useEvents((state) => state.sessionErrors)

  useFocusEffect(
    useCallback(() => {
      if (parentId) void loadChildren(parentId)
    }, [parentId, loadChildren]),
  )

  if (!parentId) return null
  const summary = summarizeChildren(children, sessionStatus, sessionErrors)
  const dotColor = summary.worst === "none" ? null : WORST_DOT_COLORS[summary.worst]
  const detailParts: string[] = []
  if (summary.running > 0) detailParts.push(`${summary.running} ${t("subagents.running")}`)
  if (summary.failed > 0) detailParts.push(`${summary.failed} ${t("subagents.failed")}`)
  if (summary.done > 0) detailParts.push(`${summary.done} ${t("subagents.done")}`)
  if (summary.idle > 0) detailParts.push(`${summary.idle} ${t("subagents.idle")}`)
  const detail = detailParts.length > 0 ? detailParts.join(" · ") : t("subagents.done")

  return (
    <View style={[s.container, isDark && s.containerDark]} testID="subagents-section">
      <TouchableOpacity
        onPress={() => setExpanded((prev) => !prev)}
        style={s.header}
        testID="subagents-header"
        accessibilityRole="button"
      >
        <Ionicons
          name={expanded ? "chevron-down-outline" : "chevron-forward-outline"}
          size={18}
          color={isDark ? "#ffffff" : "#0a0a0a"}
        />
        <Text style={[s.headerTitle, isDark && s.textDark]}>
          {t("subagents.title")} ({summary.total})
        </Text>
        {childrenLoading && <ActivityIndicator size="small" color={isDark ? "#ffffff" : "#0a0a0a"} />}
        {summary.total > 0 && dotColor && <View style={[s.dot, { backgroundColor: dotColor }]} />}
        {summary.total > 0 && (
          <Text style={[s.summary, isDark && s.metaDark]} numberOfLines={1}>
            {t("subagents.summary", { count: summary.total, detail })}
          </Text>
        )}
      </TouchableOpacity>

      {expanded &&
        (childrenError ? (
          <View style={s.body}>
            <Text style={[s.bodyText, isDark && s.metaDark]} testID="subagents-error">
              {t("subagents.loadError")}
            </Text>
            <TouchableOpacity onPress={() => void loadChildren(parentId)} testID="subagents-retry" hitSlop={8}>
              <Text style={s.retry}>{t("subagents.retry")}</Text>
            </TouchableOpacity>
          </View>
        ) : summary.total === 0 && !childrenLoading ? (
          <View style={s.body}>
            <Text style={[s.bodyText, isDark && s.metaDark]} testID="subagents-empty">
              {t("subagents.none")}
            </Text>
          </View>
        ) : (
          <View style={s.body}>
            {children.map((child) => (
              <SubagentRow
                key={child.id}
                child={child}
                status={deriveChildStatus(child, sessionStatus, sessionErrors)}
                error={sessionErrors[child.id]}
                isDark={isDark}
              />
            ))}
          </View>
        ))}
    </View>
  )
}

const s = StyleSheet.create({
  container: {
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
  },
  containerDark: {
    backgroundColor: "#0a0a0a",
    borderBottomColor: "#1a1a1a",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0a0a0a",
  },
  textDark: {
    color: "#ffffff",
  },
  metaDark: {
    color: "#666666",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  summary: {
    flex: 1,
    fontSize: 13,
    color: "#666666",
    textAlign: "right",
  },
  body: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  bodyText: {
    fontSize: 14,
    color: "#666666",
  },
  retry: {
    fontSize: 14,
    fontWeight: "600",
    color: "#3b82f6",
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
    gap: 8,
  },
  rowDark: {
    borderTopColor: "#1a1a1a",
  },
  rowMain: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 15,
    color: "#0a0a0a",
  },
  rowMeta: {
    fontSize: 13,
    color: "#666666",
  },
  rowError: {
    fontSize: 13,
    color: "#ef4444",
  },
  pill: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pillText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#ffffff",
  },
})
