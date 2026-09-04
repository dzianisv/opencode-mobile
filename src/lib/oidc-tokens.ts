import * as SecureStore from "expo-secure-store"
import { joinChunks, splitChunks } from "./secure-chunk"
import {
  ACCESS_PREFIX,
  EXPIRES_PREFIX,
  REFRESH_PREFIX,
  type OidcTokenSet,
} from "./oidc"

async function setAccess(id: string, value: string): Promise<void> {
  await deleteAccess(id)
  const parts = splitChunks(value)
  if (parts.length === 1) {
    await SecureStore.setItemAsync(`${ACCESS_PREFIX}${id}`, parts[0])
    return
  }
  await SecureStore.setItemAsync(`${ACCESS_PREFIX}${id}`, `__chunks:${parts.length}`)
  for (let i = 0; i < parts.length; i++) {
    await SecureStore.setItemAsync(`${ACCESS_PREFIX}${id}.${i}`, parts[i])
  }
}

async function setRefresh(id: string, value: string): Promise<void> {
  await deleteRefresh(id)
  const parts = splitChunks(value)
  if (parts.length === 1) {
    await SecureStore.setItemAsync(`${REFRESH_PREFIX}${id}`, parts[0])
    return
  }
  await SecureStore.setItemAsync(`${REFRESH_PREFIX}${id}`, `__chunks:${parts.length}`)
  for (let i = 0; i < parts.length; i++) {
    await SecureStore.setItemAsync(`${REFRESH_PREFIX}${id}.${i}`, parts[i])
  }
}

async function readChunked(main: string | null, chunkKey: (i: number) => Promise<string | null>): Promise<string | null> {
  if (!main) return null
  if (!main.startsWith("__chunks:")) return main
  const n = Number(main.slice("__chunks:".length))
  const parts: string[] = []
  for (let i = 0; i < n; i++) {
    const part = await chunkKey(i)
    if (part == null) return null
    parts.push(part)
  }
  return joinChunks(parts)
}

async function getAccess(id: string): Promise<string | null> {
  const main = await SecureStore.getItemAsync(`${ACCESS_PREFIX}${id}`)
  return readChunked(main, (i) => SecureStore.getItemAsync(`${ACCESS_PREFIX}${id}.${i}`))
}

async function getRefresh(id: string): Promise<string | null> {
  const main = await SecureStore.getItemAsync(`${REFRESH_PREFIX}${id}`)
  return readChunked(main, (i) => SecureStore.getItemAsync(`${REFRESH_PREFIX}${id}.${i}`))
}

async function deleteAccess(id: string): Promise<void> {
  const main = await SecureStore.getItemAsync(`${ACCESS_PREFIX}${id}`)
  await SecureStore.deleteItemAsync(`${ACCESS_PREFIX}${id}`)
  if (!main?.startsWith("__chunks:")) return
  const n = Number(main.slice("__chunks:".length))
  for (let i = 0; i < n; i++) {
    await SecureStore.deleteItemAsync(`${ACCESS_PREFIX}${id}.${i}`)
  }
}

async function deleteRefresh(id: string): Promise<void> {
  const main = await SecureStore.getItemAsync(`${REFRESH_PREFIX}${id}`)
  await SecureStore.deleteItemAsync(`${REFRESH_PREFIX}${id}`)
  if (!main?.startsWith("__chunks:")) return
  const n = Number(main.slice("__chunks:".length))
  for (let i = 0; i < n; i++) {
    await SecureStore.deleteItemAsync(`${REFRESH_PREFIX}${id}.${i}`)
  }
}

export async function loadOidcTokens(id: string): Promise<OidcTokenSet | null> {
  const accessToken = await getAccess(id)
  if (!accessToken) return null
  const refreshToken = (await getRefresh(id)) ?? undefined
  const expiresRaw = await SecureStore.getItemAsync(`${EXPIRES_PREFIX}${id}`)
  const expiresAt = expiresRaw ? Number(expiresRaw) : 0
  return { accessToken, refreshToken, expiresAt }
}

export async function saveOidcTokens(id: string, tokens: OidcTokenSet): Promise<void> {
  await setAccess(id, tokens.accessToken)
  await SecureStore.setItemAsync(`${EXPIRES_PREFIX}${id}`, String(tokens.expiresAt))
  if (!tokens.refreshToken) {
    await deleteRefresh(id)
    return
  }
  await setRefresh(id, tokens.refreshToken)
}

export async function clearOidcAccess(id: string): Promise<void> {
  await deleteAccess(id)
}

export async function clearOidcTokens(id: string): Promise<void> {
  await deleteAccess(id)
  await deleteRefresh(id)
  await SecureStore.deleteItemAsync(`${EXPIRES_PREFIX}${id}`)
}
