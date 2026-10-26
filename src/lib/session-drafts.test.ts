import assert from "node:assert/strict"
import test from "node:test"
import { readSessionDraft, writeSessionDraft, type DraftStorage } from "./session-drafts.ts"

function memoryStorage(): DraftStorage {
  const values = new Map<string, string>()
  return {
    async getItemAsync(key) { return values.get(key) ?? null },
    async setItemAsync(key, value) { values.set(key, value) },
    async deleteItemAsync(key) { values.delete(key) },
  }
}

test("encrypted draft storage preserves long Unicode, Markdown, and line endings exactly", async () => {
  const storage = memoryStorage()
  const phrase = "Follow the spec 🙂\r\n```json\n{\"greeting\":\"héllo\"}\n```\ne\u0301 — "
  const text = phrase.repeat(5_000)
  await writeSessionDraft(storage, "ses_1", text)
  const restored = await readSessionDraft(storage, "ses_1")
  assert.equal(restored, text)
  assert.equal(Buffer.byteLength(restored ?? "", "utf8"), Buffer.byteLength(text, "utf8"))
})

test("drafts are isolated by session and empty text removes only that draft", async () => {
  const storage = memoryStorage()
  await writeSessionDraft(storage, "ses_a", "draft a")
  await writeSessionDraft(storage, "ses_b", "draft b")
  await writeSessionDraft(storage, "ses_a", "")
  assert.equal(await readSessionDraft(storage, "ses_a"), null)
  assert.equal(await readSessionDraft(storage, "ses_b"), "draft b")
})
