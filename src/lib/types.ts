import type { ServerApi } from "./api-detect"

// Connection types for multiple server support
export type ConnectionType = "local" | "tunnel" | "cloud"

export interface ServerConnection {
  id: string
  name: string
  type: ConnectionType
  url: string
  // For auth
  username?: string
  // Password stored separately in SecureStore
  // Directory to use for this connection
  directory?: string
  // When last successfully connected
  lastConnected?: number
  // Is this the active connection?
  active?: boolean
  // Which server API the last probe found. "v1" means the server predates the
  // /api/ rewrite (opencode <= 1.18.x) and gets the legacy transport from
  // sdk-v1.ts. Absent means "not probed yet", which behaves as v2.
  api?: ServerApi
  // Server version reported by that probe, shown in the connection UI.
  serverVersion?: string
}

export interface AppSettings {
  // Require biometric auth to open app
  requireBiometric: boolean
  // Require biometric to send messages
  requireBiometricForMessages: boolean
  // Theme preference
  theme: "light" | "dark" | "system"
  // Show notifications for task completion
  notifications: boolean
}

// Re-export SDK types we'll use frequently
export type { Session, Message, Part, Project, Event, HealthResponse } from "./sdk"
