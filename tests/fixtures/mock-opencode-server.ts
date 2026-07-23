// Minimal opencode-server protocol stub used by the Maestro activation E2E flows
// (.maestro/flows/activation-*.yaml). It is NOT a real opencode server — it
// implements just enough of the REST + Server-Sent-Events surface that the
// mobile client (src/lib/sdk.ts) actually talks to, so the app can genuinely
// go through connect -> create session -> send message -> receive a streamed
// reply against something real instead of a live server.
//
// Protocol notes (read from src/lib/sdk.ts / src/stores/connections.ts /
// src/stores/events.ts — NOT guessed):
//   - There is no WebSocket anywhere in the client. "Connect" = one GET
//     /global/health call (src/stores/connections.ts testConnection()).
//   - Real-time updates (including the assistant's streamed reply) arrive via
//     a single long-lived SSE connection: GET /global/event, framed as
//     `data: <json>\n\n` lines (see src/lib/sse.ts SSEParser).
//   - Sending a message is fire-and-forget: POST /session/:id/prompt_async
//     returns immediately; the actual reply is delivered as
//     `message.updated` + `message.part.updated` + `session.status` (idle)
//     events on the SSE stream (src/stores/events.ts).
//   - The real server ALSO persists and broadcasts the USER's message. The
//     app relies on this: any `message.updated` event strips optimistic
//     `temp-` messages (src/stores/sessions.ts handleEvent), so if the mock
//     only broadcast the assistant reply, the user's sent message would
//     vanish from the transcript. The mock therefore stores the user message
//     from the prompt_async body and broadcasts it (message.updated +
//     message.part.updated) before the canned assistant reply, and returns
//     it from GET /session/:id/message.
//
// Also implements the surface the newer flows need (DirectoryBrowserSheet,
// all-sessions across directories, VariantPicker — see
// .maestro/flows/directory-picker.yaml / all-sessions.yaml / variant-picker.yaml):
//   - GET /file (directory-scoped via the x-opencode-directory header, NOT the
//     literal ?path= query — see src/lib/headers.ts) -> FAKE_FILE_TREE below.
//   - GET /project -> FAKE_SERVER_PROJECTS, for the "Server Projects" section.
//   - POST /session honors x-opencode-directory so sessions can be created in
//     a browsed/picked folder.
//   - GET /session/:id, needed to open a session from the directory-less
//     all-sessions list (src/stores/sessions.ts loadSessions/selectSession),
//     including sessions the client never itself created.
//   - Per-directory workspace scoping is ENFORCED (like the real server):
//     GET /session/:id and GET /session/:id/message 404 unless the request's
//     x-opencode-directory (or DEFAULT_DIRECTORY when absent) matches the
//     session's own directory, and GET /session without ?roots=true only
//     lists the request directory's sessions. This is what gives
//     all-sessions.yaml teeth as a #46/#48 regression test — an app that
//     stops threading the session's directory gets 404s, not silent passes.
//   - GET /provider's mock-model carries `variants` (low/medium/high) so
//     VariantPicker has options to render.
//
// Shared-state note: in CI (.github/workflows/activation-e2e.yml) the
// instance on port 4099 is shared by directory-picker.yaml and then
// variant-picker.yaml (run sequentially in the same emulator session).
// State persists across flows — e.g. the session directory-picker creates in
// /mock/project/backend still exists when variant-picker runs. That is
// harmless today (variant-picker creates its own quick session and never
// asserts on list contents), but keep it in mind when adding assertions
// about "how many sessions exist" to either flow — or give a new flow its
// own port instead.
//
// Two modes:
//   - Normal mode: implements the endpoints above so the app can connect,
//     open a session, send a message, and render a canned assistant reply.
//   - `--fail-auth` mode: every request returns 401, simulating a
//     connect-time auth failure (GitHub issue #76's failure class). Used by
//     .maestro/flows/activation-negative-401.yaml to assert the app surfaces
//     a visible, actionable error instead of failing silently.
//
// Usage:
//   node tests/fixtures/mock-opencode-server.ts --port 4096
//   node tests/fixtures/mock-opencode-server.ts --port 4097 --fail-auth
//   node tests/fixtures/mock-opencode-server.ts --port 4098 --seed-sessions
//   node tests/fixtures/mock-opencode-server.ts --port 4100 --seed-diff

import http from "node:http"
import { randomUUID } from "node:crypto"

export interface MockServerOptions {
  port: number
  /** When true, ALL requests return 401 (simulates issue #76's connect-time auth failure). */
  failAuth?: boolean
  /** Canned assistant reply text streamed back after a prompt is submitted. */
  replyText?: string
  /** Delay before the canned reply is pushed over SSE, in ms. */
  replyDelayMs?: number
  /**
   * Pre-populate two sessions in two different directories at startup
   * (used by .maestro/flows/all-sessions.yaml to test the directory-less
   * "all sessions across all projects" list — see src/stores/sessions.ts
   * loadSessions()'s clientForDirectory(undefined) — and the cross-project
   * open regression for GitHub issues #46/#48).
   */
  seedSessions?: boolean
  /**
   * Pre-populate a session (id "seed-diff", in DEFAULT_DIRECTORY so it shows
   * up on the normal home-tab session list) with ONE assistant message that
   * already contains a wide `edit` tool part (renders via DiffView) and a
   * wide fenced code block in its text (renders via CodeBlock) — used by
   * .maestro/flows/diff-scroll.yaml (GitHub issue #21) to prove both
   * components' horizontal ScrollView actually scrolls on-device.
   *
   * Deliberately seeded as pre-existing history, fetched via GET
   * /session/:id/message, NOT delivered over SSE — the positive-flow SSE
   * render bug (issue #90) is being fixed separately, and this flow must not
   * depend on it landing first.
   */
  seedDiff?: boolean
}

interface StoredSession {
  id: string
  slug: string
  projectID: string
  directory: string
  title: string
  version: string
  time: { created: number; updated: number }
}

interface StoredPart {
  id: string
  sessionID: string
  messageID: string
  type: string
  text?: string
  // Tool part fields (type: "tool") — mirrors src/lib/sdk.ts's Part interface,
  // needed to seed a populated `edit` tool call for --seed-diff.
  tool?: string
  callID?: string
  state?: {
    status: "pending" | "running" | "completed" | "error"
    input?: unknown
    output?: unknown
    title?: string
  }
}

interface StoredMessageInfo {
  id: string
  sessionID: string
  role: "user" | "assistant"
  time: { created: number; completed?: number }
  modelID?: string
  providerID?: string
}

interface StoredMessage {
  info: StoredMessageInfo
  parts: StoredPart[]
}

export const DEFAULT_REPLY_TEXT = "Hello from the mock opencode server — activation e2e canned reply."

// The directory a request is scoped to when the client sends no
// x-opencode-directory header (i.e. a connection added without an explicit
// directory). Mirrors the real server's notion of a default/current workspace.
export const DEFAULT_DIRECTORY = "/mock/project"

// Resolve the workspace directory a request is scoped to. Directory-scoped
// clients (src/stores/connections.ts clientForDirectory(dir)) send the
// x-opencode-directory header (src/lib/headers.ts); directory-less clients
// send none and fall back to DEFAULT_DIRECTORY.
function requestDirectory(req: http.IncomingMessage): string {
  return (req.headers["x-opencode-directory"] as string | undefined) || DEFAULT_DIRECTORY
}

// Fake server-side filesystem tree for DirectoryBrowserSheet
// (src/components/chat/DirectoryBrowserSheet.tsx -> client.file.list({path: "."})
// -> GET /file). The client always requests path=".", scoping to a directory
// entirely via the x-opencode-directory header (src/lib/headers.ts) — so this
// map is keyed by absolute directory, not by the literal query string.
// Root has two subdirectories (for the picker + Up-navigation flow) plus one
// regular file (to exercise DirectoryBrowserSheet's type === "directory" filter).
export const FAKE_FILE_TREE: Record<string, Array<{ name: string; path: string; absolute: string; type: "file" | "directory"; ignored: boolean }>> = {
  "/mock/project": [
    { name: "frontend", path: "frontend", absolute: "/mock/project/frontend", type: "directory", ignored: false },
    { name: "backend", path: "backend", absolute: "/mock/project/backend", type: "directory", ignored: false },
    { name: "README.md", path: "README.md", absolute: "/mock/project/README.md", type: "file", ignored: false },
  ],
  "/mock/project/frontend": [],
  "/mock/project/backend": [],
}

// Fake server-known projects (GET /project), consumed by the "Server Projects"
// section of the New Session modal (app/(tabs)/index.tsx). "mock-project"
// matches GET /project/current so the UI filters it out of this list.
export const FAKE_SERVER_PROJECTS = [
  { id: "mock-project", name: "mock-project", path: { cwd: "/mock/project", root: "/mock/project", absolute: "/mock/project" } },
  {
    id: "mock-project-docs",
    name: "docs-project",
    path: { cwd: "/mock/docs-project", root: "/mock/docs-project", absolute: "/mock/docs-project" },
  },
]

// Exported so .maestro/flows/diff-scroll.yaml's assertions and this file's
// own seeding logic share one source of truth for what's "off-screen until
// you scroll" in the seeded diff/code content.
export const SEED_DIFF_SESSION_ID = "seed-diff"
export const SEED_DIFF_TITLE = "Wide Diff Session"
export const SEED_DIFF_TOOL_TITLE = "Edit wide_diff_target.ts"
export const SEED_DIFF_LINE_MARKER = "ZZZ_DIFF_SCROLL_TARGET_ZZZ"
export const SEED_CODE_LINE_MARKER = "ZZZ_CODE_SCROLL_TARGET_ZZZ"

// Long, space-free filler so the RN <Text> can't word-wrap it — it just
// overflows its parent, which is exactly what the horizontal ScrollView (the
// fix under test) exists to make scrollable instead of clipped/truncated.
const WIDE_FILLER = "x".repeat(220)

export function createMockOpencodeServer(opts: MockServerOptions) {
  const {
    port,
    failAuth = false,
    replyText = DEFAULT_REPLY_TEXT,
    replyDelayMs = 300,
    seedSessions = false,
    seedDiff = false,
  } = opts

  const sessions = new Map<string, StoredSession>()
  const messagesBySession = new Map<string, StoredMessage[]>()
  const sseClients = new Set<http.ServerResponse>()

  if (seedDiff) {
    const now = Date.now()
    const session: StoredSession = {
      id: SEED_DIFF_SESSION_ID,
      slug: "seed-diff",
      projectID: "mock-project",
      directory: DEFAULT_DIRECTORY,
      title: SEED_DIFF_TITLE,
      version: "0.0.0-mock",
      time: { created: now - 30_000, updated: now - 20_000 },
    }
    sessions.set(session.id, session)

    const messageID = "seed-diff-msg"
    const info: StoredMessageInfo = {
      id: messageID,
      sessionID: session.id,
      role: "assistant",
      time: { created: now - 25_000, completed: now - 20_000 },
      modelID: "mock-model",
      providerID: "mock",
    }

    // Populated `edit` tool call: renders via ToolCallCard -> EditDetail ->
    // DiffView (src/components/chat/DiffView.tsx) once the card is expanded.
    // One short unchanged line + one wide added line, so DiffView's diff has
    // both a context row and an "add" row whose text overflows the ScrollView.
    const toolPart: StoredPart = {
      id: "seed-diff-tool",
      sessionID: session.id,
      messageID,
      type: "tool",
      tool: "edit",
      callID: "seed-diff-call-1",
      state: {
        status: "completed",
        title: SEED_DIFF_TOOL_TITLE,
        input: {
          filePath: "src/wide_diff_target.ts",
          oldString: "const shortLine = 1",
          newString: `const shortLine = 1\nconst wideLine = "${WIDE_FILLER}${SEED_DIFF_LINE_MARKER}"`,
        },
        output: "applied",
      },
    }

    // Wide fenced code block in the reply text: renders via
    // Markdown -> CustomRenderer.code -> CodeBlock
    // (src/components/markdown/CodeBlock.tsx).
    const textPart: StoredPart = {
      id: "seed-diff-text",
      sessionID: session.id,
      messageID,
      type: "text",
      text:
        "Here is a wide code sample:\n\n```typescript\n" +
        `const wideCodeLine = "${WIDE_FILLER}${SEED_CODE_LINE_MARKER}"\n` +
        "```\n",
    }

    messagesBySession.set(session.id, [{ info, parts: [toolPart, textPart] }])
  }

  if (seedSessions) {
    const now = Date.now()
    const seedDefault: StoredSession = {
      id: "seed-default",
      slug: "seed-def",
      projectID: "mock-project",
      directory: "/mock/project",
      title: "Default Project Session",
      version: "0.0.0-mock",
      time: { created: now - 120_000, updated: now - 120_000 },
    }
    const seedOther: StoredSession = {
      id: "seed-other",
      slug: "seed-oth",
      projectID: "mock-project-other",
      directory: "/mock/project/other-dir",
      title: "Cross-Project Session",
      version: "0.0.0-mock",
      time: { created: now - 60_000, updated: now - 60_000 },
    }
    sessions.set(seedDefault.id, seedDefault)
    messagesBySession.set(seedDefault.id, [])
    sessions.set(seedOther.id, seedOther)
    messagesBySession.set(seedOther.id, [])
  }

  function broadcast(type: string, properties: Record<string, unknown>) {
    const line = `data: ${JSON.stringify({ type, properties })}\n\n`
    console.log(`[mock-opencode-server] broadcast type=${type} clients=${sseClients.size}`)
    for (const res of sseClients) {
      try {
        res.write(line)
      } catch {
        sseClients.delete(res)
      }
    }
  }

  function json(res: http.ServerResponse, status: number, body: unknown) {
    const data = JSON.stringify(body)
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(data),
    })
    res.end(data)
  }

  function unauthorized(res: http.ServerResponse) {
    json(res, 401, {
      error: "Unauthorized",
      message: "mock-opencode-server: running in --fail-auth mode (simulates GitHub issue #76)",
    })
  }

  // Persist the user's message (parsed from the prompt_async body) and
  // broadcast it over SSE, mirroring the real server. This is what lets the
  // app replace its optimistic `temp-` user message with the real one instead
  // of losing it when the assistant's message.updated arrives.
  function storeUserMessage(sessionID: string, promptParts: Array<{ type?: string; text?: string }>) {
    const list = messagesBySession.get(sessionID)
    if (!list) return

    const now = Date.now()
    const messageID = randomUUID()
    const info: StoredMessageInfo = {
      id: messageID,
      sessionID,
      role: "user",
      time: { created: now, completed: now },
    }
    const parts: StoredPart[] = promptParts
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => ({
        id: randomUUID(),
        sessionID,
        messageID,
        type: "text",
        text: p.text,
      }))

    list.push({ info, parts })
    broadcast("message.updated", { info })
    for (const part of parts) {
      broadcast("message.part.updated", { part })
    }
  }

  function scheduleReply(sessionID: string) {
    const list = messagesBySession.get(sessionID)
    if (!list) return

    setTimeout(() => {
      broadcast("session.status", { sessionID, status: { type: "busy" } })

      const now = Date.now()
      const messageID = randomUUID()
      const info: StoredMessageInfo = {
        id: messageID,
        sessionID,
        role: "assistant",
        time: { created: now },
        modelID: "mock-model",
        providerID: "mock",
      }
      broadcast("message.updated", { info })

      const part: StoredPart = {
        id: randomUUID(),
        sessionID,
        messageID,
        type: "text",
        text: replyText,
      }
      broadcast("message.part.updated", { part })

      list.push({ info: { ...info, time: { created: now, completed: Date.now() } }, parts: [part] })

      broadcast("session.status", { sessionID, status: { type: "idle" } })
    }, replyDelayMs)
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", `http://localhost:${port}`)
    const path = url.pathname
    const method = req.method || "GET"

    // Per-request logging: proves whether the request ever reached the mock
    // at all (attributes transport vs. app-side rendering for issue #90).
    res.on("finish", () => {
      console.log(`[mock-opencode-server] ${method} ${path} -> ${res.statusCode}`)
    })

    if (failAuth) {
      unauthorized(res)
      return
    }

    if (method === "GET" && path === "/global/health") {
      return json(res, 200, { healthy: true, version: "0.0.0-mock" })
    }

    if (method === "GET" && path === "/project/current") {
      return json(res, 200, {
        id: "mock-project",
        name: "mock-project",
        path: { cwd: "/mock/project", root: "/mock/project", absolute: "/mock/project" },
      })
    }
    if (method === "GET" && path === "/project") {
      return json(res, 200, FAKE_SERVER_PROJECTS)
    }
    if (method === "GET" && path === "/path") {
      return json(res, 200, {
        home: "/mock/home",
        state: "/mock/home/.local/state/opencode",
        config: "/mock/home/.config/opencode",
        worktree: "/mock/project",
        directory: "/mock/project",
      })
    }

    if (method === "GET" && path === "/agent") {
      return json(res, 200, [{ name: "build", mode: "primary", options: {} }])
    }
    if (method === "GET" && path === "/command") {
      return json(res, 200, [])
    }
    if (method === "GET" && path === "/provider") {
      return json(res, 200, {
        all: [
          {
            id: "mock",
            name: "Mock Provider",
            models: {
              "mock-model": {
                id: "mock-model",
                name: "Mock Model",
                attachment: false,
                reasoning: false,
                tool_call: false,
                limit: { context: 8000, output: 2000 },
                status: "active",
                // Reasoning-effort variants for VariantPicker
                // (src/components/chat/VariantPicker.tsx reads Object.keys(variants)).
                variants: {
                  low: { reasoningEffort: "low" },
                  medium: { reasoningEffort: "medium" },
                  high: { reasoningEffort: "high" },
                },
              },
            },
          },
        ],
        default: { mock: "mock-model" },
        connected: ["mock"],
      })
    }

    // Server-side filesystem browsing for DirectoryBrowserSheet. The client
    // always requests path="." (see src/lib/sdk.ts file.list) and scopes to a
    // directory via the x-opencode-directory header (src/lib/headers.ts).
    if (method === "GET" && path === "/file") {
      const dir = requestDirectory(req)
      return json(res, 200, FAKE_FILE_TREE[dir] || [])
    }
    if (method === "GET" && path === "/permission") {
      return json(res, 200, [])
    }
    if (method === "GET" && path === "/question") {
      return json(res, 200, [])
    }

    // SSE event stream — kept open for the lifetime of the connection.
    if (method === "GET" && path === "/global/event") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      })
      res.write(": connected\n\n")
      sseClients.add(res)
      console.log(`[mock-opencode-server] SSE connect, clients=${sseClients.size}`)

      // Periodic heartbeat comment. If the client never sees even this, the
      // silence is a transport problem (expo/fetch not streaming), not a
      // broadcast bug — attributes issue #90 mode B.
      const heartbeat = setInterval(() => {
        try {
          res.write(": ping\n\n")
        } catch {
          clearInterval(heartbeat)
        }
      }, 2000)

      req.on("close", () => {
        clearInterval(heartbeat)
        sseClients.delete(res)
        console.log(`[mock-opencode-server] SSE disconnect, clients=${sseClients.size}`)
      })
      return
    }

    if (method === "POST" && path === "/session") {
      const id = randomUUID()
      const now = Date.now()
      // Directory-scoped clients (connections store clientForDirectory()) send
      // the target directory via this header — used by the "create session in
      // a browsed/picked folder" flow (DirectoryBrowserSheet -> onCreateInDirectory).
      const directory = requestDirectory(req)
      const session: StoredSession = {
        id,
        slug: id.slice(0, 8),
        projectID: "mock-project",
        directory,
        title: "Mock Session",
        version: "0.0.0-mock",
        time: { created: now, updated: now },
      }
      sessions.set(id, session)
      messagesBySession.set(id, [])
      return json(res, 200, session)
    }
    // Global "all sessions across every directory" list, mirroring the real
    // opencode server's GET /experimental/session. This is the endpoint the
    // client now PREFERS (src/lib/sdk.ts session.list -> loadSessionList): on a
    // real server a directory-less GET /session is directory-scoped and returns
    // [] when the active dir has no sessions, so the Recent Sessions list was
    // empty until the user picked a folder. /experimental/session always
    // returns every session, ignoring the x-opencode-directory header.
    if (method === "GET" && path === "/experimental/session") {
      return json(res, 200, Array.from(sessions.values()))
    }
    if (method === "GET" && path === "/session") {
      // Directory-less "all sessions across all projects" list: the app's
      // loadSessions() (src/stores/sessions.ts) uses clientForDirectory(undefined)
      // — no x-opencode-directory header — and passes ?roots=true (src/lib/sdk.ts
      // session.list). Only that combination returns sessions from every
      // directory; otherwise the list is scoped to the request's directory, so
      // directory-scoped and directory-less clients are actually distinguishable.
      // NOTE: this legacy path remains the 404-fallback for older servers that
      // predate /experimental/session.
      if (url.searchParams.get("roots") === "true") {
        return json(res, 200, Array.from(sessions.values()))
      }
      const dir = requestDirectory(req)
      return json(
        res,
        200,
        Array.from(sessions.values()).filter((s) => s.directory === dir),
      )
    }

    // Single-session fetch (src/lib/sdk.ts session.get -> src/stores/sessions.ts
    // selectSession), used whenever a session from the all-sessions list (which
    // may belong to any directory) is opened — including sessions the client
    // never created itself (e.g. the seeded ones below).
    //
    // Directory ownership is ENFORCED, mirroring the real server's per-directory
    // workspace scoping: a session is only visible to a request scoped to the
    // session's own directory. This is what makes all-sessions.yaml real
    // regression coverage for #46/#48 — if the app stopped threading the
    // session's directory into clientFor()/clientForDirectory(), the request
    // would carry the wrong (or no) x-opencode-directory header and get a 404
    // here, and the flow's session-screen assertions would fail.
    const sessionGetMatch = path.match(/^\/session\/([^/]+)$/)
    if (method === "GET" && sessionGetMatch) {
      const sid = sessionGetMatch[1]
      const session = sessions.get(sid)
      if (!session || session.directory !== requestDirectory(req)) {
        return json(res, 404, { error: `unknown session ${sid}` })
      }
      return json(res, 200, session)
    }

    const sessionMessageMatch = path.match(/^\/session\/([^/]+)\/message$/)
    if (method === "GET" && sessionMessageMatch) {
      const sid = sessionMessageMatch[1]
      const session = sessions.get(sid)
      // Same per-directory enforcement as GET /session/:id above.
      if (!session || session.directory !== requestDirectory(req)) {
        return json(res, 404, { error: `unknown session ${sid}` })
      }
      return json(res, 200, messagesBySession.get(sid) || [])
    }

    const promptMatch = path.match(/^\/session\/([^/]+)\/prompt_async$/)
    if (method === "POST" && promptMatch) {
      const sid = promptMatch[1]
      let body = ""
      req.on("data", (chunk) => (body += chunk))
      req.on("end", () => {
        if (!sessions.has(sid)) {
          return json(res, 404, { error: `unknown session ${sid}` })
        }
        let promptParts: Array<{ type?: string; text?: string }> = []
        try {
          const parsed = JSON.parse(body || "{}")
          if (Array.isArray(parsed.parts)) promptParts = parsed.parts
        } catch {
          // malformed body — still ack like a fire-and-forget endpoint would
        }
        json(res, 200, { ok: true })
        storeUserMessage(sid, promptParts)
        scheduleReply(sid)
      })
      return
    }

    const abortMatch = path.match(/^\/session\/([^/]+)\/abort$/)
    if (method === "POST" && abortMatch) {
      return json(res, 200, true)
    }

    json(res, 404, { error: `mock-opencode-server: no handler for ${method} ${path}` })
  })

  return {
    server,
    url: `http://localhost:${port}`,
    listen(): Promise<void> {
      return new Promise((resolve) => server.listen(port, "0.0.0.0", () => resolve()))
    },
    close(): Promise<void> {
      for (const res of sseClients) {
        try {
          res.end()
        } catch {
          // ignore
        }
      }
      sseClients.clear()
      return new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()))
      })
    },
  }
}

function parseArgs(argv: string[]): { port: number; failAuth: boolean; seedSessions: boolean; seedDiff: boolean } {
  const opts = { port: 4096, failAuth: false, seedSessions: false, seedDiff: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--port") opts.port = Number(argv[++i])
    else if (argv[i] === "--fail-auth") opts.failAuth = true
    else if (argv[i] === "--seed-sessions") opts.seedSessions = true
    else if (argv[i] === "--seed-diff") opts.seedDiff = true
  }
  return opts
}

const invokedDirectly =
  typeof process !== "undefined" && process.argv[1] && import.meta.url === `file://${process.argv[1]}`

if (invokedDirectly) {
  const opts = parseArgs(process.argv.slice(2))
  const mock = createMockOpencodeServer(opts)
  mock.listen().then(() => {
    console.log(
      `[mock-opencode-server] listening on ${mock.url} (failAuth=${opts.failAuth}, seedSessions=${opts.seedSessions}, seedDiff=${opts.seedDiff})`,
    )
  })
  const shutdown = () => {
    mock.close().then(() => process.exit(0))
  }
  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)
}
