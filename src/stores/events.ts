import { create } from "zustand"
import { useConnections } from "./connections"
import { useSessions } from "./sessions"
import { send as notify } from "../lib/notifications"

const MAX_NOTIF_BODY = 200
const sanitizeBody = (s: string | undefined, fallback: string): string =>
  (s ? s.replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, MAX_NOTIF_BODY) : "") || fallback
import { addBreadcrumb } from "../lib/sentry"
import type { Client, Part, Session, Message } from "../lib/sdk"

// Session status from the server
type SessionStatus = { type: "idle" } | { type: "busy" } | { type: "retry"; attempt: number; message: string }

// Tool status labels derived from part type
const TOOL_STATUS: Record<string, string> = {
  read: "Gathering context...",
  list: "Searching codebase...",
  grep: "Searching codebase...",
  glob: "Searching codebase...",
  webfetch: "Searching web...",
  edit: "Making edits...",
  write: "Making edits...",
  apply_patch: "Making edits...",
  bash: "Running command...",
  task: "Delegating...",
  todowrite: "Planning...",
  todoread: "Planning...",
}

function statusFromPart(part: Part): string {
  if (part.type === "reasoning") return "Thinking..."
  if (part.type === "tool" && part.tool) return TOOL_STATUS[part.tool] || `Running ${part.tool}...`
  if (part.type === "text") return "Writing..."
  return "Working..."
}

interface EventsState {
  connected: boolean
  reconnectAttempts: number
  lastDisconnectAt: number | null
  sessionStatus: Record<string, SessionStatus>
  statusText: Record<string, string>
  // Permissions & questions (pending per session)
  permissions: Record<
    string,
    Array<{
      id: string
      sessionID: string
      permission: string
      patterns: string[]
      metadata: Record<string, unknown>
      tool?: { messageID: string; callID: string }
    }>
  >
  questions: Record<
    string,
    Array<{
      id: string
      sessionID: string
      questions: Array<{
        question: string
        header: string
        options: Array<{ label: string; description: string }>
        multiple?: boolean
        custom?: boolean
      }>
      tool?: { messageID: string; callID: string }
    }>
  >

  connect: () => void
  disconnect: () => void
}

let controller: AbortController | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 15000] as const
const STABLE_CONNECTION_MS = 10_000
const PROLONGED_DISCONNECT_MS = 30_000

// Re-fetch pending permissions and questions from the server for a session.
// Called when entering a session to recover from missed SSE events or failed
// optimistic removals.
export async function refreshPending(client: Client, sessionID: string) {
  try {
    const [perms, questions] = await Promise.all([client.permission.list(), client.question.list()])
    const sessionPerms = (perms || []).filter((p: Record<string, unknown>) => p.sessionID === sessionID)
    const sessionQuestions = (questions || []).filter((q: Record<string, unknown>) => q.sessionID === sessionID)
    useEvents.setState((state) => ({
      permissions: { ...state.permissions, [sessionID]: sessionPerms as any },
      questions: { ...state.questions, [sessionID]: sessionQuestions as any },
    }))
  } catch (err) {
    console.warn("[Events] Failed to refresh pending:", err)
  }
}

export const useEvents = create<EventsState>((set, get) => ({
  connected: false,
  reconnectAttempts: 0,
  lastDisconnectAt: null,
  sessionStatus: {},
  statusText: {},
  permissions: {},
  questions: {},

  connect: () => {
    controller?.abort()
    controller = null
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }

    const client = useConnections.getState().client
    if (!client) return

    controller = new AbortController()
    const currentController = controller
    set({ connected: true })
    console.log("[SSE] Connecting to event stream...")
    addBreadcrumb({ category: "sse", message: "connecting" })

    // Run in background
    ;(async () => {
      let reconnectScheduled = false
      const stableTimer = setTimeout(() => {
        if (!currentController.signal.aborted) {
          set({ reconnectAttempts: 0, lastDisconnectAt: null })
        }
      }, STABLE_CONNECTION_MS)

      const scheduleReconnect = (reason: unknown) => {
        if (reconnectScheduled || currentController.signal.aborted) return
        reconnectScheduled = true
        const state = get()
        const reconnectAttempts = state.reconnectAttempts + 1
        const lastDisconnectAt = state.lastDisconnectAt ?? Date.now()
        const disconnectedFor = Date.now() - lastDisconnectAt
        set({ connected: false, reconnectAttempts, lastDisconnectAt })

        if (disconnectedFor >= PROLONGED_DISCONNECT_MS) {
          notify({
            category: "connection",
            title: "Connection interrupted",
            body: sanitizeBody(undefined, "Trying to reconnect to your server"),
            sessionId: "",
            dedupeKey: "sse-prolonged-disconnect",
            dedupeCooldownMs: 60_000,
          })
        }

        const baseDelay = RECONNECT_DELAYS_MS[Math.min(reconnectAttempts - 1, RECONNECT_DELAYS_MS.length - 1)]
        const jitteredDelay = Math.min(15_000, Math.round(baseDelay * (0.75 + Math.random() * 0.5)))
        console.warn(`[SSE] Connection lost, reconnecting in ${jitteredDelay}ms:`, reason)
        addBreadcrumb({
          category: "sse",
          level: "warning",
          message: "reconnect scheduled",
          data: { attempt: reconnectAttempts, delayMs: jitteredDelay, reason: String(reason).slice(0, 200) },
        })
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null
          get().connect()
        }, jitteredDelay)
      }

      try {
        for await (const event of client.global.events(currentController.signal)) {
          if (currentController.signal.aborted) break

          const payload = (event as any).payload || event
          const type = payload.type as string
          const props = payload.properties || {}

          switch (type) {
            case "session.status": {
              const sessionID = props.sessionID as string
              const status = props.status as SessionStatus
              if (!sessionID) break

              // Detect busy → idle transition for completion notification
              const previous = get().sessionStatus[sessionID]
              const completed = previous?.type === "busy" && status.type === "idle"

              set((state) => ({
                sessionStatus: { ...state.sessionStatus, [sessionID]: status },
                // Clear status text when idle
                statusText: status.type === "idle" ? { ...state.statusText, [sessionID]: "" } : state.statusText,
              }))

              // SSE is the source of truth — update sending state unconditionally
              if (status.type === "idle") {
                useSessions.setState((state) => ({
                  sending: { ...state.sending, [sessionID]: false },
                }))
                // Refresh messages if this is the session the user is viewing
                const sessions = useSessions.getState()
                if (sessions.currentSession?.id === sessionID) {
                  sessions.refreshMessages()
                }
              }

              if (completed) {
                const match = useSessions.getState().sessions.find((s) => s.id === sessionID)
                notify({
                  category: "completed",
                  title: "Task completed",
                  body: sanitizeBody(match?.title, "Session finished processing"),
                  sessionId: sessionID,
                })
              }
              break
            }

            case "message.updated": {
              const info = props.info as Message | undefined
              if (!info) break
              useSessions.getState().handleEvent({ type, properties: { info } } as any)
              break
            }

            case "message.part.updated": {
              const part = props.part as Part | undefined
              if (!part) break

              // Update status text from the latest part
              const sessionID = (part as any).sessionID as string
              if (sessionID) {
                set((state) => ({
                  statusText: { ...state.statusText, [sessionID]: statusFromPart(part) },
                }))
              }

              useSessions.getState().handleEvent({ type, properties: { part } } as any)
              break
            }

            case "session.updated": {
              const info = props.info as Session | undefined
              if (!info) break
              useSessions.getState().handleEvent({ type, properties: { info } } as any)
              break
            }

            case "session.created": {
              const info = props.info as Session | undefined
              if (!info) break
              // Add to sessions list
              useSessions.setState((state) => {
                const exists = state.sessions.some((s) => s.id === info.id)
                if (exists) return {}
                return { sessions: [info, ...state.sessions] }
              })
              break
            }

            case "session.error": {
              const error = props.error as { message?: string } | undefined
              const sessionID = props.sessionID as string
              if (!sessionID) break
              // Clear sending state unconditionally — SSE is truth
              useSessions.setState((state) => ({
                sending: { ...state.sending, [sessionID]: false },
                // Surface error only if user is viewing this session
                ...(state.currentSession?.id === sessionID
                  ? { error: error?.message || "Session error occurred" }
                  : {}),
              }))
              if (useSessions.getState().currentSession?.id === sessionID) {
                useSessions.getState().refreshMessages()
              }
              notify({
                category: "errors",
                title: "Session error",
                body: sanitizeBody(error?.message, "Something went wrong"),
                sessionId: sessionID,
              })
              break
            }

            case "permission.asked": {
              const req = props as any
              if (!req.id || !req.sessionID) break
              const existing = get().permissions[req.sessionID] || []
              if (existing.some((item) => item.id === req.id)) break
              set((state) => ({
                permissions: {
                  ...state.permissions,
                  [req.sessionID]: [...(state.permissions[req.sessionID] || []), req],
                },
              }))
              notify({
                category: "permissions",
                title: req.permission || "Permission requested",
                body: sanitizeBody(req.patterns?.join(", "), "A tool needs your approval"),
                sessionId: req.sessionID,
              })
              break
            }

            case "permission.replied": {
              const sessionID = props.sessionID as string
              const requestID = props.requestID as string
              if (!sessionID || !requestID) break
              set((state) => ({
                permissions: {
                  ...state.permissions,
                  [sessionID]: (state.permissions[sessionID] || []).filter((p) => p.id !== requestID),
                },
              }))
              break
            }

            case "question.asked": {
              const req = props as any
              if (!req.id || !req.sessionID) break
              const existing = get().questions[req.sessionID] || []
              if (existing.some((item) => item.id === req.id)) break
              set((state) => ({
                questions: {
                  ...state.questions,
                  [req.sessionID]: [...(state.questions[req.sessionID] || []), req],
                },
              }))
              notify({
                category: "questions",
                title: req.questions?.[0]?.header || "Input needed",
                body: sanitizeBody(req.questions?.[0]?.question, "The assistant has a question"),
                sessionId: req.sessionID,
              })
              break
            }

            case "question.replied":
            case "question.rejected": {
              const sessionID = props.sessionID as string
              const requestID = props.requestID as string
              if (!sessionID || !requestID) break
              set((state) => ({
                questions: {
                  ...state.questions,
                  [sessionID]: (state.questions[sessionID] || []).filter((q) => q.id !== requestID),
                },
              }))
              break
            }
          }
        }

        scheduleReconnect(new Error("Event stream closed"))
      } catch (err) {
        scheduleReconnect(err)
      } finally {
        clearTimeout(stableTimer)
        if (currentController.signal.aborted) {
          console.log("[SSE] Disconnected (aborted)")
        }
      }
    })()
  },

  disconnect: () => {
    console.log("[SSE] Disconnecting")
    addBreadcrumb({ category: "sse", message: "disconnected" })
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    controller?.abort()
    controller = null
    set({
      connected: false,
      reconnectAttempts: 0,
      lastDisconnectAt: null,
      sessionStatus: {},
      statusText: {},
      permissions: {},
      questions: {},
    })
  },
}))
