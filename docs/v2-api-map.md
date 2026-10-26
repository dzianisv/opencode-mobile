# opencode v2 HTTP API map (verified against v2.0.16, /openapi.json + live probe)

Authoritative source: `GET /openapi.json` on any v2 server (OpenAPI 3.1, ~113 paths).
Full spec saved at `/tmp/opencode/openapi.json`; extracted schemas in
`/tmp/opencode/schemas.txt`, `api2.txt`, `api3.txt`, `api4.txt`; live event
capture in `/tmp/opencode/events_full.txt`.

## Breaking changes vs v1 (what the app used)

1. **All API routes moved under `/api/`**. Old paths (`/session`, `/global/event`,
   `/global/health`, `/file`, `/provider`, ...) now fall through to the SPA web UI
   (HTML 200) — so the app silently renders garbage instead of erroring.
2. **Envelope responses**: list endpoints return `{data: [...], cursor?}` or
   `{location, data}` instead of bare arrays.
3. **Health**: `/global/health` gone → `GET /api/info` → `{version, pid, urls, paths}`.
4. **Auth**: same Basic auth (`OPENCODE_SERVER_PASSWORD`), username defaults `opencode`
   (check headers.ts — v1 used `OPENCODE`? verify) → 401 on wrong creds.
5. **Events SSE** `/api/event` (was `/global/event`): events are
   `{id: "evt_...", type: "...", data: {...}}` (was `{type, properties}`).
6. **Messages**: no more `MessageWithParts` (`info` + `parts[]`). Typed messages:
   - `user`: `{id, time, type:"user", text, files?, agents?, skills?}`
   - `assistant`: `{id, time:{created,streamed?,completed?}, type:"assistant", agent, model:{id,providerID,variant?}, content:[Text|Reasoning|Tool], snapshot?, finish?, cost, tokens, error?, retry?}`
     - content Text: `{type:"text", text}`
     - content Reasoning: `{type:"reasoning", text, time?}`
     - content Tool: `{type:"tool", id, name, executed?, state: ToolState, time}`
       - ToolState: `streaming {input:string}` | `running {input,metadata}` | `completed {input, content:[Tool.Content], metadata}` | `error {input, error, content?}`
       - Tool.Content: `{type:"text", text}` or `{type:"file", ...}` (Tool.TextContent / Tool.FileContent)
   - others: `idle {outcome}`, `compaction`, `system`, `synthetic`, `shell`, `skill`,
     `agent-switched`, `model-switched`, `location-switched`
7. **Prompt**: `POST /api/session/{id}/prompt` body `{text, files?:[{uri,name}], agents?, skills?, delivery?: "steer"|"queue", resume?}`.
   Model/agent are session state, set via `POST /api/session/{id}/model {model:{id,providerID,variant?}}` and `POST /api/session/{id}/agent {agent}` — NOT per-prompt.
8. **Command**: `POST /api/session/{id}/command {name, text}`.
9. **Abort** → `POST /api/session/{id}/interrupt`.
10. **Session list**: `GET /api/session?limit&order&search&directory&project&cursor` → `{data: Session.Info[], cursor:{previous,next}}`. No more `/experimental/session`.
11. **Session.Info**: `{id, projectID, agent?, model?, cost, tokens, outcome?, time:{created,updated,idle?,viewed?,archived?}, title?, subpath?, metadata?, permissions?, revert?, location:{directory}}`. No `slug`, no `version`, no `share`, no `summary`.
12. **Diff**: `GET /api/session/{id}/diff` → `{data: FileDiff.Info[]}` where
    FileDiff.Info = `{file, patch, additions, deletions, status:"added"|"deleted"|"modified"}`.
13. **Revert**: stage `POST .../revert/stage {messageID, files?}`; commit `POST .../revert/commit`; unstage `DELETE .../revert`. Session.Info.revert = `{messageID, partID?, snapshot?, files?}`.
14. **Permissions**: list `GET /api/session/{id}/permission` → `{data:[Permission.Request]}`;
    Permission.Request = `{id:"per...", sessionID, action, resources:[string], save?, metadata?, source?, message?}`;
    reply `POST /api/session/{id}/permission/{requestID}/reply {decision:"once"|"always"|"reject", message?}`.
    Newer PermissionV2 builds renamed the body field to `reply`; the client uses
    the v2.0.16 `decision` schema first and retries only 400/422 validation failures.
    Global list: `GET /api/permission/request`.
15. **Questions → Forms**: `GET /api/session/{id}/form` → `{data:[Form.Info]}`;
    Form.Info = `{id:"frm_...", sessionID, title, fields}` (typed fields: string/number/integer/boolean/multiselect/external);
    reply `POST .../form/{formID}/reply {answer}`; reject = `DELETE .../form/{formID}`.
    The `question` tool is a form on the server (`title:"Questions"`, field keys `q0..qN`,
    `metadata.kind:"question"`). Its SSE event **nests the form**: `form.created`
    carries `{form: Form.Info}`, while `permission.asked` carries the flat
    Permission.Request — reading `form.created` off `data` directly drops it
    (live capture `evt_0d4be7612002H8CTkutJnzghGX` on v2.0.16).
16. **Agents**: `GET /api/agent` → `{location, data:[Agent.Info]}`;
    Agent.Info = `{id, name, model?, request, system?, description?, mode, hidden, color?, steps?, permissions}`.
17. **Commands list**: `GET /api/command` → `{location, data:[Command.Info]}`.
18. **Providers/models**: `GET /api/provider` → `{location, data:[Provider.Info]}`;
    models: `GET /api/model` → `{location, data:[Model.Info]}`; Model.Info =
    `{id, modelID, providerID, name, capabilities, variants[], time, cost[], status, enabled, limit:{context,output}}`.
    Default: `GET /api/model/default`.
19. **Filesystem**: `GET /api/fs/list?path=` → `{location, data:[{path,type:"file"|"directory"}]}`;
    `GET /api/fs/find`, `GET /api/fs/read/*`, `POST /api/experimental/fs/write`. No `/file/roots`.
20. **Location** (was `/path` + directory header): `GET /api/location` → `{directory, project:{id,directory,canonical}}`.
    Project list `GET /api/project` → array of `{id, canonical, time, sandboxes}`.
21. **Config**: `GET /api/config` → array of config documents.
22. **Active sessions**: `GET /api/session/active` → `{data: {ses_xxx: {type:"running"}}}`.

## Event types (live-verified + from binary strings)

Core execution: `session.execution.started|failed|interrupted|succeeded`
Steps: `session.step.started {sessionID, agent, model, assistantMessageID, started}`,
`session.step.streamed`, `session.step.ended {finish, rawFinish, cost, tokens}`, `session.step.failed`
Text: `session.text.started|delta|ended {assistantMessageID, ordinal, delta|text}`
Reasoning: `session.reasoning.started|delta|ended` (same shape, `ended` has full `text`)
Tools: `session.tool.input.started {id,name}`, `.input.delta`, `.input.ended {text}`,
`.called {id, input, executed}`, `.progress`, `.success {id, content:[Tool.Content], metadata, executed}`, `.failed`
Usage: `session.step.ended` is per-assistant-step usage. `session.usage.updated
{sessionID, cost, tokens}` is a cumulative session snapshot and must never be
written onto the latest assistant message; `.usage.recorded` covers auxiliary
session work such as compaction/title generation.
Inbox: `session.inbox.enqueued {inboxID, sessionID, item}`, `.delivered`, `.cancelled`, `.delivery.changed`
Lifecycle: `session.created`, `session.updated`, `session.deleted`, `session.renamed`, `session.moved`, `session.forked`, `session.viewed`, `session.metadata.updated`
Selections: `session.agent.selected`, `session.model.selected`
Compaction: `session.compaction.started|delta|ended|failed`
Shell: `session.shell.started|ended`
Other: `session.skill.activated`, `session.retry.scheduled`, `session.message.content.updated`,
`session.instructions.updated`, `session.error`, `project.updated`, `server.connected`
Permissions: `permission.asked`, `permission.replied`, `permission.rejected`
Forms: `form.created {form:Form.Info}`, `form.replied {id,sessionID,answer}`, `form.cancelled {id,sessionID}`

## Verified probe notes

- `POST /api/session {title}` → `{data: Session.Info}` (probe: sid `ses_...`).
- Prompt POST returns `{data: userMessage}` immediately (fire-and-forget like v1).
- `GET /api/session/{id}/message` returns newest-first (`order` param available);
  includes `idle` messages (`{type:"idle", outcome:"succeeded"}`).
- SSE line format: `data: {"id":"evt_...","type":"...","data":{...}}`, `: heartbeat` comments.
- Model set probe `{providerID, modelID}` at top level → 400; correct body is `{model:{id, providerID}}`.

## v1 servers (opencode <= 1.18.x) — verified against 1.18.32

`npm install -g opencode-ai` still installs the v1 line (`latest` = 1.18.32 as of
2026-09-24), so v1 servers are the common case, not a legacy edge case. The v1
transport lives in `src/lib/sdk-v1.ts` and `src/lib/api-detect.ts` picks it.

Detection is by **content type, never status code** — an unknown route on either
server falls through to the web SPA and answers `200 text/html`:

| probe | v2.0.16 | 1.18.32 |
| --- | --- | --- |
| `GET /api/info` | `401` unauthenticated / `200 application/json` with `{version,pid,urls,paths}` | `200 text/html` (SPA) |
| `GET /global/health` | `200 text/html` (SPA) | `200 application/json` `{healthy,version}` |

Live-verified v1 behaviour (all through `src/lib/sdk-v1.ts` against a local
`opencode serve` on 1.18.32):

- `GET /global/health` → `{"healthy":true,"version":"1.18.32"}`.
- `/session`, `/session/{id}`, `POST /session`, `PATCH /session/{id}`,
  `DELETE /session/{id}`, `/session/{id}/message`, `/session/{id}/abort`,
  `/session/{id}/prompt_async`, `/experimental/session`, `/question`,
  `/permission`, `/agent`, `/command`, `/provider`, `/path`, `/project/current`
  all answer JSON as the pre-v2 client expects.
- `/file/roots` is already gone in 1.18.32 → falls through to the SPA, which is
  why `file.roots()` must keep tolerating a non-JSON answer instead of assuming 404.
- SSE line format: `data: {"payload":{"id":"evt_...","type":"...","properties":{...}}}`
  — the event is wrapped in `payload` (v2 has no wrapper), and `events.ts` unwraps
  with `event.payload || event`. Heartbeats arrive as `server.heartbeat` events
  rather than v2's `: heartbeat` comment frames.
