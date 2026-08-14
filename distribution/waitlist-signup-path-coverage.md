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
