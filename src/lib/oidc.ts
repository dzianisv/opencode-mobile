export const OIDC_REDIRECT_URI = "opencode://auth"

export const OIDC_SCOPES = ["openid", "profile", "offline_access"] as const

export const ACCESS_PREFIX = "opencode_oidc_access_"
export const REFRESH_PREFIX = "opencode_oidc_refresh_"
export const EXPIRES_PREFIX = "opencode_oidc_expires_"

export interface OidcTokenSet {
  accessToken: string
  refreshToken?: string
  expiresAt: number
}

export function normalizeIssuer(issuer: string): string {
  return issuer.trim().replace(/\/+$/, "")
}

export function needsRefresh(expiresAtMs: number | null, nowMs: number, windowMs = 60_000): boolean {
  if (expiresAtMs == null) return true
  return expiresAtMs - nowMs <= windowMs
}

export function oidcAccessKey(id: string): string {
  return `${ACCESS_PREFIX}${id}`
}

export function oidcRefreshKey(id: string): string {
  return `${REFRESH_PREFIX}${id}`
}

export function oidcExpiresKey(id: string): string {
  return `${EXPIRES_PREFIX}${id}`
}
