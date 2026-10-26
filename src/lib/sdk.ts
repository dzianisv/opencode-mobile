// SDK client wrapper for React Native — opencode v2 server API.
// We create our own lightweight client that mirrors the opencode SDK patterns
// but works in React Native environment
// expo/fetch provides WinterCG-compliant fetch with ReadableStream support for SSE
//
// v2 notes (see docs/v2-api-map.md): every endpoint lives under /api/, list
// responses are {data, cursor} envelopes, SSE emits typed execution events,
// and location scoping travels as a `location[directory]` query param (the
// legacy x-opencode-directory header still works, so headers.ts is unchanged).
// All v2 -> internal-shape conversion lives in v2-shape.ts so it stays
// unit-testable outside RN.
import { fetch as expoFetch } from "expo/fetch"
import { buildRequestHeaders } from "./headers"
import { SSEParser } from "./sse"
import { apiErrorFor, isAuthStatus } from "./api-error"
import { loadSessionList } from "./session-list"
import { v2PromptBody } from "./composer-prompt"
import { readWithIdleTimeout, SSE_IDLE_TIMEOUT_MS } from "./sse-lifecycle"
import { permissionReplyRequest } from "./permissions"
import { normalizeSessionStatusResponse } from "./session-status"
import type { FileRoot } from "./file-roots"
import { createV1Client } from "./sdk-v1"
import { detectServerApi, type ProbeRequest, type ServerApi, type ServerIdentity } from "./api-detect"
import {
  formAnswerFromFields,
  pendingRequestInfo,
  rememberForm,
  rememberPermissionRequest,
  toAgent,
  toCommand,
  toFileEntries,
  toMessageWithParts,
  toPermissionRequest,
  toProject,
  toProviderCatalog,
  toQuestionRequest,
  toSession,
  V2EventTranslator,
  type V2AgentInfo,
  type V2CommandInfo,
  type V2FormInfo,
  type V2FsEntry,
  type V2LocationRef,
  type V2Message,
  type V2ModelInfo,
  type V2PermissionRequest,
  type V2ProjectInfo,
  type V2ProviderInfo,
  type V2RawEvent,
  type V2SessionInfo,
} from "./v2-shape"

export { ApiAuthError, isAuthError } from "./api-error"

export interface ClientConfig {
  baseUrl: string
  directory?: string
  auth?: {
    username: string
    password: string
  }
  // Which server API this connection speaks, as recorded by probeServer().
  // Omitted preserves the legacy v1 transport until a successful probe records
  // the protocol; "v1" routes to the legacy client in
  // sdk-v1.ts, which speaks the pre-1.19 routes (/session, /global/event,
  // /question, /permission) that the v2 server no longer serves.
  api?: ServerApi
}

export interface Session {
  id: string
  slug: string
  projectID: string
  directory: string
  parentID?: string
  title: string
  version: string
  share?: { url: string }
  time: {
    created: number
    updated: number
    compacting?: number
    archived?: number
  }
  summary?: {
    additions: number
    deletions: number
    files: number
  }
  cost?: number
  tokens?: {
    input: number
    output: number
    reasoning?: number
    cache?: { read: number; write: number }
  }
  // Present while a message (and everything after it) is pending revert —
  // v2 keeps the staged boundary until the next prompt commits it or
  // session.unrevert (DELETE revert) discards it.
  revert?: {
    messageID: string
    partID?: string
  }
}

export interface Message {
  id: string
  sessionID: string
  role: "user" | "assistant"
  parentID?: string
  time: {
    created: number
    completed?: number
  }
  // User message fields
  agent?: string
  model?: { providerID: string; modelID: string }
  // Assistant message fields
  modelID?: string
  providerID?: string
  cost?: number
  tokens?: {
    input: number
    output: number
    reasoning?: number
    cache?: { read: number; write: number }
  }
  error?: { message: string }
  finish?: string
}

// API returns messages with parts embedded
export interface MessageWithParts {
  info: Message
  parts: Part[]
}

export interface Part {
  id: string
  sessionID?: string
  messageID: string
  type:
    | "text"
    | "reasoning"
    | "tool"
    | "file"
    | "snapshot"
    | "patch"
    | "step-start"
    | "step-finish"
    | "subtask"
    | "retry"
    | "compaction"
    | "agent"
  // Text / reasoning part
  text?: string
  // Tool part
  tool?: string
  callID?: string
  state?: {
    status: "pending" | "running" | "completed" | "error"
    input?: unknown
    output?: unknown
    title?: string
    error?: { message: string }
    time?: { start?: number; end?: number }
  }
  // Timing
  time?: { start?: number; end?: number }
  // File part
  mime?: string
  url?: string
  filename?: string
}

export interface Agent {
  name: string
  description?: string
  mode: "subagent" | "primary" | "all"
  native?: boolean
  hidden?: boolean
  topP?: number
  temperature?: number
  color?: string
  model?: { modelID: string; providerID: string }
  prompt?: string
  options: Record<string, unknown>
  steps?: number
}

export interface Command {
  name: string
  description?: string
  agent?: string
  model?: string
  mcp?: boolean
  template: string
  subtask?: boolean
  hints: string[]
}

export interface Project {
  id: string
  name?: string
  path: {
    cwd: string
    root: string
    absolute: string
  }
}

export interface FileEntry {
  name: string
  path: string
  absolute: string
  type: "file" | "directory"
  ignored: boolean
}

export interface Event {
  type: string
  properties: Record<string, unknown>
}

export interface HealthResponse {
  healthy: boolean
  version: string
}

const REQUEST_TIMEOUT_MS = 30_000

// Thrown by request() on a non-2xx, non-auth response. Carries the HTTP status
// so callers can distinguish e.g. 404 (older server, endpoint missing) or 409
// (session busy) from other failures without parsing the message string.
export class ApiError extends Error {
  status: number
  constructor(status: number, body: string) {
    super(`API Error: ${status} - ${body}`)
    this.name = "ApiError"
    this.status = status
  }
}

function createHeaders(config: ClientConfig): HeadersInit {
  return buildRequestHeaders(config)
}

// v2 location-scoped endpoints take the directory as a bracketed query param:
// `location[directory]=/path/to/dir` (verified against a live v2 server).
function locationQuery(directory?: string): string {
  return directory ? `location%5Bdirectory%5D=${encodeURIComponent(directory)}` : ""
}

function appendQuery(path: string, query: string): string {
  if (!query) return path
  return `${path}${path.includes("?") ? "&" : "?"}${query}`
}

// `timeoutMs` lets specific callers (e.g. the onboarding health-check) fail
// faster than the general REQUEST_TIMEOUT_MS used by real session calls.
// Leave it unset to get the default.
async function request<T>(
  config: ClientConfig,
  path: string,
  options: RequestInit = {},
  timeoutMs?: number,
): Promise<T> {
  const url = `${config.baseUrl}${path}`
  const headers = { ...createHeaders(config), ...options.headers }
  const response = await fetchWithTimeout(
    url,
    {
      ...options,
      headers,
    },
    timeoutMs,
  )

  if (!response.ok) {
    const error = await response.text()
    const message = `API Error: ${response.status} - ${error}`
    throw isAuthStatus(response.status) ? apiErrorFor(response.status, message) : new ApiError(response.status, message)
  }

  // Several v2 endpoints answer 204/empty (model/agent selection, form &
  // permission replies) — parsing "" as JSON would throw.
  const body = await response.text()
  if (!body) return undefined as T
  return JSON.parse(body)
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs: number = REQUEST_TIMEOUT_MS): Promise<Response> {
  const parentSignal = options.signal
  if (parentSignal?.aborted) throw new Error("Request aborted")

  const controller = new AbortController()
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const onParentAbort = () => controller.abort()
  parentSignal?.addEventListener("abort", onParentAbort)

  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch (error) {
    if (timedOut) {
      throw new Error(`Request timed out after ${timeoutMs}ms`)
    }
    throw error
  } finally {
    clearTimeout(timeout)
    parentSignal?.removeEventListener("abort", onParentAbort)
  }
}

function createV2Client(config: ClientConfig) {
  // Normalize once: a trailing slash on baseUrl (e.g. pasted into Advanced
  // mode or the Edit screen) would otherwise survive into every
  // `${config.baseUrl}${path}` concatenation below as a double slash, which
  // every request then fails against (while the diagnostics probe, which
  // reconstructs a clean URL, reports "works now"). A bare URL with no
  // trailing slash is untouched.
  config = { ...config, baseUrl: config.baseUrl.replace(/\/+$/, "") }
  const translator = new V2EventTranslator()
  const loc = () => locationQuery(config.directory)

  const getSession = async (sessionID: string): Promise<Session> => {
    const body = await request<{ data: V2SessionInfo }>(config, `/api/session/${sessionID}`)
    return toSession(body.data)
  }

  return {
    global: {
      // GET /api/info reports server identity/readiness — any 2xx means healthy.
      health: async (timeoutMs?: number): Promise<HealthResponse> => {
        const info = await request<{ version?: string }>(config, "/api/info", {}, timeoutMs)
        return { healthy: true, version: info.version ?? "" }
      },
      // SSE event stream - returns async iterator
      // Pass an AbortSignal to cancel the connection
      async *events(signal?: AbortSignal): AsyncGenerator<Event> {
        const url = `${config.baseUrl}/api/event`
        const headers = createHeaders(config)
        // Remove Content-Type for SSE (it's text/event-stream)
        delete (headers as Record<string, string>)["Content-Type"]

        // Must use expo/fetch for ReadableStream support on native
        const response = await expoFetch(url, { headers, signal })
        if (!response.ok || !response.body) {
          throw apiErrorFor(response.status, `Failed to connect to event stream: ${response.status}`)
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        const parser = new SSEParser()
        translator.reset()

        let receivedFirstByte = false
        try {
          while (true) {
            const chunk = await readWithIdleTimeout(reader)
            if (chunk === "idle") {
              console.warn(`[SSE] no data for ${SSE_IDLE_TIMEOUT_MS / 1000}s (server heartbeats every 15s) — dropping dead stream`)
              void reader.cancel?.().catch(() => {})
              throw new Error("Event stream idle — no heartbeat received")
            }
            const { done, value } = chunk
            if (done) {
              console.log("[SSE] stream ended")
              break
            }

            if (!receivedFirstByte) {
              receivedFirstByte = true
              console.log(`[SSE] first byte received (${value?.byteLength ?? 0} bytes)`)
            }

            for (const data of parser.push(decoder.decode(value, { stream: true }))) {
              try {
                const raw = JSON.parse(data) as V2RawEvent
                for (const translated of translator.translate(raw)) {
                  yield translated
                }
              } catch (err) {
                console.warn("[SSE] Failed to parse event", {
                  length: data.length,
                  error: err instanceof Error ? err.message : String(err),
                })
              }
            }
          }
        } finally {
          reader.releaseLock()
        }
      },
    },

    project: {
      // Bare array on v2 (no envelope).
      list: async (): Promise<Project[]> => {
        const body = await request<V2ProjectInfo[]>(config, "/api/project")
        return (body || []).map(toProject)
      },
      current: async (): Promise<Project> => {
        const info = await request<{ directory: string; project?: { id: string; directory: string; canonical: string } }>(
          config,
          appendQuery("/api/location", loc()),
        )
        return {
          id: info.project?.id ?? "",
          name: info.project?.canonical ?? info.directory,
          path: {
            cwd: info.directory,
            root: info.project?.canonical ?? info.directory,
            absolute: info.directory,
          },
        }
      },
    },

    // Server-side filesystem browsing, scoped to this client's directory
    // (see ClientConfig.directory / location query param). Use
    // clientForDirectory(dir) to get a client rooted at a specific folder,
    // then list(".") to enumerate its immediate children.
    file: {
      list: async (params: { path?: string } = {}): Promise<FileEntry[]> => {
        const query = new URLSearchParams({ path: params.path ?? "." })
        const body = await request<{ location?: V2LocationRef; data: V2FsEntry[] }>(
          config,
          `/api/fs/list?${query.toString()}${loc() ? `&${loc()}` : ""}`,
        )
        return toFileEntries(body.location, body.data || [])
      },
      // v2 has no filesystem-roots endpoint — resolve null so the directory
      // browser falls back to manual path entry (same as pre-roots servers).
      roots: async (): Promise<FileRoot[] | null> => null,
    },

    path: {
      // v2 exposes the resolved location; there is no separate home/state
      // config, so `home` falls back to the server's current directory (used
      // by the directory browser only to expand `~`).
      get: async () => {
        const info = await request<{ directory: string; project?: { id: string; directory: string; canonical: string } }>(
          config,
          appendQuery("/api/location", loc()),
        )
        return {
          home: info.directory,
          state: "",
          config: "",
          worktree: info.project?.canonical ?? info.directory,
          directory: info.directory,
        }
      },
    },

    session: {
      // v2 GET /api/session without a directory filter returns sessions across
      // every project (verified live), so it plays the role of the old global
      // experimental endpoint. Shaping (roots filter, search, sort, limit)
      // still happens client-side in loadSessionList — fetch a generous pool
      // because the server applies `limit` before we can filter.
      list: (params?: { roots?: boolean; limit?: number; search?: string }): Promise<Session[]> =>
        loadSessionList(
          {
            getExperimental: async (): Promise<Session[] | null> => {
              const response = await fetchWithTimeout(`${config.baseUrl}/api/session?limit=500&order=desc`, {
                headers: createHeaders(config),
              })
              // v1 servers lack /api/session — signal fallback to legacy /session.
              if (response.status === 404) return null
              if (!response.ok) {
                const body = await response.text()
                throw apiErrorFor(response.status, `API Error: ${response.status} - ${body}`)
              }
              const body = (await response.json()) as { data?: V2SessionInfo[] }
              return (body.data || []).map(toSession)
            },
            // Legacy fallback only runs against v1 servers, whose /session
            // response is already in this app's Session shape — pass through.
            getLegacy: (query) => request<Session[]>(config, `/session${query}`),
          },
          params,
        ),

      get: getSession,

      status: async (): Promise<Record<string, { type: "idle" | "busy" | "retry"; attempt?: number; message?: string }> | null> => {
        try {
          // Present on the latest stable v1.19.x HTTP API and current v2 API.
          const body = await request<unknown>(config, appendQuery("/api/session/status", loc()))
          return normalizeSessionStatusResponse(body)
        } catch (err) {
          if (!(err instanceof ApiError) || err.status !== 404) throw err
          // Early v2 builds exposed an active-only map instead. A missing
          // session in that response is idle; keep this 404-only fallback.
          try {
            const body = await request<{ data?: Record<string, { type?: string; attempt?: number; message?: string }> }>(
              config,
              appendQuery("/api/session/active", loc()),
            )
            return Object.fromEntries(Object.entries(body.data || {}).map(([sessionID, value]) => [
              sessionID,
              value.type === "retry"
                ? { type: "retry" as const, attempt: value.attempt, message: value.message }
                : { type: "busy" as const },
            ]))
          } catch (fallbackError) {
            if (fallbackError instanceof ApiError && fallbackError.status === 404) return null
            throw fallbackError
          }
        }
      },

      create: async (params?: { title?: string }): Promise<Session> => {
        const body = await request<{ data: V2SessionInfo }>(config, "/api/session", {
          method: "POST",
          body: JSON.stringify(params || {}),
        })
        return toSession(body.data)
      },

      delete: (sessionID: string) => request<void>(config, `/api/session/${sessionID}`, { method: "DELETE" }),

      // PATCH only answers 204 on v2 — re-fetch so callers get the updated
      // Session like v1 did.
      update: async (sessionID: string, params: { title?: string; time?: { archived?: number } }): Promise<Session> => {
        await request<void>(config, `/api/session/${sessionID}`, {
          method: "PATCH",
          body: JSON.stringify({ title: params.title }),
        })
        return getSession(sessionID)
      },

      // v2 pages newest-first with order=desc; the app's store is oldest-first,
      // so every page is reversed. With no limit, follow cursor.next until the
      // timeline is exhausted (loadOlderMessages wants ALL messages).
      messages: async (sessionID: string, params?: { limit?: number }): Promise<MessageWithParts[]> => {
        if (params?.limit) {
          const body = await request<{ data: V2Message[] }>(
            config,
            `/api/session/${sessionID}/message?order=desc&limit=${params.limit}`,
          )
          return toMessageWithParts(body.data || []).reverse()
        }
        const all: V2Message[] = []
        let cursor: string | null = null
        for (let page = 0; page < 50; page++) {
          // v2 rejects cursor+order together — the cursor already encodes direction.
          const qs: string = cursor ? `cursor=${encodeURIComponent(cursor)}` : "order=desc"
          const body: { data: V2Message[]; cursor?: { next?: string | null } } = await request<{ data: V2Message[]; cursor?: { next?: string | null } }>(
            config,
            `/api/session/${sessionID}/message?${qs}`,
          )
          all.push(...(body.data || []))
          cursor = body.cursor?.next ?? null
          if (!cursor) break
        }
        return toMessageWithParts(all).reverse()
      },

      // Sends a message and returns the response
      // Fire-and-forget async prompt - SSE events drive all real-time updates.
      // v2 model/agent selection is session state, applied before the prompt;
      // a staged revert (from "edit message") is committed automatically by the
      // next prompt (verified live), so no explicit commit call is needed.
      prompt: async (
        sessionID: string,
        params: {
          parts: Array<{ type: "text"; text: string } | { type: "file"; mime: string; url: string; filename?: string }>
          model?: { providerID: string; modelID: string }
          agent?: string
          variant?: string
        },
      ): Promise<void> => {
        if (params.model) {
          await request<void>(config, `/api/session/${sessionID}/model`, {
            method: "POST",
            body: JSON.stringify({
              model: {
                id: params.model.modelID,
                providerID: params.model.providerID,
                ...(params.variant ? { variant: params.variant } : {}),
              },
            }),
          })
        }
        if (params.agent) {
          await request<void>(config, `/api/session/${sessionID}/agent`, {
            method: "POST",
            body: JSON.stringify({ agent: params.agent }),
          })
        }
        const text = params.parts
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join("\n")
        const files = params.parts
          .filter((p): p is { type: "file"; mime: string; url: string; filename?: string } => p.type === "file")
          .map((p) => ({ uri: p.url, ...(p.filename ? { name: p.filename } : {}) }))
        await request(config, `/api/session/${sessionID}/prompt`, {
          method: "POST",
          body: JSON.stringify({ text, files }),
        })
      },

      command: async (
        sessionID: string,
        params: {
          command: string
          arguments: string
          agent?: string
          model?: string
          variant?: string
          parts?: Array<{ type: "file"; mime: string; url: string; filename?: string }>
        },
      ): Promise<void> => {
        await request(config, `/api/session/${sessionID}/command`, {
          method: "POST",
          body: JSON.stringify({
            name: params.command,
            text: params.arguments,
            files: (params.parts || []).map((p) => ({ uri: p.url, ...(p.filename ? { name: p.filename } : {}) })),
          }),
        })
      },

      // v2 replaces abort with interrupt (POST returns {interrupted}).
      abort: async (sessionID: string): Promise<boolean> => {
        const body = await request<{ interrupted?: boolean }>(config, `/api/session/${sessionID}/interrupt`, {
          method: "POST",
        })
        return Boolean(body.interrupted)
      },

      // v2 diff is turn-based (from/to), no messageID scoping needed —
      // callers get the session's structured per-file diffs.
      diff: async (sessionID: string): Promise<unknown[]> => {
        const body = await request<{ data: unknown[] }>(config, `/api/session/${sessionID}/diff`)
        return body.data || []
      },

      // Stages a reversible session boundary at messageID. The underlying
      // messages aren't deleted until the next prompt commits the revert, or
      // unrevert() below discards it. The stage endpoint answers with the
      // boundary itself, so re-fetch the session for its updated `revert`.
      revert: async (sessionID: string, messageID: string): Promise<Session> => {
        await request(config, `/api/session/${sessionID}/revert/stage`, {
          method: "POST",
          body: JSON.stringify({ messageID }),
        })
        return getSession(sessionID)
      },

      unrevert: async (sessionID: string): Promise<Session> => {
        await request<void>(config, `/api/session/${sessionID}/revert`, { method: "DELETE" })
        return getSession(sessionID)
      },
    },

    permission: {
      // v2 permission requests are session-scoped; refreshPending always knows
      // the session it's refreshing, so prefer the session endpoint and only
      // hit the location-global one as a fallback.
      list: async (sessionID?: string) => {
        const path = sessionID ? `/api/session/${sessionID}/permission` : appendQuery("/api/permission/request", loc())
        const body = await request<{ data: V2PermissionRequest[] }>(config, path)
        const out = (body.data || []).map((p) => {
          rememberPermissionRequest(p)
          return toPermissionRequest(p)
        })
        return out
      },

      reply: async (requestID: string, reply: "once" | "always" | "reject"): Promise<boolean> => {
        const known = pendingRequestInfo(requestID)
        if (!known) throw new Error(`Unknown permission request: ${requestID}`)
        const endpoint = permissionReplyRequest("v2", requestID, reply, known.sessionID)
        try {
          await request<void>(config, endpoint.path, {
            method: "POST",
            body: JSON.stringify(endpoint.body),
          })
        } catch (error) {
          // v2.0.16 used `decision`; newer PermissionV2 builds use `reply`.
          // Retry only schema-validation responses, never auth/network errors.
          if (!(error instanceof ApiError) || (error.status !== 400 && error.status !== 422)) throw error
          await request<void>(config, endpoint.path, {
            method: "POST",
            body: JSON.stringify({ reply }),
          })
        }
        return true
      },
    },

    question: {
      // v2 calls these "forms"; they map 1:1 onto the app's question prompts.
      list: async (sessionID?: string) => {
        const path = sessionID ? `/api/session/${sessionID}/form` : appendQuery("/api/form", loc())
        const body = await request<{ data: V2FormInfo[] }>(config, path)
        const out = (body.data || []).map((f) => {
          rememberForm(f)
          return toQuestionRequest(f)
        })
        return out
      },

      reply: async (requestID: string, answers: string[][]): Promise<boolean> => {
        const known = pendingRequestInfo(requestID)
        if (!known) throw new Error(`Unknown question request: ${requestID}`)
        await request<void>(config, `/api/session/${known.sessionID}/form/${requestID}/reply`, {
          method: "POST",
          body: JSON.stringify({ answer: formAnswerFromFields(known.fields, answers) }),
        })
        return true
      },

      reject: async (requestID: string): Promise<boolean> => {
        const known = pendingRequestInfo(requestID)
        if (!known) throw new Error(`Unknown question request: ${requestID}`)
        await request<void>(config, `/api/session/${known.sessionID}/form/${requestID}`, { method: "DELETE" })
        return true
      },
    },

    agent: {
      list: async (): Promise<Agent[]> => {
        const body = await request<{ data: V2AgentInfo[] }>(config, appendQuery("/api/agent", loc()))
        return (body.data || []).map(toAgent)
      },
    },

    command: {
      list: async (): Promise<Command[]> => {
        const body = await request<{ data: V2CommandInfo[] }>(config, appendQuery("/api/command", loc()))
        return (body.data || []).map(toCommand)
      },
    },

    provider: {
      list: async () => {
        // Models are location-scoped; without a configured directory, resolve
        // the server's active location so the model catalog is never empty.
        let location = loc()
        if (!location) {
          try {
            const here = await request<{ directory: string }>(config, "/api/location")
            location = locationQuery(here.directory)
          } catch {
            // leave unscoped — provider list alone still renders something
          }
        }
        const [providers, models, defaultModel] = await Promise.all([
          request<{ data: V2ProviderInfo[] }>(config, appendQuery("/api/provider", location)),
          request<{ data: V2ModelInfo[] }>(config, appendQuery("/api/model", location)),
          request<{ data: V2ModelInfo | null }>(config, appendQuery("/api/model/default", location)),
        ])
        return toProviderCatalog(providers.data || [], models.data || [], defaultModel.data ?? null)
      },
    },

    config: {
      get: () => request<unknown>(config, "/api/config"),
    },
  }
}

export type Client = ReturnType<typeof createV2Client>

// --- v1 / v2 transport dispatch ---------------------------------------------
// `npm install -g opencode-ai` still installs the v1 line (1.18.32 as of
// 2026-09-24), so a server that predates the /api/ rewrite is the common case,
// not an edge case. probeServer() decides which transport a connection uses;
// the answer is stored on the connection (ServerConnection.api) so every client
// built from it — including the per-directory ones from clientForDirectory —
// gets the same one without re-probing.
export function createClient(config: ClientConfig): Client {
  if (config.api === "v1") {
    // Both clients implement the same runtime contract. The cast covers the one
    // place their types differ nominally: v1's /question and /permission lists
    // hand back untyped records, while the v2 mapper produces shaped requests —
    // and events.ts already treats both as records in refreshPending().
    return createV1Client(config) as unknown as Client
  }
  return createV2Client(config)
}

// A probe is a diagnostic, not a session call: it should answer in about a
// second on a LAN and give up before the onboarding flow's own timeout.
const PROBE_TIMEOUT_MS = 8_000

/** Probe a connection and report which server API it speaks (see api-detect.ts). */
export async function probeServer(config: ClientConfig): Promise<ServerIdentity> {
  const normalized: ClientConfig = { ...config, baseUrl: config.baseUrl.replace(/\/+$/, "") }
  const headers = createHeaders(normalized)
  const probe: ProbeRequest = async (path) => {
    const response = await fetchWithTimeout(`${normalized.baseUrl}${path}`, { headers }, PROBE_TIMEOUT_MS)
    const contentType = response.headers.get("content-type") ?? ""
    const body = await response.text().catch(() => "")
    return { status: response.status, contentType, body }
  }
  return detectServerApi(probe)
}
