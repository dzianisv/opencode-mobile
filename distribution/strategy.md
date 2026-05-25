# OpenCode Mobile — Distribution + Monetization Strategy

Date: 2026-05-24
Sources: 3 research reports (market analysis, monetization, F-Droid distribution) + Play Console signup state.

---

## Pick one model for everything downstream

**Free client everywhere + paid "opencode Cloud" hosted backend.**

Mirrors Tailscale ($45M ARR, OSS client, paid coordination service) and the opencode authors' own model (OSS CLI, paid OpenCode Zen gateway, several million ARR in 5 months).

- **Client (this repo, MIT)**: free on Play Store, IzzyOnDroid, and F-Droid. Identical binary on all three (same signing key via reproducible builds).
- **opencode Cloud (separate product, proprietary)**: managed opencode server hosting. One-tap connect option in the app alongside "self-hosted" and "tunnel". Target $10/mo individual, $30/mo team. **Not built yet — see Action items.**
- **Donations layer**: GitHub Sponsors / OpenCollective to cover Sentry + CI costs (~$60/mo) while cloud revenue scales.

Rejected alternatives:
- ❌ **Paid Play + free F-Droid** — MIT allows redistribution; community resentment when users find F-Droid version; license-check callbacks always get stripped in forks. DAVx⁵ exception works only because it's a one-time donation, not a feature gate.
- ❌ **Subscription gated in client** — telemetry license checks earn F-Droid `Tracking` anti-feature and instantly get stripped by community forks.
- ❌ **Ads** — kills OSS credibility, contradicts a developer audience.

---

## Distribution channels — priority order

| # | Channel | Identity | Status | Time to live | Notes |
|---|---|---|---|---|---|
| 1 | **Google Play (Internal)** | `ai.opencode.mobile` | ⏸ blocked on identity verification | Days after ID approved | CI ready. Track: `internal` first, then closed testing (12+ testers / 14d) before production. |
| 2 | **IzzyOnDroid** | `ai.opencode.mobile` (same key) | ❌ not started | 1–3 days | Submit prebuilt APK to https://codeberg.org/IzzyOnDroid/repodata/issues. Fastest OSS channel. |
| 3 | **F-Droid mainline** | `ai.opencode.mobile` (same key, reproducible build) | ❌ not started | 4–12 weeks | File MR at https://gitlab.com/fdroid/fdroiddata. Requires `expo-notifications` FCM audit + Sentry opt-in gate. |
| 4 | **Apple App Store** | `ai.opencode.mobile` | ⏸ pending iOS prep agent | Weeks (Apple enrollment $99 + review) | iOS agent running — separate report. |

**All channels: same package id (`ai.opencode.mobile`), same signing key.** Lets users update across stores in-place.

---

## Blockers + outstanding work

### Hard blockers (need user)

1. **Google Play identity verification** — upload governor ID (Dzianis Vashchuk). Unlocks: API access, Create app, AAB upload, CI publish.
2. **Apple Developer Program enrollment** — $99/year, D-U-N-S 142059652 ready. iOS agent will produce runbook.
3. **App icon + adaptive icon + feature graphic** — current `assets/*.json` are placeholders. Need real PNGs before either Play or App Store publish.
4. **Privacy policy URL** — must be live at https://opencode.vibebrowser.app/privacy before Play publish. Template in `play-listing.md`.

### Soft blockers (we can fix without user)

5. **Sentry opt-in consent gate** — currently always-on; needed for F-Droid `Tracking` anti-feature avoidance. Add settings toggle + first-launch consent screen. Persist in `expo-secure-store`.
6. ~~**Audit `expo-notifications` FCM usage**~~ — ✅ done 2026-05-24. `src/lib/notifications.ts` uses local-only (`scheduleNotificationAsync`); no `getExpoPushTokenAsync`/`getDevicePushTokenAsync` anywhere. Remaining concern: library still compiles FCM receiver classes — F-Droid scanner may flag. Fix later with a `fdroid` Gradle flavor that excludes the FCM artifact. **Non-blocker for IzzyOnDroid** (more tolerant). For mainline F-Droid: add `productFlavors { fdroid { /* exclude FCM */ } }` to `android/app/build.gradle`.
7. **APK size check** — IzzyOnDroid limit 30 MB. AAB currently 58.5 MB but that's universal — per-ABI splits typically 15–20 MB.
8. **Fastlane metadata** — `fastlane/metadata/android/en-US/{short_description.txt,full_description.txt,images/}` so F-Droid auto-pulls listing.
9. **Reproducible build verification** — F-Droid builds from source, compares to our signed APK. Need to verify our build is reproducible (no embedded timestamps, no machine-specific paths).

### Pre-launch tasks (low priority, optional)

10. **opencode Cloud MVP** — managed opencode hosting service. Stripe billing. The actual revenue product. **Big scope, separate project.**
11. **GitHub Sponsors profile** — VIBE TECHNOLOGIES, LLC org. Tiers: $5 / $15 / $50.
12. **Closed testing tester recruitment** — 12+ testers for 14d before production. Recruit from opencode community / dev Twitter / r/androiddev.

---

## What's already done (this session)

| Item | Status |
|---|---|
| Google Play developer account (org) | ✅ Created, ID 8842655543970815326, $25 paid |
| Mercury virtual card | ✅ Saved to Bitwarden |
| D-U-N-S 142059652 | ✅ Retrieved, saved to Bitwarden + skill |
| GCP project `opencode-mobile-deploy` | ✅ Created |
| androidpublisher API | ✅ Enabled |
| Service account `playstore-deploy@…` | ✅ Created, JSON key saved to Bitwarden + GitHub secret |
| Signed AAB | ✅ Built at `android/app/build/outputs/bundle/release/app-release.aab` (58.5 MB) |
| Website verification | ✅ www.vibebrowser.app verified via Search Console auto-detection |
| Contact email verification | ✅ support@vibebrowser.app verified via Play Console code |
| Payments profile | ✅ Linked with D-U-N-S 142059652 |
| CI workflow audit + fixes | ✅ `publish-play-store.yml` — versionCode auto-bump, r0adkll@v1.1.5, whatsNewDirectory wired |
| Play Store listing copy | ✅ `distribution/play-listing.md` |
| Skill `vibetechnologies-llc` | ✅ Created with company facts |
| Subagent `vibetechnologies-llc-curator` | ✅ Created for auto-maintenance |

---

## Per-channel publishing recipe

### Google Play (after identity verified)

1. (manual, in browser) Home → Verify your identity → upload governor ID. Wait days.
2. (manual) Setup → API access → Link `opencode-mobile-deploy`. Grant `playstore-deploy@…` "Release to production".
3. (manual) Create app `ai.opencode.mobile`. Fill listing from `play-listing.md`. Upload icon + feature graphic + screenshots. Complete Data safety + Content rating + App access.
4. (manual, first time) Upload `app-release.aab` to Internal testing track. Add tester emails.
5. (automated thereafter) `git tag v0.2.4 && git push --tags` → CI builds + publishes to Internal.

### IzzyOnDroid (after first Play AAB exists for parity)

1. Tag GitHub release `v0.2.x` with signed universal APK attached (not AAB — APK).
2. File issue at https://codeberg.org/IzzyOnDroid/repodata/issues:
   ```
   App name: OpenCode Mobile
   Package: ai.opencode.mobile
   License: MIT
   GitHub release: https://github.com/dzianisv/opencode-mobile/releases
   APK SHA-256: <sha256>
   Description: Mobile client for the opencode AI coding agent CLI. Self-hosted backend.
   Note: NonFreeNet anti-feature applies (connects to user-self-hosted opencode server).
   ```
3. Wait 1–3 days for inclusion. Updates auto-pulled from each new GitHub release tag.

### F-Droid mainline (after Sentry opt-in + FCM audit done)

1. Fork https://gitlab.com/fdroid/fdroiddata.
2. Create `metadata/ai.opencode.mobile.yml` with reproducible-build config (template in F-Droid report).
3. Set `AllowedAPKSigningKeys: <sha256-fingerprint>` so F-Droid serves our pre-signed APK.
4. File MR. Iterate on build failures with reviewers. 4–12 week timeline.
5. Once accepted, request IzzyOnDroid delisting (they auto-remove when mainline accepts).

### Apple App Store

Per iOS agent report (pending) — runbook at `distribution/ios-enrollment-runbook.md` (to be created).

---

## Trigger for auto-publish (item 3 from user's plan)

"As soon as we get the ability to publish" = identity verified + app created + first manual AAB uploaded.

Once those manual steps are complete:

- Tag `v0.2.4` (or whatever the next version is) → existing `publish-play-store.yml` CI runs:
  - Bumps `android.versionCode` from `github.run_number`
  - Builds signed AAB
  - Uploads to Internal track with what's-new notes

No additional infrastructure needed — CI is already wired for this. Just push the tag.

For email notification when Google approves identity: Google sends to vibeteaichnologies@gmail.com. Add a `gws gmail` poll script that watches for "Developer account verification" subject from `noreply@google.com` and pings via webhook / posts a GitHub issue.

---

## Files in this repo related to distribution

```
distribution/
├── PLAY_CONSOLE_SETUP.md           # original handoff doc (now mostly historical)
├── play-listing.md                 # full Play Store copy + answers
├── strategy.md                     # this file
├── whatsnew/
│   └── whatsnew-en-US              # release notes consumed by CI per-release
└── (pending)
    ├── app-store-listing.md        # iOS agent will create
    ├── ios-enrollment-runbook.md   # iOS agent will create
    └── whatsnew-ios/
        └── release-notes-en-US.txt # iOS first release notes

.github/workflows/
├── build.yml                       # Android dev build CI
├── cua-smoke.yml                   # CUA smoke tests
├── publish-play-store.yml          # AUTOMATED Play publish on tag/release
└── (pending)
    └── publish-app-store.yml       # iOS agent will draft
```
