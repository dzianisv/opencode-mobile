import assert from "node:assert/strict"
import test from "node:test"
import type { Message } from "./sdk.ts"
import { reviewDiffsForMessage } from "./review-diffs.ts"

const user: Message = {
  id: "user-1",
  sessionID: "session-1",
  role: "user",
  time: { created: 1 },
  summary: {
    diffs: [{ file: "src/app.ts", patch: "-old\n+new", additions: 1, deletions: 1, status: "modified" }],
  },
}

test("reviewDiffsForMessage links an assistant reply to its user turn", () => {
  const assistant: Message = {
    id: "assistant-1",
    sessionID: "session-1",
    role: "assistant",
    parentID: user.id,
    time: { created: 2 },
  }

  assert.deepEqual(reviewDiffsForMessage(assistant, [user, assistant]), user.summary?.diffs)
})

test("reviewDiffsForMessage ignores unrelated messages", () => {
  const assistant: Message = {
    id: "assistant-2",
    sessionID: "session-1",
    role: "assistant",
    parentID: "other-user",
    time: { created: 3 },
  }

  assert.equal(reviewDiffsForMessage(user, [user, assistant]), undefined)
  assert.equal(reviewDiffsForMessage(assistant, [user, assistant]), undefined)
})

test("reviewDiffsForMessage hides changes from an earlier turn", () => {
  const assistant: Message = {
    id: "assistant-1",
    sessionID: "session-1",
    role: "assistant",
    parentID: user.id,
    time: { created: 2 },
  }

  const laterUser: Message = {
    ...user,
    id: "user-2",
    time: { created: 3 },
  }

  assert.equal(reviewDiffsForMessage(assistant, [user, assistant, laterUser]), undefined)
})

test("reviewDiffsForMessage uses the last user turn in response order", () => {
  const earlierAssistant: Message = {
    id: "assistant-early",
    sessionID: "session-1",
    role: "assistant",
    parentID: user.id,
    time: { created: 2 },
  }
  const laterUser: Message = {
    ...user,
    id: "user-2",
    time: { created: 3 },
  }

  assert.equal(reviewDiffsForMessage(earlierAssistant, [user, earlierAssistant, laterUser]), undefined)
})

test("reviewDiffsForMessage keeps the current turn when no newer user exists", () => {
  const assistant: Message = {
    id: "assistant-1",
    sessionID: "session-1",
    role: "assistant",
    parentID: user.id,
    time: { created: 2 },
  }

  assert.deepEqual(reviewDiffsForMessage(assistant, [user, assistant]), user.summary?.diffs)
})

test("reviewDiffsForMessage renders once after multiple assistant messages in a turn", () => {
  const firstAssistant: Message = {
    id: "assistant-1",
    sessionID: "session-1",
    role: "assistant",
    parentID: user.id,
    time: { created: 2 },
  }
  const lastAssistant: Message = {
    ...firstAssistant,
    id: "assistant-2",
    time: { created: 3 },
  }

  assert.equal(reviewDiffsForMessage(firstAssistant, [user, firstAssistant, lastAssistant]), undefined)
  assert.deepEqual(reviewDiffsForMessage(lastAssistant, [user, firstAssistant, lastAssistant]), user.summary?.diffs)
})
