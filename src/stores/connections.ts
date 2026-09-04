import { create } from "zustand"
import * as SecureStore from "expo-secure-store"
import * as Crypto from "expo-crypto"
import type { ServerConnection } from "../lib/types"
import { createClient, type Client, type Project } from "../lib/sdk"
import { addBreadcrumb } from "../lib/sentry"
import { AnalyticsEvent, classifyConnectionError, track, type ConnectionTestSource } from "../lib/analytics"
import { buildAuth } from "../lib/auth"
import { inferAuthMode } from "../lib/auth-mode"
import type { RequestAuth } from "../lib/headers"
import { needsRefresh, normalizeIssuer } from "../lib/oidc"
import { loginWithOidc, refreshOidcToken } from "../lib/oidc-session"
import { clearOidcAccess, clearOidcTokens, loadOidcTokens, saveOidcTokens } from "../lib/oidc-tokens"
import { stripTrailingSlash } from "../lib/path-utils"

const CONNECTIONS_KEY = "opencode_connections"
const PASSWORDS_PREFIX = "opencode_password_"
const RECENT_DIRS_KEY = "opencode_recent_dirs"
const MAX_RECENT_DIRS = 10
const CONNECTION_TEST_TIMEOUT_MS = 12_000

interface ClientBase {
  baseUrl: string
  auth?: RequestAuth
}

interface ConnectionsState {
  connections: ServerConnection[]
  activeConnection: ServerConnection | null
  client: Client | null
  clientBase: ClientBase | null
  currentProject: Project | null
  serverHome: string | null
  recentDirectories: string[]
  isLoading: boolean
  error: string | null

  loadConnections: () => Promise<void>
  addConnection: (connection: Omit<ServerConnection, "id">, password?: string) => Promise<{ cancelled?: boolean }>
  removeConnection: (id: string) => Promise<void>
  setActiveConnection: (id: string) => Promise<void>
  testConnection: (
    connection: ServerConnection,
    source: ConnectionTestSource,
    password?: string,
  ) => Promise<{ ok: boolean; error?: string }>
  updateConnection: (id: string, updates: Partial<ServerConnection>, password?: string) => Promise<void>
  loginOidc: (id: string) => Promise<{ ok: boolean; cancelled?: boolean }>
  refreshProject: () => Promise<void>
  clientForDirectory: (directory?: string) => Client | null
  switchDirectory: (directory?: string) => Promise<void>
  addRecentDirectory: (directory: string) => Promise<void>
}

function generateId(): string {
  return Crypto.randomUUID().replace(/-/g, "").slice(0, 16)
}

function buildClient(
  url: string,
  directory?: string,
  auth?: RequestAuth,
): { client: Client; base: ClientBase } {
  const base: ClientBase = { baseUrl: url, auth }
  const client = createClient({ baseUrl: url, directory, auth })
  return { client, base }
}

function persistable(connection: Omit<ServerConnection, "id"> & { id: string }): ServerConnection {
  const authMode = inferAuthMode(connection, false)
  if (authMode !== "oidc") {
    return {
      ...connection,
      authMode,
      oidcIssuer: undefined,
      oidcClientId: undefined,
    }
  }
  return {
    ...connection,
    authMode: "oidc",
    oidcIssuer: connection.oidcIssuer ? normalizeIssuer(connection.oidcIssuer) : undefined,
    oidcClientId: connection.oidcClientId?.trim() || undefined,
  }
}

async function hydrateConnections(raw: ServerConnection[]): Promise<{ connections: ServerConnection[]; dirty: boolean }> {
  let dirty = false
  const connections = await Promise.all(
    raw.map(async (c) => {
      if (c.authMode === "none" || c.authMode === "basic" || c.authMode === "oidc") return c
      dirty = true
      const password = await SecureStore.getItemAsync(`${PASSWORDS_PREFIX}${c.id}`)
      return { ...c, authMode: inferAuthMode(c, Boolean(password)) }
    }),
  )
  return { connections, dirty }
}

async function bearerFor(connection: ServerConnection): Promise<RequestAuth | undefined> {
  const tokens = await loadOidcTokens(connection.id)
  if (!tokens?.accessToken) return undefined
  if (!needsRefresh(tokens.expiresAt, Date.now())) return { token: tokens.accessToken }
  if (!tokens.refreshToken || !connection.oidcIssuer || !connection.oidcClientId) {
    await clearOidcAccess(connection.id)
    return undefined
  }
  const refreshed = await refreshOidcToken(connection.oidcIssuer, connection.oidcClientId, tokens.refreshToken)
  if (!refreshed) {
    await clearOidcAccess(connection.id)
    return undefined
  }
  await saveOidcTokens(connection.id, refreshed)
  return { token: refreshed.accessToken }
}

async function requestAuthFor(connection: ServerConnection, passwordOverride?: string): Promise<RequestAuth | undefined> {
  const mode = inferAuthMode(connection, Boolean(passwordOverride))
  if (mode === "oidc") return bearerFor(connection)
  const password = passwordOverride ?? (await SecureStore.getItemAsync(`${PASSWORDS_PREFIX}${connection.id}`)) ?? undefined
  return buildAuth(connection.username, password)
}

async function ensureOidcLogin(connection: ServerConnection): Promise<{ ok: boolean; cancelled?: boolean }> {
  if (inferAuthMode(connection, false) !== "oidc") return { ok: true }
  if (!connection.oidcIssuer || !connection.oidcClientId) return { ok: false }
  const existing = await loadOidcTokens(connection.id)
  if (existing?.accessToken && !needsRefresh(existing.expiresAt, Date.now())) return { ok: true }
  const tokens = await loginWithOidc(connection.oidcIssuer, connection.oidcClientId)
  if (!tokens) return { ok: false, cancelled: true }
  await saveOidcTokens(connection.id, tokens)
  return { ok: true }
}

async function applyActive(
  connection: ServerConnection,
  password?: string,
): Promise<{ client: Client; base: ClientBase; project: Project | null; home: string | null }> {
  const auth = await requestAuthFor(connection, password)
  const built = buildClient(connection.url, connection.directory, auth)
  const [project, paths] = await Promise.all([
    built.client.project.current().catch(() => null),
    built.client.path.get().catch(() => null),
  ])
  return { client: built.client, base: built.base, project, home: paths?.home || null }
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
      const parsed: ServerConnection[] = stored ? JSON.parse(stored) : []
      const { connections, dirty } = await hydrateConnections(parsed)
      if (dirty) await SecureStore.setItemAsync(CONNECTIONS_KEY, JSON.stringify(connections))
      const recentDirectories: string[] = recentRaw ? JSON.parse(recentRaw) : []

      const active = connections.find((c) => c.active) || null

      let client: Client | null = null
      let base: ClientBase | null = null
      let project: Project | null = null
      let home: string | null = null
      if (active) {
        const applied = await applyActive(active)
        client = applied.client
        base = applied.base
        project = applied.project
        home = applied.home
      }

      set({
        connections,
        activeConnection: active,
        client,
        clientBase: base,
        currentProject: project,
        serverHome: home,
        recentDirectories,
        isLoading: false,
      })
    } catch {
      set({ error: "Failed to load connections", isLoading: false })
    }
  },

  addConnection: async (connection, password) => {
    const id = generateId()
    const newConnection = persistable({
      ...connection,
      id,
      authMode: connection.authMode ?? inferAuthMode(connection, Boolean(password)),
      active: get().connections.length === 0,
    })

    const connections = [...get().connections, newConnection]

    if (password && newConnection.authMode === "basic") {
      await SecureStore.setItemAsync(`${PASSWORDS_PREFIX}${id}`, password)
    }

    let cancelled = false
    if (newConnection.authMode === "oidc") {
      const login = await ensureOidcLogin(newConnection)
      cancelled = Boolean(login.cancelled)
    }

    await SecureStore.setItemAsync(CONNECTIONS_KEY, JSON.stringify(connections))

    let client = get().client
    let base = get().clientBase
    let activeConnection = get().activeConnection
    let project = get().currentProject
    let serverHome = get().serverHome

    if (newConnection.active) {
      activeConnection = newConnection
      const applied = await applyActive(newConnection, password)
      client = applied.client
      base = applied.base
      project = applied.project
      serverHome = applied.home
    }

    set({ connections, activeConnection, client, clientBase: base, currentProject: project, serverHome })
    return { cancelled }
  },

  removeConnection: async (id) => {
    const connections = get().connections.filter((c) => c.id !== id)

    await SecureStore.deleteItemAsync(`${PASSWORDS_PREFIX}${id}`)
    await clearOidcTokens(id)
    await SecureStore.setItemAsync(CONNECTIONS_KEY, JSON.stringify(connections))

    const wasActive = get().activeConnection?.id === id
    if (!wasActive) {
      set({ connections })
      return
    }
    const newActive = connections[0] || null
    if (!newActive) {
      set({ connections, activeConnection: null, client: null, clientBase: null })
      return
    }
    newActive.active = true
    await SecureStore.setItemAsync(CONNECTIONS_KEY, JSON.stringify(connections))
    const applied = await applyActive(newActive)
    set({
      connections,
      activeConnection: newActive,
      client: applied.client,
      clientBase: applied.base,
      currentProject: applied.project,
      serverHome: applied.home,
    })
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
    let project: Project | null = null
    let home: string | null = null

    if (active) {
      const applied = await applyActive(active)
      client = applied.client
      base = applied.base
      project = applied.project
      home = applied.home
      active.lastConnected = Date.now()
      await SecureStore.setItemAsync(CONNECTIONS_KEY, JSON.stringify(connections))
    }

    set({ connections, activeConnection: active, client, clientBase: base, currentProject: project, serverHome: home })
    addBreadcrumb({
      category: "connection",
      message: active ? `active connection set: ${active.type}` : "active connection cleared",
      data: { id: active?.id, type: active?.type, hasProject: Boolean(project) },
    })
  },

  testConnection: async (connection, source, password) => {
    track(AnalyticsEvent.ConnectionAttempted, { source })
    try {
      const auth = await requestAuthFor(connection, password)
      const client = createClient({
        baseUrl: connection.url,
        directory: connection.directory,
        auth,
      })

      await client.global.health(CONNECTION_TEST_TIMEOUT_MS)
      track(AnalyticsEvent.ConnectionSucceeded, { source })
      return { ok: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      track(AnalyticsEvent.ConnectionFailed, { source, error_class: classifyConnectionError(message) })
      return { ok: false, error: message }
    }
  },

  updateConnection: async (id, updates, password) => {
    const previous = get().connections.find((c) => c.id === id)
    const merged = persistable({
      ...(previous as ServerConnection),
      ...updates,
      id,
      authMode: updates.authMode ?? previous?.authMode ?? inferAuthMode({ ...previous, ...updates }, Boolean(password)),
    })
    const connections = get().connections.map((c) => (c.id === id ? merged : c))

    await SecureStore.setItemAsync(CONNECTIONS_KEY, JSON.stringify(connections))

    if (password && merged.authMode === "basic") {
      await SecureStore.setItemAsync(`${PASSWORDS_PREFIX}${id}`, password)
    }

    if (previous?.authMode === "oidc" && merged.authMode !== "oidc") {
      await clearOidcTokens(id)
    }

    const authChanged = updates.authMode !== undefined || updates.oidcIssuer !== undefined || updates.oidcClientId !== undefined
    if (merged.authMode === "oidc" && authChanged) await ensureOidcLogin(merged)

    if (get().activeConnection?.id !== id) {
      set({ connections })
      return
    }
    const applied = await applyActive(merged, password)
    set({
      connections,
      activeConnection: merged,
      client: applied.client,
      clientBase: applied.base,
      currentProject: applied.project,
      serverHome: applied.home,
    })
  },

  loginOidc: async (id) => {
    const connection = get().connections.find((c) => c.id === id)
    if (!connection?.oidcIssuer || !connection.oidcClientId) return { ok: false }
    await clearOidcAccess(id)
    const tokens = await loginWithOidc(connection.oidcIssuer, connection.oidcClientId)
    if (!tokens) return { ok: false, cancelled: true }
    await saveOidcTokens(id, tokens)
    if (get().activeConnection?.id !== id) return { ok: true }
    const applied = await applyActive(connection)
    set({
      client: applied.client,
      clientBase: applied.base,
      currentProject: applied.project,
      serverHome: applied.home,
    })
    return { ok: true }
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
    const active = get().activeConnection
    if (active?.directory === directory) return get().client
    return createClient({ baseUrl: base.baseUrl, directory, auth: base.auth })
  },

  switchDirectory: async (directory) => {
    const active = get().activeConnection
    if (!active) return
    const trimmed = directory?.trim()
    const dir = trimmed ? stripTrailingSlash(trimmed) : undefined
    await get().updateConnection(active.id, { directory: dir })
    if (dir) await get().addRecentDirectory(dir)
  },

  addRecentDirectory: async (directory) => {
    const current = get().recentDirectories
    directory = stripTrailingSlash(directory.trim())
    const updated = [directory, ...current.filter((d) => d !== directory)].slice(0, MAX_RECENT_DIRS)
    set({ recentDirectories: updated })
    await SecureStore.setItemAsync(RECENT_DIRS_KEY, JSON.stringify(updated))
  },
}))
