import { test } from "node:test"
import assert from "node:assert/strict"
import {
  formAnswerFromFields,
  pendingRequestInfo,
  rememberForm,
  toMessageWithParts,
  toProviderCatalog,
  toQuestionRequest,
  toSession,
  V2EventTranslator,
  type V2FormField,
  type V2Message,
  type V2ModelInfo,
  type V2RawEvent,
  type V2SessionInfo,
} from "./v2-shape.ts"

// Fixtures mirror the live v2 server capture (docs/v2-api-map.md): a prompt
// runs as execution -> steps -> text/reasoning/tool events -> idle.

const ev = (type: string, data: Record<string, unknown>): V2RawEvent => ({
  id: `evt-${type}`,
  created: 1000,
  type,
  data,
})

test("toSession maps v2 location/time/revert into the app shape", () => {
  const info: V2SessionInfo = {
    id: "ses_1",
    projectID: "proj1",
    title: "Hello",
    location: { directory: "/srv/proj" },
    time: { created: 10, updated: 20 },
    cost: 2.5,
    tokens: { input: 100, output: 20 },
    revert: { messageID: "msg_9" },
    parentID: "ses_0",
  }
  assert.deepEqual(toSession(info), {
    id: "ses_1",
    slug: "",
    projectID: "proj1",
    directory: "/srv/proj",
    parentID: "ses_0",
    title: "Hello",
    version: "",
    time: { created: 10, updated: 20, archived: undefined },
    cost: 2.5,
    tokens: { input: 100, output: 20 },
    revert: { messageID: "msg_9", partID: undefined },
  })
})

test("toMessageWithParts reshapes user/assistant and drops timeline markers", () => {
  const messages: V2Message[] = [
    {
      id: "msg_u1",
      sessionID: "ses_1",
      type: "user",
      time: { created: 1 },
      text: "hi",
      files: [{ data: "YWJj", mime: "image/png", name: "a.png" }],
    },
    {
      id: "msg_i1",
      type: "idle",
      time: { created: 2 },
      outcome: "succeeded",
    },
    {
      id: "msg_a1",
      sessionID: "ses_1",
      type: "assistant",
      time: { created: 3, completed: 4 },
      agent: "build",
      model: { id: "m1", providerID: "p1" },
      finish: "stop",
      cost: 0.5,
      tokens: { input: 1, output: 2, reasoning: 0, cache: { read: 0, write: 0 } },
      content: [
        { type: "reasoning", text: "thinking..." },
        {
          type: "tool",
          id: "call1",
          name: "write",
          state: {
            status: "completed",
            input: { path: "/x" },
            content: [{ type: "text", text: "done" }],
            metadata: { title: "/x" },
          },
          time: { created: 5, completed: 6 },
        },
        { type: "text", text: "final answer" },
      ],
    },
  ]
  const out = toMessageWithParts(messages)
  assert.equal(out.length, 2, "idle marker dropped")

  const user = out[0]
  assert.equal(user.info.role, "user")
  assert.deepEqual(user.parts.map((p) => p.type), ["text", "file"])
  assert.equal(user.parts[1].url, "data:image/png;base64,YWJj")

  const assistant = out[1]
  assert.equal(assistant.info.role, "assistant")
  assert.equal(assistant.info.modelID, "m1")
  assert.equal(assistant.info.providerID, "p1")
  assert.equal(assistant.info.finish, "stop")
  assert.deepEqual(assistant.parts.map((p) => p.type), ["reasoning", "tool", "text"])
  const tool = assistant.parts[1]
  assert.equal(tool.tool, "write")
  assert.equal(tool.state?.status, "completed")
  assert.equal(tool.state?.output, "done")
  assert.equal(tool.state?.title, "/x")
})

test("error tool state surfaces a message the ToolCallCard can render", () => {
  const out = toMessageWithParts([
    {
      id: "msg_a1",
      sessionID: "s",
      type: "assistant",
      time: { created: 1 },
      content: [
        {
          type: "tool",
          id: "c1",
          name: "bash",
          state: { status: "error", input: { command: "false" }, error: { data: { message: "exit 1" } } },
        },
      ],
    },
  ])
  const state = out[0].parts[0].state
  assert.equal(state?.status, "error")
  assert.equal(state?.error?.message, "exit 1")
})

test("translator replays a live execution flow into v1-style events", () => {
  const t = new V2EventTranslator()
  const stream: V2RawEvent[] = [
    { type: "server.connected", data: {} },
    ev("session.execution.started", { sessionID: "ses_1" }),
    ev("session.step.started", {
      sessionID: "ses_1",
      agent: "build",
      model: { id: "m1", providerID: "p1" },
      assistantMessageID: "msg_a1",
      started: 100,
    }),
    ev("session.reasoning.started", { sessionID: "ses_1", assistantMessageID: "msg_a1", ordinal: 0 }),
    ev("session.reasoning.delta", { sessionID: "ses_1", assistantMessageID: "msg_a1", ordinal: 0, delta: "thi" }),
    ev("session.reasoning.ended", { sessionID: "ses_1", assistantMessageID: "msg_a1", ordinal: 0, text: "thinking" }),
    ev("session.tool.input.started", { sessionID: "ses_1", assistantMessageID: "msg_a1", id: "c1", name: "write" }),
    ev("session.tool.input.delta", { sessionID: "ses_1", assistantMessageID: "msg_a1", id: "c1", delta: '{"path":' }),
    ev("session.tool.input.ended", { sessionID: "ses_1", assistantMessageID: "msg_a1", id: "c1", text: '{"path":"/x"}' }),
    ev("session.tool.called", { sessionID: "ses_1", assistantMessageID: "msg_a1", id: "c1", input: { path: "/x" } }),
    ev("session.tool.success", {
      sessionID: "ses_1",
      assistantMessageID: "msg_a1",
      id: "c1",
      content: [{ type: "text", text: "Created /x" }],
      metadata: { title: "/x" },
    }),
    ev("session.step.ended", { sessionID: "ses_1", assistantMessageID: "msg_a1", finish: "tool-calls", cost: 0, tokens: { input: 1, output: 2 } }),
    ev("session.text.started", { sessionID: "ses_1", assistantMessageID: "msg_a2", ordinal: 0 }),
    ev("session.text.delta", { sessionID: "ses_1", assistantMessageID: "msg_a2", ordinal: 0, delta: "3+3=" }),
    ev("session.text.delta", { sessionID: "ses_1", assistantMessageID: "msg_a2", ordinal: 0, delta: "6" }),
    ev("session.text.ended", { sessionID: "ses_1", assistantMessageID: "msg_a2", ordinal: 0, text: "3+3=6" }),
    ev("session.step.ended", { sessionID: "ses_1", assistantMessageID: "msg_a2", finish: "stop", cost: 0.01, tokens: { input: 3, output: 1 } }),
    ev("session.usage.updated", { sessionID: "ses_1", cost: 1, tokens: { input: 9, output: 4 } }),
    ev("session.execution.succeeded", { sessionID: "ses_1" }),
  ]

  const out = stream.flatMap((e) => t.translate(e))
  const types = out.map((e) => e.type)

  assert.equal(types[0], "session.status")
  assert.deepEqual((out[0].properties.status as { type: string }).type, "busy")

  // Assistant messages synthesized per step
  const messageUpdates = out.filter((e) => e.type === "message.updated")
  assert.deepEqual(
    messageUpdates.map((e) => (e.properties.info as { id: string }).id),
    ["msg_a1", "msg_a1", "msg_a2", "msg_a2"],
  )

  // Reasoning accumulates and the ended event carries the authoritative text
  const reasoning = out
    .filter((e) => e.type === "message.part.updated")
    .map((e) => e.properties.part as { type: string; text?: string })
    .filter((p) => p.type === "reasoning")
  assert.deepEqual(reasoning.map((p) => p.text), ["", "thi", "thinking"])

  // Tool part: running while streaming input, completed with parsed input + output
  const toolParts = out
    .filter((e) => e.type === "message.part.updated")
    .map((e) => e.properties.part as { type: string; state?: { status: string; input?: unknown; output?: string; title?: string } })
    .filter((p) => p.type === "tool")
  assert.equal(toolParts[0].state?.status, "running")
  assert.equal(toolParts[toolParts.length - 1].state?.status, "completed")
  assert.deepEqual(toolParts[toolParts.length - 1].state?.input, { path: "/x" })
  assert.equal(toolParts[toolParts.length - 1].state?.output, "Created /x")
  assert.equal(toolParts[toolParts.length - 1].state?.title, "/x")

  // Text deltas accumulate into the full text
  const textParts = out
    .filter((e) => e.type === "message.part.updated")
    .map((e) => e.properties.part as { type: string; text?: string })
    .filter((p) => p.type === "text")
  assert.deepEqual(textParts.map((p) => p.text), ["", "3+3=", "3+3=6", "3+3=6"])

  // Per-step usage remains on the assistant; cumulative usage is session-scoped.
  const lastUpdate = messageUpdates[messageUpdates.length - 1].properties.info as { cost?: number; tokens?: { input: number } }
  assert.equal(lastUpdate.cost, 0.01)
  assert.equal(lastUpdate.tokens?.input, 3)
  const usage = out.find((event) => event.type === "session.usage.updated")
  assert.equal(usage?.properties.cost, 1)
  assert.deepEqual(usage?.properties.tokens, { input: 9, output: 4, reasoning: undefined, cache: undefined })

  // Execution end -> idle status
  const last = out[out.length - 1]
  assert.equal(last.type, "session.status")
  assert.deepEqual((last.properties.status as { type: string }).type, "idle")
})

test("execution.failed emits session.error before the idle status", () => {
  const t = new V2EventTranslator()
  const out = t.translate(ev("session.execution.failed", { sessionID: "s1", error: { data: { message: "boom" } } }))
  assert.deepEqual(out.map((e) => e.type), ["session.error", "session.status"])
  assert.deepEqual((out[0].properties.error as { message: string }).message, "boom")
})

test("execution.failed handles the live provider error shape {type, message}", () => {
  // Verified against a v2 server: selecting a nonexistent model produced
  // session.execution.failed with data.error = {type, message}.
  const t = new V2EventTranslator()
  const out = t.translate(
    ev("session.execution.failed", {
      sessionID: "s1",
      error: { type: "provider.no-route", message: "Model unavailable: openrouter/definitely-not-a-real-model" },
    }),
  )
  assert.deepEqual(out.map((e) => e.type), ["session.error", "session.status"])
  assert.deepEqual((out[0].properties.error as { message: string }).message, "Model unavailable: openrouter/definitely-not-a-real-model")
})

test("inbox enqueue resolves the optimistic temp message with a real user message", () => {
  const t = new V2EventTranslator()
  const out = t.translate(
    ev("session.inbox.enqueued", {
      sessionID: "s1",
      inboxID: "msg_u1",
      item: { type: "user", payload: { text: "hello", files: [{ data: "YWJj", mime: "image/png", name: "a.png" }] } },
    }),
  )
  assert.deepEqual(out.map((e) => e.type), ["message.updated", "message.part.updated", "message.part.updated"])
  const info = out[0].properties.info as { id: string; role: string }
  assert.deepEqual([info.id, info.role], ["msg_u1", "user"])
  const filePart = out[2].properties.part as { type: string; url?: string }
  assert.deepEqual([filePart.type, filePart.url], ["file", "data:image/png;base64,YWJj"])
})

test("permission and form events feed the pending registry and the prompt UI shapes", () => {
  const t = new V2EventTranslator()
  const perm = t.translate(
    ev("permission.asked", { id: "per_1", sessionID: "s1", action: "bash", resources: ["ls"], source: { type: "tool", messageID: "msg_a1", id: "c1" } }),
  )
  assert.equal(perm[0].type, "permission.asked")
  const props = perm[0].properties as { permission: string; patterns: string[]; tool?: { callID: string } }
  assert.deepEqual([props.permission, props.patterns], ["bash", ["ls"]])
  assert.equal(props.tool?.callID, "c1")
  assert.equal(pendingRequestInfo("per_1")?.sessionID, "s1")

  // Live-verified envelope: v2 nests the form under `data.form`, unlike
  // permission.asked (whose payload is the flat Permission.Request). Captured
  // from a v2.0.16 server: evt_0d4be7612002H8CTkutJnzghGX. Reading the fields
  // off `data` directly drops the event and no prompt ever renders.
  const form = t.translate(
    ev("form.created", {
      form: {
        id: "frm_1",
        sessionID: "s1",
        title: "Questions",
        metadata: { kind: "question" },
        fields: [
          { key: "mode", type: "multiselect", title: "Mode", options: [{ value: "fast", label: "Fast" }, { value: "slow", label: "Slow" }] },
          { key: "note", type: "string", title: "Note" },
        ],
      },
    }),
  )
  assert.equal(form[0].type, "question.asked")
  const q = (form[0].properties as { questions: Array<{ multiple: boolean; custom: boolean }> }).questions
  assert.equal(q[0].multiple, true)
  assert.equal(q[1].custom, true)
  assert.equal(pendingRequestInfo("frm_1")?.sessionID, "s1")

  const gone = t.translate(ev("form.replied", { id: "frm_1", sessionID: "s1" }))
  assert.equal(gone[0].type, "question.replied")
  assert.equal(pendingRequestInfo("frm_1"), undefined)
})

test("form.created also maps when the payload is flat", () => {
  const t = new V2EventTranslator()
  const out = t.translate(
    ev("form.created", { id: "frm_2", sessionID: "s2", title: "Questions", fields: [{ key: "q0", type: "string", title: "Answer" }] }),
  )
  assert.equal(out[0].type, "question.asked")
  assert.equal(pendingRequestInfo("frm_2")?.sessionID, "s2")
})

test("formAnswerFromFields maps QuestionPrompt labels back to keyed values", () => {
  const fields: V2FormField[] = [
    { key: "mode", type: "multiselect", options: [{ value: "fast", label: "Fast" }, { value: "slow", label: "Slow" }] },
    { key: "note", type: "string" },
    { key: "ok", type: "boolean" },
    { key: "count", type: "integer" },
  ]
  rememberForm({ id: "frm_x", sessionID: "s", title: "t", fields })
  const answer = formAnswerFromFields(pendingRequestInfo("frm_x")?.fields, [["Fast", "Slow"], ["free text"], ["Yes"], ["7"]])
  assert.deepEqual(answer, { mode: ["fast", "slow"], note: "free text", ok: true, count: 7 })
})

test("toQuestionRequest skips external fields and keeps answer alignment", () => {
  const req = toQuestionRequest({
    id: "frm_1",
    sessionID: "s",
    title: "t",
    fields: [
      { key: "hidden", type: "external" },
      { key: "name", type: "string", title: "Name" },
    ],
  })
  assert.equal(req.questions.length, 1)
  assert.equal(req.questions[0].header, "Name")
})

test("toProviderCatalog rebuilds the v1 provider/model shape", () => {
  const models: V2ModelInfo[] = [
    {
      id: "prov/model-a",
      modelID: "model-a",
      providerID: "prov",
      name: "Model A",
      capabilities: { tools: true, input: ["text", "image"], output: ["text"] },
      variants: [{ id: "none" }, { id: "high", settings: { reasoning: { effort: "high" } } }],
      cost: [{ input: 1, output: 2 }],
      status: "active",
      enabled: true,
      limit: { context: 100, output: 50 },
    },
  ]
  const catalog = toProviderCatalog([{ id: "prov", name: "Prov" }], models, models[0])
  assert.equal(catalog.all.length, 1)
  assert.equal(catalog.connected.includes("prov"), true)
  const m = catalog.all[0].models["prov/model-a"]
  assert.equal(m.attachment, true)
  assert.equal(m.tool_call, true)
  assert.equal(m.reasoning, true)
  assert.deepEqual(m.variants.high, { reasoningEffort: "high" })
  assert.deepEqual(catalog.default, { prov: "prov/model-a" })
})
