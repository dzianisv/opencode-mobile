// Conversion layer between the opencode v2 HTTP/SSE payloads and the internal
// v1-style shapes the stores and chat UI consume (Session, Message, Part,
// Event {type, properties}, ...). Keeping every mapping in one pure module
// (only `import type` from sdk.ts, which is erased at runtime) makes it fully
// unit-testable under plain `node --test` and keeps sdk.ts thin.
//
// Reference: docs/v2-api-map.md (verified against a live opencode v2 server).
import type { Agent, Command, Event, FileEntry, Message, MessageWithParts, Part, Project, Session } from "./sdk"

// --- raw v2 shapes (subset we consume) ---

export interface V2LocationRef {
  directory: string
}

export interface V2ModelRef {
  id: string
  providerID: string
  variant?: string
}

export interface V2Tokens {
  input: number
  output: number
  reasoning?: number
  cache?: { read: number; write: number }
}

export interface V2SessionInfo {
  id: string
  parentID?: string
  projectID: string
  agent?: string
  model?: V2ModelRef
  title?: string
  subpath?: string
  revert?: { messageID: string; partID?: string }
  location: V2LocationRef
  time: { created: number; updated: number; archived?: number; idle?: number }
  cost?: number
  tokens?: V2Tokens
}

export interface V2ToolContent {
  type: "text" | "file"
  text?: string
  uri?: string
  mime?: string
  name?: string | null
}

export interface V2ToolState {
  status: "streaming" | "running" | "completed" | "error"
  input?: unknown
  content?: V2ToolContent[]
  metadata?: Record<string, unknown>
  error?: { message?: string; data?: { message?: string } } & Record<string, unknown>
}

export interface V2AssistantContentPart {
  type: "text" | "reasoning" | "tool"
  text?: string
  id?: string
  name?: string
  state?: V2ToolState
  time?: { created?: number; ran?: number; completed?: number }
}

export interface V2FileAttachment {
  data?: string
  mime?: string
  uri?: string
  name?: string
  source?: { type: string; path?: string }
}

export interface V2Message {
  id: string
  sessionID?: string
  type: string
  time: { created: number; completed?: number }
  text?: string
  files?: V2FileAttachment[]
  agent?: string
  model?: V2ModelRef
  content?: V2AssistantContentPart[]
  finish?: string
  cost?: number
  tokens?: V2Tokens
  error?: { message?: string; data?: { message?: string } } & Record<string, unknown>
  outcome?: string
}

export interface V2PermissionRequest {
  id: string
  sessionID: string
  action: string
  resources: string[]
  metadata?: Record<string, unknown>
  source?: { type: string; messageID?: string; id?: string }
}

export interface V2FormOption {
  value: string
  label: string
  description?: string
}

export interface V2FormField {
  key: string
  type: "string" | "number" | "integer" | "boolean" | "multiselect" | "external"
  title?: string
  description?: string
  options?: V2FormOption[]
  custom?: boolean
}

export interface V2FormInfo {
  id: string
  sessionID: string
  title: string
  fields: V2FormField[]
}

export interface V2AgentInfo {
  id: string
  name: string
  description?: string
  mode: "subagent" | "primary" | "all"
  hidden?: boolean
  color?: string
  model?: V2ModelRef
  steps?: number
}

export interface V2CommandInfo {
  name: string
  description?: string
}

export interface V2ModelInfo {
  id: string
  modelID: string
  providerID: string
  name: string
  capabilities: { tools: boolean; input: string[]; output: string[] }
  variants: Array<{ id: string; settings?: { reasoning?: { enabled?: boolean; effort?: string } } }>
  cost?: Array<{ input: number; output: number }>
  status?: "alpha" | "beta" | "deprecated" | "active"
  enabled?: boolean
  limit: { context: number; output: number }
}

export interface V2ProviderInfo {
  id: string
  name: string
  activation?: "auto" | "enabled" | "disabled"
}

export interface V2ProjectInfo {
  id: string
  canonical: string
}

export interface V2FsEntry {
  path: string
  type: "file" | "directory"
}

export interface V2RawEvent {
  id?: string
  created?: number
  type: string
  data?: Record<string, any>
}

// --- pending-request registry -------------------------------------------------
// v2 permission/form replies are session-scoped (`/api/session/{id}/...`), but
// the app calls `permission.reply(requestID)` globally. Remember which session
// owns each request (from SSE events and list endpoints — both flow through
// this module) so the SDK can build the right URL. Forms additionally keep
// their fields so `question.reply(answers)` can map selected labels back to
// the keyed Form.Answer object v2 expects.

interface PendingRequest {
  sessionID: string
  fields?: V2FormField[]
}

const pendingRequests = new Map<string, PendingRequest>()

export function rememberPermissionRequest(req: V2PermissionRequest): void {
  pendingRequests.set(req.id, { sessionID: req.sessionID })
}

export function rememberForm(form: V2FormInfo): void {
  pendingRequests.set(form.id, { sessionID: form.sessionID, fields: answerFields(form.fields) })
}

export function forgetPendingRequest(id: string): void {
  pendingRequests.delete(id)
}

export function pendingRequestInfo(id: string): PendingRequest | undefined {
  return pendingRequests.get(id)
}

export function clearPendingRequests(): void {
  pendingRequests.clear()
}

// --- conversions ---------------------------------------------------------------

export function toSession(info: V2SessionInfo): Session {
  return {
    id: info.id,
    slug: "",
    projectID: info.projectID,
    directory: info.location?.directory ?? "",
    parentID: info.parentID,
    title: info.title ?? "",
    version: "",
    time: {
      created: info.time?.created ?? 0,
      updated: info.time?.updated ?? 0,
      archived: info.time?.archived,
    },
    cost: info.cost,
    tokens: info.tokens,
    revert: info.revert ? { messageID: info.revert.messageID, partID: info.revert.partID } : undefined,
  }
}

function structuredErrorMessage(error: unknown): string {
  if (!error) return "Session error occurred"
  if (typeof error === "string") return error
  const e = error as { message?: string; data?: { message?: string } }
  return e.message || e.data?.message || JSON.stringify(error)
}

function attachmentUrl(f: V2FileAttachment): string {
  if (f.uri) return f.uri
  if (f.data && f.mime) return `data:${f.mime};base64,${f.data}`
  if (f.source?.path) return f.source.path
  return ""
}

function userParts(messageID: string, msg: { text?: string; files?: V2FileAttachment[] }): Part[] {
  const parts: Part[] = []
  if (msg.text) {
    parts.push({ id: `${messageID}-text`, messageID, type: "text", text: msg.text })
  }
  for (const f of msg.files || []) {
    const url = attachmentUrl(f)
    if (!url) continue
    parts.push({ id: `${messageID}-file-${parts.length}`, messageID, type: "file", mime: f.mime, url, filename: f.name })
  }
  return parts
}

function toolOutput(content: V2ToolContent[] | undefined): string | undefined {
  if (!content || content.length === 0) return undefined
  const texts = content.map((c) => (c.type === "text" ? c.text : c.uri ? `[${c.name || c.uri}]` : "")).filter(Boolean)
  return texts.length > 0 ? texts.join("\n") : undefined
}

function mapToolState(state: V2ToolState | undefined): Part["state"] {
  if (!state) return { status: "pending" }
  const title = typeof state.metadata?.title === "string" ? (state.metadata.title as string) : undefined
  if (state.status === "streaming" || state.status === "running") {
    return { status: "running", input: state.input, title }
  }
  if (state.status === "completed") {
    return { status: "completed", input: state.input, output: toolOutput(state.content), title }
  }
  return {
    status: "error",
    input: state.input,
    output: toolOutput(state.content),
    title,
    error: { message: structuredErrorMessage(state.error) },
  }
}

function assistantParts(messageID: string, content: V2AssistantContentPart[] | undefined): Part[] {
  const parts: Part[] = []
  for (let i = 0; i < (content || []).length; i++) {
    const c = content![i]
    if (c.type === "text" || c.type === "reasoning") {
      parts.push({ id: `${messageID}-${c.type}-${i}`, messageID, type: c.type, text: c.text ?? "" })
      continue
    }
    if (c.type === "tool") {
      parts.push({
        id: `${messageID}-tool-${c.id || i}`,
        messageID,
        type: "tool",
        tool: c.name,
        callID: c.id,
        state: mapToolState(c.state),
        time: { start: c.time?.created, end: c.time?.completed },
      })
    }
  }
  return parts
}

// v2 projects a session timeline of typed messages (user / assistant / idle /
// switch markers / ...). The chat UI only understands user+assistant messages
// with parts, so markers are dropped and the rest reshaped. Input is expected
// oldest-first (order=asc); output preserves that order.
export function toMessageWithParts(messages: V2Message[]): MessageWithParts[] {
  const out: MessageWithParts[] = []
  for (const m of messages) {
    if (m.type === "user") {
      out.push({
        info: {
          id: m.id,
          sessionID: m.sessionID ?? "",
          role: "user",
          time: { created: m.time?.created ?? 0 },
          agent: m.agent,
          model: m.model ? { providerID: m.model.providerID, modelID: m.model.id } : undefined,
        },
        parts: userParts(m.id, m),
      })
      continue
    }
    if (m.type === "assistant") {
      out.push({
        info: {
          id: m.id,
          sessionID: m.sessionID ?? "",
          role: "assistant",
          time: { created: m.time?.created ?? 0, completed: m.time?.completed },
          agent: m.agent,
          modelID: m.model?.id,
          providerID: m.model?.providerID,
          cost: m.cost,
          tokens: m.tokens
            ? {
                input: m.tokens.input,
                output: m.tokens.output,
                reasoning: m.tokens.reasoning,
                cache: m.tokens.cache,
              }
            : undefined,
          error: m.error ? { message: structuredErrorMessage(m.error) } : undefined,
          finish: m.finish,
        },
        parts: assistantParts(m.id, m.content),
      })
    }
    // idle / agent-switched / model-switched / compaction / system / synthetic
    // / shell / skill markers carry no chat content - skipped.
  }
  return out
}

export function toPermissionRequest(req: V2PermissionRequest) {
  return {
    id: req.id,
    sessionID: req.sessionID,
    permission: req.action,
    patterns: req.resources || [],
    metadata: req.metadata || {},
    tool: req.source?.type === "tool" && req.source.messageID ? { messageID: req.source.messageID, callID: req.source.id ?? "" } : undefined,
  }
}

// Fields that actually render as questions (external fields have no UI here);
// the same filtered list keys the answer mapping so indices stay aligned.
function answerFields(fields: V2FormField[]): V2FormField[] {
  return (fields || []).filter((f) => f.type !== "external")
}

export function toQuestionRequest(form: V2FormInfo) {
  const questions = answerFields(form.fields).map((f) => {
    const options = (f.options || []).map((o) => ({ label: o.label || o.value, description: o.description || "" }))
    if (f.type === "boolean") {
      return {
        question: f.description || f.title || f.key,
        header: f.title || f.key,
        options: [
          { label: "Yes", description: "" },
          { label: "No", description: "" },
        ],
        multiple: false,
        custom: false,
      }
    }
    const hasOptions = options.length > 0
    return {
      question: f.description || f.title || f.key,
      header: f.title || f.key,
      options,
      multiple: f.type === "multiselect",
      custom: f.custom !== false && (f.type === "string" || f.type === "number" || f.type === "integer" || !hasOptions),
    }
  })
  return {
    id: form.id,
    sessionID: form.sessionID,
    questions,
    tool: undefined,
  }
}

// Map QuestionPrompt's label-based answers back to v2's keyed Form.Answer.
export function formAnswerFromFields(fields: V2FormField[] | undefined, answers: string[][]): Record<string, unknown> {
  const answer: Record<string, unknown> = {}
  for (let i = 0; i < (fields || []).length; i++) {
    const f = fields![i]
    const selected = answers[i] || []
    const valueOf = (label: string): string => {
      const opt = (f.options || []).find((o) => (o.label || o.value) === label)
      return opt ? opt.value : label
    }
    if (selected.length === 0) continue
    if (f.type === "multiselect") {
      answer[f.key] = selected.map(valueOf)
    } else if (f.type === "boolean") {
      answer[f.key] = selected[0] === "Yes" || selected[0] === "true"
    } else if (f.type === "number" || f.type === "integer") {
      const n = Number(selected[0])
      if (!Number.isNaN(n)) answer[f.key] = n
    } else {
      answer[f.key] = valueOf(selected[0])
    }
  }
  return answer
}

export function toAgent(a: V2AgentInfo): Agent {
  return {
    name: a.id,
    description: a.description,
    mode: a.mode,
    hidden: a.hidden,
    color: a.color,
    model: a.model ? { modelID: a.model.id, providerID: a.model.providerID } : undefined,
    options: {},
    steps: a.steps,
  }
}

export function toCommand(c: V2CommandInfo): Command {
  return { name: c.name, description: c.description, template: "", hints: [], mcp: false }
}

export function toProject(p: V2ProjectInfo): Project {
  return { id: p.id, name: p.canonical, path: { cwd: p.canonical, root: p.canonical, absolute: p.canonical } }
}

export function toFileEntries(location: V2LocationRef | undefined, entries: V2FsEntry[]): FileEntry[] {
  const base = location?.directory ?? ""
  return entries.map((e) => ({
    name: e.path.split("/").filter(Boolean).pop() || e.path,
    path: e.path,
    absolute: e.path.startsWith("/") ? e.path : `${base}/${e.path}`.replace(/\/{2,}/g, "/"),
    type: e.type,
    ignored: false,
  }))
}

// v2 splits providers and models across two endpoints; rebuild the v1-style
// catalog object ModelPicker/VariantPicker consume.
export function toProviderCatalog(
  providers: V2ProviderInfo[],
  models: V2ModelInfo[],
  defaultModel: V2ModelInfo | null,
): {
  all: Array<{ id: string; name: string; models: Record<string, any> }>
  default: Record<string, string>
  connected: string[]
} {
  const byProvider = new Map<string, { id: string; name: string; models: Record<string, any> }>()
  for (const p of providers || []) {
    byProvider.set(p.id, { id: p.id, name: p.name, models: {} })
  }
  const connected = new Set<string>()
  for (const m of models || []) {
    if (!byProvider.has(m.providerID)) {
      byProvider.set(m.providerID, { id: m.providerID, name: m.providerID, models: {} })
    }
    if (m.enabled === false) continue
    connected.add(m.providerID)
    const entry = byProvider.get(m.providerID)!
    const variants: Record<string, { reasoningEffort?: string }> = {}
    for (const v of m.variants || []) {
      variants[v.id] = { reasoningEffort: v.settings?.reasoning?.effort }
    }
    entry.models[m.id] = {
      id: m.id,
      name: m.name || m.modelID,
      attachment: (m.capabilities?.input || []).includes("image"),
      reasoning:
        (m.capabilities?.input || []).includes("reasoning") ||
        (m.variants || []).some((v) => v.settings?.reasoning && v.settings.reasoning.enabled !== false),
      tool_call: Boolean(m.capabilities?.tools),
      cost: m.cost?.[0] ? { input: m.cost[0].input, output: m.cost[0].output } : undefined,
      limit: { context: m.limit?.context ?? 0, output: m.limit?.output ?? 0 },
      status: m.status,
      variants: Object.keys(variants).length > 0 ? variants : undefined,
    }
  }
  const defaultByProvider: Record<string, string> = {}
  if (defaultModel) defaultByProvider[defaultModel.providerID] = defaultModel.id
  return {
    all: Array.from(byProvider.values()).filter((p) => Object.keys(p.models).length > 0),
    default: defaultByProvider,
    connected: Array.from(connected),
  }
}

// --- SSE event translation -----------------------------------------------------
// v2 streams typed execution events (session.text.delta, session.tool.called,
// ...) scoped by assistantMessageID. The app's stores consume the v1 taxonomy
// (message.updated / message.part.updated / session.status / ...), so the
// translator accumulates streamed content client-side and re-emits it as
// part/message updates. Docs: docs/v2-api-map.md "Event taxonomy".

function ev(type: string, properties: Record<string, unknown>): Event {
  return { type, properties }
}

interface ToolBuf {
  sessionID: string
  messageID: string
  name: string
  input: string
  start?: number
}

export class V2EventTranslator {
  private assistants = new Map<string, Message>()
  private textBuf = new Map<string, string>()
  private reasoningBuf = new Map<string, string>()
  private tools = new Map<string, ToolBuf>()

  reset(): void {
    this.assistants.clear()
    this.textBuf.clear()
    this.reasoningBuf.clear()
    this.tools.clear()
  }

  // Content events can arrive before session.step.started for a step; emit a
  // synthesized message.updated the first time we see an assistantMessageID so
  // the chat always has a message bubble to attach parts to.
  private ensureAssistant(sessionID: string, messageID: string, created?: number): Event[] {
    if (this.assistants.has(messageID)) return []
    const msg: Message = {
      id: messageID,
      sessionID,
      role: "assistant",
      time: { created: created ?? Date.now() },
    }
    this.assistants.set(messageID, msg)
    return [ev("message.updated", { info: msg })]
  }

  private assistantMessage(sessionID: string, messageID: string, created?: number): Message {
    const existing = this.assistants.get(messageID)
    if (existing) return existing
    const msg: Message = {
      id: messageID,
      sessionID,
      role: "assistant",
      time: { created: created ?? Date.now() },
    }
    this.assistants.set(messageID, msg)
    return msg
  }

  private partEvent(buf: Map<string, string>, key: string, part: Part): Event[] {
    buf.set(key, buf.get(key) === undefined ? (part.text ?? "") : buf.get(key) + (part.text ?? ""))
    part = { ...part, text: buf.get(key) }
    return [ev("message.part.updated", { part })]
  }

  translate(raw: V2RawEvent): Event[] {
    const d = raw.data || {}
    const sessionID = d.sessionID as string | undefined

    switch (raw.type) {
      case "server.connected":
      case "project.updated":
      case "session.inbox.delivered":
      case "session.viewed":
      case "session.metadata.updated":
      case "session.model.selected":
      case "session.agent.selected":
      case "session.usage.recorded":
        return []

      case "session.execution.started":
        if (!sessionID) return []
        return [ev("session.status", { sessionID, status: { type: "busy" } })]

      case "session.execution.succeeded":
      case "session.execution.interrupted": {
        if (!sessionID) return []
        return [ev("session.status", { sessionID, status: { type: "idle" } })]
      }

      case "session.execution.failed": {
        if (!sessionID) return []
        const out: Event[] = []
        const errorMessage = structuredErrorMessage(d.error)
        out.push(ev("session.error", { sessionID, error: { message: errorMessage } }))
        let latest: Message | undefined
        for (const m of this.assistants.values()) {
          if (m.sessionID === sessionID) latest = m
        }
        if (latest) {
          const msg: Message = { ...latest, error: { message: errorMessage } }
          this.assistants.set(latest.id, msg)
          out.push(ev("message.updated", { info: msg }))
        }
        out.push(ev("session.status", { sessionID, status: { type: "idle" } }))
        return out
      }

      case "session.error":
        if (!sessionID) return []
        return [ev("session.error", { sessionID, error: { message: structuredErrorMessage(d.error) } })]

      case "session.step.started": {
        if (!sessionID || !d.assistantMessageID) return []
        const msg: Message = {
          id: d.assistantMessageID,
          sessionID,
          role: "assistant",
          time: { created: d.started ?? raw.created ?? Date.now() },
          agent: d.agent,
          modelID: d.model?.id,
          providerID: d.model?.providerID,
        }
        this.assistants.set(msg.id, msg)
        return [ev("message.updated", { info: msg })]
      }

      case "session.step.ended": {
        if (!d.assistantMessageID) return []
        const base = this.assistantMessage(sessionID ?? "", d.assistantMessageID, raw.created)
        const msg: Message = {
          ...base,
          time: { ...base.time, completed: raw.created ?? Date.now() },
          finish: d.finish,
          cost: d.cost ?? base.cost,
          tokens: d.tokens ? { input: d.tokens.input, output: d.tokens.output, reasoning: d.tokens.reasoning, cache: d.tokens.cache } : base.tokens,
        }
        this.assistants.set(msg.id, msg)
        return [ev("message.updated", { info: msg })]
      }

      case "session.usage.updated": {
        if (!sessionID) return []
        return [ev("session.usage.updated", {
          sessionID,
          cost: d.cost,
          tokens: d.tokens ? { input: d.tokens.input, output: d.tokens.output, reasoning: d.tokens.reasoning, cache: d.tokens.cache } : undefined,
        })]
      }

      case "session.text.started":
      case "session.text.delta":
      case "session.text.ended": {
        if (!sessionID || !d.assistantMessageID) return []
        const pre = this.ensureAssistant(sessionID, d.assistantMessageID, raw.created)
        const key = `${d.assistantMessageID}|${d.ordinal ?? 0}`
        if (raw.type === "session.text.started") {
          if (!this.textBuf.has(key)) this.textBuf.set(key, "")
          return [...pre, ev("message.part.updated", { part: { id: `text-${key}`, sessionID, messageID: d.assistantMessageID, type: "text", text: "" } })]
        }
        const chunk = raw.type === "session.text.delta" ? String(d.delta ?? "") : String(d.text ?? "")
        const isEnd = raw.type === "session.text.ended"
        const acc = (this.textBuf.get(key) ?? "") + chunk
        this.textBuf.set(key, acc)
        if (isEnd && d.text !== undefined) this.textBuf.set(key, String(d.text))
        return [...pre, ev("message.part.updated", { part: { id: `text-${key}`, sessionID, messageID: d.assistantMessageID, type: "text", text: this.textBuf.get(key) } })]
      }

      case "session.reasoning.started":
      case "session.reasoning.delta":
      case "session.reasoning.ended": {
        if (!sessionID || !d.assistantMessageID) return []
        const pre = this.ensureAssistant(sessionID, d.assistantMessageID, raw.created)
        const key = `${d.assistantMessageID}|${d.ordinal ?? 0}`
        if (raw.type === "session.reasoning.started") {
          if (!this.reasoningBuf.has(key)) this.reasoningBuf.set(key, "")
          return [...pre, ev("message.part.updated", { part: { id: `reasoning-${key}`, sessionID, messageID: d.assistantMessageID, type: "reasoning", text: "" } })]
        }
        const chunk = raw.type === "session.reasoning.delta" ? String(d.delta ?? "") : String(d.text ?? "")
        const acc = (this.reasoningBuf.get(key) ?? "") + chunk
        this.reasoningBuf.set(key, acc)
        if (raw.type === "session.reasoning.ended" && d.text !== undefined) this.reasoningBuf.set(key, String(d.text))
        return [...pre, ev("message.part.updated", { part: { id: `reasoning-${key}`, sessionID, messageID: d.assistantMessageID, type: "reasoning", text: this.reasoningBuf.get(key) } })]
      }

      case "session.tool.input.started":
      case "session.tool.input.delta":
      case "session.tool.input.ended":
      case "session.tool.called":
      case "session.tool.progress":
      case "session.tool.success":
      case "session.tool.failed": {
        if (!sessionID || !d.id || !d.assistantMessageID) return []
        const pre = this.ensureAssistant(sessionID, d.assistantMessageID, raw.created)
        let buf = this.tools.get(d.id)
        if (!buf) {
          buf = { sessionID, messageID: d.assistantMessageID, name: d.name ?? "tool", input: "" }
          this.tools.set(d.id, buf)
        }
        if (d.name) buf.name = d.name
        if (raw.type === "session.tool.input.delta") buf.input += String(d.delta ?? "")
        if (raw.type === "session.tool.input.ended" && d.text !== undefined) buf.input = String(d.text)

        let state: Part["state"]
        if (raw.type === "session.tool.success") {
          state = { status: "completed", input: parsedToolInput(buf), output: toolOutput(d.content), title: typeof d.metadata?.title === "string" ? d.metadata.title : undefined, time: { start: buf.start, end: raw.created } }
        } else if (raw.type === "session.tool.failed") {
          state = { status: "error", input: parsedToolInput(buf), output: toolOutput(d.content), error: { message: structuredErrorMessage(d.error) }, time: { start: buf.start, end: raw.created } }
        } else {
          state = { status: "running", input: raw.type === "session.tool.called" ? d.input : parsedToolInput(buf), title: typeof d.metadata?.title === "string" ? d.metadata.title : undefined, time: { start: buf.start } }
        }
        if (raw.type === "session.tool.called") buf.start = buf.start ?? raw.created
        const part: Part = { id: `tool-${d.id}`, sessionID, messageID: d.assistantMessageID, type: "tool", tool: buf.name, callID: d.id, state }
        return [...pre, ev("message.part.updated", { part })]
      }

      case "session.inbox.enqueued": {
        // The projected user message id equals the inbox item id (verified live),
        // so emitting it here resolves the app's optimistic `temp-` message.
        if (!sessionID || !d.inboxID) return []
        const item = d.item || {}
        const info: Message = {
          id: d.inboxID,
          sessionID,
          role: "user",
          time: { created: raw.created ?? Date.now() },
        }
        const out: Event[] = [ev("message.updated", { info })]
        for (const part of userParts(d.inboxID, item.payload || item)) {
          out.push(ev("message.part.updated", { part }))
        }
        return out
      }

      case "session.inbox.cancelled":
        if (!sessionID || !d.inboxID) return []
        return [ev("message.removed", { sessionID, messageID: d.inboxID })]

      case "session.created": {
        if (!d.id) return []
        return [ev("session.created", { info: toSession(d as unknown as V2SessionInfo) })]
      }

      case "session.updated":
      case "session.renamed":
      case "session.moved":
      case "session.forked": {
        if (!d.id) return []
        return [ev("session.updated", { info: toSession(d as unknown as V2SessionInfo) })]
      }

      case "permission.asked": {
        if (!d.id || !d.sessionID) return []
        rememberPermissionRequest(d as V2PermissionRequest)
        return [ev("permission.asked", toPermissionRequest(d as V2PermissionRequest))]
      }

      case "permission.replied":
      case "permission.rejected": {
        if (!d.id) return []
        const known = pendingRequestInfo(d.id)
        forgetPendingRequest(d.id)
        const sid = d.sessionID ?? known?.sessionID
        if (!sid) return []
        return [ev("permission.replied", { sessionID: sid, requestID: d.id })]
      }

      case "form.created": {
        // v2 nests the form under `data.form` — unlike `permission.asked`, whose
        // payload is the flat Permission.Request. Live-verified on v2.0.16
        // (evt_0d4be7612002H8CTkutJnzghGX): data = {form: {id, sessionID, title, fields}}.
        // Reading `d.id` here returns undefined, so the event was dropped silently
        // and the question prompt never rendered.
        const form = (d.form ?? d) as V2FormInfo
        if (!form.id || !form.sessionID) return []
        rememberForm(form)
        return [ev("question.asked", toQuestionRequest(form))]
      }

      case "form.replied": {
        if (!d.id) return []
        const known = pendingRequestInfo(d.id)
        forgetPendingRequest(d.id)
        const sid = d.sessionID ?? known?.sessionID
        if (!sid) return []
        return [ev("question.replied", { sessionID: sid, requestID: d.id })]
      }

      case "form.cancelled": {
        if (!d.id) return []
        const known = pendingRequestInfo(d.id)
        forgetPendingRequest(d.id)
        const sid = d.sessionID ?? known?.sessionID
        if (!sid) return []
        return [ev("question.rejected", { sessionID: sid, requestID: d.id })]
      }

      default:
        return []
    }
  }
}

function parsedToolInput(buf: ToolBuf): unknown {
  if (!buf.input) return undefined
  try {
    return JSON.parse(buf.input)
  } catch {
    return buf.input
  }
}
