import * as AuthSession from "expo-auth-session"
import * as WebBrowser from "expo-web-browser"
import { normalizeIssuer, OIDC_REDIRECT_URI, OIDC_SCOPES, type OidcTokenSet } from "./oidc"

WebBrowser.maybeCompleteAuthSession()

function toTokenSet(token: AuthSession.TokenResponse, fallbackRefresh?: string): OidcTokenSet {
  const expiresIn = token.expiresIn ?? 3600
  return {
    accessToken: token.accessToken,
    refreshToken: token.refreshToken ?? fallbackRefresh,
    expiresAt: Date.now() + expiresIn * 1000,
  }
}

export async function loginWithOidc(issuer: string, clientId: string): Promise<OidcTokenSet | null> {
  const discovery = await AuthSession.fetchDiscoveryAsync(normalizeIssuer(issuer)).catch(() => null)
  if (!discovery) return null
  const request = new AuthSession.AuthRequest({
    clientId,
    redirectUri: OIDC_REDIRECT_URI,
    scopes: [...OIDC_SCOPES],
    usePKCE: true,
    responseType: AuthSession.ResponseType.Code,
  })
  await request.makeAuthUrlAsync(discovery).catch(() => null)
  const result = await request.promptAsync(discovery).catch(() => null)
  if (!result || result.type !== "success" || !result.params.code) return null
  const token = await AuthSession.exchangeCodeAsync(
    {
      clientId,
      code: result.params.code,
      extraParams: { code_verifier: request.codeVerifier ?? "" },
      redirectUri: OIDC_REDIRECT_URI,
    },
    discovery,
  ).catch(() => null)
  if (!token) return null
  return toTokenSet(token)
}

export async function refreshOidcToken(
  issuer: string,
  clientId: string,
  refreshToken: string,
): Promise<OidcTokenSet | null> {
  const discovery = await AuthSession.fetchDiscoveryAsync(normalizeIssuer(issuer)).catch(() => null)
  if (!discovery) return null
  const token = await AuthSession.refreshAsync({ clientId, refreshToken }, discovery).catch(() => null)
  if (!token) return null
  return toTokenSet(token, refreshToken)
}
