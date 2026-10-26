export const SESSION_DRAFT_PREFIX = "opencode.session.draft.v1."

export interface DraftStorage {
  getItemAsync(key: string): Promise<string | null>
  setItemAsync(key: string, value: string): Promise<void>
  deleteItemAsync(key: string): Promise<void>
}

function keyFor(sessionID: string): string {
  return `${SESSION_DRAFT_PREFIX}${sessionID}`
}

export function readSessionDraft(storage: DraftStorage, sessionID: string): Promise<string | null> {
  return storage.getItemAsync(keyFor(sessionID))
}

export function writeSessionDraft(storage: DraftStorage, sessionID: string, text: string): Promise<void> {
  if (text.length === 0) return storage.deleteItemAsync(keyFor(sessionID))
  return storage.setItemAsync(keyFor(sessionID), text)
}
