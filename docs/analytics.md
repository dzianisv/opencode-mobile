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

## Sentry event budget — the noise gate (AGE-105)

Consent decides *whether* we report; the noise gate in `src/lib/sentry-noise.ts` decides *how
often*. It exists because this app became the org's #1 Sentry volume source (~4,500
events/month against a 3,500/month org quota) while ~1,100 of those events were three
non-defects: `connect timeout`, `connect server-unreachable`, and one device's
`API Error: 401` firing 498 times.

> **AGE-107 postscript.** That 401 storm was traced to a *human* retry loop, not a client
> token-refresh loop. In v0.4.4 the connection probe scored **any** HTTP response as a
> success, so a 401 was reported to the user as "Health endpoint responded — connection
> actually works now" while their password was wrong. They re-tapped Connect for two months
> (Sentry breadcrumbs show a `touch` event before every single capture, at irregular
> human-paced intervals). `requireOk` in `diagnostics.ts` (v0.4.8) stopped the false
> success; `auth-failed` now gives it its own actionable message and drop-list entry.
> The client's automated loops were never at fault — `events.ts` already terminates the SSE
> reconnect loop on `ApiAuthError` (issue #76).

`beforeSend` applies three layers, cheapest first:

| Layer | Rule | Effect |
|---|---|---|
| Always-send allowlist | OOM / ANR / native / `IllegalStateException` / `NullPointerException` / fatal level / unhandled mechanism | Bypasses every limit below — quota is worthless if it silences real crashes |
| Transport drop-list | `connect timeout\|server-unreachable\|no-internet\|malformed-url\|auth-failed`, `Network request failed`, `Request timed out after`, `ECONN*`/`ETIMEDOUT`… | Hard drop. Not sampled: the gate is per-install, so even 1/device/day multiplies by the install base back into thousands/month |
| Dedup + rate cap | per-fingerprint cooldown 6h, ≤6 new fingerprints/h, ≤10 events/h (mirrors the `openclaw-box-bot` shim, AGE-55) | Turns a retry loop into one report and caps any future regression |

Nothing is lost by the transport drop: those failures are already shown to the user as
connection UI **and** already trended, PII-free, as the PostHog `connection_failed` event with
an `error_class` property (`src/lib/analytics-classify.ts` — a 401 lands in `unauthorized`).
Sentry was paying per event for a graph we already have. `connect health-failed` and
`connect tls-error` are deliberately **not** dropped: a box that answers but is unhealthy, or
a broken certificate, is actionable.

Dropped-event counts are not silent — the number dropped since the last delivered event rides
along as a `noise.dropped_since_last` tag, so the saving is auditable from Sentry itself.

Rules are pure and unit-tested in `src/lib/sentry-noise.test.ts` (18 tests, incl. a replay of
the observed 1,126-event hour → 5 delivered events). Widening the drop-list is a deliberate
act: add a test asserting the new pattern, and never add anything that could mask a crash.

### Measuring whether it worked

```sh
SENTRY_AUTH_TOKEN=… node scripts/sentry-volume-report.mjs --by-reason \
  --org vibetechnologies \
  --window "before=2026-08-14T07:00:00Z..2026-08-14T14:00:00Z" \
  --window "after=2026-08-17T00:00:00Z..now"
```

Read **`submitted` = `accepted` + `rate_limited`**, never `accepted` alone. The org is
currently over its error quota, so Sentry rejects essentially everything and `accepted`
reads ~0 for *every* project — a blown org and a fixed one look identical on that column.
`submitted` is the demand the clients actually put on the wire, which is what the
3,500/month gate is really about.

**And do not read raw `client_discard` as "the gate is working" either — that is the same
mistake one column over.** Split it by reason (`--by-reason`, and the split line prints
unconditionally):

| `client_discard` reason | what it means |
|---|---|
| `before_send` | **our noise gate dropped the event.** Recorded by `@sentry/core` `baseclient.js` whenever `beforeSend` returns `null`. The only proof the gate is live on real devices. |
| `ratelimit_backoff` | the SDK is in 429 backoff because the **org** is over quota. A symptom of the overage; it goes UP when things get worse. |
| `event_processor`, `network_error` | neither of the above. |

On 2026-08-14, 100% of `opencode-mobile`'s `client_discard` was `ratelimit_backoff` and
`before_send` was 0 — i.e. the pre-rollout `client_discard` number was entirely quota
damage, not filtering. So the healthy shape is precisely: `submitted` falls **and**
`client_discard/before_send` rises from zero.

`before_send > 0` is also the **earliest** available evidence, because it does not depend on
what share of the install base has updated: one device on v0.4.14 hitting one filtered error
produces it. Check it before waiting days for the monthly rate to bend.

**Do not try to segment the after-number by app release.** While the org is over quota,
rate-limited events are never stored, so the project's `release`/`dist` tag values and issue
list stop dead (last value: `opencode-mobile@0.4.12`, 2026-08-08) even though clients keep
submitting. Version share comes from Play (`scripts/play-version-share.mjs`), not Sentry.

Pre-rollout baseline for the v0.4.14 comparison (measured 2026-08-14 14:00 UTC, before
production rollout at 14:22 UTC), two windows agreeing to within 0.2%:

| Window | `opencode-mobile` submitted | → /month | Org submitted → /month |
|---|---|---|---|
| 7h, post-box-bot-fix (08-14 07:00–14:00Z) | 33 (4.71/h) | 3,441 | 3,963 |
| 7d trailing (08-07–08-14) | 793 (4.72/h) | 3,446 | 25,450 (box-bot pre-fix) |

Mobile was 87% of the org's post-box-bot demand. Target: under ~1,500/month, which puts the
org under the 3,500/month gate.

**Never measure across the rollout instant.** Use `--since-rollout`, which reads the v0.4.14
production instant (2026-08-14 14:22Z) out of the release-history table in
[`playstore.md`](./playstore.md) and splits the windows exactly there:

```sh
SENTRY_AUTH_TOKEN=... node scripts/sentry-volume-report.mjs --by-reason --since-rollout
```

A hand-rolled window that spans the instant mixes two populations — devices that have the
gate and devices that do not — so its rate is neither a baseline nor a result, while looking
exactly like both. This is not hypothetical: a `post=08-14T07:00Z..now` window (84% of it
pre-rollout) was run against this very script and reported mobile *rising* to 4.44/h. Such
windows now print `[mixed]` with the pre-rollout percentage, a clean but young post window
prints how many hours of uptake it has, and an unparseable release table reports `unknown`
rather than silently grading everything as post-gate
(`scripts/sentry-volume-report.test.mjs`).

### Uptake is part of the measurement, not an excuse afterwards

The gate ships **inside the app binary**, so it only runs on devices that installed v0.4.14.
A raw event count therefore cannot grade it. Replaying 90d of real events through the gate
drops 96.9% of them (~107/month) — but only at 100% install share, which Play never reaches
quickly and never reaches fully.

The two symmetrical mistakes:

- reading a still-high number at 30% uptake as "the gate failed" (it predicts ~70% of
  baseline — that IS the gate working), and
- reading a dip caused by a quiet weekend, or by users simply opening the app less, as gate
  efficacy.

So grade against the uptake-adjusted expectation:

```
expected_post = baseline_rate x (1 - gated_share x 0.969)
```

`scripts/noise-gate-report.mjs` does exactly this: it pulls the Sentry rate
(`sentry-volume-report.mjs`) and the Play install share (`play-version-share.mjs`,
versionCode >= 150 = v0.4.14 = gated), prints measured-vs-expected-vs-100%-uptake, and
**refuses to grade** a window where `client_discard/before_send` is 0 or Play share is 0 —
neither of which is a pass or a failure, only an absence of evidence. It also inverts the
model to report the *implied* on-device efficacy, so the 96.9% constant is checked against
reality rather than assumed.

Neither credential exists on a laptop, so run it in CI and read the job summary:

```sh
gh workflow run "Sentry noise-gate report" -f post=2026-08-21T00:00:00Z..now
gh run view --log   # or just open the run summary
```

It also runs itself weekly (Mondays 15:00 UTC) so the trend is recorded whether or not
anyone asks. Unit tests for the grading model live in `scripts/noise-gate-report.test.mjs`
and run in the same job that publishes the number.

### The quota resets on the 4th — that is the real deadline

Org-wide daily `accepted` shows a hard billing boundary:

| Date | org `accepted` | org `rate_limited` | cumulative `accepted` |
|---|---|---|---|
| 08-03 | 2 | 427 | 24 |
| **08-04** | **837** | 10 | 861 |
| 08-07 | 1,820 | 0 | 3,812 |
| **08-08** | 1,574 | 816 | **5,386** |
| 08-09 → 08-14 | 0 | 155–672/day | 5,387 |

The period reset on **2026-08-04**, the 5,000-error month was spent in **4.5 days**, and the
org has been receiving *zero* error data since **2026-08-08**. Next reset: **2026-09-04**.
Two consequences: (1) no `accepted`-based measurement is possible before then, which is why
`submitted` is the metric; (2) 09-04 is the date the gate actually has to hold by.

Who spent it, over the 30d to 08-14:

| project | accepted | rate_limited | submitted |
|---|---|---|---|
| `openclaw-box-bot` | 4,401 (82%) | 11,741 | 16,142 |
| `vibe-api-gateway` | 254 | 3,321 | 3,575 |
| `opencode-mobile` | 664 (12%) | 2,148 | 2,812 |
| `openclaw-ci` | 68 | 333 | 401 |

`opencode-mobile` did not blow the quota — `openclaw-box-bot` did (fixed by AGE-55). But with
box-bot at 0, mobile is now the dominant remaining demand.

### Server-side levers do not exist on this plan

Probed directly against the API (re-verified 2026-08-14 15:45Z with a **write**-scoped
token, so none of these is a permissions artifact), so nobody re-litigates it:

| Lever | Call | Result |
|---|---|---|
| Per-key rate limit | `PUT /projects/{org}/{proj}/keys/{id}/` `{"rateLimit":{"window":86400,"count":50}}` | **HTTP 200 that lies.** The field is dropped; the follow-up GET reads `rateLimit: null`. Reproduced with `window` = 60, 3600, 86400. The success code is the trap — this is the one lever that looks like it worked. |
| Custom inbound filter on error message | `PUT /projects/{org}/{proj}/` `{"options":{"filters:error_messages":"…"}}` | **HTTP 400 `{"detail":"You do not have that feature enabled"}`.** The option key exists and reads `''`; writing it is plan-gated (Business). This is the lever that *would* fix the residual risk, because it drops at ingest for **every** app version, including installs that never update. |
| Generic inbound filters | `PUT /projects/{org}/{proj}/filters/{id}/` `{"active":true}` | **HTTP 204 — works.** Useless here: the only ids are `browser-extensions`, `legacy-browsers`, `localhost`, `web-crawlers`, `filtered-transaction`. None can match a React Native app error. |
| Spike protection | `POST /organizations/{org}/spike-protections/` | **HTTP 201 — and it was already on.** Every project reads `quotas:spike-protection-disabled = false`. It did not prevent this overage because this is *sustained baseline* volume, not a spike. (The org-level GET is 403, which earlier read as "unavailable"; it is not unavailable, it is ineffective — do not spend a plan upgrade on it.) |

Org `features` is `[]`. **The client-side gate is the only control that exists**, so its
coverage is the entire safety margin — which is why `sentry-noise-production.test.ts` pins
that coverage against real production data.

Two consequences worth stating outright:

1. Because the only control ships **inside the app binary**, Play install uptake is on the
   critical path of the fix. That is not a reporting detail — it is why the verdict must be
   normalised by uptake (`scripts/noise-gate-report.mjs`) instead of read off raw volume.
2. Devices that never update are permanently ungated. Nothing on this plan can reach them.
   If the org ever moves to Business, `filters:error_messages` is the row to revisit first;
   re-probe it rather than assuming, since these answers are plan state, not physics.

### Gate coverage against 90d of real events

Every issue in the project over the 90d to 2026-08-14 (648 events), replayed through the
gate's own precedence (allowlist first, then drop-list) by
`src/lib/sentry-noise-production.test.ts`:

| Outcome | events | share |
|---|---|---|
| hard-dropped as transport noise | 628 | 96.9% |
| always-send crash classes (OOM, ANR, `IllegalStateException`) | 13 | 2.0% |
| deduped / rate-capped (the 401 storm) | 7 | 1.1% |

Upper bound of surviving volume: 2,750/month × 3.1% ≈ **87/month**, ~17× under the
1,500/month target, and that ignores dedup and the hourly cap, which only push it lower.
Crash classes still come through — the test fails if any of them stops being allowlisted,
because hitting the number by silencing real crashes is a failure, not a win.

### The one piece of evidence available on release day: check the artifact

Everything above is worthless if a build ships without the gate. That failure is
*invisible in Sentry*: while the org is over quota nothing is stored, so release tags stop
updating (opencode-mobile's stop at `0.4.12` / 2026-08-08 while clients keep submitting
~4.7/h) and a `release:0.4.14` query returns an empty result that reads exactly like "no
errors from the new build".

The binary is checkable the same day. Hermes bytecode keeps string literals, so
`scripts/verify-release-bundle.mjs` greps `base/assets/index.android.bundle` inside the AAB
for the gate's own reason codes, the transport drop-list regex, and the
`noise.dropped_since_last` tag that only `applyNoiseGate()` writes — plus the baked-in DSN,
because a release built without `EXPO_PUBLIC_SENTRY_DSN` makes `Sentry.init()` a silent
no-op. It runs in `publish-play-store.yml` **before** the Play upload step, so a gateless
build cannot reach users.

It discriminates — this is not a self-confirming assertion:

| Artifact | Result |
|---|---|
| v0.4.14 AAB, versionCode 151 (the build now on Play production, run `31807432647`) | **passes**, all six markers, DSN = project `4511436292292608` |
| v0.4.13 AAB (run `31786473735`, pre-gate) | **fails**, all six markers absent |

### Rejected: persisting gate state across launches

The rate caps (`maxPerHour`, `maxNewPerHour`) and the 6h per-fingerprint cooldown live in
process memory, so every cold start resets them. That looks like a hole worth plugging
with `AsyncStorage`; the session data says it is not.

Sentry session envelopes for `opencode-mobile`, 7d to 2026-08-14: **2,633** (267–541/day),
which is the install base's app-start rate. Persisting only pays off if a device launches
the app *more often than the cooldown expires* — i.e. if `376 launches/day ÷ devices > 4`,
so only below **~94 active devices**. One issue alone (`connect timeout`) has 104 distinct
users over 90d, so the install base is above that line and the two rates are within
rounding of each other. Persisting would add native storage I/O on the crash path to buy
nothing measurable. Revisit only if the app-start rate rises well above ~4/device/day.

(Those session envelopes are 100% `client_discard`, 96% `network_error` — sent at cold
start and at process teardown, when the transport often can't complete. Sessions are not
billed, so this costs no quota, but it does mean release health is not a usable signal for
this app either.)

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
