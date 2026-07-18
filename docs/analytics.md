# Activation Analytics — Design Record

Design record for the PostHog-based activation-funnel analytics added to OpenCode Mobile,
and how it is disclosed and consent-gated. Companion to `docs/playstore.md` (Data safety)
and `distribution/privacy-policy.md` (user-facing policy). GitHub issue: #63.

> **Note:** the same consent flag also gates a third, separate data flow not covered by this
> doc: delivery of user-shared diagnostic reports to our self-hosted Chatwoot support inbox
> (`src/lib/chatwoot.ts`, `src/lib/diagnostics.ts`, issue #85/#88). That flow is triggered
> manually ("Share Report"), not automatic like Sentry/PostHog. It is disclosed alongside
> Sentry and PostHog in every surface in the table below; see `distribution/privacy-policy.md`
> §3b for the full description.

---

## Goal

Answer one product question: **do new users successfully connect to their opencode server
and reach first value (message sent → response received)?** Nothing else is tracked.

## SDK and destination

| Item | Value |
|---|---|
| SDK | `posthog-react-native`, self-instantiated (no `PostHogProvider`, no autocapture) |
| Destination | PostHog **EU region** — `https://eu.i.posthog.com` (override: `EXPO_PUBLIC_POSTHOG_HOST`) |
| API key | `EXPO_PUBLIC_POSTHOG_KEY` (CI secret; unset ⇒ analytics is a strict no-op) |
| Identity | PostHog's random app-generated anonymous ID only; no `identify()` calls, no user IDs |
| Code | `src/lib/analytics.ts` (wrapper), `src/lib/analytics-classify.ts` (error bucketing), `src/lib/demo-analytics.ts` (demo-funnel property derivation), `src/lib/telemetry.ts` (consent gate) |

## Event schema

Keep this table in 1:1 sync with `AnalyticsEvent` in `src/lib/analytics.ts` and with
section 3a of `distribution/privacy-policy.md`.

| Event | Fired when | Properties | Call site |
|---|---|---|---|
| `app_opened` | Once per JS session, as soon as analytics is enabled (cold start with prior consent, or immediately after consent grant) | `is_first_open: boolean` | `app/_layout.tsx`, `src/lib/telemetry.ts` |
| `connection_form_submitted` | User taps Connect/Save with a non-empty server URL | `mode: "quick" \| "advanced"` | `app/connection/add.tsx` |
| `connection_attempted` | A real connection test starts (advanced mode: fired on save, no pre-flight check) | `source: "onboarding" \| "edit_test"` | `src/stores/connections.ts`, `app/connection/add.tsx` |
| `connection_succeeded` | Health check responds OK | `source` | `src/stores/connections.ts` |
| `connection_failed` | Health check fails | `source`, `error_class` | `src/stores/connections.ts` |
| `message_sent` | User sends a prompt to an agent session (excludes slash commands) | — | `src/stores/sessions.ts` |
| `response_received` | Agent response finishes streaming (busy → idle), excluding user-aborted runs | — | `src/stores/events.ts` |
| `demo_started` | The offline `/demo` screen mounts (no server, no network) | — | `app/demo.tsx` |
| `demo_step_advanced` | User advances a step in the scripted demo (currently: replies to the demo's permission prompt) | `step_index`, `step_name`, `reply` (`"once"` \| `"always"` \| `"reject"`) | `app/demo.tsx`, `src/lib/demo-analytics.ts` |
| `demo_completed` | The scripted demo reaches its end (completion or denial message shown) — the key demo activation metric | `outcome` (`"completed"` \| `"denied"`) | `app/demo.tsx`, `src/lib/demo-analytics.ts` |
| `demo_exited_to_connect` | User taps "Connect your own server" on the demo's CTA card | `reached_completion` (boolean) | `app/demo.tsx` |

`error_class` is one of a fixed enum — `malformed-url`, `no-internet`, `server-unreachable`,
`unauthorized`, `tls-error`, `timeout`, `unknown` (`src/lib/analytics-classify.ts`). The raw
error string is never sent (it can embed hostnames/IPs/tokens).

**PII rule:** properties are flat primitives only (`AnalyticsProps`). Never add server URLs,
hostnames, ports, prompts, message/file content, tokens, or raw error text. Adding any new
event or property requires updating the privacy policy (section 3a) and the consent modal
copy in the same PR.

## Consent gating

Single consent flag (`opencode_telemetry_consent` in expo-secure-store) gates **both**
Sentry and PostHog — there is no separate analytics toggle. Managed by `src/lib/telemetry.ts`.

- **Off by default.** First launch shows `TelemetryConsentModal` (discloses crash reports
  AND usage analytics). No SDK is initialised before a "granted" decision.
- **Grant:** `initSentry()` + `initAnalytics()`; `app_opened` fires (once-per-session guard).
- **Decline / never asked:** `track()` is a strict no-op; the PostHog client is never created;
  nothing is written locally (the first-open flag is only touched post-consent).
- **Revoke (Settings → Privacy → Crash Reports & Usage Analytics):**
  - Sentry client closed.
  - PostHog: **buffered-but-unsent events are DROPPED, not flushed.** `ConsentGatedPostHog`
    overrides the SDK `fetch()` transport; after revocation every request short-circuits to a
    synthetic 200, so `shutdown()` drains the queue with zero bytes leaving the device. SDK
    `optOut()` is persisted first so a re-created client can't capture either.
- **Re-grant mid-session:** `optIn()` clears the persisted opt-out; the `app_opened`
  session guard prevents double-counting.

## Disclosure surfaces (must stay in sync)

| Surface | File |
|---|---|
| First-launch consent modal | `src/components/TelemetryConsentModal.tsx` |
| Settings toggle label/description | `app/(tabs)/settings.tsx` |
| Privacy policy (canonical md) | `distribution/privacy-policy.md` §3a, §3b, §4, §5 |
| Privacy policy (store/site html) | `distribution/privacy-policy.html`, `docs/privacy/index.html` (live gh-pages) |
| Play Data safety draft | `distribution/play-listing.md` |
| Play ops checklist | `docs/playstore.md` item 7 |
| Apple nutrition label | Apple addendum in `distribution/privacy-policy.md` (Usage Data → Product Interaction: Yes) |

## Verification checklist — TODO

Not yet verified end-to-end. Each item needs a real device/emulator run with a network
sniffer or PostHog live-events view:

- [ ] TODO: Fresh install → decline consent → exercise full app flow → confirm zero requests to `eu.i.posthog.com` and `sentry.io`.
- [ ] TODO: Fresh install → allow consent → confirm `app_opened` arrives with `is_first_open=true`; second launch sends `is_first_open=false`.
- [ ] TODO: Onboarding quick-connect success path emits `connection_form_submitted(mode=quick)` → `connection_attempted(source=onboarding)` → `connection_succeeded`.
- [ ] TODO: Failure path emits `connection_failed` with a coarse `error_class` and no raw error text/hostname in the payload.
- [ ] TODO: Send message + receive response emits `message_sent` and `response_received`; aborted run emits no `response_received`.
- [ ] TODO: Revoke mid-session while offline (events buffered) → go online → confirm buffered events are dropped (no PostHog traffic after revoke).
- [ ] TODO: Revoke → re-grant in same session → `app_opened` not double-counted.
- [ ] TODO: Build without `EXPO_PUBLIC_POSTHOG_KEY` → analytics is a complete no-op (no init log, no network).
- [ ] TODO: Inspect one real payload of every event type in PostHog and confirm property allowlist matches the schema table above.
- [ ] TODO: Play Console Data safety form re-submitted to match `distribution/play-listing.md` draft before next release.
