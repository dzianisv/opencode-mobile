// Chatwoot support-feedback client using the PUBLIC client API
// (/public/api/v1/inboxes/{inbox_identifier}/...), which is designed for
// untrusted clients: the only value shipped in the binary is the inbox
// identifier. Never put an account-level api_access_token in this app —
// that token can read/write the whole support account.
//
// Contacts are created anonymously (no identifier), so Chatwoot's HMAC
// identifier-validation does not apply. The returned contact source_id is
// persisted via injected storage hooks so repeat reports from the same
// install land on the same contact.
//
// This module is dependency-injected and imports no React Native / Expo
// packages so it runs under `node --test`.

const REQUEST_TIMEOUT_MS = 15_000

export interface ChatwootDeps {
  fetchFn?: typeof fetch
  loadSourceId?: () => Promise<string | null>
  saveSourceId?: (id: string) => Promise<void>
}

interface ChatwootConfig {
  baseUrl: string
  inboxIdentifier: string
}

export function getChatwootConfig(): ChatwootConfig | null {
  const inboxIdentifier = process.env.EXPO_PUBLIC_CHATWOOT_INBOX_IDENTIFIER
  if (!inboxIdentifier) return null
  const baseUrl = (process.env.EXPO_PUBLIC_CHATWOOT_BASE_URL || "https://support.agentlabs.cc").replace(/\/+$/, "")
  return { baseUrl, inboxIdentifier }
}

export function chatwootConfigured(): boolean {
  return getChatwootConfig() !== null
}

async function post(
  fetchFn: typeof fetch,
  url: string,
  body: Record<string, unknown>,
): Promise<{ status: number; json: Record<string, unknown> | null }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    let json: Record<string, unknown> | null = null
    try {
      json = (await res.json()) as Record<string, unknown>
    } catch {
      // non-JSON error body
    }
    return { status: res.status, json }
  } finally {
    clearTimeout(timer)
  }
}

async function createContact(fetchFn: typeof fetch, cfg: ChatwootConfig): Promise<string> {
  const { status, json } = await post(fetchFn, `${cfg.baseUrl}/public/api/v1/inboxes/${cfg.inboxIdentifier}/contacts`, {
    name: "OpenCode Mobile user",
  })
  const sourceId = json?.source_id
  if (status >= 400 || typeof sourceId !== "string" || !sourceId) {
    throw new Error(`chatwoot contact create failed (http ${status})`)
  }
  return sourceId
}

async function createConversation(fetchFn: typeof fetch, cfg: ChatwootConfig, sourceId: string): Promise<number> {
  const { status, json } = await post(
    fetchFn,
    `${cfg.baseUrl}/public/api/v1/inboxes/${cfg.inboxIdentifier}/contacts/${encodeURIComponent(sourceId)}/conversations`,
    {},
  )
  const id = json?.id
  if (status >= 400 || typeof id !== "number") {
    const err = new Error(`chatwoot conversation create failed (http ${status})`)
    ;(err as Error & { status?: number }).status = status
    throw err
  }
  return id
}

async function postMessage(
  fetchFn: typeof fetch,
  cfg: ChatwootConfig,
  sourceId: string,
  conversationId: number,
  content: string,
): Promise<void> {
  const { status } = await post(
    fetchFn,
    `${cfg.baseUrl}/public/api/v1/inboxes/${cfg.inboxIdentifier}/contacts/${encodeURIComponent(sourceId)}/conversations/${conversationId}/messages`,
    { content },
  )
  if (status >= 400) throw new Error(`chatwoot message post failed (http ${status})`)
}

/**
 * Send an already-scrubbed report to the support inbox as a new conversation.
 * Returns true on success, false when Chatwoot is not configured.
 * Throws on network/API failure — callers decide whether that is fatal
 * (the in-app share path treats it as best-effort).
 *
 * Consent is NOT checked here; this module has no access to the consent
 * store. Callers MUST gate on telemetry consent before invoking.
 */
export async function sendSupportReport(content: string, deps: ChatwootDeps = {}): Promise<boolean> {
  const cfg = getChatwootConfig()
  if (!cfg) return false
  const fetchFn = deps.fetchFn ?? fetch

  let sourceId = (await deps.loadSourceId?.().catch(() => null)) ?? null
  let created = false
  if (!sourceId) {
    sourceId = await createContact(fetchFn, cfg)
    created = true
  }

  let conversationId: number
  try {
    conversationId = await createConversation(fetchFn, cfg, sourceId)
  } catch (error) {
    const status = (error as { status?: number }).status
    // A persisted source_id can go stale (contact deleted server-side).
    // Recreate the contact once and retry.
    if (created || status !== 404) throw error
    sourceId = await createContact(fetchFn, cfg)
    created = true
    conversationId = await createConversation(fetchFn, cfg, sourceId)
  }

  await postMessage(fetchFn, cfg, sourceId, conversationId, content)
  if (created) await deps.saveSourceId?.(sourceId).catch(() => undefined)
  return true
}
