# Waitlist signup-path coverage — how much of the install base can't sign up in-app

_Measured 2026-08-14 for [AGE-61]. Re-run with `node scripts/play-version-share.mjs --github`._

## The question

The in-app OpenCode Connect waitlist form posts to `POST /api/beta-signup` (Brevo list 4).
That code path first shipped in **v0.4.8** (commit `0fdfb54`, 2026-07-18). Every older build
has exactly one path: open a `mailto:` to support@agentlabs.cc, which lands in a human inbox
and nowhere near the waitlist store. 20 of 21 signups between 2026-08-03 and 2026-08-13 were
lost that way. So: **how many people are still on a build with no working signup path?**

## Answer, by channel

| Channel | Population measured | Pre-v0.4.8 share |
| --- | --- | --- |
| Google Play (auto-updates) | ~90–100 daily distinct users, 2026-07-31 → 2026-08-13 | **0%** — Play reports a single versionCode, `142` (v0.4.10). Any older build is below Play's reporting floor (<10 users/day). |
| Sideload — GitHub release APKs (never auto-update) | 1,682 lifetime APK downloads across all releases | **25.9%** (436 downloads) are pre-v0.4.8 builds. |

There is no iOS App Store listing (`itunes.apple.com/lookup?bundleId=cc.agentlabs.opencode`
returns 0 results) and the app is not on IzzyOnDroid, so those channels contribute nothing.

## What that means

1. **Play is not the problem.** Auto-update did its job: the measurable Android active base is
   effectively 100% on a build that can sign up through the API.
2. **The stale cohort is sideload-only and permanent.** ~436 devices pulled an APK that predates
   the signup API. Nothing will ever update them; they will keep emitting mailto signups until
   the owner manually re-downloads. The hourly reconciler
   (`VibeBrowserProductPage/.github/workflows/waitlist-mailto-reconcile.yml`) is what keeps those
   signups from being lost, and it is not a temporary measure.
3. **Stale builds are not the only source of mailto signups** — they are, as of AGE-87, the only
   *remaining* one. Until v0.4.12 the fallback also fired on network error, timeout (8s) and 5xx,
   so a user on a current build with flaky mobile data took the same lossy path. That path is gone:
   a failed signup is now persisted on-device (`opencode.waitlist.pending.v1`, AsyncStorage) and
   retried on every app foreground (`src/lib/waitlist.ts` queue section, flushed from
   `app/_layout.tsx`). `mailto:` is only ever opened by an explicit user tap after repeated
   retry failures. Expect the reconciler's `synced_count` to trend toward the sideload cohort only.
   Any plan that assumes "ship an update and the leak closes" is still wrong for those ~436 devices.

## After-number: how it gets attributed (AGE-100)

**Answer (2026-08-20, [AGE-100](https://app.paperclip.so/AGE/issues/AGE-100)): `stamped=0` over 6.3 days, but `n=0` — no mailto-fallback conversation of any kind arrived in that window, so the 0 is a pass on an empty sample, not 0-out-of-many.** v0.4.13 (the first build users can actually run the retry queue on) went to the Play **production** track on 2026-08-14 as **versionCode 149** ([run 31786473735](https://github.com/dzianisv/opencode-mobile/actions/runs/31786473735)).

Baseline at release time, from the hourly reconciler's last run before the cut
(`Waitlist Mailto Reconcile`, 2026-08-14 07:59 UTC): `scanned=34 synced=0 skipped=34 failed=0`
— i.e. 34 known mailto conversations, all already healed into the store, nothing new that hour.

The reconciler reads a Chatwoot mail body, so "split by app version" only works if the body
carries one. It did not. As of v0.4.13 the escape hatch stamps `App: OpenCode Mobile v<version>`
into the mail (`buildWaitlistMailtoUrl`, `src/lib/waitlist.ts`). That gives a clean read a week out:

| Mail body | Means |
| --- | --- |
| no `App:` line | a build older than v0.4.13 — expected, this is the ~436-device sideload cohort no release can reach |
| `App: OpenCode Mobile v0.4.13` or newer | a current build still reached mailto — the retry queue leaked, **file it as a new defect with the mail as evidence** |

### Reading the after-number

Do **not** open Chatwoot conversations by hand — the reconciler does the split itself as of
[VibeBrowserProductPage#237](https://github.com/dzianisv/VibeBrowserProductPage/pull/237). Every
hourly run now prints one grep-able line:

```
scanned=N synced=N skipped=N failed=N unstamped=N stamped=N builds=v0.4.13:N
```

- `unstamped` — recovered signups from builds older than v0.4.13. **Expected**; this is the cohort
  no shipped code can reach, and it is the number that should account for essentially all of
  `synced`.
- `stamped` — recovered signups from builds that carry the AGE-87 retry queue and fell back
  anyway. **This must be 0.** Anything above 0 is a live defect, and the reconciler already says so
  in its alert issue and in the Chatwoot internal note, naming the exact conversations.

So the week-out read is:

```bash
gh run list --repo dzianisv/VibeBrowserProductPage \
  --workflow "Waitlist Mailto Reconcile" --limit 200 \
  --json databaseId,createdAt,conclusion
# then, per run id:
gh run view --repo dzianisv/VibeBrowserProductPage <id> --log | grep -E "^scanned="
```

Sum `stamped` across the week. `stamped=0` closes AGE-100 with the number; `stamped>0` opens a
defect with those conversations as evidence.

First reading after the release, from the run that first carried the split
([run 31790218194](https://github.com/dzianisv/VibeBrowserProductPage/actions/runs/31790218194),
2026-08-14 09:57 UTC, against the real inbox):

```
scanned=34 synced=0 skipped=34 failed=0 unstamped=0 stamped=0
```

Same 34 known conversations as the pre-release baseline, nothing new. That was one hour of
exposure; the aggregate below is the full read.

### Aggregate, 2026-08-14 09:57 UTC → 2026-08-20 16:02 UTC (143 runs)

```
gh run list --repo dzianisv/VibeBrowserProductPage \
  --workflow "Waitlist Mailto Reconcile" --limit 200 \
  --json databaseId,createdAt,conclusion
# per run id:
gh run view --repo dzianisv/VibeBrowserProductPage <id> --log | grep -E "^scanned="
```

Every one of the 143 runs after [#237](https://github.com/dzianisv/VibeBrowserProductPage/pull/237)
merged (2026-08-14T09:56:54Z) printed the **identical** line:

```
scanned=34 synced=0 skipped=34 failed=0 unstamped=0 stamped=0
```

(One run at 09:38 UTC predates the #237 merge and lacks the split fields — expected, not a gap;
no hourly gap exceeds ~2.3h in the whole window, so the liveness guard is clean.)

**`scanned` never moved off 34 — the same 34 conversations as the pre-release baseline
(2026-08-14 07:59 UTC) — for the entire 6.3-day window.** `scanned` counts every
Chatwoot conversation with the waitlist subject, ever, not just new ones
(`scripts/reconcile-waitlist-mailto.js:listConversations`, `status=all`, no time filter). Constant
`scanned` therefore means **zero new mailto-fallback conversations of any kind — pre-v0.4.13 or
stamped — arrived in the inbox in 6.3 days**, versus ~1.9/day (20 of 21 in 11 days) before AGE-87
shipped. `unstamped`/`stamped` are computed only over `summary.synced`
(`lib/waitlist-mailto-reconcile.ts:splitByAppVersion`), and nothing synced, so both are trivially 0.

**Read this as a pass on the stated condition (`stamped=0`), not as "143 samples, zero
regressions." It is 0 samples.** Whether that is because the retry queue now succeeds before the
user ever taps mailto, or because the ~436-device sideload cohort simply had a quiet week, cannot
be distinguished from this signal alone — the sideload cohort never auto-updates, so its background
rate should have been unaffected by the v0.4.13 rollout. No conversation gives grounds to suspect a
regression, so [AGE-100](https://app.paperclip.so/AGE/issues/AGE-100) closes on this number; a
future stamped signup would still reopen it as a new defect per the table above.

## Method / reproducing

```bash
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON="$(cat play-store-key.json)" \
  node scripts/play-version-share.mjs --days 14 --github
```

- Play numbers come from the Play Developer Reporting API, `crashRateMetricSet` →
  `distinctUsers` grouped by `versionCode`. That is Play's own vitals denominator: users who
  actually opened the app. It only covers devices with usage-and-diagnostics sharing on, and Play
  rounds it — which is why we quote a share, never an absolute install count.
- Play versionCodes are **not** the ones in `android/app/build.gradle`: the publish workflow
  overwrites them with `github.run_number + 100`. The mapping in the script was derived from the
  successful runs of `publish-play-store.yml` (`versionCode 139` = v0.4.8 = first build with the
  API path).
- The service account is the same `PLAY_STORE_SERVICE_ACCOUNT_JSON` already used to publish; the
  script needs only the `playdeveloperreporting` scope and mints its own token, no extra deps.

[AGE-61]: https://github.com/dzianisv/VibeBrowserProductPage/pull/234
