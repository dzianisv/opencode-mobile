# Google Play Store — opencode-mobile

Operational doc for shipping `ai.opencode.mobile` to Google Play under VIBE TECHNOLOGIES, LLC.

For full company facts (D-U-N-S, address, governor, etc.) see `~/.agents/skills/vibetechnologies-llc/SKILL.md` and Bitwarden item `GOOGLE_PLAY_CONSOLE_ACCOUNT`.

---

## Account state (as of 2026-05-24)

| Field | Value |
|---|---|
| Google account (owner) | vibeteaichnologies@gmail.com |
| Developer Account ID | **8842655543970815326** |
| Account type | Organization — VIBE TECHNOLOGIES, LLC |
| Developer name (public) | `VIBE TECHNOLOGIES, LLC` |
| D-U-N-S | 142059652 |
| Console URL | https://play.google.com/console/u/2/developers/8842655543970815326 |
| Registration fee | ✅ $25 paid via Mercury virtual card (Bitwarden: `MERCURY_VIRTUAL_CARD_PLAY_CONSOLE`) |
| Payments profile | ✅ linked, D-U-N-S verified |
| Website ownership | ✅ verified — https://agentlabs.cc/ (Search Console auto-detected meta tag) |
| Contact email | ✅ support@agentlabs.cc verified |
| Identity verification | ❌ **pending — needs governor ID upload at Home → Verify your identity** |
| Phone verification | ⏸ auto after identity |
| API access (GCP link) | ⏸ blocked on identity (URL `/api-access` redirects home) |
| Create app | ⏸ blocked on identity |
| First AAB upload | ⏸ blocked on app creation |

### Linked GCP resources

| Resource | Value |
|---|---|
| Project | `opencode-mobile-deploy` |
| Service account | `playstore-deploy@opencode-mobile-deploy.iam.gserviceaccount.com` |
| API enabled | `androidpublisher.googleapis.com` |
| SA JSON key | ✅ in Bitwarden item `PLAY_STORE_SERVICE_ACCOUNT_JSON` + GitHub secret of same name |

---

## What's already done

1. ✅ gcloud authed as `vibeteaichnologies@gmail.com`
2. ✅ GCP project + API + service account + JSON key
3. ✅ JSON key saved to Bitwarden + set as GitHub secret
4. ✅ Signed release AAB built: `android/app/build/outputs/bundle/release/app-release.aab` (58.5 MB, sha256 `ae3a8aa498dfa188226ec5db06ba51cc77cf94c6a311be097f1c47534b2aff61`)
5. ✅ Play Developer account created + $25 paid
6. ✅ Payments profile linked w/ D-U-N-S 142059652
7. ✅ Website + email verifications complete
8. ✅ CI workflow `.github/workflows/publish-play-store.yml` patched:
   - versionCode auto-bumped from `github.run_number` (was hardcoded `1`, would have failed on 2nd release)
   - r0adkll/upload-google-play pinned to v1.1.5
   - `whatsNewDirectory: distribution/whatsnew` added
9. ✅ Listing copy drafted: `distribution/play-listing.md`
10. ✅ Release notes scaffold: `distribution/whatsnew/whatsnew-en-US`

---

## What's left to do — eligibility checklist

| # | Item | Owner | Blocking? |
|---|---|---|---|
| 1 | Upload governor ID for identity verification | User | 🔴 yes |
| 2 | App icon — real 512×512 PNG (current `assets/icon.json` is placeholder) | Agent | ✅ done — `assets/icon.png` (1024×1024 master), `distribution/play-graphics/icon-512.png` (512×512 store upload) |
| 3 | Adaptive icon — 432×432 foreground PNG | Agent | ✅ done — `assets/adaptive-icon.png` (432×432, transparent bg) |
| 4 | Feature graphic — 1024×500 PNG | Agent | ✅ done — `distribution/play-graphics/feature-graphic.png` |
| 5 | At least 2 phone screenshots (1080×1920 or similar) | Agent | ✅ done — `distribution/play-graphics/phone-{01,02,03}.png` (1080×2400 each; 3 screens: connection, chat, diff viewer) |
| 6 | Privacy policy — live at https://dzianisv.github.io/opencode-mobile/privacy/ | Agent | ✅ done — live & verified (HTTP 200) on gh-pages; `distribution/privacy-policy.html` (source), `distribution/privacy-policy.md` (markdown mirror) |
| 7 | Data safety form answers (drafted in `distribution/play-listing.md`) | User (in Console after app created) | ✅ verified — no analytics/ad SDKs found; crash logs updated to "Optional (opt-in, default OFF)" per new consent gate |
| 8 | Content rating questionnaire (IARC, drafted) | User (in Console after app created) | ✅ verified — no violence/sexual/gambling/UGC; "interact with other users" = No (user talks to own AI agent) |
| 9 | App access — reviewer instructions for self-hosted opencode (drafted) | User | ✅ verified — instructions accurate; `npm install -g opencode-ai && opencode serve` flow confirmed in `play-listing.md` |
| 10 | Sentry opt-in consent gate (for F-Droid parity + GDPR friendly) | Agent | ✅ done — `src/lib/telemetry.ts` (consent store), `src/components/TelemetryConsentModal.tsx` (first-launch modal), `app/_layout.tsx` (gated init), `app/(tabs)/settings.tsx` (Privacy section toggle) |
| 11 | Closed testing recruitment — 12+ testers, 14 days | User | ⏸ post-Internal-track |

---

## Publishing process (after identity verified)

1. (manual) Setup → API access → Link `opencode-mobile-deploy`. Grant `playstore-deploy@…` "Release to production, exclude devices, and use Play App Signing".
2. (manual) Create app `ai.opencode.mobile`. Fill listing from `distribution/play-listing.md`.
3. (manual) Upload graphic assets + privacy policy URL.
4. (manual) Complete Data safety + Content rating + App access forms.
5. (manual, first time only) Upload `app-release.aab` to Internal testing track → add tester emails → publish.
6. (automated thereafter) `git tag v0.2.x && git push --tags` → CI builds + publishes to Internal.

After 14 days on Closed testing with 12+ active testers → promote to Production.

---

## Files in repo

- `.github/workflows/publish-play-store.yml` — CI automation
- `distribution/play-listing.md` — store listing copy
- `distribution/whatsnew/whatsnew-en-US` — release notes
- `distribution/strategy.md` — broader distribution + monetization strategy
- `keystores/production-release.jks` — signing key (gitignored; backup in Bitwarden)
- `android/` — Expo prebuild output (regenerated each CI run)

---

## Acquisition metrics — trusted source

There is currently no verified, least-privilege source wired up for Play
Store acquisition/uninstall metrics (installs, uninstalls, store listing
conversion). `scripts/product-intelligence.mjs` explicitly lists this as a
**deferred** metric until a proper reporting contract exists — do not treat
ad-hoc Play Console screenshots or manual exports as a trusted feed for
automated reporting.

Until that's implemented, the Play Console UI
(https://play.google.com/console/u/2/developers/8842655543970815326) is the
only source of truth for acquisition numbers, checked manually. Review
volume/rating triage (a related but separate signal) is automated via
`.github/workflows/triage-reviews.yml` + `scripts/triage-reviews.py`, which
reads reviews through the Android Publisher API using the
`PLAY_STORE_SERVICE_ACCOUNT_JSON` GitHub secret (see "Linked GCP resources"
above) — this is the trusted source for review-based signals, not any
scraped or manually copied review text.

---

## Sibling channels: F-Droid + IzzyOnDroid

OpenCode Mobile is also distributed via F-Droid (mainline) and IzzyOnDroid —
the two primary OSS Android app stores for privacy-conscious users.

All three channels use the **same signing key and same package id** (`ai.opencode.mobile`),
so users can update in-place across stores.

Submission packets (ready to file after the first Play release is live):

- `distribution/fdroid-submission/` — F-Droid mainline MR packet
  - `metadata.yml` — ready-to-PR fdroiddata metadata
  - `SUBMISSION-CHECKLIST.md` — step-by-step MR filing guide
  - `REPRODUCIBLE-BUILD-NOTES.md` — reproducibility audit + fixes needed
  - `SIZE-OPTIMIZATION.md` — APK ABI splits + FCM flavor documentation
- `distribution/izzyondroid-submission/` — IzzyOnDroid inclusion request packet
  - `INCLUSION-REQUEST.md` — ready-to-paste Codeberg issue body
  - `SUBMISSION-CHECKLIST.md` — step-by-step filing guide
- `distribution/SIGNING-KEY-FINGERPRINTS.md` — signing key SHA-256 fingerprints
- `docs/fdroid.md` — operational doc for F-Droid / IzzyOnDroid (mirrors this doc)

Timeline: IzzyOnDroid 1–3 days after first APK on GitHub releases.
F-Droid mainline 4–12 weeks after MR filed.

---

## Reference

- Console: https://play.google.com/console/u/2/developers/8842655543970815326
- Account details: https://play.google.com/console/u/2/developers/8842655543970815326/account/developer-details
- Identity verification: https://play.google.com/console/u/2/developers/8842655543970815326/app-list (Home → Verify your identity)
- Original handoff doc: `opencode-mobile.playstore.md` (root, mostly historical)
- Setup notes: `distribution/PLAY_CONSOLE_SETUP.md` (historical)
