export type AuthMode = "none" | "basic" | "oidc"

export function inferAuthMode(
  stored: { authMode?: string },
  hasPassword: boolean,
): AuthMode {
  if (stored.authMode === "none" || stored.authMode === "basic" || stored.authMode === "oidc") {
    return stored.authMode
  }
  if (hasPassword) return "basic"
  return "none"
}
