import { create } from "zustand"
import * as SecureStore from "expo-secure-store"
import * as Crypto from "expo-crypto"
import type { ServerConnection, ConnectionType } from "../lib/types"
import { createClient, probeServer, type Client, type Project } from "../lib/sdk"
import type { ServerApi } from "../lib/api-detect"
import { addBreadcrumb } from "../lib/sentry"
import { AnalyticsEvent, classifyConnectionError, track, type ConnectionTestSource } from "../lib/analytics"
import { buildAuth } from "../lib/auth"
import { stripTrailingSlash } from "../lib/path-utils"

const CONNECTIONS_KEY = "opencode_connections"
const PASSWORDS_PREFIX = "opencode_password_"
const RECENT_DIRS_KEY = "opencode_recent_dirs"
const MAX_RECENT_DIRS = 10
// A bad IP (unreachable host, wrong port) otherwise hangs for the full 30s
// general request timeout before the user sees a "connection failed" error —
// a first-run bounce driver. The interactive connect flow can afford to fail
// faster since a real server responds to /global/health in well under a
// second; this does NOT affect the timeout used for real session traffic.
const CONNECTION_TEST_TIMEOUT_MS = 12_000

// Cached auth so we can create directory-scoped clients without async SecureStore lookups
interface ClientBase {
  baseUrl: string
  auth?: { username: string; password: string }
  api?: ServerApi
}

interface ConnectionsState {
  connections: ServerConnection[]
  activeConnection: ServerConnection | null
  client: Client | null
  clientBase: ClientBase | null
  currentProject: Project | null
  serverHome: string | null // Home directory on the server machine (for ~ expansion)
  recentDirectories: string[]
  isLoading: boolean
  error: string | null

  // Actions
  loadConnections: () => Promise<void>
  addConnection: (connection: Omit<ServerConnection, "id">, password?: string) => Promise<void>
  removeConnection: (id: string) => Promise<void>
  setActiveConnection: (id: string) => Promise<void>
  // `source` distinguishes the activation funnel (onboarding) from the edit
  // screen's Test button (edit_test) in analytics.
  testConnection: (
    connection: ServerConnection,
    source: ConnectionTestSource,
    password?: string,
  ) => Promise<{ ok: boolean; api?: ServerApi; serverVersion?: string; error?: string }>
  updateConnection: (id: string, updates: Partial<ServerConnection>, password?: string) => Promise<void>
  refreshProject: () => Promise<void>
  // Create a one-off client pointing at a specific directory (for cross-project operations).
  // Pass undefined to get a directory-less client that queries the server without project scope.
  clientForDirectory: (directory?: string) => Client | null
  // Switch the active connection's directory and reload
  switchDirectory: (directory?: string) => Promise<void>
  // Record a directory as recently used
  addRecentDirectory: (directory: string) => Promise<void>
}

function generateId(): string {
  return Crypto.randomUUID().replace(/-/g, "").slice(0, 16)
}

function buildClient(
  url: string,
  directory?: string,
  auth?: { username: string; password: string },
  api?: ServerApi,
): { client: Client; base: ClientBase } {
  const base: ClientBase = { baseUrl: url, auth, api }
  const client = createClient({ baseUrl: url, directory, auth, api })
  return { client, base }
}

// Decide which transport a connection needs. A recorded probe is reused; a
// connection saved before this existed (or saved while the server was down) is
// probed once here and the answer is written back onto the stored record. When
// the probe cannot classify the server we keep the previous behaviour (v2)
// instead of refusing to load a connection the user can still see and edit.
async function resolveApi(
  connection: ServerConnection,
  auth?: { username: string; password: string },
): Promise<{ api?: ServerApi; resolved: boolean }> {
  if (connection.api) return { api: connection.api, resolved: false }
  try {
    const identity = await probeServer({ baseUrl: connection.url, directory: connection.directory, auth })
    connection.api = identity.api
    connection.serverVersion = identity.version
    return { api: identity.api, resolved: true }
  } catch {
    return { api: undefined, resolved: false }
  }
}

export const useConnections = create<ConnectionsState>((set, get) => ({
  connections: [],
  activeConnection: null,
  client: null,
  clientBase: null,
  serverHome: null,
  currentProject: null,
  recentDirectories: [],
  isLoading: true,
  error: null,

  loadConnections: async () => {
    try {
      set({ isLoading: true, error: null })
      const [stored, recentRaw] = await Promise.all([
        SecureStore.getItemAsync(CONNECTIONS_KEY),
        SecureStore.getItemAsync(RECENT_DIRS_KEY),
      ])
      const connections: ServerConnection[] = stored ? JSON.parse(stored) : []
      const recentDirectories: string[] = recentRaw ? JSON.parse(recentRaw) : []

      // Find active connection
      const active = connections.find((c) => c.active) || null

      // Create client for active connection
      let client: Client | null = null
      let base: ClientBase | null = null
      if (active) {
        const password = await SecureStore.getItemAsync(`${PASSWORDS_PREFIX}${active.id}`)
        const auth = buildAuth(active.username, password)
        const { api, resolved } = await resolveApi(active, auth)
        const built = buildClient(active.url, active.directory, auth, api)
        client = built.client
        base = built.base
        // Persist a probe that was only just discovered, so the next launch
        // picks the same transport without probing again.
        if (resolved) await SecureStore.setItemAsync(CONNECTIONS_KEY, JSON.stringify(connections))
      }

      set({
        connections,
        activeConnection: active,
        client,
        clientBase: base,
        currentProject: null,
        serverHome: null,
        recentDirectories,
        isLoading: false,
      })

      // Publish the client before optional project/path metadata. SSE startup
      // must not wait on these unrelated calls: on a slow mobile route either
      // request can spend its full timeout before realtime recovery begins.
      if (client) {
        const requestClient = client
        void Promise.all([
          requestClient.project.current().catch(() => null),
          requestClient.path.get().catch(() => null),
        ]).then(([project, paths]) => {
          if (get().client !== requestClient) return
          set({ currentProject: project, serverHome: paths?.home || null })
        })
      }
    } catch (error) {
      set({ error: "Failed to load connections", isLoading: false })
    }
  },

  addConnection: async (connection, password) => {
    const id = generateId()
    const newConnection: ServerConnection = {
      ...connection,
      id,
      active: get().connections.length === 0, // First connection is active
    }

    const connections = [...get().connections, newConnection]

    // Store password separately if provided
    if (password) {
      await SecureStore.setItemAsync(`${PASSWORDS_PREFIX}${id}`, password)
    }

    await SecureStore.setItemAsync(CONNECTIONS_KEY, JSON.stringify(connections))

    // If this is the first/active connection, create client
    let client = get().client
    let base = get().clientBase
    let activeConnection = get().activeConnection

    if (newConnection.active) {
      activeConnection = newConnection
      const auth = buildAuth(newConnection.username, password)
      const { api } = await resolveApi(newConnection, auth)
      const built = buildClient(newConnection.url, newConnection.directory, auth, api)
      const requestClient = built.client
      client = requestClient
      base = built.base
      set({ connections, activeConnection, client, clientBase: base, currentProject: null, serverHome: null })
      void Promise.all([
        requestClient.project.current().catch(() => null),
        requestClient.path.get().catch(() => null),
      ]).then(([project, paths]) => {
        if (get().client !== requestClient) return
        set({ currentProject: project, serverHome: paths?.home || null })
      })
      return
    }

    set({ connections, activeConnection, client, clientBase: base })
  },

  removeConnection: async (id) => {
    const connections = get().connections.filter((c) => c.id !== id)

    // Remove stored password
    await SecureStore.deleteItemAsync(`${PASSWORDS_PREFIX}${id}`)
    await SecureStore.setItemAsync(CONNECTIONS_KEY, JSON.stringify(connections))

    // If removing active connection, clear client
    const wasActive = get().activeConnection?.id === id
    if (wasActive) {
      const newActive = connections[0] || null
      if (newActive) {
        // Mark new connection as active
        newActive.active = true
        await SecureStore.setItemAsync(CONNECTIONS_KEY, JSON.stringify(connections))
        const password = await SecureStore.getItemAsync(`${PASSWORDS_PREFIX}${newActive.id}`)
        const auth = buildAuth(newActive.username, password)
        const { api, resolved } = await resolveApi(newActive, auth)
        const built = buildClient(newActive.url, newActive.directory, auth, api)
        if (resolved) await SecureStore.setItemAsync(CONNECTIONS_KEY, JSON.stringify(connections))
        set({ connections, activeConnection: newActive, client: built.client, clientBase: built.base })
      } else {
        set({ connections, activeConnection: null, client: null, clientBase: null })
      }
    } else {
      set({ connections })
    }
  },

  setActiveConnection: async (id) => {
    const connections = get().connections.map((c) => ({
      ...c,
      active: c.id === id,
    }))

    await SecureStore.setItemAsync(CONNECTIONS_KEY, JSON.stringify(connections))

    const active = connections.find((c) => c.id === id) || null
    let client: Client | null = null
    let base: ClientBase | null = null
    let requestClient: Client | null = null

    if (active) {
      const password = await SecureStore.getItemAsync(`${PASSWORDS_PREFIX}${active.id}`)
      const auth = buildAuth(active.username, password)
      const { api } = await resolveApi(active, auth)
      const built = buildClient(active.url, active.directory, auth, api)
      requestClient = built.client
      client = requestClient
      base = built.base

      // Update last connected time
      active.lastConnected = Date.now()
      await SecureStore.setItemAsync(CONNECTIONS_KEY, JSON.stringify(connections))
    }

    set({ connections, activeConnection: active, client, clientBase: base, currentProject: null, serverHome: null })
    if (requestClient) {
      void Promise.all([
        requestClient.project.current().catch(() => null),
        requestClient.path.get().catch(() => null),
      ]).then(([project, paths]) => {
        if (get().client !== requestClient) return
        set({ currentProject: project, serverHome: paths?.home || null })
      })
    }
    addBreadcrumb({
      category: "connection",
      message: active ? `active connection set: ${active.type}` : "active connection cleared",
      data: { id: active?.id, type: active?.type, hasProject: false },
    })
  },

  testConnection: async (connection, source, password) => {
    track(AnalyticsEvent.ConnectionAttempted, { source })
    try {
      const auth = buildAuth(connection.username, password)
      // Probe before anything else. Against a v1 server the v2 health route is not
      // a route at all — it falls through to the web SPA and answers 200 with HTML,
      // which used to read as "connected" and then failed on every real request.
      const identity = await probeServer({ baseUrl: connection.url, directory: connection.directory, auth })
      const client = createClient({
        baseUrl: connection.url,
        directory: connection.directory,
        auth,
        api: identity.api,
      })

      await client.global.health(CONNECTION_TEST_TIMEOUT_MS)
      track(AnalyticsEvent.ConnectionSucceeded, { source })
      return { ok: true, api: identity.api, serverVersion: identity.version }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      track(AnalyticsEvent.ConnectionFailed, { source, error_class: classifyConnectionError(message) })
      return { ok: false, error: message }
    }
  },

  updateConnection: async (id, updates, password) => {
    const connections = get().connections.map((c) => {
      if (c.id !== id) return c
      const merged = { ...c, ...updates }
      // A different URL is a different server: drop the recorded probe so the
      // next client build re-detects the transport instead of reusing the
      // previous server's answer.
      if (updates.url !== undefined && updates.url !== c.url) {
        merged.api = undefined
        merged.serverVersion = undefined
      }
      return merged
    })

    await SecureStore.setItemAsync(CONNECTIONS_KEY, JSON.stringify(connections))

    // Persist a new password only when one was entered. The edit form loads the
    // password field blank (passwords aren't read back for security), so an
    // empty value means "keep the existing password", not "clear it". Written
    // before the active-client rebuild below so the rebuilt client picks it up.
    if (password) {
      await SecureStore.setItemAsync(`${PASSWORDS_PREFIX}${id}`, password)
    }

    // If updating active connection, recreate client
    if (get().activeConnection?.id === id) {
      const active = connections.find((c) => c.id === id)!
      const password = await SecureStore.getItemAsync(`${PASSWORDS_PREFIX}${id}`)
      const auth = buildAuth(active.username, password)
      const { api, resolved } = await resolveApi(active, auth)
      const built = buildClient(active.url, active.directory, auth, api)
      if (resolved) await SecureStore.setItemAsync(CONNECTIONS_KEY, JSON.stringify(connections))
      set({
        connections,
        activeConnection: active,
        client: built.client,
        clientBase: built.base,
        currentProject: null,
        serverHome: null,
      })
      void Promise.all([
        built.client.project.current().catch(() => null),
        built.client.path.get().catch(() => null),
      ]).then(([project, paths]) => {
        if (get().client !== built.client) return
        set({ currentProject: project, serverHome: paths?.home || null })
      })
    } else {
      set({ connections })
    }
  },

  refreshProject: async () => {
    const client = get().client
    if (!client) return

    try {
      const project = await client.project.current()
      set({ currentProject: project })
    } catch {
      set({ currentProject: null })
    }
  },

  clientForDirectory: (directory) => {
    const base = get().clientBase
    if (!base) return null
    // Reuse current client if directory matches
    const active = get().activeConnection
    if (active?.directory === directory) return get().client
    return createClient({ baseUrl: base.baseUrl, directory, auth: base.auth, api: base.api })
  },

  switchDirectory: async (directory) => {
    const active = get().activeConnection
    if (!active) return
    // Update connection directory and recreate client. Normalize trailing
    // slashes so "/home/user" and "/home/user/" don't diverge (recent-dir
    // duplicates + a mismatched "current directory" highlight).
    const trimmed = directory?.trim()
    const dir = trimmed ? stripTrailingSlash(trimmed) : undefined
    await get().updateConnection(active.id, { directory: dir })
    // Record in recents if it's a real directory
    if (dir) await get().addRecentDirectory(dir)
  },

  addRecentDirectory: async (directory) => {
    const current = get().recentDirectories
    // Normalize trailing slashes so the same dir entered as ".../x" and
    // ".../x/" dedups to one recent-list entry instead of two.
    directory = stripTrailingSlash(directory.trim())
    // Move to front, dedup, cap at MAX
    const updated = [directory, ...current.filter((d) => d !== directory)].slice(0, MAX_RECENT_DIRS)
    set({ recentDirectories: updated })
    await SecureStore.setItemAsync(RECENT_DIRS_KEY, JSON.stringify(updated))
  },
}))
