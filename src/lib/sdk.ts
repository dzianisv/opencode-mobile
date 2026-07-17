// SDK client wrapper for React Native
// We create our own lightweight client that mirrors the opencode SDK patterns
// but works in React Native environment
// expo/fetch provides WinterCG-compliant fetch with ReadableStream support for SSE
import { fetch as expoFetch } from "expo/fetch"
import { buildRequestHeaders } from "./headers"
import { SSEParser } from "./sse"
import { apiErrorFor } from "./api-error"

export { ApiAuthError, isAuthError } from "./api-error"

export interface ClientConfig {
  baseUrl: string
  directory?: string
  auth?: {
    username: string
    password: string
  }
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
  // Present while a message (and everything after it) is pending revert —
  // the server keeps the underlying messages until the next prompt/summarize
  // call runs cleanup (or the revert is undone via session.unrevert).
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

// Thrown by request() on a non-2xx response. Carries the HTTP status so
// callers can distinguish e.g. 404 (older server, endpoint missing) from
// other failures without parsing the message string.
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

async function request<T>(config: ClientConfig, path: string, options: RequestInit = {}): Promise<T> {
  const url = `${config.baseUrl}${path}`
  const headers = { ...createHeaders(config), ...options.headers }
  const response = await fetchWithTimeout(url, {
    ...options,
    headers,
  })

  if (!response.ok) {
    const error = await response.text()
    throw apiErrorFor(response.status, `API Error: ${response.status} - ${error}`)
  }

  return response.json()
}

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const parentSignal = options.signal
  if (parentSignal?.aborted) throw new Error("Request aborted")

  const controller = new AbortController()
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, REQUEST_TIMEOUT_MS)
  const onParentAbort = () => controller.abort()
  parentSignal?.addEventListener("abort", onParentAbort)

  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch (error) {
    if (timedOut) {
      throw new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms`)
    }
    throw error
  } finally {
    clearTimeout(timeout)
    parentSignal?.removeEventListener("abort", onParentAbort)
  }
}

export function createClient(config: ClientConfig) {
  return {
    global: {
      health: () => request<HealthResponse>(config, "/global/health"),
      // SSE event stream - returns async iterator
      // Pass an AbortSignal to cancel the connection
      async *events(signal?: AbortSignal): AsyncGenerator<Event> {
        const url = `${config.baseUrl}/global/event`
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

        let receivedFirstByte = false
        try {
          while (true) {
            const { done, value } = await reader.read()
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
                yield JSON.parse(data)
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
      list: () => request<Project[]>(config, "/project"),
      current: () => request<Project>(config, "/project/current"),
    },

    // Server-side filesystem browsing, scoped to this client's directory
    // (see ClientConfig.directory / x-opencode-directory header). Use
    // clientForDirectory(dir) to get a client rooted at a specific folder,
    // then list("." ) to enumerate its immediate children.
    file: {
      list: (params: { path?: string } = {}) => {
        const query = new URLSearchParams({ path: params.path ?? "." })
        return request<FileEntry[]>(config, `/file?${query.toString()}`)
      },
    },

    path: {
      get: () =>
        request<{ home: string; state: string; config: string; worktree: string; directory: string }>(config, "/path"),
    },

    session: {
      list: (params?: { roots?: boolean; limit?: number; search?: string }) => {
        const query = new URLSearchParams()
        if (params?.roots) query.set("roots", "true")
        if (params?.limit) query.set("limit", String(params.limit))
        if (params?.search) query.set("search", params.search)
        const qs = query.toString()
        return request<Session[]>(config, `/session${qs ? `?${qs}` : ""}`)
      },

      get: (sessionID: string) => request<Session>(config, `/session/${sessionID}`),

      create: (params?: { title?: string }) =>
        request<Session>(config, "/session", {
          method: "POST",
          body: JSON.stringify(params || {}),
        }),

      delete: (sessionID: string) => request<void>(config, `/session/${sessionID}`, { method: "DELETE" }),

      update: (sessionID: string, params: { title?: string; time?: { archived?: number } }) =>
        request<Session>(config, `/session/${sessionID}`, {
          method: "PATCH",
          body: JSON.stringify(params),
        }),

      messages: (sessionID: string, params?: { limit?: number }) => {
        const query = new URLSearchParams()
        if (params?.limit) query.set("limit", String(params.limit))
        const qs = query.toString()
        return request<MessageWithParts[]>(config, `/session/${sessionID}/message${qs ? `?${qs}` : ""}`)
      },

      // Sends a message and returns the response
      // Fire-and-forget async prompt - SSE events drive all real-time updates
      prompt: async (
        sessionID: string,
        params: {
          parts: Array<{ type: "text"; text: string } | { type: "file"; mime: string; url: string; filename?: string }>
          model?: { providerID: string; modelID: string }
          agent?: string
          variant?: string
        },
      ): Promise<void> => {
        const url = `${config.baseUrl}/session/${sessionID}/prompt_async`
        const headers = createHeaders(config)
        const body = JSON.stringify(params)
        const response = await fetchWithTimeout(url, {
          method: "POST",
          headers,
          body,
        })

        if (!response.ok) {
          const error = await response.text()
          throw new Error(`Failed to send message: ${response.status} - ${error}`)
        }
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
        const url = `${config.baseUrl}/session/${sessionID}/command`
        const headers = createHeaders(config)

        const response = await fetchWithTimeout(url, {
          method: "POST",
          headers,
          body: JSON.stringify({ ...params, sessionID }),
        })

        if (!response.ok) {
          const error = await response.text()
          throw new Error(`Failed to run command: ${response.status} - ${error}`)
        }
      },

      abort: (sessionID: string) => request<boolean>(config, `/session/${sessionID}/abort`, { method: "POST" }),

      diff: (sessionID: string, messageID?: string) => {
        const qs = messageID ? `?messageID=${messageID}` : ""
        return request<unknown[]>(config, `/session/${sessionID}/diff${qs}`)
      },

      // Marks messageID (and everything after it) as pending revert. The
      // underlying messages aren't deleted until the next prompt runs
      // cleanup, or the revert is undone with unrevert() below.
      revert: (sessionID: string, messageID: string, partID?: string) =>
        request<Session>(config, `/session/${sessionID}/revert`, {
          method: "POST",
          body: JSON.stringify(partID ? { messageID, partID } : { messageID }),
        }),

      unrevert: (sessionID: string) =>
        request<Session>(config, `/session/${sessionID}/unrevert`, {
          method: "POST",
        }),
    },

    permission: {
      list: () =>
        request<Array<{ id: string; sessionID: string; tool: string; input: unknown }>>(config, "/permission"),

      reply: (requestID: string, reply: "once" | "always" | "reject") =>
        request<boolean>(config, `/permission/${requestID}/reply`, {
          method: "POST",
          body: JSON.stringify({ reply }),
        }),
    },

    question: {
      list: () => request<Array<{ id: string; sessionID: string; questions: unknown[] }>>(config, "/question"),

      reply: (requestID: string, answers: string[][]) =>
        request<boolean>(config, `/question/${requestID}/reply`, {
          method: "POST",
          body: JSON.stringify({ answers }),
        }),

      reject: (requestID: string) =>
        request<boolean>(config, `/question/${requestID}/reject`, {
          method: "POST",
        }),
    },

    agent: {
      list: () => request<Agent[]>(config, "/agent"),
    },

    command: {
      list: () => request<Command[]>(config, "/command"),
    },

    provider: {
      list: () =>
        request<{
          all: Array<{
            id: string
            name: string
            models: Record<
              string,
              {
                id: string
                name: string
                attachment: boolean
                reasoning: boolean
                tool_call: boolean
                cost?: { input: number; output: number }
                limit: { context: number; output: number }
                status?: "alpha" | "beta" | "deprecated" | "active"
                variants?: Record<string, { reasoningEffort?: string }>
              }
            >
          }>
          default: Record<string, string>
          connected: string[]
        }>(config, "/provider"),
    },

    config: {
      get: () => request<unknown>(config, "/config"),
    },
  }
}

export type Client = ReturnType<typeof createClient>
